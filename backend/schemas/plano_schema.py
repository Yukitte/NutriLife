from pydantic import BaseModel, ConfigDict, Field, field_validator


class OpcaoAlimento(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=2, max_length=120)
    quantidade: float = Field(gt=0, le=10000)
    medida: str = Field(min_length=1, max_length=40)
    calorias: int = Field(ge=0, le=10000)

    @field_validator("nome", "medida")
    @classmethod
    def campos_nao_vazios(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Este campo não pode ficar vazio.")
        return value


class RefeicaoPlano(BaseModel):
    model_config = ConfigDict(extra="forbid")

    horario: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    nome: str = Field(min_length=2, max_length=120)
    opcoes: list[OpcaoAlimento] = Field(min_length=1, max_length=10)

    @field_validator("nome")
    @classmethod
    def validar_nome(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Informe o nome da refeição.")
        return value


class PlanoCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    paciente_id: str = Field(min_length=24, max_length=24)
    titulo: str = Field(min_length=3, max_length=120)
    objetivo: str = Field(min_length=2, max_length=160)
    duracao_meses: int = Field(ge=1, le=60)
    descricao: str = Field(min_length=1, max_length=1000)
    refeicoes: list[RefeicaoPlano] = Field(min_length=1, max_length=12)

    @field_validator("titulo", "objetivo", "descricao")
    @classmethod
    def campos_nao_vazios(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Este campo não pode ficar vazio.")
        return value


class PlanoUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    titulo: str | None = Field(default=None, min_length=3, max_length=120)
    objetivo: str | None = Field(default=None, min_length=2, max_length=160)
    duracao_meses: int | None = Field(default=None, ge=1, le=60)
    descricao: str | None = Field(default=None, min_length=1, max_length=1000)
    refeicoes: list[RefeicaoPlano] | None = Field(default=None, min_length=1, max_length=12)

    @field_validator("titulo", "objetivo", "descricao")
    @classmethod
    def campos_nao_vazios(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("Este campo não pode ficar vazio.")
        return value


class PlanoResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    paciente_id: str
    paciente_nome: str
    nutricionista_id: str
    nutricionista_nome: str
    titulo: str
    objetivo: str
    duracao_meses: int
    descricao: str
    refeicoes: list[RefeicaoPlano]
