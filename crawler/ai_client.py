"""OpenAI-compatible chat client (DeepSeek / OpenAI / others)."""

from __future__ import annotations

import json
import os
import re
from typing import Any

import httpx


def ai_configured() -> bool:
    return bool(os.environ.get("AI_API_KEY", "").strip())


def _settings() -> tuple[str, str, str]:
    key = os.environ.get("AI_API_KEY", "").strip()
    base = os.environ.get("AI_BASE_URL", "https://api.deepseek.com").rstrip("/")
    model = (
        os.environ.get("AI_MODEL", "deepseek-flash").strip()
        or "deepseek-flash"
    )
    if not key:
        raise RuntimeError("AI_API_KEY is not set")
    return key, base, model


def chat_json(system: str, user: str, *, temperature: float = 0.2, max_tokens: int = 600) -> dict[str, Any]:
    key, base, model = _settings()
    url = f"{base}/v1/chat/completions"
    payload = {
        "model": model,
        # DeepSeek V4.1 enables high-effort thinking by default. These calls need
        # compact, deterministic JSON; reasoning can consume the completion budget
        # before the final JSON is emitted.
        "thinking": {"type": "disabled"},
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }
    last_parse_error: Exception | None = None
    supports_response_format = True
    with httpx.Client(timeout=90.0) as client:
        for attempt in range(2):
            request_payload = dict(payload)
            if attempt:
                # A single bounded retry for DeepSeek's documented occasional empty
                # JSON response or a completion truncated at the original ceiling.
                request_payload["max_tokens"] = min(max(max_tokens * 2, 1200), 5000)
            if not supports_response_format:
                request_payload.pop("response_format", None)

            resp = client.post(url, headers=headers, json=request_payload)
            # Some OpenAI-compatible providers reject response_format; remember that
            # capability decision so a JSON-content retry does not repeat the 400.
            if resp.status_code >= 400 and "response_format" in (resp.text or ""):
                supports_response_format = False
                request_payload.pop("response_format", None)
                resp = client.post(url, headers=headers, json=request_payload)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"].get("content") or ""
            try:
                return _parse_json_object(content)
            except (ValueError, json.JSONDecodeError) as exc:
                last_parse_error = exc

    if last_parse_error:
        raise last_parse_error
    raise ValueError("Model did not return JSON")


def _parse_json_object(text: str) -> dict[str, Any]:
    text = (text or "").strip()
    try:
        obj = json.loads(text)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{[\s\S]*\}", text)
    if not match:
        raise ValueError(f"Model did not return JSON: {text[:200]}")
    obj = json.loads(match.group(0))
    if not isinstance(obj, dict):
        raise ValueError("JSON root must be an object")
    return obj
