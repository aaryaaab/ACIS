"""
Optional speech-to-text. Audio is sent to the configured provider, the text comes back, and the
audio itself is never stored. With no provider configured, the app accepts typed or
browser-generated transcripts instead.
"""
import httpx

from app.config import settings

MAX_AUDIO_BYTES = 10 * 1024 * 1024


class SpeechError(Exception):
    pass


def is_configured() -> bool:
    return settings.stt_provider == "openai_compatible" and bool(settings.stt_base_url)


def http_client() -> httpx.Client:        # tests replace this
    return httpx.Client(timeout=60)


def transcribe(filename: str, content: bytes, content_type: str) -> str:
    if not is_configured():
        raise SpeechError("Speech-to-text is not configured on this server")
    headers = {"Authorization": f"Bearer {settings.stt_api_key}"} if settings.stt_api_key else {}
    try:
        with http_client() as client:
            r = client.post(f"{settings.stt_base_url.rstrip('/')}/audio/transcriptions", headers=headers,
                            data={"model": settings.stt_model}, files={"file": (filename, content, content_type)})
            r.raise_for_status()
            text = r.json()["text"].strip()
    except (httpx.HTTPError, KeyError, ValueError) as e:
        raise SpeechError(f"Transcription failed: {type(e).__name__}") from e
    if not text:
        raise SpeechError("No speech was detected in the recording")
    return text
