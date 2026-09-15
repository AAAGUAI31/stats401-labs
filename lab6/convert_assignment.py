"""Convert the flat Lab 6 GDP CSV into nested JSON for D3."""

import json
from pathlib import Path

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = PROJECT_ROOT / "data" / "lab6_assignment_gdp.csv"
JSON_PATH = PROJECT_ROOT / "data" / "lab6_assignment_gdp.json"


def build_hierarchy(dataframe: pd.DataFrame, levels: list[str]) -> list[dict]:
    """Recursively group continent and area; preserve GDP and status at country leaves."""
    if len(levels) == 1:
        return [
            {
                "name": row[levels[0]],
                "gdp": float(row["gdp_billion_usd"]),
                "status": row["gdp_status"],
            }
            for _, row in dataframe.iterrows()
        ]

    level = levels[0]
    return [
        {
            "name": name,
            "children": build_hierarchy(group, levels[1:]),
        }
        for name, group in dataframe.groupby(level, sort=True)
    ]


df = pd.read_csv(CSV_PATH)
hierarchy = {
    "name": "World",
    "children": build_hierarchy(df, ["continent", "area", "country"]),
}

with JSON_PATH.open("w", encoding="utf-8") as output_file:
    json.dump(hierarchy, output_file, indent=2, ensure_ascii=False)

print(f"Created {JSON_PATH}")
