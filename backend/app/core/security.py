from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import jwt, JWTError
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from .config import settings

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login", auto_error=False)

# Demo user store — role-based access control
USERS = {
    "analyst": {"password": "demo", "role": "valuation_analyst"},
    "reviewer": {"password": "demo", "role": "quality_control_reviewer"},
    "compliance": {"password": "demo", "role": "compliance_reviewer"},
    "auditor": {"password": "demo", "role": "audit_reviewer"},
    "admin": {"password": "demo", "role": "administrator"},
}


def create_access_token(sub: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.access_token_minutes)
    payload = {"sub": sub, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def current_user(token: Optional[str] = Depends(oauth2_scheme)) -> dict:
    if not token:
        # allow anonymous read in demo mock mode
        return {"sub": "anonymous", "role": "valuation_analyst"}
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        return {"sub": payload.get("sub"), "role": payload.get("role")}
    except JWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token")


def require_roles(*roles: str):
    def dep(user: dict = Depends(current_user)):
        if user["role"] not in roles and user["role"] != "administrator":
            raise HTTPException(403, "Insufficient role")
        return user
    return dep
