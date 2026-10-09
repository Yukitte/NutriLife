from datetime import datetime, timezone
from hashlib import sha256
import hmac

from bson import ObjectId

from database.connection import get_database
from geolocalizacao import coordenadas_por_cep, distancia_km
from schemas.usuario_schema import AdministradorUsuarioUpdate, UsuarioCreate, UsuarioUpdate
from settings import get_settings


def hash_cpf(cpf: str) -> str:
    chave = get_settings().jwt_secret_key.encode()
    return hmac.new(chave, cpf.encode(), sha256).hexdigest()


def serializar_usuario(usuario: dict) -> dict:
    return {
        "id": str(usuario["_id"]),
        "nome": usuario["nome"],
        "email": usuario["email"],
        "perfil": usuario["perfil"],
        "telefone": usuario.get("telefone", ""),
        "endereco": usuario.get("endereco", ""),
        "cep": usuario.get("cep", ""),
        "estado": usuario.get("estado", ""),
        "crn": usuario.get("crn"),
        "especialidades": usuario.get("especialidades", []),
        "biografia": usuario.get("biografia", ""),
        "valor_consulta": usuario.get("valor_consulta", 0),
        "pagseguro_link": usuario.get("pagseguro_link"),
        "data_inicio": usuario.get("data_inicio", datetime.now(timezone.utc).date().isoformat()),
        "ativo": usuario.get("ativo", True),
    }


def criar_usuario(usuario: UsuarioCreate, senha_hash: str) -> dict:
    collection = get_database()["usuarios"]
    document = {
        "nome": usuario.nome.strip(),
        "email": str(usuario.email).lower(),
        "cpf_hash": hash_cpf(usuario.cpf),
        "senha_hash": senha_hash,
        "perfil": usuario.tipo,
        "telefone": usuario.telefone,
        "endereco": usuario.endereco,
        "cep": usuario.cep,
        "estado": usuario.estado,
        "crn": usuario.crn,
        "especialidades": [],
        "biografia": "",
        "valor_consulta": 0,
        "data_inicio": datetime.now(timezone.utc).date().isoformat(),
    }
    result = collection.insert_one(document)
    return serializar_usuario({**document, "_id": result.inserted_id})


def autenticar_usuario(email: str) -> dict | None:
    return get_database()["usuarios"].find_one(
        {"email": email.lower(), "senha_hash": {"$exists": True}}
    )


def guardar_nonce_recuperacao(usuario_id: str, nonce: str) -> None:
    get_database()["usuarios"].update_one(
        {"_id": ObjectId(usuario_id)},
        {"$set": {"reset_nonce_hash": sha256(nonce.encode()).hexdigest()}},
    )


def redefinir_senha(usuario_id: str, nonce: str, senha_hash: str) -> bool:
    if not ObjectId.is_valid(usuario_id):
        return False
    result = get_database()["usuarios"].update_one(
        {
            "_id": ObjectId(usuario_id),
            "reset_nonce_hash": sha256(nonce.encode()).hexdigest(),
        },
        {
            "$set": {"senha_hash": senha_hash, "senha_alterada_em": datetime.now(timezone.utc)},
            "$unset": {"reset_nonce_hash": ""},
        },
    )
    return result.modified_count == 1


def redefinir_senha_por_cpf(email: str, cpf: str, senha_hash: str) -> bool:
    result = get_database()["usuarios"].update_one(
        {"email": email.lower(), "cpf_hash": hash_cpf(cpf), "ativo": {"$ne": False}},
        {"$set": {"senha_hash": senha_hash, "senha_alterada_em": datetime.now(timezone.utc)}, "$unset": {"reset_nonce_hash": ""}},
    )
    return result.matched_count == 1


def paciente_vinculado(nutricionista_id: str, paciente_id: str) -> bool:
    if not ObjectId.is_valid(nutricionista_id) or not ObjectId.is_valid(paciente_id):
        return False
    nutritionist_object_id = ObjectId(nutricionista_id)
    patient_object_id = ObjectId(paciente_id)
    database = get_database()
    return bool(
        database["consultas"].find_one(
            {
                "nutricionista_id": nutritionist_object_id,
                "paciente_id": patient_object_id,
                "status": "confirmada",
            },
            {"_id": 1},
        )
        or database["planos"].find_one(
            {
                "nutricionista_id": nutritionist_object_id,
                "paciente_id": patient_object_id,
            },
            {"_id": 1},
        )
    )


def listar_pacientes(nutricionista_id: str) -> list[dict]:
    if not ObjectId.is_valid(nutricionista_id):
        return []
    nutritionist_object_id = ObjectId(nutricionista_id)
    database = get_database()
    patient_ids = {
        appointment["paciente_id"]
        for appointment in database["consultas"].find(
            {
                "nutricionista_id": nutritionist_object_id,
                "status": "confirmada",
            },
            {"paciente_id": 1},
        )
    }
    patient_ids.update(
        plan["paciente_id"]
        for plan in database["planos"].find(
            {"nutricionista_id": nutritionist_object_id},
            {"paciente_id": 1},
        )
    )
    if not patient_ids:
        return []
    return [
        serializar_usuario(usuario)
        for usuario in database["usuarios"].find(
            {"_id": {"$in": list(patient_ids)}, "perfil": "paciente"},
            {"senha_hash": 0},
        ).sort("nome", 1)
    ]


def listar_nutricionistas(estado: str | None = None) -> list[dict]:
    query: dict = {"perfil": "nutricionista", "ativo": {"$ne": False}}
    if estado:
        query["estado"] = estado.upper()
    professionals = get_database()["usuarios"].find(
        query,
        {"senha_hash": 0, "endereco": 0, "cep": 0, "pagseguro_link": 0},
    ).sort("nome", 1)
    return [_serializar_profissional(professional) for professional in professionals]


def coordenadas_do_usuario(usuario: dict) -> tuple[float, float] | None:
    cep = usuario.get("cep")
    if not cep:
        return None
    geo = usuario.get("geo") or {}
    if geo.get("cep") == cep:
        return geo["lat"], geo["lng"]
    coordenadas = coordenadas_por_cep(cep)
    if coordenadas:
        get_database()["usuarios"].update_one(
            {"_id": usuario["_id"]},
            {"$set": {"geo": {"cep": cep, "lat": coordenadas[0], "lng": coordenadas[1]}}},
        )
    return coordenadas


def listar_nutricionistas_proximos(
    paciente_id: str,
    raio_km: float | None = None,
    estado: str | None = None,
) -> list[dict] | None:
    collection = get_database()["usuarios"]
    paciente = collection.find_one({"_id": ObjectId(paciente_id)})
    origem = coordenadas_do_usuario(paciente) if paciente else None
    if origem is None:
        return None

    query: dict = {"perfil": "nutricionista", "ativo": {"$ne": False}}
    if estado:
        query["estado"] = estado.upper()

    resultado = []
    for professional in collection.find(query, {"senha_hash": 0}):
        destino = coordenadas_do_usuario(professional)
        distancia = round(distancia_km(origem, destino), 1) if destino else None
        if raio_km is not None and (distancia is None or distancia > raio_km):
            continue
        resultado.append({**_serializar_profissional(professional), "distancia_km": distancia})

    return sorted(resultado, key=lambda item: (item["distancia_km"] is None, item["distancia_km"] or 0, item["nome"]))


def buscar_nutricionista(usuario_id: str) -> dict | None:
    if not ObjectId.is_valid(usuario_id):
        return None
    professional = get_database()["usuarios"].find_one(
        {
            "_id": ObjectId(usuario_id),
            "perfil": "nutricionista",
            "ativo": {"$ne": False},
        },
        {"senha_hash": 0, "endereco": 0, "cep": 0, "pagseguro_link": 0},
    )
    return _serializar_profissional(professional) if professional else None


def _serializar_profissional(professional: dict) -> dict:
    return {
        "id": str(professional["_id"]),
        "nome": professional["nome"],
        "estado": professional.get("estado", ""),
        "crn": professional.get("crn"),
        "telefone": professional.get("telefone"),
        "especialidades": professional.get("especialidades", []),
        "biografia": professional.get("biografia", ""),
        "valor_consulta": professional.get("valor_consulta", 0),
        "nota_media": professional.get("nota_media", 0),
        "total_pacientes": professional.get("total_pacientes", 0),
        "data_inicio": professional.get(
            "data_inicio",
            datetime.now(timezone.utc).date().isoformat(),
        ),
    }


def buscar_usuario(usuario_id: str, incluir_sessao: bool = False) -> dict | None:
    if not ObjectId.is_valid(usuario_id):
        return None
    usuario = get_database()["usuarios"].find_one({"_id": ObjectId(usuario_id)})
    if not usuario:
        return None
    serializado = serializar_usuario(usuario)
    if incluir_sessao:
        serializado["senha_alterada_em"] = usuario.get("senha_alterada_em")
    return serializado


def listar_usuarios_administrador() -> list[dict]:
    users = get_database()["usuarios"].find(
        {},
        {"senha_hash": 0, "reset_nonce_hash": 0},
    ).sort("nome", 1)
    return [serializar_usuario(user) for user in users]


def _usuario_tem_historico(usuario_id: ObjectId) -> bool:
    database = get_database()
    relation_query = {
        "$or": [
            {"paciente_id": usuario_id},
            {"nutricionista_id": usuario_id},
        ]
    }
    return bool(
        database["consultas"].find_one(relation_query, {"_id": 1})
        or database["planos"].find_one(relation_query, {"_id": 1})
    )


def atualizar_usuario_administrador(
    usuario_id: str,
    changes: AdministradorUsuarioUpdate,
) -> dict | None:
    if not ObjectId.is_valid(usuario_id):
        return None
    user_object_id = ObjectId(usuario_id)
    current = get_database()["usuarios"].find_one({"_id": user_object_id})
    if current is None:
        return None
    if current.get("perfil") == "administrador":
        raise ValueError("Contas de administrador não podem ser editadas neste painel.")

    updates = changes.model_dump(exclude_unset=True, exclude_none=True)
    new_profile = updates.get("perfil")
    if new_profile and new_profile != current.get("perfil") and _usuario_tem_historico(
        user_object_id
    ):
        raise ValueError(
            "Não é possível alterar o perfil de uma conta com consultas ou planos vinculados."
        )
    if "nome" in updates:
        updates["nome"] = updates["nome"].strip()
    if "email" in updates:
        updates["email"] = str(updates["email"]).lower()
    if "estado" in updates:
        updates["estado"] = updates["estado"].strip().upper()
    if "crn" in updates:
        updates["crn"] = updates["crn"].strip().upper()
    if "especialidades" in updates:
        updates["especialidades"] = [
            specialty.strip() for specialty in updates["especialidades"]
        ]
    if "pagseguro_link" in updates:
        updates["pagseguro_link"] = str(updates["pagseguro_link"])

    update_document: dict = {}
    if updates:
        update_document["$set"] = updates
    if new_profile == "paciente":
        update_document["$unset"] = {
            "crn": "",
            "especialidades": "",
            "biografia": "",
            "valor_consulta": "",
            "pagseguro_link": "",
        }
    if update_document:
        get_database()["usuarios"].update_one(
            {"_id": user_object_id},
            update_document,
        )
    return buscar_usuario(usuario_id)


def remover_usuario_administrador(usuario_id: str) -> bool:
    if not ObjectId.is_valid(usuario_id):
        return False
    user_object_id = ObjectId(usuario_id)
    database = get_database()
    user = database["usuarios"].find_one({"_id": user_object_id}, {"perfil": 1})
    if user is None:
        return False
    if user.get("perfil") == "administrador":
        raise ValueError("Contas de administrador não podem ser excluídas neste painel.")
    if _usuario_tem_historico(user_object_id):
        raise ValueError(
            "Esta conta possui consultas ou planos; desative-a para preservar o histórico."
        )
    return database["usuarios"].delete_one({"_id": user_object_id}).deleted_count == 1


def buscar_usuario_com_senha(email: str) -> dict | None:
    return autenticar_usuario(email)



def atualizar_usuario(usuario_id: str, usuario: UsuarioUpdate) -> dict | None:
    if not ObjectId.is_valid(usuario_id):
        return None

    changes = usuario.model_dump(exclude_unset=True, exclude_none=True)
    if "nome" in changes:
        changes["nome"] = changes["nome"].strip()
    if "email" in changes:
        changes["email"] = str(changes["email"]).lower()
    if "estado" in changes:
        changes["estado"] = changes["estado"].strip().upper()
    if "crn" in changes:
        changes["crn"] = changes["crn"].strip().upper()
    if "especialidades" in changes:
        changes["especialidades"] = [
            specialty.strip() for specialty in changes["especialidades"] if specialty.strip()
        ]
    if "pagseguro_link" in changes:
        changes["pagseguro_link"] = str(changes["pagseguro_link"])
    if changes:
        get_database()["usuarios"].update_one(
            {"_id": ObjectId(usuario_id)},
            {"$set": changes},
        )
    return buscar_usuario(usuario_id)


def remover_usuario(usuario_id: str) -> bool:
    if not ObjectId.is_valid(usuario_id):
        return False
    database = get_database()
    object_id = ObjectId(usuario_id)
    database["planos"].delete_many(
        {"$or": [{"paciente_id": object_id}, {"nutricionista_id": object_id}]}
    )
    result = database["usuarios"].delete_one({"_id": object_id})
    return result.deleted_count == 1
