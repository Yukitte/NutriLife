from bson import ObjectId

from database.connection import get_database
from crud.usuario_crud import paciente_vinculado
from schemas.plano_schema import PlanoCreate, PlanoUpdate


def _serializar_plano(plano: dict) -> dict:
    database = get_database()
    paciente = database["usuarios"].find_one({"_id": plano["paciente_id"]})
    nutricionista = database["usuarios"].find_one(
        {"_id": plano["nutricionista_id"]}
    )
    return {
        "id": str(plano["_id"]),
        "paciente_id": str(plano["paciente_id"]),
        "paciente_nome": paciente["nome"] if paciente else "Paciente removido",
        "nutricionista_id": str(plano["nutricionista_id"]),
        "nutricionista_nome": (
            nutricionista["nome"] if nutricionista else "Nutricionista removido"
        ),
        "titulo": plano["titulo"],
        "objetivo": plano.get("objetivo", ""),
        "duracao_meses": plano.get("duracao_meses", 0),
        "descricao": plano["descricao"],
        "refeicoes": [
            refeicao if isinstance(refeicao, dict) else {
                "horario": "00:00",
                "nome": refeicao,
                "alimentos": [{
                    "nome": refeicao,
                    "quantidade": 1,
                    "medida": "porção",
                    "calorias": 0,
                }],
            }
            for refeicao in plano["refeicoes"]
        ],
    }


def criar_plano(plano: PlanoCreate, nutricionista: dict) -> dict | None:
    if not ObjectId.is_valid(plano.paciente_id):
        return None
    database = get_database()
    paciente_id = ObjectId(plano.paciente_id)
    paciente = database["usuarios"].find_one(
        {"_id": paciente_id, "perfil": "paciente"}
    )
    if paciente is None:
        return None
    if not paciente_vinculado(nutricionista["id"], plano.paciente_id):
        return None

    document = {
        "paciente_id": paciente_id,
        "nutricionista_id": ObjectId(nutricionista["id"]),
        "titulo": plano.titulo.strip(),
        "objetivo": plano.objetivo.strip(),
        "duracao_meses": plano.duracao_meses,
        "descricao": plano.descricao.strip(),
        "refeicoes": [refeicao.model_dump() for refeicao in plano.refeicoes],
    }
    result = database["planos"].insert_one(document)
    return _serializar_plano({**document, "_id": result.inserted_id})


def listar_planos(usuario: dict) -> list[dict]:
    usuario_id = ObjectId(usuario["id"])
    field = "nutricionista_id" if usuario["perfil"] == "nutricionista" else "paciente_id"
    planos = get_database()["planos"].find({field: usuario_id}).sort("_id", -1)
    return [_serializar_plano(plano) for plano in planos]


def atualizar_plano(plano_id: str, changes: PlanoUpdate, nutricionista: dict) -> dict | None:
    if not ObjectId.is_valid(plano_id):
        return None
    updates = changes.model_dump(exclude_unset=True, exclude_none=True)
    if "titulo" in updates:
        updates["titulo"] = updates["titulo"].strip()
    if "descricao" in updates:
        updates["descricao"] = updates["descricao"].strip()
    if changes.refeicoes is not None:
        updates["refeicoes"] = [
            refeicao.model_dump() for refeicao in changes.refeicoes
        ]
    if "objetivo" in updates:
        updates["objetivo"] = updates["objetivo"].strip()

    collection = get_database()["planos"]
    query = {
        "_id": ObjectId(plano_id),
        "nutricionista_id": ObjectId(nutricionista["id"]),
    }
    if updates:
        collection.update_one(query, {"$set": updates})
    plano = collection.find_one(query)
    return _serializar_plano(plano) if plano else None


def remover_plano(plano_id: str, nutricionista: dict) -> bool:
    if not ObjectId.is_valid(plano_id):
        return False
    result = get_database()["planos"].delete_one(
        {
            "_id": ObjectId(plano_id),
            "nutricionista_id": ObjectId(nutricionista["id"]),
        }
    )
    return result.deleted_count == 1
