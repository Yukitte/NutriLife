from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class ComentarioSalvar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nota: int = Field(ge=1, le=5)
    comentario: str = Field(min_length=3, max_length=1000)
    anonimo: bool = False

    @field_validator("comentario")
    @classmethod
    def limpar_comentario(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 3:
            raise ValueError("Escreva um comentário com pelo menos 3 caracteres.")
        return value


class RespostaSalvar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    texto: str = Field(min_length=2, max_length=1000)

    @field_validator("texto")
    @classmethod
    def limpar_texto(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Escreva uma resposta.")
        return value


class RespostaPublica(BaseModel):
    texto: str
    respondido_em: datetime


class ComentarioPublico(BaseModel):
    id: str
    autor: str
    anonimo: bool
    nota: int
    comentario: str
    criado_em: datetime
    atualizado_em: datetime | None = None
    resposta: RespostaPublica | None = None


class MeuComentario(BaseModel):
    pode_comentar: bool
    comentario: ComentarioPublico | None = None
