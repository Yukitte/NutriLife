import unicodedata

from fastapi import APIRouter, HTTPException, Query

from catalogo_alimentos import buscar_alimento_por_id, carregar_alimentos, carregar_fonte
from schemas.alimento_schema import AlimentoCatalogo, BuscaAlimentosResponse

router = APIRouter(prefix="/alimentos", tags=["Catálogo de alimentos"])


def _normalizar(texto: str) -> str:
    decomposed = unicodedata.normalize("NFKD", texto.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


@router.get("/categorias", response_model=list[str])
def listar_categorias():
    return sorted({food["category"] for food in carregar_alimentos()}, key=str.casefold)


@router.get("/fonte")
def obter_fonte():
    return carregar_fonte()


@router.get("/{food_id}", response_model=AlimentoCatalogo)
def obter_alimento(food_id: str):
    food = buscar_alimento_por_id(food_id)
    if food is None:
        raise HTTPException(status_code=404, detail="Alimento não encontrado.")
    return food


@router.get("", response_model=BuscaAlimentosResponse)
def buscar_alimentos(
    busca: str = Query(default="", max_length=120),
    categoria: str = Query(default="", max_length=120),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    normalized_query = _normalizar(busca.strip())
    normalized_category = _normalizar(categoria.strip())
    if len(normalized_query) < 2 and not normalized_category:
        raise HTTPException(
            status_code=422,
            detail="Informe ao menos 2 caracteres ou selecione uma categoria.",
        )

    matches = [
        food
        for food in carregar_alimentos()
        if (not normalized_query or normalized_query in _normalizar(food["name"]))
        and (
            not normalized_category
            or normalized_category == _normalizar(food["category"])
        )
    ]
    return {
        "total": len(matches),
        "offset": offset,
        "limit": limit,
        "items": matches[offset : offset + limit],
    }
