from datetime import datetime, timezone
from hashlib import sha256

from bson import ObjectId

from database.connection import get_database
from schemas.usuario_schema import UsuarioCreate, UsuarioUpdate


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
    }


def criar_usuario(usuario: UsuarioCreate, senha_hash: str) -> dict:
    collection = get_database()["usuarios"]
    document = {
        "nome": usuario.nome.strip(),
        "email": str(usuario.email).lower(),
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
            "$set": {"senha_hash": senha_hash},
            "$unset": {"reset_nonce_hash": ""},
        },
    )
    return result.modified_count == 1


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
    query: dict = {"perfil": "nutricionista"}
    if estado:
        query["estado"] = estado.upper()
    professionals = get_database()["usuarios"].find(
        query,
        {"senha_hash": 0, "endereco": 0, "cep": 0, "pagseguro_link": 0},
    ).sort("nome", 1)
    return [_serializar_profissional(professional) for professional in professionals]


def buscar_nutricionista(usuario_id: str) -> dict | None:
    if not ObjectId.is_valid(usuario_id):
        return None
    professional = get_database()["usuarios"].find_one(
        {"_id": ObjectId(usuario_id), "perfil": "nutricionista"},
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


def buscar_usuario(usuario_id: str) -> dict | None:
    if not ObjectId.is_valid(usuario_id):
        return None
    usuario = get_database()["usuarios"].find_one({"_id": ObjectId(usuario_id)})
    return serializar_usuario(usuario) if usuario else None


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
