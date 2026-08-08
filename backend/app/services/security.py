import hashlib
import hmac
import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from .. import config
from ..database import get_db
from ..models import Department, User

_bearer = HTTPBearer(auto_error=False)

_PBKDF2_ITERATIONS = 120_000


def hash_password(password: str) -> str:
    salt = os.urandom(16)
    digest = hashlib.pbkdf2_hmac(
        "sha256", password.encode("utf-8"), salt, _PBKDF2_ITERATIONS
    )
    return f"pbkdf2${_PBKDF2_ITERATIONS}${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, iterations, salt_hex, digest_hex = stored.split("$")
        digest = hashlib.pbkdf2_hmac(
            "sha256", password.encode("utf-8"), bytes.fromhex(salt_hex), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), digest_hex)
    except Exception:
        return False


def create_token(user: User) -> str:
    payload = {
        "sub": str(user.id),
        "role": user.role,
        "dept": user.dept_code,
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=config.settings.JWT_EXPIRES_MINUTES),
    }
    return jwt.encode(
        payload, config.settings.JWT_SECRET, algorithm=config.settings.JWT_ALGORITHM
    )


def _decode_token(token: str) -> dict:
    try:
        return jwt.decode(
            token,
            config.settings.JWT_SECRET,
            algorithms=[config.settings.JWT_ALGORITHM],
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Expired token.")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token.")


def user_from_token(token: str, db: Session) -> User | None:
    """Non-request helper (websockets / background) to resolve a token to a user."""
    try:
        payload = _decode_token(token)
        user = db.get(User, int(payload["sub"]))
    except HTTPException:
        return None
    return user if user is not None and user.active else None


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> User:
    if credentials is None or not credentials.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated.")
    payload = _decode_token(credentials.credentials)
    user = db.get(User, int(payload["sub"]))
    if user is None or not user.active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User disabled or missing.")
    return user


class RoleGuard:
    """Require a minimum role and optionally constrain to a department."""

    ROLE_RANK = {"cofounder": 3, "lead": 2, "teammate": 1}

    def __init__(self, min_role: str = "teammate", dept_code: str | None = None):
        self.min_role = min_role
        self.dept_code = dept_code

    def __call__(self, user: User = Depends(get_current_user)) -> User:
        if self.ROLE_RANK[user.role] < self.ROLE_RANK[self.min_role]:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Role lacks permission.")
        if (
            user.role != "cofounder"
            and self.dept_code
            and user.dept_code != self.dept_code
        ):
            raise HTTPException(
                status.HTTP_403_FORBIDDEN, "Outside your department scope."
            )
        return user