# src/api/auth.py
"""
Email/password JWT auth. No OAuth, no external identity provider —
bcrypt for hashing, PyJWT for tokens, raw sqlite3 (src/api/db.py) for storage.
"""
import re
import time
from typing import Optional

import bcrypt
import jwt
from fastapi import APIRouter, Body, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr

from src.api.config import JWT_SECRET, JWT_EXPIRE_MINUTES
from src.api.db import create_user, get_user_by_email, get_user_by_id

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# ============================================================
# PASSWORD HASHING
# ============================================================
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


# ============================================================
# JWT
# ============================================================
def create_access_token(user_id: int, email: str) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": now,
        "exp": now + JWT_EXPIRE_MINUTES * 60,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_access_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


def _extract_token(request: Request) -> Optional[str]:
    header = request.headers.get("Authorization") or ""
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return None


def get_current_user(request: Request) -> dict:
    token = _extract_token(request)
    if not token:
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    try:
        payload = decode_access_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = get_user_by_id(int(payload["sub"]))
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_current_user_optional(request: Request) -> Optional[dict]:
    token = _extract_token(request)
    if not token:
        return None
    try:
        payload = decode_access_token(token)
    except jwt.PyJWTError:
        return None
    return get_user_by_id(int(payload["sub"]))


# ============================================================
# SCHEMAS
# ============================================================
class RegisterPayload(BaseModel):
    email: EmailStr
    password: str


class LoginPayload(BaseModel):
    email: EmailStr
    password: str


def _public_user(user: dict) -> dict:
    return {"id": user["id"], "email": user["email"], "created_at": user.get("created_at")}


# ============================================================
# ROUTER
# ============================================================
auth_router = APIRouter(prefix="/api/auth", tags=["auth"])


@auth_router.post("/register")
def register(payload: RegisterPayload = Body(...)):
    email = payload.email.strip().lower()
    if len(payload.password) < 6:
        raise HTTPException(status_code=422, detail="Password must be at least 6 characters")
    if get_user_by_email(email):
        raise HTTPException(status_code=409, detail="Email already registered")

    user = create_user(email, hash_password(payload.password))
    token = create_access_token(user["id"], user["email"])
    return {"token": token, "user": _public_user(user)}


@auth_router.post("/login")
def login(payload: LoginPayload = Body(...)):
    email = payload.email.strip().lower()
    user = get_user_by_email(email)
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    token = create_access_token(user["id"], user["email"])
    return {"token": token, "user": _public_user(user)}


@auth_router.get("/me")
def me(current_user: dict = Depends(get_current_user)):
    return _public_user(current_user)
