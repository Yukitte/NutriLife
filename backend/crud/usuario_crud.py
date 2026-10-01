from bson import ObjectId

from database.connection import get_database
from schemas.usuario_schema import UsuarioCreate, UsuarioUpdate


def serializar_usuario(usuario: dict) -> dict:
    return {
        "id": str(usuario["_id"]),
        "nome": usuario["nome"],
        "email": usuario["email"],
        "perfil": usuario["perfil"],
    }


def criar_usuario(usuario: UsuarioCreate, senha_hash: str, perfil: str = "paciente") -> dict:
    collection = get_database()["usuarios"]
    document = {
        "nome": usuario.nome.strip(),
        "email": str(usuario.email).lower(),
        "senha_hash": senha_hash,
        "perfil": perfil,
    }
    result = collection.insert_one(document)
    return serializar_usuario({**document, "_id": result.inserted_id})


def autenticar_usuario(email: str) -> dict | None:
    return get_database()["usuarios"].find_one(
        {"email": email.lower(), "senha_hash": {"$exists": True}}
    )


def listar_pacientes() -> list[dict]:
    return [
        serializar_usuario(usuario)
        for usuario in get_database()["usuarios"].find(
            {"perfil": "paciente"},
            {"senha_hash": 0},
        ).sort("nome", 1)
    ]


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
