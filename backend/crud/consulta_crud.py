from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from bson import ObjectId
from pymongo import ReturnDocument

from database.connection import get_database
from schemas.consulta_schema import (
    ConsultaCreate,
    ConsultaConfirmar,
    DisponibilidadeUpdate,
)


def salvar_disponibilidade(
    nutricionista: dict,
    disponibilidade: DisponibilidadeUpdate,
) -> dict:
    get_database()["usuarios"].update_one(
        {"_id": ObjectId(nutricionista["id"]), "perfil": "nutricionista"},
        {
            "$set": {
                "fuso_horario": disponibilidade.fuso_horario,
                "horarios": [
                    horario.model_dump() for horario in disponibilidade.horarios
                ],
            }
        },
    )
    return {
        "fuso_horario": disponibilidade.fuso_horario,
        "horarios": [horario.model_dump() for horario in disponibilidade.horarios],
    }


def obter_disponibilidade(nutricionista_id: str) -> dict | None:
    if not ObjectId.is_valid(nutricionista_id):
        return None
    nutritionist = get_database()["usuarios"].find_one(
        {"_id": ObjectId(nutricionista_id), "perfil": "nutricionista"},
        {"fuso_horario": 1, "horarios": 1},
    )
    if nutritionist is None:
        return None
    return {
        "fuso_horario": nutritionist.get("fuso_horario", "America/Sao_Paulo"),
        "horarios": nutritionist.get("horarios", []),
    }


def listar_horarios_livres(
    nutricionista_id: str,
    inicio: date,
    fim: date,
) -> list[dict] | None:
    availability = obter_disponibilidade(nutricionista_id)
    if availability is None:
        return None

    timezone_info = ZoneInfo(availability["fuso_horario"])
    busy = {
        consulta["inicio"]
        for consulta in get_database()["consultas"].find(
            {
                "nutricionista_id": ObjectId(nutricionista_id),
                "status": {"$ne": "cancelada"},
                "inicio": {
                    "$gte": datetime.combine(inicio, time.min, timezone_info).astimezone(timezone.utc),
                    "$lt": datetime.combine(fim + timedelta(days=1), time.min, timezone_info).astimezone(timezone.utc),
                },
            },
            {"inicio": 1},
        )
    }
    busy = {
        value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value
        for value in busy
    }

    slots = []
    now = datetime.now(timezone.utc)
    current_day = inicio
    while current_day <= fim:
        for window in availability["horarios"]:
            if window["dia_semana"] != current_day.weekday():
                continue
            start_hour, start_minute = map(int, window["inicio"].split(":"))
            end_hour, end_minute = map(int, window["fim"].split(":"))
            slot = datetime.combine(
                current_day,
                time(start_hour, start_minute),
                timezone_info,
            )
            window_end = datetime.combine(
                current_day,
                time(end_hour, end_minute),
                timezone_info,
            )
            duration = timedelta(minutes=window["duracao_minutos"])
            while slot + duration <= window_end:
                slot_utc = slot.astimezone(timezone.utc)
                if slot_utc > now and slot_utc not in busy:
                    slots.append(
                        {
                            "nutricionista_id": nutricionista_id,
                            "data_local": current_day,
                            "inicio": slot_utc,
                            "fim": slot_utc + duration,
                        }
                    )
                slot += duration
        current_day += timedelta(days=1)
    return slots


def criar_consulta(paciente: dict, consulta: ConsultaCreate) -> dict | None:
    if not ObjectId.is_valid(consulta.nutricionista_id):
        return None

    nutritionist_id = ObjectId(consulta.nutricionista_id)
    nutritionist = get_database()["usuarios"].find_one(
        {"_id": nutritionist_id, "perfil": "nutricionista"}
    )
    if nutritionist is None:
        return None
    if not nutritionist.get("pagseguro_link"):
        raise ValueError("A nutricionista ainda não configurou o link de pagamento.")

    start = consulta.inicio.astimezone(timezone.utc)
    local_start = start.astimezone(ZoneInfo(nutritionist.get("fuso_horario", "America/Sao_Paulo")))
    duration_slots = listar_horarios_livres(
        consulta.nutricionista_id,
        local_start.date(),
        local_start.date(),
    )
    if duration_slots is None or not any(slot["inicio"] == start for slot in duration_slots):
        raise ValueError("Esse horário não está disponível.")

    document = {
        "paciente_id": ObjectId(paciente["id"]),
        "nutricionista_id": nutritionist_id,
        "inicio": start,
        "status": "pendente_pagamento",
        "link_pagamento": nutritionist.get("pagseguro_link"),
        "link_reuniao": None,
    }
    inserted = get_database()["consultas"].insert_one(document)
    return _serializar_consulta({**document, "_id": inserted.inserted_id})


def _serializar_consulta(consulta: dict) -> dict:
    database = get_database()
    patient = database["usuarios"].find_one({"_id": consulta["paciente_id"]})
    professional = database["usuarios"].find_one(
        {"_id": consulta["nutricionista_id"]}
    )
    return {
        "id": str(consulta["_id"]),
        "paciente_id": str(consulta["paciente_id"]),
        "paciente_nome": patient["nome"] if patient else "Paciente removido",
        "nutricionista_id": str(consulta["nutricionista_id"]),
        "nutricionista_nome": professional["nome"] if professional else "Nutricionista removido",
        "inicio": consulta["inicio"],
        "status": consulta["status"],
        "link_pagamento": consulta.get("link_pagamento"),
        "link_reuniao": consulta.get("link_reuniao"),
    }


def listar_consultas(usuario: dict) -> list[dict]:
    user_id = ObjectId(usuario["id"])
    field = "nutricionista_id" if usuario["perfil"] == "nutricionista" else "paciente_id"
    appointments = get_database()["consultas"].find({field: user_id}).sort("inicio", 1)
    return [_serializar_consulta(appointment) for appointment in appointments]


def confirmar_consulta(
    consulta_id: str,
    link: ConsultaConfirmar,
    nutricionista: dict,
) -> dict | None:
    if not ObjectId.is_valid(consulta_id):
        return None
    collection = get_database()["consultas"]
    query = {
        "_id": ObjectId(consulta_id),
        "nutricionista_id": ObjectId(nutricionista["id"]),
        "status": "pendente_pagamento",
    }
    appointment = collection.find_one_and_update(
        query,
        {"$set": {"status": "confirmada", "link_reuniao": str(link.link_reuniao)}},
        return_document=ReturnDocument.AFTER,
    )
    return _serializar_consulta(appointment) if appointment else None


def cancelar_consulta(consulta_id: str, usuario: dict) -> dict | None:
    if not ObjectId.is_valid(consulta_id):
        return None
    user_id = ObjectId(usuario["id"])
    collection = get_database()["consultas"]
    query = {"_id": ObjectId(consulta_id)}
    if usuario["perfil"] == "nutricionista":
        query["nutricionista_id"] = user_id
    else:
        query["paciente_id"] = user_id
    query["status"] = {"$in": ["pendente_pagamento", "confirmada"]}
    appointment = collection.find_one_and_update(
        query,
        {"$set": {"status": "cancelada"}},
        return_document=ReturnDocument.AFTER,
    )
    return _serializar_consulta(appointment) if appointment else None
