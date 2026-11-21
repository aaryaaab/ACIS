"""
Optional LLM client. Works with Ollama (free, local) or any OpenAI-compatible chat endpoint.
If nothing is configured, or a call fails, callers fall back to the rule-based answer.
"""
import httpx

from app.config import settings


class LLMError(Exception):
    pass


def is_configured() -> bool:
    if settings.llm_provider == "ollama":
        return bool(settings.llm_model)
    if settings.llm_provider == "openai_compatible":
        return bool(settings.llm_model and settings.llm_base_url)
    return False


def http_client() -> httpx.Client:        # tests replace this to avoid real network calls
    return httpx.Client(timeout=45)


def complete(messages: list[dict]) -> str:
    """messages = [{"role": "system"|"user"|"assistant", "content": "..."}]"""
    if not is_configured():
        raise LLMError("LLM is not configured")
    try:
        with http_client() as client:
            if settings.llm_provider == "ollama":
                base = settings.llm_base_url or "http://localhost:11434"
                r = client.post(f"{base.rstrip('/')}/api/chat",
                                json={"model": settings.llm_model, "messages": messages, "stream": False})
                r.raise_for_status()
                return r.json()["message"]["content"].strip()
            headers = {"Authorization": f"Bearer {settings.llm_api_key}"} if settings.llm_api_key else {}
            r = client.post(f"{settings.llm_base_url.rstrip('/')}/chat/completions", headers=headers,
                            json={"model": settings.llm_model, "messages": messages, "temperature": 0.4})
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"].strip()
    except (httpx.HTTPError, KeyError, IndexError, ValueError) as e:
        raise LLMError(f"LLM request failed: {type(e).__name__}") from e
