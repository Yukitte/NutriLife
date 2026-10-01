import argparse
import json
import math
import zipfile
from pathlib import Path
from xml.etree import ElementTree


MAIN_SHEET = "CMVCol taco3"
NAMESPACES = {
    "main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "relationship": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
    "package": "http://schemas.openxmlformats.org/package/2006/relationships",
}
NUTRIENT_COLUMNS = {
    "energia_kcal": "D",
    "proteina_g": "F",
    "carboidrato_g": "I",
    "gordura_g": "G",
    "fibra_g": "J",
    "sodio_mg": "R",
}
DATA_SOURCE = {
    "name": "Tabela Brasileira de Composição de Alimentos (TACO)",
    "publisher": "NEPA/UNICAMP",
    "edition": "4ª edição revisada e ampliada",
    "citation": (
        "NEPA/UNICAMP. Tabela Brasileira de Composição de Alimentos (TACO), "
        "4ª edição revisada e ampliada. Campinas: NEPA/UNICAMP."
    ),
    "source_url": "https://nepa.unicamp.br/publicacoes/tabela-taco-pdf/",
    "reproduction_notice": (
        "A publicação oficial permite reprodução total ou parcial desde que citada a fonte."
    ),
    "note": "Dados para 100 g de parte comestível; 'Tr' e valores ausentes são exibidos como não informados.",
}


def _column_row(worksheet, shared_strings: list[str]) -> dict[int, dict[str, str]]:
    result = {}
    for row in worksheet.findall(".//main:sheetData/main:row", NAMESPACES):
        row_number = int(row.attrib["r"])
        cells = {}
        for cell in row.findall("main:c", NAMESPACES):
            value = cell.find("main:v", NAMESPACES)
            if value is None:
                continue
            raw = value.text or ""
            if cell.attrib.get("t") == "s":
                raw = shared_strings[int(raw)]
            column = "".join(char for char in cell.attrib["r"] if char.isalpha())
            cells[column] = raw.strip()
        result[row_number] = cells
    return result


def _load_sheet(archive: zipfile.ZipFile, sheet_name: str):
    workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
    relationships = ElementTree.fromstring(
        archive.read("xl/_rels/workbook.xml.rels")
    )
    relationship_targets = {
        relation.attrib["Id"]: relation.attrib["Target"]
        for relation in relationships.findall("package:Relationship", NAMESPACES)
    }
    for sheet in workbook.findall("main:sheets/main:sheet", NAMESPACES):
        if sheet.attrib["name"] != sheet_name:
            continue
        relationship_id = sheet.attrib[f"{{{NAMESPACES['relationship']}}}id"]
        target = relationship_targets[relationship_id]
        sheet_path = target.lstrip("/") if target.startswith("/") else f"xl/{target}"
        shared_strings_root = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
        shared_strings = [
            "".join(text.text or "" for text in item.findall(".//main:t", NAMESPACES))
            for item in shared_strings_root.findall("main:si", NAMESPACES)
        ]
        worksheet = ElementTree.fromstring(archive.read(sheet_path))
        return _column_row(worksheet, shared_strings)
    raise ValueError(f"A planilha '{sheet_name}' não foi encontrada no arquivo.")


def _nutrient_value(value: str | None) -> float | None:
    if not value or value.casefold() in {"na", "tr", "nd", "-", "*"}:
        return None
    parsed = float(value.replace(",", "."))
    return parsed if math.isfinite(parsed) else None


def build_catalog(workbook_path: Path) -> list[dict]:
    foods = []
    category = "Sem categoria"
    with zipfile.ZipFile(workbook_path) as archive:
        rows = _load_sheet(archive, MAIN_SHEET)

    for row_number in sorted(rows):
        row = rows[row_number]
        food_name = row.get("B", "").strip()
        row_id = row.get("A", "").strip()
        if not food_name:
            if row_id and not row_id.isdigit():
                category = row_id
            continue
        if not row_id.isdigit():
            continue

        nutrients = {
            field: _nutrient_value(row.get(column))
            for field, column in NUTRIENT_COLUMNS.items()
        }
        if nutrients["energia_kcal"] is None:
            continue
        foods.append(
            {
                "id": f"taco-{row_id}",
                "name": food_name,
                "category": category,
                "nutrients_per_100g": nutrients,
                "portions": [
                    {"label": "100 g (base TACO)", "gram_weight": 100}
                ],
            }
        )
    return foods


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Import the official TACO workbook into a local JSON catalog."
    )
    parser.add_argument("workbook", type=Path, help="Path to the official TACO XLSX")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "taco_catalogo.json",
        help="Output path (defaults to the versioned backend/data/taco_catalogo.json)",
    )
    args = parser.parse_args()
    catalog = build_catalog(args.workbook)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as output:
        json.dump(
            {"source": DATA_SOURCE, "foods": catalog},
            output,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        output.write("\n")
    print(f"Importados {len(catalog)} alimentos para {args.output}")


if __name__ == "__main__":
    main()
