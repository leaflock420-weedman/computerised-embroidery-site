#!/usr/bin/env python3
"""Copy mockups.json blankImage URLs into products.json image fields."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MOCKUPS = ROOT / "data" / "mockups.json"
PRODUCTS = ROOT / "data" / "products.json"

with open(MOCKUPS, encoding="utf-8") as f:
    mockups = json.load(f)
with open(PRODUCTS, encoding="utf-8") as f:
    products = json.load(f)

by_id = {m["productId"]: m.get("blankImage", "") for m in mockups.get("products", [])}
n = 0
for p in products["products"]:
    img = by_id.get(p["id"], "")
    if img:
        p["image"] = img
        n += 1

with open(PRODUCTS, "w", encoding="utf-8") as f:
    json.dump(products, f, indent=2)

print(f"Updated {n} product images from mockups.json")