from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from schemas.alimento_schema import NutrientesAlimento


class IngredienteReceita(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=1, max_length=200)
    alimento_id: str | None = Field(default=None, max_length=60)
    quantidade: float | None = Field(default=None, gt=0, le=10000)
    medida: str | None = Field(default=None, max_length=80)
    gramas: float | None = Field(default=None, gt=0, le=10000)

    @field_validator("nome")
    @classmethod
    def limpar_nome(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Informe o nome do ingrediente.")
        return value

    @model_validator(mode="after")
    def exigir_gramas_da_taco(self):
        if self.alimento_id and self.gramas is None:
            raise ValueError("Informe a quantidade do alimento da TACO.")
        return self


class ReceitaSalvar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    titulo: str = Field(min_length=3, max_length=120)
    categoria: str = Field(default="", max_length=60)
    tempo_preparo_min: int = Field(ge=1, le=600)
    porcoes: int = Field(ge=1, le=50)
    ingredientes: list[IngredienteReceita] = Field(min_length=1, max_length=40)
    modo_preparo: str = Field(min_length=3, max_length=4000)
    planos_ids: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("titulo", "modo_preparo")
    @classmethod
    def campos_nao_vazios(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Este campo não pode ficar vazio.")
        return value

    @field_validator("categoria")
    @classmethod
    def limpar_categoria(cls, value: str) -> str:
        return value.strip()

    @field_validator("planos_ids")
    @classmethod
    def planos_unicos(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))


class IngredienteCalculado(IngredienteReceita):
    energia_kcal: float | None = None


class PlanoVinculado(BaseModel):
    id: str
    titulo: str
    paciente_nome: str


class ReceitaResponse(BaseModel):
    id: str
    nutricionista_id: str
    nutricionista_nome: str
    titulo: str
    categoria: str
    tempo_preparo_min: int
    porcoes: int
    ingredientes: list[IngredienteCalculado]
    ingredientes_calculados: int
    nutricao_total: NutrientesAlimento
    nutricao_porcao: NutrientesAlimento
    modo_preparo: str
    planos: list[PlanoVinculado]
    criada_em: datetime
