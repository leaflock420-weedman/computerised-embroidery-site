#!/usr/bin/env python3
"""One-off scrape for products still missing blankImage."""
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location(
    "scrape_all", ROOT / "scripts" / "scrape-all-blanks.py"
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

MISSING_IDS = [
    "biz-bshp", "biz-bshv", "biz-bshs", "biz-bshk", "biz-bshf",
    "jbs-1cp",
    "dnc-dnc1300", "dnc-dnc2100", "dnc-dnc3100", "dnc-dnc4300", "dnc-dnc4400", "dnc-dnc4500",
]

EXTRA_QUERIES = {
    "biz-bshp": ["Biz Collection apron", "Biz Care apron bib"],
    "biz-bshv": ["Biz Collection hi vis vest", "Syzmik hi vis vest"],
    "biz-bshs": ["Biz Collection soft shell jacket"],
    "biz-bshk": ["Biz Collection knit polo"],
    "biz-bshf": ["Biz Collection fleece jacket"],
    "jbs-1cp": ["JB's childcare polo", "JB's Podium kids polo 1CP"],
    "dnc-dnc1300": ["DNC cargo work pant", "DNC work pant cargo"],
    "dnc-dnc2100": ["DNC coverall", "DNC overall coverall"],
    "dnc-dnc3100": ["DNC wet weather jacket", "DNC rain jacket"],
    "dnc-dnc4300": ["DNC hoodie fleece", "DNC hooded fleece"],
    "dnc-dnc4400": ["DNC beanie acrylic", "DNC work beanie"],
    "dnc-dnc4500": ["DNC cap cotton drill", "DNC work cap"],
}

with open(ROOT / "data" / "products.json", encoding="utf-8") as f:
    products = {p["id"]: p for p in json.load(f)["products"]}
with open(ROOT / "data" / "mockups.json", encoding="utf-8") as f:
    catalog = json.load(f)
existing = {m["productId"]: m for m in catalog.get("products", [])}

ok = 0
for pid in MISSING_IDS:
    p = products[pid]
    print("==", p["sku"], p["name"])
    hit = None
    for fn in (mod.scrape_budgetworkwear, mod.scrape_kcembroidery):
        hit = fn(p)
        if hit and hit.get("blankImage"):
            break
    if not hit or not hit.get("blankImage"):
        for q in EXTRA_QUERIES.get(pid, []):
            tmp = dict(p)
            tmp["name"] = q
            hit = mod.scrape_budgetworkwear(tmp)
            if hit and hit.get("blankImage"):
                break
    if hit and hit.get("blankImage"):
        existing[pid] = hit
        ok += 1
        print(" OK", hit["blankImage"][:100])
    else:
        print(" FAIL")

results = [existing[k] for k in sorted(existing.keys())]
catalog["products"] = results
catalog["meta"] = {
    **(catalog.get("meta") or {}),
    "withBlankImage": sum(1 for r in results if r.get("blankImage")),
}
with open(ROOT / "data" / "mockups.json", "w", encoding="utf-8") as f:
    json.dump(catalog, f, indent=2)

blank_by_id = {r["productId"]: mod.normalize_image_url(r["blankImage"]) for r in results if r.get("blankImage")}
with open(ROOT / "data" / "products.json", encoding="utf-8") as f:
    pdata = json.load(f)
for prod in pdata["products"]:
    if prod["id"] in blank_by_id:
        prod["image"] = blank_by_id[prod["id"]]
with open(ROOT / "data" / "products.json", "w", encoding="utf-8") as f:
    json.dump(pdata, f, indent=2)

print(f"\nResolved {ok}/{len(MISSING_IDS)}; total with blank: {catalog['meta']['withBlankImage']}/223")