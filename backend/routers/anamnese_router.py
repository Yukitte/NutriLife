from fastapi import APIRouter, Depends, HTTPException

from crud.anamnese_crud import buscar_anamnese, salvar_anamnese
from crud.usuario_crud import paciente_vinculado
from schemas.anamnese_schema import AnamneseResponse, AnamneseSalvar
from security import get_current_user, require_nutritionist

router = APIRouter(prefix="/anamnese", tags=["Anamnese"])


def _exigir_paciente(usuario: dict) -> None:
    if usuario["perfil"] != "paciente":
        raise HTTPException(status_code=403, detail="Somente pacientes têm anamnese própria.")


def _exigir_vinculo(nutricionista: dict, paciente_id: str) -> None:
    if not paciente_vinculado(nutricionista["id"], paciente_id):
        raise HTTPException(status_code=403, detail="Este paciente não está vinculado a você.")


@router.get("/minha", response_model=AnamneseResponse)
def consultar_minha_anamnese(usuario: dict = Depends(get_current_user)):
    _exigir_paciente(usuario)
    return buscar_anamnese(usuario["id"], usuario["perfil"])


@router.put("/minha", response_model=AnamneseResponse)
def salvar_minha_anamnese(anamnese: AnamneseSalvar, usuario: dict = Depends(get_current_user)):
    _exigir_paciente(usuario)
    return salvar_anamnese(usuario["id"], usuario, anamnese)


@router.get("/paciente/{paciente_id}", response_model=AnamneseResponse)
def consultar_anamnese_do_paciente(paciente_id: str, usuario: dict = Depends(require_nutritionist)):
    _exigir_vinculo(usuario, paciente_id)
    return buscar_anamnese(paciente_id, usuario["perfil"])


@router.put("/paciente/{paciente_id}", response_model=AnamneseResponse)
def salvar_anamnese_do_paciente(paciente_id: str, anamnese: AnamneseSalvar, usuario: dict = Depends(require_nutritionist)):
    _exigir_vinculo(usuario, paciente_id)
    return salvar_anamnese(paciente_id, usuario, anamnese)
