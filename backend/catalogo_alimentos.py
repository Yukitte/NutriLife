import json
from functools import lru_cache
from pathlib import Path


DATA_DIRECTORY = Path(__file__).resolve().parent / "data"
TACO_CATALOG_PATH = DATA_DIRECTORY / "taco_catalogo.json"
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
def carregar_alimentos() -> list[dict]:
    return carregar_catalogo()["foods"]


def carregar_fonte() -> dict:
    return carregar_catalogo()["source"]


@lru_cache(maxsize=1)
def indexar_alimentos() -> dict[str, dict]:
    return {food["id"]: food for food in carregar_alimentos()}


def buscar_alimento_por_id(food_id: str) -> dict | None:
    return indexar_alimentos().get(food_id)
