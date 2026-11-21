import logging

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://acis:acis@localhost:5432/acis"
    secret_key: str = "change-me-in-env"          # signs local-dev JWTs
    token_minutes: int = 60 * 12
    cors_origins: str = "http://localhost:3000"     # also the list of origins allowed to log in

    # "development" or "production". Production refuses to start with unsafe settings.
    environment: str = "development"
    # Session cookie. Set COOKIE_SECURE=true whenever the site is served over HTTPS.
    cookie_secure: bool = False
    cookie_samesite: str = "lax"
    login_max_failures: int = 5                    # wrong passwords allowed per email ...
    login_window_seconds: int = 15 * 60            # ... within this many seconds

    # "local" = built-in email/password auth. "supabase" = verify Supabase JWTs.
    auth_mode: str = "local"
    supabase_jwt_secret: str = ""

    # Optional AI providers. Everything works with these left empty.
    llm_provider: str = "none"                     # none | ollama | openai_compatible
    llm_api_key: str = ""
    llm_base_url: str = ""
    llm_model: str = ""
    embedding_provider: str = "hash"               # hash (local, free) | api
    embedding_api_key: str = ""
    external_data_api_key: str = ""

    # Optional speech-to-text (OpenAI-compatible /audio/transcriptions). Empty = typed transcripts only.
    stt_provider: str = "none"                     # none | openai_compatible
    stt_api_key: str = ""
    stt_base_url: str = ""
    stt_model: str = "whisper-1"

    # Emails (comma separated) allowed to download the anonymised research export.
    researcher_emails: str = ""


PLACEHOLDER_SECRETS = {"", "change-me-in-env", "enter_a_long_random_string_here", "changeme", "secret"}


def check_production_settings(s: "Settings") -> None:
    """Called at startup. In production, unsafe settings stop the server instead of running quietly."""
    if s.environment.lower() != "production":
        if s.secret_key in PLACEHOLDER_SECRETS or s.secret_key.startswith("enter_"):
            logging.getLogger("acis").warning("SECRET_KEY is a placeholder. Fine for local testing, never for a real deployment.")
        return
    problems = []
    if s.secret_key in PLACEHOLDER_SECRETS or s.secret_key.startswith("enter_") or len(s.secret_key) < 32:
        problems.append("SECRET_KEY must be a random string of at least 32 characters (not a placeholder)")
    if s.auth_mode == "local" and not s.cookie_secure:
        problems.append("COOKIE_SECURE must be true so the session cookie is only sent over HTTPS")
    if s.cookie_samesite.lower() not in ("lax", "strict"):
        problems.append("COOKIE_SAMESITE must be lax or strict")
    if "*" in s.cors_origins:
        problems.append("CORS_ORIGINS must list your real site address, not *")
    if s.auth_mode == "supabase" and not s.supabase_jwt_secret:
        problems.append("SUPABASE_JWT_SECRET is required when AUTH_MODE=supabase")
    if problems:
        raise RuntimeError("Refusing to start in production:\n  - " + "\n  - ".join(problems))


settings = Settings()
