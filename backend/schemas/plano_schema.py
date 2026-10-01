from pydantic import BaseModel, ConfigDict, Field, field_validator


class PlanoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paciente_id: str = Field(min_length=24, max_length=24)
    titulo: str = Field(min_length=3, max_length=120)
    descricao: str = Field(min_length=1, max_length=1000)
    refeicoes: list[str] = Field(min_length=1, max_length=12)

    @field_validator("titulo", "descricao")
    @classmethod
    def campos_nao_vazios(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Este campo não pode ficar vazio.")
        return value

    @field_validator("refeicoes")
    @classmethod
    def validar_refeicoes(cls, value: list[str]) -> list[str]:
        meals = [meal.strip() for meal in value]
        if any(not meal for meal in meals):
            raise ValueError("As refeições não podem ficar vazias.")
        return meals


class PlanoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    titulo: str | None = Field(default=None, min_length=3, max_length=120)
    descricao: str | None = Field(default=None, min_length=1, max_length=1000)
    refeicoes: list[str] | None = Field(default=None, min_length=1, max_length=12)

    @field_validator("titulo", "descricao")
    @classmethod
    def campos_nao_vazios(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Este campo não pode ficar vazio.")
        return value

    @field_validator("refeicoes")
    @classmethod
    def validar_refeicoes(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        meals = [meal.strip() for meal in value]
        if any(not meal for meal in meals):
            raise ValueError("As refeições não podem ficar vazias.")
        return meals


class PlanoResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    paciente_id: str
    paciente_nome: str
    nutricionista_id: str
    nutricionista_nome: str
    titulo: str
    descricao: str
    refeicoes: list[str]
