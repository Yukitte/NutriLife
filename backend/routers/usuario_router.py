from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import DuplicateKeyError

from crud.usuario_crud import (
    atualizar_usuario,
    buscar_usuario,
    criar_usuario,
    listar_pacientes,
    remover_usuario,
)
from schemas.usuario_schema import (
    TokenResponse,
    UsuarioCreate,
    UsuarioResponse,
    UsuarioUpdate,
)
from security import create_access_token, get_current_user, hash_password, require_nutritionist

router = APIRouter(prefix="/usuarios", tags=["Usuários"])


@router.post("", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def cadastrar_usuario(usuario: UsuarioCreate):
    try:
        created = criar_usuario(usuario, hash_password(usuario.senha))
    except DuplicateKeyError as error:
        raise HTTPException(status_code=409, detail="E-mail já cadastrado.") from error
    return {
        "access_token": create_access_token(created["id"]),
        "usuario": created,
    }


@router.get("", response_model=list[UsuarioResponse])
def consultar_pacientes(_: dict = Depends(require_nutritionist)):
    return listar_pacientes()


@router.get("/me", response_model=UsuarioResponse)
def consultar_perfil(usuario: dict = Depends(get_current_user)):
    return usuario


@router.put("/me", response_model=UsuarioResponse)
def atualizar_perfil(
    changes: UsuarioUpdate,
    usuario: dict = Depends(get_current_user),
):
    try:
        updated = atualizar_usuario(usuario["id"], changes)
    except DuplicateKeyError as error:
        raise HTTPException(status_code=409, detail="E-mail já cadastrado.") from error
    if updated is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return updated


@router.get("/{usuario_id}", response_model=UsuarioResponse)
def consultar_usuario(
    usuario_id: str,
    usuario: dict = Depends(get_current_user),
):
    if usuario["perfil"] != "nutricionista" and usuario_id != usuario["id"]:
        raise HTTPException(status_code=403, detail="Acesso não permitido.")
    found = buscar_usuario(usuario_id)
    if found is None or (
        usuario["perfil"] == "nutricionista" and found["perfil"] != "paciente"
    ):
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    return found


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def excluir_propria_conta(usuario: dict = Depends(get_current_user)):
    if not remover_usuario(usuario["id"]):
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
