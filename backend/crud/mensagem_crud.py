from datetime import datetime, timezone

from bson import ObjectId

from database.connection import get_database


def _ids_vinculados(usuario: dict) -> set[ObjectId]:
    if usuario["perfil"] == "nutricionista":
        campo_proprio, campo_contato = "nutricionista_id", "paciente_id"
    elif usuario["perfil"] == "paciente":
        campo_proprio, campo_contato = "paciente_id", "nutricionista_id"
    else:
        return set()
    database = get_database()
    usuario_id = ObjectId(usuario["id"])
    ids = {
        consulta[campo_contato]
        for consulta in database["consultas"].find(
            {campo_proprio: usuario_id, "status": "confirmada"},
            {campo_contato: 1},
        )
    }
    ids.update(
        plano[campo_contato]
        for plano in database["planos"].find({campo_proprio: usuario_id}, {campo_contato: 1})
    )
    return ids


def pode_conversar(usuario: dict, contato_id: str) -> bool:
    return ObjectId.is_valid(contato_id) and ObjectId(contato_id) in _ids_vinculados(usuario)


def _filtro_conversa(usuario_id: ObjectId, contato_id: ObjectId) -> dict:
    return {
        "$or": [
            {"remetente_id": usuario_id, "destinatario_id": contato_id},
            {"remetente_id": contato_id, "destinatario_id": usuario_id},
        ]
    }


def _com_fuso(valor: datetime | None) -> datetime | None:
    if valor is not None and valor.tzinfo is None:
        return valor.replace(tzinfo=timezone.utc)
    return valor


def _serializar(mensagem: dict, usuario_id: ObjectId) -> dict:
    return {
        "id": str(mensagem["_id"]),
        "remetente_id": str(mensagem["remetente_id"]),
        "destinatario_id": str(mensagem["destinatario_id"]),
        "texto": mensagem["texto"],
        "criada_em": _com_fuso(mensagem["criada_em"]),
        "lida_em": _com_fuso(mensagem.get("lida_em")),
        "minha": mensagem["remetente_id"] == usuario_id,
    }


def listar_conversas(usuario: dict) -> list[dict]:
    contatos = _ids_vinculados(usuario)
    if not contatos:
        return []
    database = get_database()
    usuario_id = ObjectId(usuario["id"])
    pessoas = database["usuarios"].find(
        {"_id": {"$in": list(contatos)}, "ativo": {"$ne": False}},
        {"nome": 1, "perfil": 1},
    )
    ultimas = {
        item["_id"]: item["mensagem"]
        for item in database["mensagens"].aggregate([
            {"$match": {"$or": [{"remetente_id": usuario_id}, {"destinatario_id": usuario_id}]}},
            {"$sort": {"criada_em": -1}},
            {"$group": {
                "_id": {"$cond": [{"$eq": ["$remetente_id", usuario_id]}, "$destinatario_id", "$remetente_id"]},
                "mensagem": {"$first": "$$ROOT"},
            }},
        ])
    }
    nao_lidas = {
        item["_id"]: item["total"]
        for item in database["mensagens"].aggregate([
            {"$match": {"destinatario_id": usuario_id, "lida_em": None}},
            {"$group": {"_id": "$remetente_id", "total": {"$sum": 1}}},
        ])
    }
    conversas = []
    for pessoa in pessoas:
        ultima = ultimas.get(pessoa["_id"])
        conversas.append({
            "contato_id": str(pessoa["_id"]),
            "contato_nome": pessoa["nome"],
            "contato_perfil": pessoa.get("perfil", ""),
            "ultima_mensagem": ultima["texto"] if ultima else None,
            "ultima_em": _com_fuso(ultima["criada_em"]) if ultima else None,
            "ultima_minha": bool(ultima and ultima["remetente_id"] == usuario_id),
            "nao_lidas": nao_lidas.get(pessoa["_id"], 0),
        })
    sem_data = datetime.min.replace(tzinfo=timezone.utc)
    conversas.sort(key=lambda conversa: (conversa["ultima_em"] or sem_data, conversa["contato_nome"]), reverse=True)
    return conversas


def listar_mensagens(usuario: dict, contato_id: str, limite: int = 200) -> list[dict]:
    database = get_database()
    usuario_id = ObjectId(usuario["id"])
    contato = ObjectId(contato_id)
    database["mensagens"].update_many(
        {"remetente_id": contato, "destinatario_id": usuario_id, "lida_em": None},
        {"$set": {"lida_em": datetime.now(timezone.utc)}},
    )
    mensagens = list(
        database["mensagens"].find(_filtro_conversa(usuario_id, contato)).sort("criada_em", -1).limit(limite)
    )
    return [_serializar(mensagem, usuario_id) for mensagem in reversed(mensagens)]


def enviar_mensagem(usuario: dict, contato_id: str, texto: str) -> dict:
    documento = {
        "remetente_id": ObjectId(usuario["id"]),
        "destinatario_id": ObjectId(contato_id),
        "texto": texto,
        "criada_em": datetime.now(timezone.utc),
        "lida_em": None,
    }
    resultado = get_database()["mensagens"].insert_one(documento)
    return _serializar({**documento, "_id": resultado.inserted_id}, documento["remetente_id"])


def resumo_nao_lidas(usuario: dict) -> dict:
    database = get_database()
    filtro = {"destinatario_id": ObjectId(usuario["id"]), "lida_em": None}
    total = database["mensagens"].count_documents(filtro)
    if not total:
        return {"total": 0}
    ultima = database["mensagens"].find_one(filtro, sort=[("criada_em", -1)])
    remetente = database["usuarios"].find_one({"_id": ultima["remetente_id"]}, {"nome": 1})
    return {
        "total": total,
        "ultima_id": str(ultima["_id"]),
        "ultima_texto": ultima["texto"],
        "ultima_remetente_id": str(ultima["remetente_id"]),
        "ultima_remetente_nome": remetente["nome"] if remetente else "Contato",
    }
