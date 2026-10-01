from fastapi import APIRouter, Depends, HTTPException, status

from crud.plano_crud import (
    atualizar_plano,
    criar_plano,
    listar_planos,
    remover_plano,
)
from schemas.plano_schema import PlanoCreate, PlanoResponse, PlanoUpdate
from security import get_current_user, require_nutritionist

router = APIRouter(prefix="/planos", tags=["Planos alimentares"])


@router.get("", response_model=list[PlanoResponse])
def consultar_planos(usuario: dict = Depends(get_current_user)):
    return listar_planos(usuario)


@router.post("", response_model=PlanoResponse, status_code=status.HTTP_201_CREATED)
def cadastrar_plano(
    plano: PlanoCreate,
    nutricionista: dict = Depends(require_nutritionist),
):
    created = criar_plano(plano, nutricionista)
    if created is None:
        raise HTTPException(status_code=404, detail="Paciente não encontrado.")
    return created


@router.put("/{plano_id}", response_model=PlanoResponse)
def editar_plano(
    plano_id: str,
    changes: PlanoUpdate,
    nutricionista: dict = Depends(require_nutritionist),
):
    updated = atualizar_plano(plano_id, changes, nutricionista)
    if updated is None:
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
    return updated


@router.delete("/{plano_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_plano(
    plano_id: str,
    nutricionista: dict = Depends(require_nutritionist),
):
    if not remover_plano(plano_id, nutricionista):
        raise HTTPException(status_code=404, detail="Plano não encontrado.")
