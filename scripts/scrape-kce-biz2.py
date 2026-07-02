#!/usr/bin/env python3
"""Match Biz Collection SKUs to kcembroidery product pages by SKU in HTML."""
import json
import re
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / "data" / "products.json"
MOCKUPS = ROOT / "data" / "mockups.json"
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CE-Scraper/1.0)"}
BASE = "https://kcembroidery.co.nz"


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def best_image(html, sku):
    imgs = re.findall(
        r'(https://kcembroidery\.co\.nz/wp-content/uploads/[^"\']+\.(?:jpg|jpeg|png))',
        html,
        re.I,
    )
    imgs = [u for u in dict.fromkeys(imgs) if "logo" not in u.lower()]
    sku_low = sku.lower()
    for img in imgs:
        if sku_low in img.lower() or "08000000" in img:
            return re.sub(r"-\d+x\d+(?=\.\w+$)", "", img)
    for img in imgs:
        if "fullbody" in img.lower() or "-right" in img.lower():
            return re.sub(r"-\d+x\d+(?=\.\w+$)", "", img)
    return re.sub(r"-\d+x\d+(?=\.\w+$)", "", imgs[0]) if imgs else ""


def search_product(sku):
    q = urllib.parse.quote(sku)
    html = fetch(f"{BASE}/shop/?s={q}&post_type=product")
    links = re.findall(r'href="(https://kcembroidery\.co\.nz/product/[^"]+)"', html)
    for link in dict.fromkeys(links):
        page = fetch(link)
        if sku.lower() in page.lower():
            img = best_image(page, sku)
            if img:
                return link, img
    # direct product slug guesses
    for slug in [sku.lower(), f"biz-{sku.lower()}"]:
        link = f"{BASE}/product/{slug}/"
        try:
            page = fetch(link)
            if sku.lower() in page.lower():
                img = best_image(page, sku)
                if img:
                    return link, img
        except Exception:
            pass
    return None, ""


def main():
    with open(PRODUCTS, encoding="utf-8") as f:
        biz = [p for p in json.load(f)["products"] if p["supplier"] == "biz-collection"]
    with open(MOCKUPS, encoding="utf-8") as f:
        catalog = json.load(f)
    existing = {m["productId"]: m for m in catalog.get("products", [])}

    ok = 0
    for p in biz:
        if existing.get(p["id"], {}).get("blankImage"):
            print(p["sku"], "skip existing")
            ok += 1
            continue
        link, img = search_product(p["sku"])
        if img:
            existing[p["id"]] = {
                "productId": p["id"],
                "blankImage": img,
                "matched": "kce-sku-search",
                "source": link,
            }
            ok += 1
            print(p["sku"], "OK", img[:100])
        else:
            print(p["sku"], "MISS")
        time.sleep(0.35)

    results = [existing[k] for k in sorted(existing.keys())]
    catalog["products"] = results
    catalog["meta"] = {
        **(catalog.get("meta") or {}),
        "withBlankImage": sum(1 for r in results if r.get("blankImage")),
    }
    with open(MOCKUPS, "w", encoding="utf-8") as f:
        json.dump(catalog, f, indent=2)

    blank_by_id = {r["productId"]: r["blankImage"] for r in results if r.get("blankImage")}
    with open(PRODUCTS, encoding="utf-8") as f:
        pdata = json.load(f)
    for prod in pdata["products"]:
        if prod["id"] in blank_by_id:
            prod["image"] = blank_by_id[prod["id"]]
    with open(PRODUCTS, "w", encoding="utf-8") as f:
        json.dump(pdata, f, indent=2)
    print(f"biz total with image: {ok}/{len(biz)}")


if __name__ == "__main__":
    main()