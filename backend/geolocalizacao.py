import json
import math
import time
from urllib.parse import urlencode
from urllib.request import Request, urlopen

USER_AGENT = "NutriLife/1.0 (projeto academico)"
_ultima_consulta_nominatim = 0.0


def _buscar_json(url: str):
    request = Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    with urlopen(request, timeout=8) as response:
        return json.load(response)


def _buscar_nominatim(*partes: str | None) -> tuple[float, float] | None:
    global _ultima_consulta_nominatim
    texto = ", ".join(parte for parte in partes if parte)
    if not texto:
        return None
    espera = 1.1 - (time.monotonic() - _ultima_consulta_nominatim)
    if espera > 0:
        time.sleep(espera)
    _ultima_consulta_nominatim = time.monotonic()
    params = urlencode({"q": f"{texto}, Brasil", "format": "json", "limit": 1, "countrycodes": "br"})
    resultados = _buscar_json(f"https://nominatim.openstreetmap.org/search?{params}")
    if resultados:
        return float(resultados[0]["lat"]), float(resultados[0]["lon"])
    return None


def coordenadas_por_cep(cep: str) -> tuple[float, float] | None:
    try:
        dados = _buscar_json(f"https://brasilapi.com.br/api/cep/v2/{cep}")
    except Exception:
        return None

    rua, bairro = dados.get("street"), dados.get("neighborhood")
    cidade, estado = dados.get("city"), dados.get("state")
    try:
        coordenadas = _buscar_nominatim(rua, bairro, cidade, estado) or _buscar_nominatim(bairro, cidade, estado)
        if coordenadas:
            return coordenadas
    except Exception:
        pass

    pontos = (dados.get("location") or {}).get("coordinates") or {}
    if pontos.get("latitude") and pontos.get("longitude"):
        return float(pontos["latitude"]), float(pontos["longitude"])

    try:
        return _buscar_nominatim(cidade, estado)
    except Exception:
        return None


def distancia_km(origem: tuple[float, float], destino: tuple[float, float]) -> float:
    lat1, lon1 = map(math.radians, origem)
    lat2, lon2 = map(math.radians, destino)
    a = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(a))
