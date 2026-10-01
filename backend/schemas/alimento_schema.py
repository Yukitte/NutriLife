from pydantic import BaseModel, ConfigDict, Field


class NutrientesAlimento(BaseModel):
    model_config = ConfigDict(extra="forbid")

    energia_kcal: float | None = None
    proteina_g: float | None = None
    carboidrato_g: float | None = None
    gordura_g: float | None = None
    fibra_g: float | None = None
    sodio_mg: float | None = None


class PorcaoAlimento(BaseModel):
    model_config = ConfigDict(extra="forbid")

    label: str
    gram_weight: float = Field(gt=0)


class AlimentoCatalogo(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    name: str
    category: str
    nutrients_per_100g: NutrientesAlimento
    portions: list[PorcaoAlimento]


class BuscaAlimentosResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    total: int
    offset: int
    limit: int
    items: list[AlimentoCatalogo]
