from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from catalogo_alimentos import buscar_alimento_por_id, carregar_fonte


class OpcaoAlimento(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nome: str = Field(min_length=2, max_length=250)
    quantidade: float = Field(gt=0, le=10000)
    medida: str = Field(min_length=1, max_length=40)
    calorias: int = Field(ge=0, le=100000)
    alimento_id: str | None = Field(default=None, min_length=1, max_length=24)
    categoria: str | None = Field(default=None, max_length=120)
    porcao: str | None = Field(default=None, max_length=250)
    fonte_dados: str | None = Field(default=None, max_length=120)
    energia_kcal: float | None = Field(default=None, ge=0, le=100000)
    proteina_g: float | None = Field(default=None, ge=0, le=10000)
    carboidrato_g: float | None = Field(default=None, ge=0, le=10000)
    gordura_g: float | None = Field(default=None, ge=0, le=10000)
    fibra_g: float | None = Field(default=None, ge=0, le=10000)
    sodio_mg: float | None = Field(default=None, ge=0, le=1000000)

    @field_validator("nome", "medida")
    @classmethod
    def campos_nao_vazios(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Este campo não pode ficar vazio.")
        return value

    @model_validator(mode="after")
    def preencher_dados_da_fonte(self):
        if not self.alimento_id:
            return self

        food = buscar_alimento_por_id(self.alimento_id)
        if food is None:
            raise ValueError("Alimento não encontrado no catálogo ativo.")
        if self.medida.casefold() not in {"g", "grama", "gramas"}:
            raise ValueError("Alimentos do catálogo devem ser informados em gramas.")

        per_100g = food["nutrients_per_100g"]
        factor = self.quantidade / 100
        energy = per_100g.get("energia_kcal")
        if energy is None:
            raise ValueError("O catálogo não informa energia para este alimento.")

        self.nome = food["name"]
        self.medida = "g"
        self.categoria = food["category"]
        self.fonte_dados = carregar_fonte()["name"]
        self.calorias = round(energy * factor)
        self.energia_kcal = energy * factor
        for field in (
            "proteina_g",
            "carboidrato_g",
            "gordura_g",
            "fibra_g",
            "sodio_mg",
        ):
            value = per_100g.get(field)
            setattr(self, field, value * factor if value is not None else None)
        return self


class ItemRefeicao(OpcaoAlimento):
    substituicoes: list[OpcaoAlimento] = Field(default_factory=list, max_length=5)


class RefeicaoPlano(BaseModel):
    model_config = ConfigDict(extra="forbid")

    horario: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    nome: str = Field(min_length=2, max_length=120)
    alimentos: list[ItemRefeicao] = Field(min_length=1, max_length=15)

    @model_validator(mode="before")
    @classmethod
    def converter_formato_antigo(cls, data):
        if isinstance(data, dict) and "alimentos" not in data and data.get("opcoes"):
            data = dict(data)
            principal, *substituicoes = data.pop("opcoes")
            data["alimentos"] = [{**principal, "substituicoes": substituicoes}]
        return data

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
