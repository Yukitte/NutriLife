from datetime import datetime, timezone

from bson import ObjectId

from catalogo_alimentos import buscar_alimento_por_id
from database.connection import get_database
from schemas.receita_schema import ReceitaSalvar

PLANO_INVALIDO = "Vincule a receita apenas a planos alimentares seus."
NUTRIENTES = ("energia_kcal", "proteina_g", "carboidrato_g", "gordura_g", "fibra_g", "sodio_mg")


def calcular_nutricao(ingredientes: list[dict], porcoes: int) -> dict:
    calculados = []
    total = {chave: None for chave in NUTRIENTES}
    quantidade_calculada = 0
    for ingrediente in ingredientes:
        item = {"nome": ingrediente} if isinstance(ingrediente, str) else dict(ingrediente)
        alimento = buscar_alimento_por_id(item["alimento_id"]) if item.get("alimento_id") else None
        item["energia_kcal"] = None
        if alimento and item.get("gramas"):
            quantidade_calculada += 1
            fator = item["gramas"] / 100
            for chave in NUTRIENTES:
                valor = alimento["nutrients_per_100g"].get(chave)
                if valor is None:
                    continue
                total[chave] = (total[chave] or 0) + valor * fator
            energia = alimento["nutrients_per_100g"].get("energia_kcal")
            item["energia_kcal"] = round(energia * fator, 1) if energia is not None else None
        calculados.append(item)
    arredondar = lambda valor: round(valor, 1) if valor is not None else None
    return {
        "ingredientes": calculados,
        "ingredientes_calculados": quantidade_calculada,
        "nutricao_total": {chave: arredondar(valor) for chave, valor in total.items()},
        "nutricao_porcao": {
            chave: arredondar(valor / porcoes) if valor is not None else None
            for chave, valor in total.items()
        },
    }


def _validar_alimentos(receita: ReceitaSalvar) -> None:
    for ingrediente in receita.ingredientes:
        if ingrediente.alimento_id and buscar_alimento_por_id(ingrediente.alimento_id) is None:
            raise ValueError(f"O alimento \"{ingrediente.nome}\" não foi encontrado na TACO.")


def _planos_do_nutricionista(nutricionista_id: str, planos_ids: list[str]) -> list[ObjectId] | None:
    if any(not ObjectId.is_valid(plano_id) for plano_id in planos_ids):
        return None
    ids = [ObjectId(plano_id) for plano_id in planos_ids]
    encontrados = get_database()["planos"].count_documents(
        {"_id": {"$in": ids}, "nutricionista_id": ObjectId(nutricionista_id)}
    ) if ids else 0
    return ids if encontrados == len(ids) else None


def _serializar_receitas(receitas: list[dict]) -> list[dict]:
    database = get_database()
    planos_ids = {plano_id for receita in receitas for plano_id in receita.get("planos_ids", [])}
    planos = {
        plano["_id"]: plano
        for plano in database["planos"].find({"_id": {"$in": list(planos_ids)}}, {"titulo": 1, "paciente_id": 1})
    } if planos_ids else {}
    pessoas_ids = {receita["nutricionista_id"] for receita in receitas} | {plano["paciente_id"] for plano in planos.values()}
    nomes = {
        pessoa["_id"]: pessoa["nome"]
        for pessoa in database["usuarios"].find({"_id": {"$in": list(pessoas_ids)}}, {"nome": 1})
    } if pessoas_ids else {}
    return [
        {
            "id": str(receita["_id"]),
            "nutricionista_id": str(receita["nutricionista_id"]),
            "nutricionista_nome": nomes.get(receita["nutricionista_id"], "Nutricionista removido"),
            "titulo": receita["titulo"],
            "categoria": receita.get("categoria", ""),
            "tempo_preparo_min": receita["tempo_preparo_min"],
            "porcoes": receita.get("porcoes", 1),
            **calcular_nutricao(receita["ingredientes"], receita.get("porcoes", 1)),
            "modo_preparo": receita["modo_preparo"],
            "planos": [
                {
                    "id": str(plano_id),
                    "titulo": planos[plano_id]["titulo"],
                    "paciente_nome": nomes.get(planos[plano_id]["paciente_id"], "Paciente removido"),
                }
                for plano_id in receita.get("planos_ids", [])
                if plano_id in planos
            ],
            "criada_em": receita["criada_em"],
        }
        for receita in receitas
    ]


def listar_receitas(usuario: dict) -> list[dict]:
    database = get_database()
    if usuario["perfil"] == "nutricionista":
        filtro = {"nutricionista_id": ObjectId(usuario["id"])}
    else:
        planos_ids = [plano["_id"] for plano in database["planos"].find({"paciente_id": ObjectId(usuario["id"])}, {"_id": 1})]
        if not planos_ids:
            return []
        filtro = {"planos_ids": {"$in": planos_ids}}
    return _serializar_receitas(list(database["receitas"].find(filtro).sort("titulo", 1)))


def criar_receita(nutricionista_id: str, receita: ReceitaSalvar) -> dict:
    _validar_alimentos(receita)
    planos_ids = _planos_do_nutricionista(nutricionista_id, receita.planos_ids)
    if planos_ids is None:
        raise ValueError(PLANO_INVALIDO)
    documento = {
        **receita.model_dump(exclude={"planos_ids"}),
        "planos_ids": planos_ids,
        "nutricionista_id": ObjectId(nutricionista_id),
        "criada_em": datetime.now(timezone.utc),
    }
    resultado = get_database()["receitas"].insert_one(documento)
    return _serializar_receitas([{**documento, "_id": resultado.inserted_id}])[0]


def atualizar_receita(nutricionista_id: str, receita_id: str, receita: ReceitaSalvar) -> dict | None:
    if not ObjectId.is_valid(receita_id):
        return None
    _validar_alimentos(receita)
    planos_ids = _planos_do_nutricionista(nutricionista_id, receita.planos_ids)
    if planos_ids is None:
        raise ValueError(PLANO_INVALIDO)
    colecao = get_database()["receitas"]
    filtro = {"_id": ObjectId(receita_id), "nutricionista_id": ObjectId(nutricionista_id)}
    resultado = colecao.update_one(filtro, {"$set": {**receita.model_dump(exclude={"planos_ids"}), "planos_ids": planos_ids}})
    if resultado.matched_count == 0:
        return None
    return _serializar_receitas([colecao.find_one(filtro)])[0]


def remover_receita(nutricionista_id: str, receita_id: str) -> bool:
    if not ObjectId.is_valid(receita_id):
        return False
    resultado = get_database()["receitas"].delete_one(
        {"_id": ObjectId(receita_id), "nutricionista_id": ObjectId(nutricionista_id)}
    )
    return resultado.deleted_count == 1
