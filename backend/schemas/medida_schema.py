from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Dobra = float | None
Circunferencia = float | None


class Dobras(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tricipital: Dobra = Field(default=None, ge=0, le=100)
    bicipital: Dobra = Field(default=None, ge=0, le=100)
    abdominal: Dobra = Field(default=None, ge=0, le=100)
    subescapular: Dobra = Field(default=None, ge=0, le=100)
    axilar_media: Dobra = Field(default=None, ge=0, le=100)
    coxa: Dobra = Field(default=None, ge=0, le=100)
    toracica: Dobra = Field(default=None, ge=0, le=100)
    suprailiaca: Dobra = Field(default=None, ge=0, le=100)
    panturrilha: Dobra = Field(default=None, ge=0, le=100)
    supraespinhal: Dobra = Field(default=None, ge=0, le=100)


class Circunferencias(BaseModel):
    model_config = ConfigDict(extra="forbid")

    pescoco: Circunferencia = Field(default=None, gt=0, le=100)
    torax: Circunferencia = Field(default=None, gt=0, le=250)
    ombro: Circunferencia = Field(default=None, gt=0, le=250)
    cintura: Circunferencia = Field(default=None, gt=0, le=250)
    quadril: Circunferencia = Field(default=None, gt=0, le=250)
    abdomen: Circunferencia = Field(default=None, gt=0, le=250)
    braco_relaxado: Circunferencia = Field(default=None, gt=0, le=100)
    braco_contraido: Circunferencia = Field(default=None, gt=0, le=100)
    antebraco: Circunferencia = Field(default=None, gt=0, le=100)
    coxa_proximal: Circunferencia = Field(default=None, gt=0, le=150)
    coxa_medial: Circunferencia = Field(default=None, gt=0, le=150)
    coxa_distal: Circunferencia = Field(default=None, gt=0, le=150)
    panturrilha: Circunferencia = Field(default=None, gt=0, le=100)


class MedidaSalvar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    data_avaliacao: date
    sexo_biologico: Literal["feminino", "masculino"]
    idade_anos: int = Field(ge=2, le=120)
    peso_kg: float = Field(gt=0, le=500, allow_inf_nan=False)
    altura_cm: float = Field(ge=50, le=260, allow_inf_nan=False)
    dobras: Dobras = Field(default_factory=Dobras)
    circunferencias: Circunferencias = Field(default_factory=Circunferencias)
    protocolo_gordura: Literal["pollock7", "pollock3"] | None = None
    nivel_atividade: Literal["sedentario", "leve", "moderado", "intenso", "muito_intenso"] | None = None
    observacoes: str = Field(default="", max_length=1000)

    @field_validator("data_avaliacao")
    @classmethod
    def data_nao_futura(cls, value: date) -> date:
        if value > date.today():
            raise ValueError("A data da avaliação não pode estar no futuro.")
        return value

    @field_validator("observacoes")
    @classmethod
    def limpar_observacoes(cls, value: str) -> str:
        return value.strip()


class Resultados(BaseModel):
    imc: float
    classificacao_imc: str
    rcq: float | None = None
    risco_rcq: str | None = None
    rce: float | None = None
    risco_rce: str | None = None
    cmb_cm: float | None = None
    adequacao_cmb: float | None = None
    classificacao_cmb: str | None = None
    soma_dobras_mm: float | None = None
    soma_dobras_metodo_mm: float | None = None
    densidade_corporal: float | None = None
    percentual_gordura: float | None = None
    classificacao_gordura: str | None = None
    massa_gordura_kg: float | None = None
    massa_livre_gordura_kg: float | None = None
    massa_residual_kg: float | None = None
    metodo_gordura: str | None = None
    protocolo_gordura: Literal["pollock7", "pollock3"] | None = None
    dobras_faltando: list[str] = Field(default_factory=list)
    percentual_gordura_pollock7: float | None = None
    percentual_gordura_pollock3: float | None = None
    tmb_kcal: int | None = None
    fator_atividade: float | None = None
    get_kcal: int | None = None


class MedidaResponse(MedidaSalvar):
    model_config = ConfigDict(extra="forbid")

    id: str
    paciente_id: str
    nutricionista_id: str | None = None
    nutricionista_nome: str | None = None
    resultados: Resultados
