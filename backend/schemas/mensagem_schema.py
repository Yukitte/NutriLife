from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator


class MensagemEnviar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    texto: str = Field(min_length=1, max_length=2000)

    @field_validator("texto")
    @classmethod
    def limpar_texto(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Escreva uma mensagem.")
        return value


class MensagemResponse(BaseModel):
    id: str
    remetente_id: str
    destinatario_id: str
    texto: str
    criada_em: datetime
    lida_em: datetime | None = None
    minha: bool


class ConversaResponse(BaseModel):
    contato_id: str
    contato_nome: str
    contato_perfil: str
    ultima_mensagem: str | None = None
    ultima_em: datetime | None = None
    ultima_minha: bool = False
    nao_lidas: int = 0


class NaoLidasResponse(BaseModel):
    total: int
    ultima_id: str | None = None
    ultima_texto: str | None = None
    ultima_remetente_id: str | None = None
    ultima_remetente_nome: str | None = None
