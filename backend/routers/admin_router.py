from fastapi import APIRouter, Depends, HTTPException, Response, status
from pymongo.errors import DuplicateKeyError

from crud.admin_crud import resumo_plataforma
from crud.usuario_crud import (
    atualizar_usuario_administrador,
    listar_usuarios_administrador,
    remover_usuario_administrador,
)
from schemas.admin_schema import ResumoPlataforma
from schemas.usuario_schema import AdministradorUsuarioUpdate, UsuarioResponse
from security import require_administrator

router = APIRouter(prefix="/admin", tags=["Administração"])


@router.get("/resumo", response_model=ResumoPlataforma)
def consultar_resumo(_: dict = Depends(require_administrator)):
    return resumo_plataforma()


@router.get("/usuarios", response_model=list[UsuarioResponse])
def listar_usuarios(_: dict = Depends(require_administrator)):
    return listar_usuarios_administrador()


@router.put("/usuarios/{usuario_id}", response_model=UsuarioResponse)
def editar_usuario(
    usuario_id: str,
    changes: AdministradorUsuarioUpdate,
    _: dict = Depends(require_administrator),
):
    try:
        updated = atualizar_usuario_administrador(usuario_id, changes)
    except DuplicateKeyError as error:
        raise HTTPException(status_code=409, detail="E-mail já cadastrado.") from error
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if updated is None:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return updated


@router.delete("/usuarios/{usuario_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_usuario(
    usuario_id: str,
    _: dict = Depends(require_administrator),
):
    try:
        deleted = remover_usuario_administrador(usuario_id)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    if not deleted:
        raise HTTPException(status_code=404, detail="Usuário não encontrado.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
