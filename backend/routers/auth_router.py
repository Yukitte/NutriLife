from fastapi import APIRouter, HTTPException, status

from crud.usuario_crud import buscar_usuario_com_senha, serializar_usuario
from schemas.usuario_schema import TokenResponse, UsuarioLogin
from security import create_access_token, verify_password

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.post("/login", response_model=TokenResponse)
def login(credentials: UsuarioLogin):
    usuario = buscar_usuario_com_senha(str(credentials.email).lower())
    if usuario is None or not verify_password(
        credentials.senha,
        usuario["senha_hash"],
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="E-mail ou senha inválidos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    public_user = serializar_usuario(usuario)
    return {
        "access_token": create_access_token(public_user["id"]),
        "usuario": public_user,
    }
