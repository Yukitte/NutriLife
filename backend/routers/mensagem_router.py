from fastapi import APIRouter, Depends, HTTPException, status

from crud.mensagem_crud import enviar_mensagem, listar_conversas, listar_mensagens, pode_conversar, resumo_nao_lidas
from schemas.mensagem_schema import ConversaResponse, MensagemEnviar, MensagemResponse, NaoLidasResponse
from security import get_current_user

router = APIRouter(prefix="/mensagens", tags=["Mensagens"])


def _exigir_participante(usuario: dict) -> dict:
    if usuario["perfil"] not in ("nutricionista", "paciente"):
        raise HTTPException(status_code=403, detail="O bate-papo é exclusivo para nutricionistas e pacientes.")
    return usuario


def _exigir_vinculo(usuario: dict, contato_id: str) -> None:
    if not pode_conversar(usuario, contato_id):
        raise HTTPException(
            status_code=403,
            detail="Você só pode conversar com quem tem consulta confirmada ou plano alimentar com você.",
        )


@router.get("/conversas", response_model=list[ConversaResponse])
def consultar_conversas(usuario: dict = Depends(get_current_user)):
    return listar_conversas(_exigir_participante(usuario))


@router.get("/nao-lidas", response_model=NaoLidasResponse)
def consultar_nao_lidas(usuario: dict = Depends(get_current_user)):
    return resumo_nao_lidas(_exigir_participante(usuario))


@router.get("/{contato_id}", response_model=list[MensagemResponse])
def consultar_mensagens(contato_id: str, usuario: dict = Depends(get_current_user)):
    _exigir_participante(usuario)
    _exigir_vinculo(usuario, contato_id)
    return listar_mensagens(usuario, contato_id)


@router.post("/{contato_id}", response_model=MensagemResponse, status_code=status.HTTP_201_CREATED)
def enviar(contato_id: str, mensagem: MensagemEnviar, usuario: dict = Depends(get_current_user)):
    _exigir_participante(usuario)
    _exigir_vinculo(usuario, contato_id)
    return enviar_mensagem(usuario, contato_id, mensagem.texto)
