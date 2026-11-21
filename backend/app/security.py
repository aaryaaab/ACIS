from datetime import datetime, timedelta

import hmac
import secrets

import bcrypt
import jwt
from fastapi import Response

from app.config import settings


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), hashed.encode())
    except ValueError:
        return False


def make_token(user_id: int, epoch: int = 0) -> str:
    payload = {"sub": str(user_id), "ep": epoch, "exp": datetime.utcnow() + timedelta(minutes=settings.token_minutes)}
    return jwt.encode(payload, settings.secret_key, algorithm="HS256")


def read_local_token(token: str) -> tuple[int, int] | None:
    """Returns (user id, session epoch) or None if the token is invalid or expired."""
    try:
        claims = jwt.decode(token, settings.secret_key, algorithms=["HS256"])
        return int(claims["sub"]), int(claims.get("ep", 0))
    except (jwt.PyJWTError, KeyError, ValueError):
        return None


def read_supabase_token(token: str) -> dict | None:
    """Supabase signs its access tokens with the project's JWT secret."""
    try:
        return jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
    except jwt.PyJWTError:
        return None


# ---------------------------------------------------------------- passwords
MAX_PASSWORD_BYTES = 72          # bcrypt cannot hash more than this


def password_too_long(password: str) -> bool:
    return len(password.encode("utf-8")) > MAX_PASSWORD_BYTES


# A real bcrypt hash of a random string. Used so "unknown email" takes as long as "wrong password".
DUMMY_HASH = bcrypt.hashpw(secrets.token_bytes(16), bcrypt.gensalt()).decode()


# ---------------------------------------------------------------- session cookie
CSRF_COOKIE = "acis_csrf"
CSRF_HEADER = "x-csrf-token"


def session_cookie_name() -> str:
    """With HTTPS the cookie gets the __Host- prefix, which browsers only accept if it is Secure, has Path=/ and no Domain."""
    return "__Host-acis_session" if settings.cookie_secure else "acis_session"


def new_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def csrf_matches(header_value: str | None, cookie_value: str | None) -> bool:
    return bool(header_value) and bool(cookie_value) and hmac.compare_digest(header_value, cookie_value)


def set_session_cookies(response: Response, token: str) -> None:
    """The login token goes in an httpOnly cookie that JavaScript cannot read. A second, readable cookie
    carries a random value the page must echo back in a header on every change request (double-submit CSRF)."""
    max_age = settings.token_minutes * 60
    common = {"max_age": max_age, "path": "/", "secure": settings.cookie_secure, "samesite": settings.cookie_samesite.lower()}
    response.set_cookie(session_cookie_name(), token, httponly=True, **common)
    response.set_cookie(CSRF_COOKIE, new_csrf_token(), httponly=False, **common)


def clear_session_cookies(response: Response) -> None:
    for name in (session_cookie_name(), CSRF_COOKIE):
        response.delete_cookie(name, path="/", secure=settings.cookie_secure, samesite=settings.cookie_samesite.lower(),
                               httponly=name != CSRF_COOKIE)
