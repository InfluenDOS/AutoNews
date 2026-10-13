import io
import os
import unittest
from unittest.mock import patch

import ai_client


class FakeResponse:
    def __init__(self, content: str, status_code: int = 200, text: str = "") -> None:
        self.content = content
        self.status_code = status_code
        self.text = text

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")

    def json(self) -> dict:
        return {"choices": [{"message": {"content": self.content}}]}


class FakeClient:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.responses = responses
        self.payloads: list[dict] = []

    def __enter__(self):
        return self

    def __exit__(self, *_args) -> None:
        return None

    def post(self, _url: str, *, headers: dict, json: dict) -> FakeResponse:
        self.payloads.append(json)
        return self.responses.pop(0)


class ChatJsonTests(unittest.TestCase):
    def setUp(self) -> None:
        self.env = patch.dict(
            os.environ,
            {
                "AI_API_KEY": "test-key",
                "AI_BASE_URL": "https://api.deepseek.com",
                "AI_MODEL": "deepseek-flash",
            },
        )
        self.env.start()
        ai_client._unavailable = None

    def tearDown(self) -> None:
        self.env.stop()
        ai_client._unavailable = None

    def test_disables_thinking_for_structured_calls(self) -> None:
        client = FakeClient([FakeResponse('{"ok": true}')])
        with patch.object(ai_client.httpx, "Client", return_value=client):
            result = ai_client.chat_json("return json", "input")
        self.assertEqual(result, {"ok": True})
        self.assertEqual(client.payloads[0]["thinking"], {"type": "disabled"})

    def test_retries_empty_json_once_with_larger_budget(self) -> None:
        client = FakeClient([FakeResponse(""), FakeResponse('{"ok": true}')])
        with patch.object(ai_client.httpx, "Client", return_value=client):
            result = ai_client.chat_json("return json", "input", max_tokens=600)
        self.assertEqual(result, {"ok": True})
        self.assertEqual(len(client.payloads), 2)
        self.assertEqual(client.payloads[1]["max_tokens"], 1200)

    def test_raises_after_one_bad_json_retry(self) -> None:
        client = FakeClient([FakeResponse("{"), FakeResponse("{")])
        with patch.object(ai_client.httpx, "Client", return_value=client):
            with self.assertRaises(ValueError):
                ai_client.chat_json("return json", "input")
        self.assertEqual(len(client.payloads), 2)

    def test_balance_refusal_stops_later_calls(self) -> None:
        client = FakeClient([FakeResponse("", status_code=402, text="Insufficient Balance")])
        # Swallow the ::error:: annotation so the Tests run does not show a fake 402.
        with patch.object(ai_client.httpx, "Client", return_value=client), patch(
            "sys.stderr", new_callable=io.StringIO
        ) as err:
            with self.assertRaises(ai_client.AIUnavailable):
                ai_client.chat_json("return json", "input")
            with self.assertRaises(ai_client.AIUnavailable):
                ai_client.chat_json("return json", "input")
        # The second call never reached the provider.
        self.assertEqual(len(client.payloads), 1)
        self.assertIn("::error", err.getvalue())


if __name__ == "__main__":
    unittest.main()
