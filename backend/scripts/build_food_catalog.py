import argparse
import csv
import io
import json
import math
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Iterator


DATASET_DIRECTORY = "FoodData_Central_sr_legacy_food_csv_2018-04"
NUTRIENT_FIELDS = {
    "1003": "proteina_g",
    "1004": "gordura_g",
    "1005": "carboidrato_g",
    "1008": "energia_kcal",
    "1079": "fibra_g",
    "1093": "sodio_mg",
}
DATA_SOURCE = {
    "name": "USDA FoodData Central — SR Legacy",
    "citation": (
        "U.S. Department of Agriculture, Agricultural Research Service. "
        "FoodData Central, 2019. fdc.nal.usda.gov."
    ),
    "dataset_release": "April 2018",
    "license": "CC0 1.0 Universal (public domain)",
    "source_url": (
        "https://fdc.nal.usda.gov/fdc-datasets/"
        "FoodData_Central_sr_legacy_food_csv_2018-04.zip"
    ),
}


def read_csv(archive: zipfile.ZipFile, table: str) -> Iterator[dict[str, str]]:
    path = f"{DATASET_DIRECTORY}/{table}.csv"
    with archive.open(path) as source:
        with io.TextIOWrapper(source, encoding="utf-8-sig", newline="") as text:
            yield from csv.DictReader(text)


def build_catalog(archive_path: Path) -> list[dict]:
    with zipfile.ZipFile(archive_path) as archive:
        foods = list(read_csv(archive, "food"))
        categories = {
            row["id"]: row["description"]
            for row in read_csv(archive, "food_category")
        }
        nutrients = defaultdict(dict)
        for row in read_csv(archive, "food_nutrient"):
            field = NUTRIENT_FIELDS.get(row["nutrient_id"])
            if field and row["amount"]:
                value = float(row["amount"])
                if math.isfinite(value):
                    nutrients[row["fdc_id"]][field] = value

        measure_units = {
            row["id"]: row["name"]
            for row in read_csv(archive, "measure_unit")
        }
        portions = defaultdict(list)
        for row in read_csv(archive, "food_portion"):
            try:
                gram_weight = float(row["gram_weight"])
                amount = float(row["amount"] or "1")
            except ValueError:
                continue
            if gram_weight <= 0:
                continue

            unit = measure_units.get(row["measure_unit_id"], "")
            modifier = row["modifier"].strip()
            description = row["portion_description"].strip()
            if unit and unit != "undetermined":
                label = f"{amount:g} {unit}"
                if modifier and modifier.casefold() not in {unit.casefold(), "serving"}:
                    label = f"{label}, {modifier}"
            else:
                label = modifier or description
            if not label:
                continue
            label = f"{label} ({gram_weight:g} g)"
            portion = {"label": label[:250], "gram_weight": gram_weight}
            food_portions = portions[row["fdc_id"]]
            if all(existing["label"] != portion["label"] for existing in food_portions):
                food_portions.append(portion)

    return [
        {
            "id": food["fdc_id"],
            "name": food["description"],
            "category": categories.get(food["food_category_id"], "Uncategorized"),
            "nutrients_per_100g": nutrients.get(food["fdc_id"], {}),
            "portions": portions.get(food["fdc_id"], [])[:12],
        }
        for food in foods
    ]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build the NutriLife JSON catalog from the USDA SR Legacy ZIP."
    )
    parser.add_argument("archive", type=Path, help="Path to the USDA SR Legacy ZIP file")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "data" / "usda_sr_legacy.json",
        help="Output JSON path (defaults to backend/data/usda_sr_legacy.json)",
    )
    args = parser.parse_args()

    catalog = build_catalog(args.archive)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="\n") as output:
        json.dump(
            {
                "source": DATA_SOURCE,
                "foods": catalog,
            },
            output,
            ensure_ascii=False,
            separators=(",", ":"),
        )
        output.write("\n")
    print(f"Exported {len(catalog)} foods to {args.output}")


if __name__ == "__main__":
    main()
