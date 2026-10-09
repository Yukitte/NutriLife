from bson import ObjectId

from database.connection import get_database
from schemas.medida_caseira_schema import MedidaCaseiraSalvar


def _serializar(documento: dict) -> dict:
    return {
        "id": str(documento["_id"]),
        "alimento_id": documento["alimento_id"],
        "rotulo": documento["rotulo"],
        "gramas": documento["gramas"],
    }


def listar_medidas_caseiras(nutricionista_id: str, alimento_id: str) -> list[dict]:
    documentos = get_database()["medidas_caseiras"].find(
        {"nutricionista_id": ObjectId(nutricionista_id), "alimento_id": alimento_id}
    ).sort("gramas", 1)
    return [_serializar(documento) for documento in documentos]


def criar_medida_caseira(nutricionista_id: str, alimento_id: str, medida: MedidaCaseiraSalvar) -> dict:
    documento = {
        "nutricionista_id": ObjectId(nutricionista_id),
        "alimento_id": alimento_id,
        "rotulo": medida.rotulo,
        "gramas": medida.gramas,
    }
    colecao = get_database()["medidas_caseiras"]
    colecao.update_one(
        {"nutricionista_id": documento["nutricionista_id"], "alimento_id": alimento_id, "rotulo": medida.rotulo},
        {"$set": documento},
        upsert=True,
    )
    return _serializar(colecao.find_one(
        {"nutricionista_id": documento["nutricionista_id"], "alimento_id": alimento_id, "rotulo": medida.rotulo}
    ))


def remover_medida_caseira(nutricionista_id: str, medida_id: str) -> bool:
    if not ObjectId.is_valid(medida_id):
        return False
    resultado = get_database()["medidas_caseiras"].delete_one(
        {"_id": ObjectId(medida_id), "nutricionista_id": ObjectId(nutricionista_id)}
    )
    return resultado.deleted_count == 1
