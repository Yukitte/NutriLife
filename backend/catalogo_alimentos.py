import json
from functools import lru_cache
from pathlib import Path


DATA_DIRECTORY = Path(__file__).resolve().parent / "data"
TACO_CATALOG_PATH = DATA_DIRECTORY / "taco_catalogo.json"
MEDIDAS_CASEIRAS_PATH = DATA_DIRECTORY / "medidas_caseiras.json"
USDA_CATALOG_PATH = DATA_DIRECTORY / "usda_sr_legacy.json"


def _catalog_path() -> Path:
    if TACO_CATALOG_PATH.is_file():
        return TACO_CATALOG_PATH
    local_taco_path = DATA_DIRECTORY / "taco_catalogo_local.json"
    return local_taco_path if local_taco_path.is_file() else USDA_CATALOG_PATH


@lru_cache(maxsize=1)
def carregar_catalogo() -> dict:
    with _catalog_path().open(encoding="utf-8") as catalog_file:
        return json.load(catalog_file)


@lru_cache(maxsize=1)
def carregar_medidas_caseiras() -> dict:
    if not MEDIDAS_CASEIRAS_PATH.is_file():
        return {"source": None, "foods": {}}
    with MEDIDAS_CASEIRAS_PATH.open(encoding="utf-8") as measures_file:
        return json.load(measures_file)


def _rotulo_medida(medida: dict) -> str:
    gramas = f"{medida['gram_weight']:g}".replace(".", ",")
    return f"{medida['label']} · {gramas} g"


@lru_cache(maxsize=1)
def carregar_alimentos() -> list[dict]:
    medidas = carregar_medidas_caseiras()["foods"]
    return [
        {
            **food,
            "portions": food["portions"] + [
                {"label": _rotulo_medida(medida), "gram_weight": medida["gram_weight"]}
                for medida in medidas.get(food["id"], [])
            ],
        }
        for food in carregar_catalogo()["foods"]
    ]


def carregar_fonte() -> dict:
    fonte = dict(carregar_catalogo()["source"])
    fonte_medidas = carregar_medidas_caseiras()["source"]
    if fonte_medidas:
        fonte["household_measures"] = fonte_medidas
        fonte["note"] = f"{fonte.get('note', '')} Medidas caseiras: {fonte_medidas['publisher']}.".strip()
    return fonte


@lru_cache(maxsize=1)
def indexar_alimentos() -> dict[str, dict]:
    return {food["id"]: food for food in carregar_alimentos()}


def buscar_alimento_por_id(food_id: str) -> dict | None:
    return indexar_alimentos().get(food_id)
