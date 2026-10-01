from datetime import date, datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import AnyHttpUrl, BaseModel, ConfigDict, Field, field_validator


class HorarioDisponivel(BaseModel):
    model_config = ConfigDict(extra="forbid")

    dia_semana: int = Field(ge=0, le=6)
    inicio: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    fim: str = Field(pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    duracao_minutos: int = Field(default=60, ge=15, le=180)


class DisponibilidadeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    fuso_horario: str = "America/Sao_Paulo"
    horarios: list[HorarioDisponivel] = Field(max_length=42)

    @field_validator("fuso_horario")
    @classmethod
    def validar_fuso(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except ZoneInfoNotFoundError as error:
            raise ValueError("Fuso horário inválido.") from error
        return value

    @field_validator("horarios")
    @classmethod
    def validar_periodos(cls, value: list[HorarioDisponivel]):
        windows_by_day: dict[int, list[tuple[str, str]]] = {}
        for availability in value:
            if availability.inicio >= availability.fim:
                raise ValueError("O horário final deve ser posterior ao inicial.")
            windows_by_day.setdefault(availability.dia_semana, []).append(
                (availability.inicio, availability.fim)
            )
        for windows in windows_by_day.values():
            windows.sort()
            if any(
                current[0] < previous[1]
                for previous, current in zip(windows, windows[1:])
            ):
                raise ValueError("Horários no mesmo dia não podem se sobrepor.")
        return value


class ConsultaCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    nutricionista_id: str = Field(min_length=24, max_length=24)
    inicio: datetime

    @field_validator("inicio")
    @classmethod
    def exigir_data_com_fuso(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("A data da consulta deve incluir fuso horário.")
        return value


class ConsultaConfirmar(BaseModel):
    model_config = ConfigDict(extra="forbid")

    link_reuniao: AnyHttpUrl

    @field_validator("link_reuniao")
    @classmethod
    def validar_link_teams(cls, value: AnyHttpUrl) -> AnyHttpUrl:
        if value.scheme != "https":
            raise ValueError("O link da reunião deve usar HTTPS.")
        if value.host not in {"teams.microsoft.com", "teams.live.com"}:
            raise ValueError("Informe um link válido de reunião do Microsoft Teams.")
        return value


class ConsultaResponse(BaseModel):
    id: str
    paciente_id: str
    paciente_nome: str
    nutricionista_id: str
    nutricionista_nome: str
    inicio: datetime
    status: Literal["pendente_pagamento", "confirmada", "cancelada"]
    link_pagamento: str | None = None
    link_reuniao: str | None = None


class DisponibilidadePublica(BaseModel):
    nutricionista_id: str
    data_local: date
    inicio: datetime
    fim: datetime
