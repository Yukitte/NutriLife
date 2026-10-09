import re
import unicodedata

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from catalogo_alimentos import buscar_alimento_por_id, carregar_alimentos, carregar_fonte
from crud.medida_caseira_crud import criar_medida_caseira, listar_medidas_caseiras, remover_medida_caseira
from schemas.alimento_schema import AlimentoCatalogo, BuscaAlimentosResponse
from schemas.medida_caseira_schema import MedidaCaseiraResponse, MedidaCaseiraSalvar
from security import require_nutritionist

router = APIRouter(prefix="/alimentos", tags=["Catálogo de alimentos"])


PALAVRAS_IGNORADAS = {"de", "da", "do", "das", "dos", "com", "e", "em", "a", "o"}

SINONIMOS = {
    "goma de tapioca": ["fecula mandioca", "polvilho doce"],
    "tapioca": ["fecula mandioca", "polvilho doce"],
    "goma": ["fecula mandioca"],
    "polvilho": ["fecula mandioca"],
    "aipim": ["mandioca"],
    "macaxeira": ["mandioca"],
    "mandioquinha": ["batata baroa"],
    "jerimum": ["abobora"],
    "bergamota": ["tangerina", "mexerica"],
    "mexerica": ["tangerina"],
    "tangerina": ["mexerica"],
    "carne seca": ["charque"],
    "carne de sol": ["charque"],
    "bacon": ["toucinho"],
    "maisena": ["milho amido"],
    "amido de milho": ["milho amido"],
    "pao frances": ["pao trigo frances"],
    "pao de sal": ["pao trigo frances"],
    "tofu": ["soja queijo"],
}


def _normalizar(texto: str) -> str:
    decomposed = unicodedata.normalize("NFKD", texto.casefold())
    return "".join(char for char in decomposed if not unicodedata.combining(char))


def _palavras(texto: str) -> list[str]:
    return [palavra for palavra in re.split(r"[^a-z0-9]+", texto) if palavra and palavra not in PALAVRAS_IGNORADAS]


def _corresponde(nome: str, consulta: str) -> bool:
    palavras = _palavras(consulta)
    return consulta in nome or (bool(palavras) and all(palavra in nome for palavra in palavras))


def _consultas_alternativas(consulta: str) -> list[str]:
    pendentes = [consulta]
    vistas = {consulta}
    while pendentes and len(vistas) < 30:
        atual = pendentes.pop()
        for termo in sorted(SINONIMOS, key=len, reverse=True):
            if not re.search(rf"(^|[^a-z0-9]){re.escape(termo)}($|[^a-z0-9])", atual):
                continue
            for equivalente in SINONIMOS[termo]:
                nova = atual.replace(termo, equivalente)
                if nova not in vistas:
                    vistas.add(nova)
                    pendentes.append(nova)
            break
    return [alternativa for alternativa in vistas if alternativa != consulta]


@router.get("/categorias", response_model=list[str])
def listar_categorias():
    return sorted({food["category"] for food in carregar_alimentos()}, key=str.casefold)


@router.get("/fonte")
def obter_fonte():
    return carregar_fonte()


@router.get("/{food_id}/medidas", response_model=list[MedidaCaseiraResponse])
def consultar_medidas_proprias(food_id: str, nutricionista: dict = Depends(require_nutritionist)):
    if buscar_alimento_por_id(food_id) is None:
        raise HTTPException(status_code=404, detail="Alimento não encontrado.")
    return listar_medidas_caseiras(nutricionista["id"], food_id)


@router.post("/{food_id}/medidas", response_model=MedidaCaseiraResponse, status_code=status.HTTP_201_CREATED)
def cadastrar_medida_propria(food_id: str, medida: MedidaCaseiraSalvar, nutricionista: dict = Depends(require_nutritionist)):
    if buscar_alimento_por_id(food_id) is None:
        raise HTTPException(status_code=404, detail="Alimento não encontrado.")
    return criar_medida_caseira(nutricionista["id"], food_id, medida)


@router.delete("/medidas/{medida_id}", status_code=status.HTTP_204_NO_CONTENT)
def excluir_medida_propria(medida_id: str, nutricionista: dict = Depends(require_nutritionist)):
    if not remover_medida_caseira(nutricionista["id"], medida_id):
        raise HTTPException(status_code=404, detail="Medida não encontrada.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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

    foods = [
        food
        for food in carregar_alimentos()
        if not normalized_category or normalized_category == _normalizar(food["category"])
    ]
    if normalized_query:
        diretos = [food for food in foods if _corresponde(_normalizar(food["name"]), normalized_query)]
        alternativas = _consultas_alternativas(normalized_query)
        ids_diretos = {food["id"] for food in diretos}
        por_sinonimo = [
            food
            for food in foods
            if food["id"] not in ids_diretos
            and any(_corresponde(_normalizar(food["name"]), alternativa) for alternativa in alternativas)
        ]
        matches = diretos + por_sinonimo
    else:
        matches = foods
    return {
        "total": len(matches),
        "offset": offset,
        "limit": limit,
        "items": matches[offset : offset + limit],
    }
