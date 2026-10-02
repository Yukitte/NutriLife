from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pymongo.errors import DuplicateKeyError

from crud.consulta_crud import (
    cancelar_consulta,
    confirmar_consulta,
    criar_consulta,
    listar_consultas,
    listar_horarios_livres,
    obter_avaliacao_consulta,
    obter_disponibilidade,
    salvar_disponibilidade,
    salvar_avaliacao_consulta,
)
from schemas.consulta_schema import (
    ConsultaAvaliacaoDetalhe,
    ConsultaAvaliacaoResumo,
    ConsultaAvaliacaoUpdate,
    ConsultaConfirmar,
    ConsultaCreate,
    ConsultaResponse,
    DisponibilidadePublica,
    DisponibilidadeUpdate,
)
from security import get_current_user, require_nutritionist

router = APIRouter(prefix="/consultas", tags=["Consultas"])


@router.get("/disponibilidade", response_model=list[DisponibilidadePublica])
def consultar_horarios_disponiveis(
    nutricionista_id: str,
    inicio: date,
    fim: date,
):
    if fim < inicio or (fim - inicio).days > 31:
        raise HTTPException(status_code=422, detail="Consulte um período de até 32 dias.")
    slots = listar_horarios_livres(nutricionista_id, inicio, fim)
    if slots is None:
        raise HTTPException(status_code=404, detail="Nutricionista não encontrado.")
    return slots


@router.get("/minha-disponibilidade")
def consultar_minha_disponibilidade(
    nutricionista: dict = Depends(require_nutritionist),
):
    availability = obter_disponibilidade(nutricionista["id"])
    if availability is None:
        raise HTTPException(status_code=404, detail="Nutricionista não encontrado.")
    return availability


@router.put("/minha-disponibilidade")
def atualizar_minha_disponibilidade(
    availability: DisponibilidadeUpdate,
    nutricionista: dict = Depends(require_nutritionist),
):
    return salvar_disponibilidade(nutricionista, availability)


@router.get("", response_model=list[ConsultaResponse])
def consultar_minhas_consultas(usuario: dict = Depends(get_current_user)):
    return listar_consultas(usuario)


@router.get(
    "/{consulta_id}/avaliacao",
    response_model=ConsultaAvaliacaoDetalhe | ConsultaAvaliacaoResumo,
)
def consultar_avaliacao(
    consulta_id: str,
    usuario: dict = Depends(get_current_user),
):
    assessment = obter_avaliacao_consulta(consulta_id, usuario)
    if assessment is None:
        raise HTTPException(status_code=404, detail="Avaliação não encontrada.")
    return assessment


@router.put(
    "/{consulta_id}/avaliacao",
    response_model=ConsultaAvaliacaoDetalhe,
)
def registrar_avaliacao(
    consulta_id: str,
    avaliacao: ConsultaAvaliacaoUpdate,
    nutricionista: dict = Depends(require_nutritionist),
):
    assessment = salvar_avaliacao_consulta(consulta_id, avaliacao, nutricionista)
    if assessment is None:
        raise HTTPException(
            status_code=404,
            detail="Consulta confirmada não encontrada para esta nutricionista.",
        )
    return assessment


@router.post("", response_model=ConsultaResponse, status_code=status.HTTP_201_CREATED)
def marcar_consulta(
    consulta: ConsultaCreate,
    paciente: dict = Depends(get_current_user),
):
    if paciente["perfil"] != "paciente":
        raise HTTPException(status_code=403, detail="Somente pacientes podem agendar.")
    try:
        created = criar_consulta(paciente, consulta)
    except ValueError as error:
        raise HTTPException(status_code=409, detail=str(error)) from error
    except DuplicateKeyError as error:
        raise HTTPException(status_code=409, detail="Este horário acabou de ser reservado.") from error
    if created is None:
        raise HTTPException(status_code=404, detail="Nutricionista não encontrada.")
    return created


@router.put("/{consulta_id}/confirmar", response_model=ConsultaResponse)
@router.put("/{consulta_id}/confirmar-pagamento", response_model=ConsultaResponse)
def confirmar(
    consulta_id: str,
    meeting: ConsultaConfirmar,
    nutricionista: dict = Depends(require_nutritionist),
):
    appointment = confirmar_consulta(consulta_id, meeting, nutricionista)
    if appointment is None:
        raise HTTPException(
            status_code=404,
            detail="Consulta pendente não encontrada para esta nutricionista.",
        )
    return appointment


@router.put("/{consulta_id}/cancelar", response_model=ConsultaResponse)
def cancelar(
    consulta_id: str,
    usuario: dict = Depends(get_current_user),
):
    appointment = cancelar_consulta(consulta_id, usuario)
    if appointment is None:
        raise HTTPException(status_code=404, detail="Consulta não encontrada.")
    return appointment
