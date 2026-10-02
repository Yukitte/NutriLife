from datetime import datetime, timezone

from bson import ObjectId
from pymongo import ReturnDocument

from database.connection import get_database
from schemas.comentario_schema import ComentarioSalvar


def _primeiro_nome(nome: str | None) -> str:
    return (nome or "Paciente").split(" ")[0]


def _serializar(comentario: dict, nome_paciente: str | None = None) -> dict:
    resposta = comentario.get("resposta")
    return {
        "id": str(comentario["_id"]),
        "autor": "Anônimo" if comentario.get("anonimo") else _primeiro_nome(nome_paciente),
        "anonimo": bool(comentario.get("anonimo")),
        "nota": comentario["nota"],
        "comentario": comentario["comentario"],
        "criado_em": comentario["criado_em"],
        "atualizado_em": comentario.get("atualizado_em"),
        "resposta": resposta if resposta and resposta.get("texto") else None,
    }


def paciente_pode_comentar(paciente_id: str, nutricionista_id: str) -> bool:
    if not ObjectId.is_valid(paciente_id) or not ObjectId.is_valid(nutricionista_id):
        return False
    database = get_database()
    vinculo = {"paciente_id": ObjectId(paciente_id), "nutricionista_id": ObjectId(nutricionista_id)}
    consulta = database["consultas"].find_one(
        {**vinculo, "status": "confirmada", "inicio": {"$lte": datetime.now(timezone.utc)}},
        {"_id": 1},
    )
    if consulta is not None:
        return True
    return database["planos"].find_one(vinculo, {"_id": 1}) is not None


def _nutricionista_existe(nutricionista_id: str) -> bool:
    if not ObjectId.is_valid(nutricionista_id):
        return False
    return get_database()["usuarios"].find_one(
        {"_id": ObjectId(nutricionista_id), "perfil": "nutricionista", "ativo": {"$ne": False}},
        {"_id": 1},
    ) is not None


def _recalcular_nota_media(nutricionista_id: ObjectId) -> None:
    database = get_database()
    resultado = list(database["comentarios"].aggregate([
        {"$match": {"nutricionista_id": nutricionista_id}},
        {"$group": {"_id": None, "media": {"$avg": "$nota"}}},
    ]))
    media = round(resultado[0]["media"], 1) if resultado else 0
    database["usuarios"].update_one({"_id": nutricionista_id}, {"$set": {"nota_media": media}})


def listar_comentarios(nutricionista_id: str) -> list[dict] | None:
    if not _nutricionista_existe(nutricionista_id):
        return None
    database = get_database()
    comentarios = list(
        database["comentarios"].find({"nutricionista_id": ObjectId(nutricionista_id)}).sort("criado_em", -1)
    )
    ids = [comentario["paciente_id"] for comentario in comentarios]
    nomes = {
        paciente["_id"]: paciente.get("nome")
        for paciente in database["usuarios"].find({"_id": {"$in": ids}}, {"nome": 1})
    }
    return [_serializar(comentario, nomes.get(comentario["paciente_id"])) for comentario in comentarios]


def obter_meu_comentario(paciente: dict, nutricionista_id: str) -> dict | None:
    if not _nutricionista_existe(nutricionista_id):
        return None
    comentario = get_database()["comentarios"].find_one(
        {"paciente_id": ObjectId(paciente["id"]), "nutricionista_id": ObjectId(nutricionista_id)}
    )
    return {
        "pode_comentar": paciente_pode_comentar(paciente["id"], nutricionista_id),
        "comentario": _serializar(comentario, paciente.get("nome")) if comentario else None,
    }


def salvar_comentario(paciente: dict, nutricionista_id: str, dados: ComentarioSalvar) -> dict:
    agora = datetime.now(timezone.utc)
    nutri_id = ObjectId(nutricionista_id)
    comentario = get_database()["comentarios"].find_one_and_update(
        {"paciente_id": ObjectId(paciente["id"]), "nutricionista_id": nutri_id},
        {
            "$set": {**dados.model_dump(), "atualizado_em": agora},
            "$setOnInsert": {"criado_em": agora},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    _recalcular_nota_media(nutri_id)
    return _serializar(comentario, paciente.get("nome"))


def responder_comentario(nutricionista: dict, comentario_id: str, texto: str) -> dict | None:
    if not ObjectId.is_valid(comentario_id):
        return None
    comentario = get_database()["comentarios"].find_one_and_update(
        {"_id": ObjectId(comentario_id), "nutricionista_id": ObjectId(nutricionista["id"])},
        {"$set": {"resposta": {"texto": texto, "respondido_em": datetime.now(timezone.utc)}}},
        return_document=ReturnDocument.AFTER,
    )
    if comentario is None:
        return None
    paciente = get_database()["usuarios"].find_one({"_id": comentario["paciente_id"]}, {"nome": 1})
    return _serializar(comentario, paciente.get("nome") if paciente else None)
