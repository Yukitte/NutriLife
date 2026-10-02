from typing import Literal

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

ESTADOS_BR = {
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
    "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
    "SP", "SE", "TO",
}


def normalizar_cpf(value: str) -> str:
    digitos = "".join(character for character in value if character.isdigit())
    if len(digitos) != 11 or len(set(digitos)) == 1:
        raise ValueError("Informe um CPF válido.")
    for posicao in (9, 10):
        soma = sum(int(digitos[i]) * (posicao + 1 - i) for i in range(posicao))
        verificador = (soma * 10) % 11 % 10
        if verificador != int(digitos[posicao]):
            raise ValueError("Informe um CPF válido.")
    return digitos


class UsuarioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=2, max_length=120)
    email: EmailStr
    cpf: str = Field(min_length=11, max_length=14)
    telefone: str = Field(min_length=8, max_length=24)
    endereco: str = Field(min_length=3, max_length=200)
    cep: str = Field(min_length=8, max_length=9)
    estado: str = Field(min_length=2, max_length=2)
    senha: str = Field(min_length=8, max_length=128)
    tipo: Literal["paciente", "nutricionista"] = "paciente"
    crn: str | None = Field(default=None, min_length=4, max_length=20)

    @field_validator("nome", "endereco")
    @classmethod
    def campos_com_texto(cls, value: str) -> str:
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Informe um valor válido.")
        return value

    @field_validator("telefone")
    @classmethod
    def normalizar_telefone(cls, value: str) -> str:
        normalized = "".join(character for character in value if character.isdigit())
        if not 10 <= len(normalized) <= 13:
            raise ValueError("Informe um telefone com DDD.")
        return normalized

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, value: str) -> str:
        return normalizar_cpf(value)

    @field_validator("cep")
    @classmethod
    def normalizar_cep(cls, value: str) -> str:
        normalized = "".join(character for character in value if character.isdigit())
        if len(normalized) != 8:
            raise ValueError("O CEP deve ter 8 dígitos.")
        return normalized

    @field_validator("estado")
    @classmethod
    def normalizar_estado(cls, value: str) -> str:
        normalized = value.strip().upper()
        if normalized not in ESTADOS_BR:
            raise ValueError("Informe uma sigla de estado válida.")
        return normalized

    @field_validator("crn", mode="before")
    @classmethod
    def normalizar_crn(cls, value: object) -> object:
        if isinstance(value, str):
            normalized = value.strip().upper()
            return normalized or None
        return value

    @model_validator(mode="after")
    def validar_crn_do_profissional(self):
        if self.tipo == "nutricionista" and not self.crn:
            raise ValueError("Nutricionistas precisam informar o CRN.")
        if self.tipo == "paciente" and self.crn:
            raise ValueError("Pacientes não devem informar CRN.")
        return self


class UsuarioLogin(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr
    senha: str = Field(min_length=1, max_length=128)


class RecuperacaoSenhaSolicitar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    email: EmailStr


class RecuperacaoSenhaCpf(BaseModel):
    model_config = ConfigDict(extra="forbid")

    cpf: str = Field(min_length=11, max_length=14)
    email: EmailStr
    senha: str = Field(min_length=8, max_length=128)

    @field_validator("cpf")
    @classmethod
    def validar_cpf(cls, value: str) -> str:
        return normalizar_cpf(value)


class RecuperacaoSenhaConfirmar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    token: str = Field(min_length=20, max_length=4096)
    senha: str = Field(min_length=8, max_length=128)


class UsuarioUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str | None = Field(default=None, min_length=2, max_length=120)
    email: EmailStr | None = None
    telefone: str | None = Field(default=None, min_length=8, max_length=24)
    endereco: str | None = Field(default=None, min_length=3, max_length=200)
    cep: str | None = Field(default=None, min_length=8, max_length=9)
    estado: str | None = Field(default=None, min_length=2, max_length=2)
    crn: str | None = Field(default=None, min_length=4, max_length=20)
    especialidades: list[str] | None = Field(default=None, max_length=12)
    biografia: str | None = Field(default=None, max_length=2000)
    valor_consulta: float | None = Field(default=None, ge=0, le=100000)
    pagseguro_link: AnyHttpUrl | None = None

    @field_validator("nome", "endereco")
    @classmethod
    def validar_texto(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if len(value) < 2:
            raise ValueError("Informe um valor válido.")
        return value

    @field_validator("telefone")
    @classmethod
    def normalizar_telefone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = "".join(character for character in value if character.isdigit())
        if not 10 <= len(normalized) <= 13:
            raise ValueError("Informe um telefone com DDD.")
        return normalized

    @field_validator("cep")
    @classmethod
    def normalizar_cep(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = "".join(character for character in value if character.isdigit())
        if len(normalized) != 8:
            raise ValueError("O CEP deve ter 8 dígitos.")
        return normalized

    @field_validator("estado")
    @classmethod
    def normalizar_estado(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip().upper()
        if normalized not in ESTADOS_BR:
            raise ValueError("Informe uma sigla de estado válida.")
        return normalized

    @field_validator("especialidades")
    @classmethod
    def normalizar_especialidades(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        normalized = [specialty.strip() for specialty in value if specialty.strip()]
        if len(normalized) != len(value):
            raise ValueError("Especialidades não podem ficar vazias.")
        return normalized

    @field_validator("biografia")
    @classmethod
    def validar_biografia(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("A biografia não pode ficar vazia.")
        return value

    @field_validator("pagseguro_link")
    @classmethod
    def exigir_link_seguro(cls, value: AnyHttpUrl | None) -> AnyHttpUrl | None:
        if value is not None and value.scheme != "https":
            raise ValueError("O link de pagamento deve usar HTTPS.")
        return value


class AdministradorUsuarioUpdate(UsuarioUpdate):
    perfil: Literal["paciente", "nutricionista"] | None = None
    ativo: bool | None = None

    @model_validator(mode="after")
    def validar_perfil_administrado(self):
        if self.perfil == "nutricionista" and not self.crn:
            raise ValueError("Nutricionistas precisam informar o CRN.")
        return self


class UsuarioPublico(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    nome: str
    estado: str
    crn: str | None = None
    telefone: str | None = None
    especialidades: list[str] = Field(default_factory=list)
    biografia: str = ""
    valor_consulta: float = 0
    nota_media: float = 0
    total_pacientes: int = 0
    data_inicio: str
    distancia_km: float | None = None


class UsuarioResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    nome: str
    email: EmailStr
    perfil: Literal["paciente", "nutricionista", "administrador"]
    telefone: str = ""
    endereco: str = ""
    cep: str = ""
    estado: str = ""
    crn: str | None = None
    especialidades: list[str] = Field(default_factory=list)
    biografia: str = ""
    valor_consulta: float = 0
    pagseguro_link: str | None = None
    data_inicio: str
    ativo: bool = True


class TokenResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")

    access_token: str
    token_type: str = "bearer"
    usuario: UsuarioResponse
