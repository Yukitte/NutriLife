from datetime import datetime, timezone

from bson import ObjectId
from pymongo import ReturnDocument

from database.connection import get_database
from schemas.anamnese_schema import AnamneseSalvar

CAMPOS = list(AnamneseSalvar.model_fields)


def _com_fuso(valor: datetime | None) -> datetime | None:
    if valor is not None and valor.tzinfo is None:
        return valor.replace(tzinfo=timezone.utc)
    return valor


def _serializar(paciente_id: str, documento: dict | None, perfil: str) -> dict:
    vazia = AnamneseSalvar().model_dump()
    dados = {campo: (documento or {}).get(campo, vazia[campo]) for campo in CAMPOS}
    if perfil != "nutricionista":
        dados["observacoes_nutricionista"] = ""
    return {
        **dados,
        "paciente_id": paciente_id,
        "preenchida": documento is not None,
        "atualizada_em": _com_fuso((documento or {}).get("atualizada_em")),
        "atualizada_por_nome": (documento or {}).get("atualizada_por_nome"),
        "atualizada_por_perfil": (documento or {}).get("atualizada_por_perfil"),
    }


def buscar_anamnese(paciente_id: str, perfil: str) -> dict:
    documento = get_database()["anamneses"].find_one({"paciente_id": ObjectId(paciente_id)})
    return _serializar(paciente_id, documento, perfil)


def salvar_anamnese(paciente_id: str, usuario: dict, anamnese: AnamneseSalvar) -> dict:
    campos = anamnese.model_dump()
    if usuario["perfil"] != "nutricionista":
        campos.pop("observacoes_nutricionista")
    campos.update({
        "atualizada_em": datetime.now(timezone.utc),
        "atualizada_por_id": ObjectId(usuario["id"]),
        "atualizada_por_nome": usuario.get("nome"),
        "atualizada_por_perfil": usuario["perfil"],
    })
    documento = get_database()["anamneses"].find_one_and_update(
        {"paciente_id": ObjectId(paciente_id)},
        {"$set": campos, "$setOnInsert": {"criada_em": campos["atualizada_em"]}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return _serializar(paciente_id, documento, usuario["perfil"])
