from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.config import settings
from app.database import get_db
from app.deps import bearer, current_user
from app.schemas import LoginIn, RegisterIn, TokenOut, UserOut
from app.security import (CSRF_COOKIE, CSRF_HEADER, DUMMY_HASH, clear_session_cookies, csrf_matches, hash_password,
                          make_token, read_local_token, session_cookie_name, set_session_cookies, verify_password)
from app.services.rate_limit import FailureLimiter

router = APIRouter(prefix="/auth", tags=["auth"])

login_limiter = FailureLimiter(settings.login_max_failures, settings.login_window_seconds)


def allowed_origins() -> set[str]:
    return {o.strip().rstrip("/") for o in settings.cors_origins.split(",") if o.strip()}


def check_origin(request: Request) -> None:
    """Browsers always send Origin on cross-site POSTs. Refuse logins/sign-ups started from a site we don't know.
    (Requests with no Origin, such as curl or server-to-server calls, are not browser CSRF and are allowed.)"""
    origin = request.headers.get("origin")
    if origin and origin.rstrip("/") not in allowed_origins():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This request came from an unrecognised website")


def limiter_key(request: Request, email: str) -> str:
    host = request.client.host if request.client else "unknown"
    return f"{host}|{email}"


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
def register(data: RegisterIn, request: Request, response: Response, db: Session = Depends(get_db)):
    check_origin(request)
    if settings.auth_mode != "local":
        raise HTTPException(400, "Sign-up is handled by Supabase in this configuration")
    email = data.email.lower()
    if db.scalars(select(m.User).where(m.User.email == email)).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "An account with this email already exists")
    user = m.User(email=email, password_hash=hash_password(data.password), full_name=data.full_name)
    db.add(user)
    db.commit()
    token = make_token(user.id, user.session_epoch)
    set_session_cookies(response, token)                  # the website uses this httpOnly cookie
    return TokenOut(access_token=token)                   # API clients and Swagger can use this as a Bearer token


@router.post("/login", response_model=TokenOut)
def login(data: LoginIn, request: Request, response: Response, db: Session = Depends(get_db)):
    check_origin(request)
    email = data.email.lower()
    key = limiter_key(request, email)
    wait = login_limiter.retry_after(key)
    if wait:
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS,
                            f"Too many failed attempts. Please try again in {max(1, wait // 60 + (1 if wait % 60 else 0))} minute(s).",
                            headers={"Retry-After": str(wait)})
    user = db.scalars(select(m.User).where(m.User.email == email)).first()
    # Always do one bcrypt check so an unknown email takes as long as a wrong password.
    ok = verify_password(data.password, user.password_hash if user and user.password_hash else DUMMY_HASH)
    if not user or not user.password_hash or not ok:
        login_limiter.record_failure(key)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Incorrect email or password")   # same message either way
    login_limiter.reset(key)
    token = make_token(user.id, user.session_epoch)
    set_session_cookies(response, token)
    return TokenOut(access_token=token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT, summary="Sign out everywhere (revokes every session of this account)")
def logout(request: Request, response: Response, creds: HTTPAuthorizationCredentials | None = Depends(bearer),
           db: Session = Depends(get_db)):
    """Always clears this browser's cookies, so signing out never fails. If the session is valid it is also revoked on the
    server (every older token for this account stops working). A cookie session must prove it is not a forged request,
    otherwise a stranger's web page could sign you out everywhere."""
    via_cookie = creds is None
    token = creds.credentials if creds else request.cookies.get(session_cookie_name())
    claims = read_local_token(token) if token and settings.auth_mode == "local" else None
    if claims:
        user = db.get(m.User, claims[0])
        proven = (not via_cookie) or csrf_matches(request.headers.get(CSRF_HEADER), request.cookies.get(CSRF_COOKIE))
        if user and user.session_epoch == claims[1] and proven:
            user.session_epoch += 1
            db.commit()
    clear_session_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
def me(user: m.User = Depends(current_user)):
    return user
