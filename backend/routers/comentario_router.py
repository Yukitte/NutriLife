from fastapi import APIRouter, Depends, HTTPException

from crud.comentario_crud import (
    listar_comentarios,
    obter_meu_comentario,
    paciente_pode_comentar,
    responder_comentario,
    salvar_comentario,
)
from schemas.comentario_schema import ComentarioPublico, ComentarioSalvar, MeuComentario, RespostaSalvar
from security import get_current_user, require_nutritionist

router = APIRouter(prefix="/comentarios", tags=["Comentários"])


def _exigir_paciente(usuario: dict) -> None:
    if usuario["perfil"] != "paciente":
        raise HTTPException(status_code=403, detail="Somente pacientes podem comentar.")


@router.get("/nutricionista/{nutricionista_id}", response_model=list[ComentarioPublico])
def consultar_comentarios(nutricionista_id: str):
    comentarios = listar_comentarios(nutricionista_id)
    if comentarios is None:
        raise HTTPException(status_code=404, detail="Nutricionista não encontrado.")
    return comentarios


@router.get("/nutricionista/{nutricionista_id}/meu", response_model=MeuComentario)
def consultar_meu_comentario(nutricionista_id: str, usuario: dict = Depends(get_current_user)):
    _exigir_paciente(usuario)
    resultado = obter_meu_comentario(usuario, nutricionista_id)
    if resultado is None:
        raise HTTPException(status_code=404, detail="Nutricionista não encontrado.")
    return resultado


@router.put("/nutricionista/{nutricionista_id}", response_model=ComentarioPublico)
def publicar_comentario(
    nutricionista_id: str,
    dados: ComentarioSalvar,
    usuario: dict = Depends(get_current_user),
):
    _exigir_paciente(usuario)
    if not paciente_pode_comentar(usuario["id"], nutricionista_id):
        raise HTTPException(
            status_code=403,
            detail="Você poderá comentar depois de receber um plano alimentar ou ter uma consulta com este nutricionista.",
        )
    return salvar_comentario(usuario, nutricionista_id, dados)


@router.get("/recebidos", response_model=list[ComentarioPublico])
def consultar_comentarios_recebidos(usuario: dict = Depends(require_nutritionist)):
    return listar_comentarios(usuario["id"]) or []


@router.put("/{comentario_id}/resposta", response_model=ComentarioPublico)
def responder(comentario_id: str, dados: RespostaSalvar, usuario: dict = Depends(require_nutritionist)):
    comentario = responder_comentario(usuario, comentario_id, dados.texto)
    if comentario is None:
        raise HTTPException(status_code=404, detail="Comentário não encontrado.")
    return comentario
