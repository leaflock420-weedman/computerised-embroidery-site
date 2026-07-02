#!/usr/bin/env python3
"""Scrape Biz Collection product images from kcembroidery.co.nz brand pages."""
import json
import re
import time
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


def product_image_from_page(url):
    html = fetch(url)
    imgs = re.findall(
        r'(https://kcembroidery\.co\.nz/wp-content/uploads/[^"\']+\.(?:jpg|jpeg|png))',
        html,
        re.I,
    )
    imgs = [u for u in dict.fromkeys(imgs) if "logo" not in u.lower()]
    # WooCommerce often has full-size in data-large or first gallery image
    for img in imgs:
        if "300x400" in img or "fullbody" in img.lower() or "-right" in img.lower():
            return re.sub(r"-\d+x\d+(?=\.\w+$)", "", img)
    return re.sub(r"-\d+x\d+(?=\.\w+$)", "", imgs[0]) if imgs else ""


def collect_biz_links():
    links = []
    for page in range(1, 6):
        url = f"{BASE}/product_brand/biz-collection/page/{page}/"
        try:
            html = fetch(url)
        except Exception:
            break
        found = re.findall(r'href="(https://kcembroidery\.co\.nz/product/[^"]+)"', html)
        if not found:
            break
        links.extend(found)
        time.sleep(0.3)
    return list(dict.fromkeys(links))


def main():
    with open(PRODUCTS, encoding="utf-8") as f:
        products = json.load(f)["products"]
    biz = [p for p in products if p["supplier"] == "biz-collection"]

    if MOCKUPS.exists():
        with open(MOCKUPS, encoding="utf-8") as f:
            catalog = json.load(f)
        existing = {m["productId"]: m for m in catalog.get("products", [])}
    else:
        catalog = {}
        existing = {}

    links = collect_biz_links()
    print("KC links", len(links))

    # index KC pages by SKU tokens in URL/title
    kc_index = {}
    for link in links:
        slug = link.rstrip("/").split("/")[-1]
        try:
            html = fetch(link)
        except Exception:
            continue
        title = re.search(r"<title>([^<]+)", html)
        title_txt = title.group(1).lower() if title else slug
        tokens = set(re.findall(r"[a-z0-9]{2,}", slug + " " + title_txt))
        img = product_image_from_page(link)
        if img:
            kc_index[slug] = {"link": link, "img": img, "tokens": tokens, "title": title_txt}
        time.sleep(0.2)

    ok = 0
    for p in biz:
        sku = p["sku"].lower()
        name_tokens = set(re.findall(r"[a-z0-9]{2,}", p["name"].lower()))
        best = None
        best_score = 0
        for slug, info in kc_index.items():
            score = 0
            if sku in slug or sku in info["title"]:
                score += 10
            if sku in info["tokens"]:
                score += 8
            overlap = len(name_tokens & info["tokens"])
            score += overlap
            if score > best_score:
                best_score = score
                best = info
        if best and best_score >= 8:
            existing[p["id"]] = {
                "productId": p["id"],
                "blankImage": best["img"],
                "matched": "kce-page",
                "source": best["link"],
            }
            ok += 1
            print(p["sku"], "OK", best["img"][:90])
        else:
            print(p["sku"], "MISS best", best_score)

    results = [existing[k] for k in sorted(existing.keys())]
    out = {
        **catalog,
        "products": results,
        "meta": {
            **(catalog.get("meta") or {}),
            "withBlankImage": sum(1 for r in results if r.get("blankImage")),
        },
    }
    with open(MOCKUPS, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"biz kce: {ok}/{len(biz)} matched")


if __name__ == "__main__":
    main()