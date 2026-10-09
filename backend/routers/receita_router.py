from fastapi import APIRouter, Depends, HTTPException, Response, status

from crud.receita_crud import atualizar_receita, criar_receita, listar_receitas, remover_receita
from schemas.receita_schema import ReceitaResponse, ReceitaSalvar
from security import get_current_user, require_nutritionist

router = APIRouter(prefix="/receitas", tags=["Receitas"])


@router.get("", response_model=list[ReceitaResponse])
def consultar_receitas(usuario: dict = Depends(get_current_user)):
    if usuario["perfil"] not in ("nutricionista", "paciente"):
        raise HTTPException(status_code=403, detail="Receitas disponíveis apenas para nutricionistas e pacientes.")
    return listar_receitas(usuario)


@router.post("", response_model=ReceitaResponse, status_code=status.HTTP_201_CREATED)
def cadastrar_receita(receita: ReceitaSalvar, nutricionista: dict = Depends(require_nutritionist)):
    try:
        return criar_receita(nutricionista["id"], receita)
    except ValueError as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro


@router.put("/{receita_id}", response_model=ReceitaResponse)
def editar_receita(receita_id: str, receita: ReceitaSalvar, nutricionista: dict = Depends(require_nutritionist)):
    try:
        atualizada = atualizar_receita(nutricionista["id"], receita_id, receita)
    except ValueError as erro:
        raise HTTPException(status_code=422, detail=str(erro)) from erro
    if atualizada is None:
        raise HTTPException(status_code=404, detail="Receita não encontrada.")
    return atualizada


@router.delete("/{receita_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_receita(receita_id: str, nutricionista: dict = Depends(require_nutritionist)):
    if not remover_receita(nutricionista["id"], receita_id):
        raise HTTPException(status_code=404, detail="Receita não encontrada.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
