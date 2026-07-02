#!/usr/bin/env python3
import json
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
H = {"User-Agent": "Mozilla/5.0"}

SEARCHES = {
    "biz-bshv": ["hi vis vest orange navy", "safety vest day night", "Biz Care hi vis"],
    "biz-bshs": ["soft shell jacket black", "Biz Corporate soft shell", "Biz Collection jacket softshell"],
    "biz-bshk": ["knit polo mens", "Biz Collection knit", "merino knit polo"],
    "biz-bshf": ["fleece jacket mens black", "Biz Collection fleece", "corporate fleece jacket"],
    "jbs-1cp": ["kids polo navy", "childcare polo", "JB kids polo", "school polo kids"],
}


def suggest(q):
    u = (
        "https://www.budgetworkwear.com.au/search/suggest.json?q="
        + urllib.parse.quote(q)
        + "&resources%5Btype%5D=product&resources%5Blimit%5D=8"
    )
    return json.load(urllib.request.urlopen(urllib.request.Request(u, headers=H), timeout=20))[
        "resources"
    ]["results"]["products"]


with open(ROOT / "data" / "mockups.json", encoding="utf-8") as f:
    catalog = json.load(f)
existing = {m["productId"]: m for m in catalog.get("products", [])}

for pid, queries in SEARCHES.items():
    print("==", pid)
    picked = None
    for q in queries:
        for hit in suggest(q):
            title = (hit.get("title") or "").lower()
            if pid.startswith("biz") and "biz" not in title and "syzmik" not in title:
                continue
            if pid.startswith("jbs") and "jb" not in title:
                continue
            picked = hit
            break
        if picked:
            break
    if not picked:
        for q in queries:
            hits = suggest(q)
            if hits:
                picked = hits[0]
                break
    if picked and picked.get("image"):
        img = picked["image"]
        if img.startswith("//"):
            img = "https:" + img
        existing[pid] = {
            "productId": pid,
            "blankImage": img,
            "matched": "manual-bww2",
            "source": picked.get("title"),
        }
        print(" OK", picked["title"][:75])
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