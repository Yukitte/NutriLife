from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

from crud.usuario_crud import buscar_usuario
from settings import get_settings

password_hash = PasswordHash.recommended()
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed_password: str) -> bool:
    return password_hash.verify(password, hashed_password)


def create_access_token(user_id: str) -> str:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.access_token_expire_minutes
    )
    return jwt.encode(
        {"sub": user_id, "exp": expires_at, "purpose": "access"},
        settings.jwt_secret_key,
        algorithm="HS256",
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> dict:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sessão inválida ou expirada.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None:
        raise unauthorized
    try:
        payload = jwt.decode(
            credentials.credentials,
            get_settings().jwt_secret_key,
            algorithms=["HS256"],
        )
        user_id = payload.get("sub")
        if not isinstance(user_id, str) or payload.get("purpose") != "access":
            raise unauthorized
    except jwt.InvalidTokenError as error:
        raise unauthorized from error

    user = buscar_usuario(user_id)
    if user is None or not user.get("ativo", True):
        raise unauthorized
    return user


def get_reset_token_claims(token: str) -> dict | None:
    try:
        payload = jwt.decode(
            token,
            get_settings().jwt_secret_key,
            algorithms=["HS256"],
        )
    except jwt.InvalidTokenError:
        return None
    if (
        payload.get("purpose") != "password_reset"
        or not isinstance(payload.get("sub"), str)
        or not isinstance(payload.get("jti"), str)
    ):
        return None
    return {"user_id": payload["sub"], "jti": payload["jti"]}


def create_password_reset_token(user_id: str, nonce: str) -> str:
    settings = get_settings()
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.password_reset_expire_minutes
    )
    return jwt.encode(
        {
            "sub": user_id,
            "exp": expires_at,
            "purpose": "password_reset",
            "jti": nonce,
        },
        settings.jwt_secret_key,
        algorithm="HS256",
    )


def require_nutritionist(user: dict = Depends(get_current_user)) -> dict:
    if user["perfil"] != "nutricionista":
        raise HTTPException(status_code=403, detail="Acesso exclusivo para nutricionistas.")
    return user


def require_administrator(user: dict = Depends(get_current_user)) -> dict:
    if user["perfil"] != "administrador":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso exclusivo para administradores.",
        )
    return user
