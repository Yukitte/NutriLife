from fastapi import APIRouter, Depends, HTTPException, Response, status

from crud.medida_crud import atualizar_medida, criar_medida, listar_medidas, remover_medida
from crud.usuario_crud import paciente_vinculado
from schemas.medida_schema import MedidaResponse, MedidaSalvar
from security import get_current_user, require_nutritionist

router = APIRouter(prefix="/medidas", tags=["Medidas antropométricas"])


def _exigir_vinculo(nutricionista: dict, paciente_id: str) -> None:
    if not paciente_vinculado(nutricionista["id"], paciente_id):
        raise HTTPException(status_code=403, detail="Este paciente não está vinculado a você.")


@router.get("/minhas", response_model=list[MedidaResponse])
def consultar_minhas_medidas(usuario: dict = Depends(get_current_user)):
    if usuario["perfil"] != "paciente":
        raise HTTPException(status_code=403, detail="Somente pacientes têm medidas próprias.")
    return listar_medidas(usuario["id"])


@router.get("/paciente/{paciente_id}", response_model=list[MedidaResponse])
def consultar_medidas_do_paciente(paciente_id: str, usuario: dict = Depends(require_nutritionist)):
    _exigir_vinculo(usuario, paciente_id)
    return listar_medidas(paciente_id)


@router.post("/paciente/{paciente_id}", response_model=MedidaResponse, status_code=status.HTTP_201_CREATED)
def registrar_medida(paciente_id: str, medida: MedidaSalvar, usuario: dict = Depends(require_nutritionist)):
    _exigir_vinculo(usuario, paciente_id)
    return criar_medida(paciente_id, usuario["id"], medida)


@router.put("/{medida_id}", response_model=MedidaResponse)
def editar_medida(medida_id: str, medida: MedidaSalvar, usuario: dict = Depends(require_nutritionist)):
    atualizada = atualizar_medida(usuario["id"], medida_id, medida)
    if atualizada is None:
        raise HTTPException(status_code=404, detail="Avaliação não encontrada.")
    return atualizada


@router.delete("/{medida_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_medida(medida_id: str, usuario: dict = Depends(require_nutritionist)):
    if not remover_medida(usuario["id"], medida_id):
        raise HTTPException(status_code=404, detail="Avaliação não encontrada.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)
