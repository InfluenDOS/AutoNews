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
    model = os.environ.get("AI_MODEL", "deepseek-chat").strip() or "deepseek-chat"
    if not key:
        raise RuntimeError("AI_API_KEY is not set")
    return key, base, model


def chat_json(system: str, user: str, *, temperature: float = 0.2, max_tokens: int = 600) -> dict[str, Any]:
    key, base, model = _settings()
    url = f"{base}/v1/chat/completions"
    payload = {
        "model": model,
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
    with httpx.Client(timeout=90.0) as client:
        resp = client.post(url, headers=headers, json=payload)
        # Some providers ignore response_format; retry without it on 400
        if resp.status_code >= 400 and "response_format" in (resp.text or ""):
            payload.pop("response_format", None)
            resp = client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        data = resp.json()
    content = data["choices"][0]["message"]["content"]
    return _parse_json_object(content)


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
