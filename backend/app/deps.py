from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.config import settings
from app.database import get_db
from app.security import (CSRF_COOKIE, CSRF_HEADER, csrf_matches, read_local_token, read_supabase_token,
                          session_cookie_name)

bearer = HTTPBearer(auto_error=False)


SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}


def current_user(request: Request, creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                 db: Session = Depends(get_db)) -> m.User:
    """Who is calling? Either an Authorization: Bearer header (API clients, Swagger) or the httpOnly session cookie (the website).
    A request authenticated by cookie that changes data must also carry the matching CSRF header."""
    unauthorised = HTTPException(status.HTTP_401_UNAUTHORIZED, "Not logged in", headers={"WWW-Authenticate": "Bearer"})
    via_cookie = creds is None
    token = creds.credentials if creds else request.cookies.get(session_cookie_name())
    if not token:
        raise unauthorised

    if settings.auth_mode == "supabase":
        claims = read_supabase_token(token)
        if not claims:
            raise unauthorised
        user = db.scalars(select(m.User).where(m.User.external_id == claims["sub"])).first()
        if user is None:                        # first login: create our own user row
            user = m.User(email=claims.get("email", f"{claims['sub']}@supabase.local"), external_id=claims["sub"])
            db.add(user)
            db.commit()
    else:
        claims = read_local_token(token)
        user = db.get(m.User, claims[0]) if claims else None
        if user is None or user.session_epoch != claims[1]:        # signed out since this token was issued
            raise unauthorised

    if via_cookie and request.method not in SAFE_METHODS:
        if not csrf_matches(request.headers.get(CSRF_HEADER), request.cookies.get(CSRF_COOKIE)):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Security check failed. Please reload the page and try again.")
    return user


def get_profile(user: m.User, db: Session) -> m.StudentProfile:
    profile = db.scalars(select(m.StudentProfile).where(m.StudentProfile.user_id == user.id)).first()
    if profile is None:
        raise HTTPException(404, "Finish onboarding first")
    return profile
