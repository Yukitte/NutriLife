import argparse
import json
import re
import statistics
import unicodedata
from pathlib import Path

import xlrd

IGNORADAS = {
    "de", "da", "do", "das", "dos", "com", "sem", "e", "em", "a", "o", "ao", "tipo", "nao", "se",
    "aplica", "etc", "especificado", "especificada", "qualquer", "industrializado", "industrializada",
}
PREPAROS = {
    "cozido": "cozido", "cozida": "cozido", "crozido": "cozido",
    "cru": "cru", "crua": "cru",
    "frito": "frito", "frita": "frito",
    "assado": "assado", "assada": "assado",
    "refogado": "refogado", "refogada": "refogado",
    "grelhado": "grelhado", "grelhada": "grelhado", "brasa": "grelhado", "churrasco": "grelhado",
    "ensopado": "ensopado",
}
FORMAS = {
    "molho", "suco", "farinha", "farofa", "geleia", "polpa", "extrato", "po", "conserva", "chips",
    "creme", "pure", "sorvete", "mingau", "doce", "agua", "oleo", "flocos", "massa", "biscoito",
    "bolo", "pao", "torrada", "salgado", "enlatado", "enlatada", "desidratado", "desidratada",
    "fuba", "amido", "farelo", "germen", "pipoca", "polvilho", "fecula", "almondega", "hamburguer",
    "clara", "gema",
}
MEDIDAS_IGNORADAS = {"GRAMA", "QUILO", "MILILITRO", "LITRO"}
ACENTOS = {
    "xicara": "xícara", "cha": "chá", "cafe": "café", "pedaco": "pedaço", "porcao": "porção",
    "medio": "médio", "media": "média", "requeijao": "requeijão", "file": "filé", "taca": "taça",
    "concha": "concha", "colher": "colher", "pao": "pão", "cafezinho": "cafezinho", "unica": "única",
}
PREPARO_IBGE_PADRAO = "nao se aplica"


def normalizar(texto) -> str:
    texto = unicodedata.normalize("NFKD", str(texto).casefold())
    return "".join(caractere for caractere in texto if not unicodedata.combining(caractere))


def raiz(palavra: str) -> str:
    return palavra[:-1] if len(palavra) > 4 and palavra.endswith("s") else palavra


def palavras(texto: str) -> list[str]:
    return [raiz(p) for p in re.split(r"[^a-z0-9]+", normalizar(texto)) if p and p not in IGNORADAS]


def preparo_de(tokens: list[str]) -> str | None:
    return next((PREPAROS[t] for t in tokens if t in PREPAROS), None)


def rotulo_medida(descricao: str) -> str:
    texto = " ".join(ACENTOS.get(p, p) for p in normalizar(descricao).replace("/", " ou ").split())
    return texto[:1].upper() + texto[1:]


def carregar_ibge(caminho: Path) -> dict[str, dict]:
    folha = xlrd.open_workbook(str(caminho)).sheet_by_index(0)
    alimentos: dict[str, dict] = {}
    for linha in range(5, folha.nrows):
        codigo = folha.cell_value(linha, 0)
        if codigo == "":
            continue
        nome = folha.cell_value(linha, 1)
        preparo = normalizar(folha.cell_value(linha, 3)).strip()
        medida = folha.cell_value(linha, 5).strip()
        gramas = folha.cell_value(linha, 8)
        if not isinstance(gramas, float) or gramas <= 0 or medida in MEDIDAS_IGNORADAS:
            continue
        principal = re.sub(r"\(.*?\)", " ", nome)
        variedades = re.findall(r"\((.*?)\)", nome)
        registro = alimentos.setdefault(nome, {
            "preparo_no_nome": preparo_de(palavras(principal)),
            "principal": [t for t in palavras(principal) if t not in PREPAROS],
            "variedades": {t for v in variedades for t in palavras(v)},
            "medidas": {},
        })
        registro["medidas"].setdefault(preparo, {}).setdefault(medida, []).append(gramas)
    return alimentos


def melhor_correspondencia(nome_taco: str, ibge: dict[str, dict]) -> tuple[str, dict] | None:
    tokens = palavras(nome_taco)
    base = [t for t in tokens if t not in PREPAROS]
    if not base:
        return None
    conjunto = set(base)
    formas_taco = conjunto & FORMAS
    preparo_taco = preparo_de(tokens)
    melhor = None
    for nome, registro in ibge.items():
        principal = registro["principal"]
        if not principal or principal[0] != base[0] or not set(principal) <= conjunto:
            continue
        if registro["preparo_no_nome"] and registro["preparo_no_nome"] != preparo_taco:
            continue
        if not formas_taco <= set(principal) | registro["variedades"]:
            continue
        pontos = len(principal) + (0.5 if conjunto & registro["variedades"] else 0)
        if melhor is None or pontos > melhor[0]:
            melhor = (pontos, nome, registro)
    return (melhor[1], melhor[2]) if melhor else None


def medidas_do_preparo(registro: dict, preparo: str | None) -> dict[str, list[float]] | None:
    medidas = registro["medidas"]
    chaves = {normalizar(p): p for p in medidas}
    if preparo:
        for chave, original in chaves.items():
            if preparo_de(re.split(r"[^a-z0-9]+", chave)) == preparo:
                return medidas[original]
        return medidas.get(PREPARO_IBGE_PADRAO)
    return medidas.get(PREPARO_IBGE_PADRAO) or next(
        (medidas[original] for chave, original in chaves.items() if preparo_de(re.split(r"[^a-z0-9]+", chave)) == "cru"),
        None,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Gera medidas caseiras (IBGE POF 2008-2009) para os alimentos da TACO.")
    parser.add_argument("planilha_ibge", type=Path, help="tabelamedidas_bd.xls do IBGE")
    parser.add_argument("--taco", type=Path, default=Path(__file__).resolve().parent.parent / "data" / "taco_catalogo.json")
    parser.add_argument("--saida", type=Path, default=Path(__file__).resolve().parent.parent / "data" / "medidas_caseiras.json")
    args = parser.parse_args()

    ibge = carregar_ibge(args.planilha_ibge)
    taco = json.loads(args.taco.read_text(encoding="utf-8"))["foods"]
    medidas_por_alimento = {}
    correspondencias = {}
    for alimento in taco:
        encontrado = melhor_correspondencia(alimento["name"], ibge)
        if not encontrado:
            continue
        nome_ibge, registro = encontrado
        medidas = medidas_do_preparo(registro, preparo_de(palavras(alimento["name"])))
        if not medidas:
            continue
        lista = sorted(
            ({"label": rotulo_medida(medida), "gram_weight": round(statistics.median(valores), 1)} for medida, valores in medidas.items()),
            key=lambda item: item["gram_weight"],
        )
        medidas_por_alimento[alimento["id"]] = lista
        correspondencias[alimento["id"]] = nome_ibge

    resultado = {
        "source": {
            "name": "Tabela de Medidas Referidas para os Alimentos Consumidos no Brasil",
            "publisher": "IBGE — Pesquisa de Orçamentos Familiares 2008-2009",
            "source_url": "https://ftp.ibge.gov.br/Orcamentos_Familiares/Pesquisa_de_Orcamentos_Familiares_2008_2009/Tabela_de_Medidas_Referidas_para_os_Alimentos_Consumidos_no_Brasil/",
        },
        "foods": medidas_por_alimento,
        "matches": correspondencias,
    }
    args.saida.write_text(json.dumps(resultado, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(medidas_por_alimento)} de {len(taco)} alimentos da TACO com medidas caseiras -> {args.saida}")


if __name__ == "__main__":
    main()
