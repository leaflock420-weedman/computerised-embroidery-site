#!/usr/bin/env python3
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
H = {"User-Agent": "Mozilla/5.0"}

PICKS = {
    "biz-bshv": ("Syzmik hi vis vest day night", "Syzmik"),
    "biz-bshs": ("Biz Collection soft shell jacket mens", "Biz Collection"),
    "biz-bshk": ("Biz Collection knit polo mens", "Biz Collection"),
    "biz-bshf": ("Biz Collection fleece jacket mens", "Biz Collection"),
    "jbs-1cp": ("JB's Podium Poly Polo kids", "JB"),
    "dnc-dnc1300": ("DNC cargo pant work", "DNC"),
    "dnc-dnc2100": ("DNC coverall cotton", "DNC"),
    "dnc-dnc4500": ("DNC cap cotton", "DNC"),
}


def suggest(q):
    u = (
        "https://www.budgetworkwear.com.au/search/suggest.json?q="
        + urllib.parse.quote(q)
        + "&resources%5Btype%5D=product&resources%5Blimit%5D=5"
    )
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=20))[
        "resources"
    ]["results"]["products"]


with open(ROOT / "data" / "mockups.json", encoding="utf-8") as f:
    catalog = json.load(f)
existing = {m["productId"]: m for m in catalog.get("products", [])}

for pid, (query, brand_hint) in PICKS.items():
    print("==", pid, query)
    best = None
    for hit in suggest(query):
        title = hit.get("title", "")
        if brand_hint.lower() not in title.lower():
            continue
        best = hit
        break
    if not best:
        for hit in suggest(query):
            best = hit
            break
    if best and best.get("image"):
        img = best["image"]
        if img.startswith("//"):
            img = "https:" + img
        existing[pid] = {
            "productId": pid,
            "blankImage": img,
            "matched": "manual-bww",
            "source": best.get("title"),
        }
        print(" OK", best["title"][:70])
        print("   ", img[:90])
    else:
        print(" FAIL")

results = [existing[k] for k in sorted(existing.keys())]
catalog["products"] = results
catalog["meta"] = {**(catalog.get("meta") or {}), "withBlankImage": sum(1 for r in results if r.get("blankImage"))}
with open(ROOT / "data" / "mockups.json", "w", encoding="utf-8") as f:
    json.dump(catalog, f, indent=2)

blank_by_id = {r["productId"]: r["blankImage"] for r in results if r.get("blankImage")}
with open(ROOT / "data" / "products.json", encoding="utf-8") as f:
    pdata = json.load(f)
for prod in pdata["products"]:
    if prod["id"] in blank_by_id:
        prod["image"] = blank_by_id[prod["id"]]
with open(ROOT / "data" / "products.json", "w", encoding="utf-8") as f:
    json.dump(pdata, f, indent=2)

print("total", catalog["meta"]["withBlankImage"], "/223")