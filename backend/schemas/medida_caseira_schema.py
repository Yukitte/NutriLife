from pydantic import BaseModel, ConfigDict, Field, field_validator


class MedidaCaseiraSalvar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rotulo: str = Field(min_length=2, max_length=60)
    gramas: float = Field(gt=0, le=5000)

    @field_validator("rotulo")
    @classmethod
    def limpar_rotulo(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Informe o nome da medida.")
        return value[:1].upper() + value[1:]


class MedidaCaseiraResponse(BaseModel):
    id: str
    alimento_id: str
    rotulo: str
    gramas: float
