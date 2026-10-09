from datetime import datetime, timezone

from bson import ObjectId
from pymongo import ReturnDocument

from antropometria import calcular_resultados
from database.connection import get_database
from schemas.medida_schema import MedidaSalvar


def _documento(medida: MedidaSalvar) -> dict:
    dados = medida.model_dump()
    dados["data_avaliacao"] = medida.data_avaliacao.isoformat()
    return dados


def _serializar(documento: dict, nomes: dict | None = None) -> dict:
    dados = {
        "data_avaliacao": documento["data_avaliacao"],
        "sexo_biologico": documento["sexo_biologico"],
        "idade_anos": documento["idade_anos"],
        "peso_kg": documento["peso_kg"],
        "altura_cm": documento["altura_cm"],
        "dobras": documento.get("dobras") or {},
        "circunferencias": documento.get("circunferencias") or {},
        "protocolo_gordura": documento.get("protocolo_gordura"),
        "nivel_atividade": documento.get("nivel_atividade"),
        "observacoes": documento.get("observacoes", ""),
    }
    nutricionista_id = documento.get("nutricionista_id")
    return {
        **dados,
        "id": str(documento["_id"]),
        "paciente_id": str(documento["paciente_id"]),
        "nutricionista_id": str(nutricionista_id) if nutricionista_id else None,
        "nutricionista_nome": (nomes or {}).get(nutricionista_id),
        "resultados": calcular_resultados(dados),
    }


def _nomes_dos_nutricionistas(documentos: list[dict]) -> dict:
    ids = list({documento["nutricionista_id"] for documento in documentos if documento.get("nutricionista_id")})
    if not ids:
        return {}
    usuarios = get_database()["usuarios"].find({"_id": {"$in": ids}}, {"nome": 1})
    return {usuario["_id"]: usuario.get("nome") for usuario in usuarios}


def listar_medidas(paciente_id: str) -> list[dict]:
    if not ObjectId.is_valid(paciente_id):
        return []
    documentos = list(
        get_database()["medidas_antropometricas"]
        .find({"paciente_id": ObjectId(paciente_id)})
        .sort([("data_avaliacao", 1), ("criado_em", 1)])
    )
    nomes = _nomes_dos_nutricionistas(documentos)
    return [_serializar(documento, nomes) for documento in documentos]


def criar_medida(paciente_id: str, nutricionista_id: str, medida: MedidaSalvar) -> dict:
    documento = {
        **_documento(medida),
        "paciente_id": ObjectId(paciente_id),
        "nutricionista_id": ObjectId(nutricionista_id),
        "criado_em": datetime.now(timezone.utc),
    }
    resultado = get_database()["medidas_antropometricas"].insert_one(documento)
    documento["_id"] = resultado.inserted_id
    return _serializar(documento, _nomes_dos_nutricionistas([documento]))


def atualizar_medida(nutricionista_id: str, medida_id: str, medida: MedidaSalvar) -> dict | None:
    if not ObjectId.is_valid(medida_id):
        return None
    documento = get_database()["medidas_antropometricas"].find_one_and_update(
        {"_id": ObjectId(medida_id), "nutricionista_id": ObjectId(nutricionista_id)},
        {"$set": {**_documento(medida), "atualizado_em": datetime.now(timezone.utc)}},
        return_document=ReturnDocument.AFTER,
    )
    return _serializar(documento, _nomes_dos_nutricionistas([documento])) if documento else None


def remover_medida(nutricionista_id: str, medida_id: str) -> bool:
    if not ObjectId.is_valid(medida_id):
        return False
    resultado = get_database()["medidas_antropometricas"].delete_one(
        {"_id": ObjectId(medida_id), "nutricionista_id": ObjectId(nutricionista_id)}
    )
    return resultado.deleted_count == 1
