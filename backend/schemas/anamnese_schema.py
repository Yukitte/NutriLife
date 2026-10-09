from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Texto = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]
TextoLongo = Annotated[str, StringConstraints(strip_whitespace=True, max_length=3000)]
Horario = Annotated[str, StringConstraints(pattern=r"^([01]\d|2[0-3]):[0-5]\d$")]


class AnamneseSalvar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    objetivo: Texto = ""
    motivo_consulta: Texto = ""
    doencas: Texto = ""
    medicamentos: Texto = ""
    suplementos: Texto = ""
    cirurgias: Texto = ""
    historico_familiar: Texto = ""
    alergias_intolerancias: Texto = ""
    exames_recentes: Texto = ""
    saude_feminina: Texto = ""
    profissao: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] = ""
    horario_acorda: Horario | None = None
    horario_dorme: Horario | None = None
    qualidade_sono: Literal["boa", "regular", "ruim"] | None = None
    nivel_estresse: Literal["baixo", "moderado", "alto"] | None = None
    atividade_fisica: Texto = ""
    tabagismo: Literal["nao", "ex_fumante", "sim"] | None = None
    consumo_alcool: Literal["nao", "ocasional", "frequente"] | None = None
    refeicoes_por_dia: int | None = Field(default=None, ge=1, le=12)
    consumo_agua_litros: float | None = Field(default=None, ge=0, le=10, allow_inf_nan=False)
    funcionamento_intestinal: Literal["regular", "preso", "solto", "alternado"] | None = None
    apetite: Literal["pouco", "normal", "aumentado"] | None = None
    restricoes: list[Literal["vegetariano", "vegano", "sem_lactose", "sem_gluten", "low_carb"]] = Field(default_factory=list, max_length=5)
    preferencias: Texto = ""
    aversoes: Texto = ""
    quem_prepara: Texto = ""
    come_fora: Texto = ""
    recordatorio_24h: TextoLongo = ""
    observacoes_nutricionista: TextoLongo = ""


class AnamneseResponse(AnamneseSalvar):
    model_config = ConfigDict(extra="forbid")

    paciente_id: str
    preenchida: bool
    atualizada_em: datetime | None = None
    atualizada_por_nome: str | None = None
    atualizada_por_perfil: str | None = None
