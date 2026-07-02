#!/usr/bin/env python3
"""Scrape blank/black variant images from headwear product pages."""
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / "data" / "products.json"
MOCKUPS = ROOT / "data" / "mockups.json"

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CE-Scraper/1.0)"}
BLACK_KEYS = ("black", "blk", "charcoal", "navy")

DEFAULTS = {
    "caps": "assets/mockups/cap-front.svg",
    "beanies": "assets/mockups/beanie-front.svg",
    "bucket-hats": "assets/mockups/bucket-front.svg",
    "t-shirts": "assets/mockups/tee-front.svg",
    "polos": "assets/mockups/tee-front.svg",
    "hoodies": "assets/mockups/hoodie-front.svg",
    "headwear": "assets/mockups/cap-front.svg",
}


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        return r.read().decode("utf-8", "replace")


def find_images(html):
    imgs = re.findall(
        r'(?:data-src|data-image|src)=["\'](https://cdn11\.bigcommerce\.com/[^"\']+/products/[^"\']+\.(?:jpg|jpeg|png|webp)[^"\']*)["\']',
        html,
        re.I,
    )
    # Prefer larger stencil sizes for designer quality
    imgs = [u for u in dict.fromkeys(imgs) if "loading" not in u]
    imgs.sort(key=lambda u: (
        "1280x1280" not in u,
        "357x476" not in u,
        "75x100" in u,
    ))
    return imgs


def find_black_image(html, images):
    for key in BLACK_KEYS:
        for m in re.finditer(key, html, re.I):
            chunk = html[max(0, m.start() - 400) : m.end() + 400]
            local = find_images(chunk)
            if local:
                return local[0], key
    for img in images:
        low = img.lower()
        if any(k in low for k in BLACK_KEYS):
            return img, "filename"
    return images[0] if images else "", ""


def scrape_product_mockup(product):
    url = product.get("sourceUrl") or ""
    if not url or product.get("supplier") != "headwear":
        return None
    try:
        html = fetch(url)
        images = find_images(html)
        if not images:
            return None
        black_img, matched = find_black_image(html, images)
        return {
            "productId": product["id"],
            "blankImage": black_img,
            "allVariants": images[:8],
            "matched": matched,
        }
    except Exception as e:
        return {"productId": product["id"], "error": str(e)}


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 0

    with open(PRODUCTS, encoding="utf-8") as f:
        data = json.load(f)

    existing = {}
    try:
        with open(MOCKUPS, encoding="utf-8") as f:
            catalog = json.load(f)
            existing = {m["productId"]: m for m in catalog.get("products", [])}
    except FileNotFoundError:
        catalog = {}

    headwear = [p for p in data["products"] if p.get("supplier") == "headwear"]
    if limit > 0:
        headwear = headwear[:limit]

    total = len(headwear)
    ok = 0
    for i, p in enumerate(headwear):
        print(f"[{i + 1}/{total}] {p['name'][:55]}")
        m = scrape_product_mockup(p)
        if m and m.get("blankImage"):
            existing[p["id"]] = m
            ok += 1
        elif m:
            existing[p["id"]] = m
        time.sleep(0.15)

    results = [existing[k] for k in sorted(existing.keys())]

    out = {
        "defaults": catalog.get("defaults") or DEFAULTS,
        "products": results,
        "meta": {
            "total": len(results),
            "withBlankImage": sum(1 for r in results if r.get("blankImage")),
            "note": "blankImage = black/neutral variant; SVG defaults used for other categories",
        },
    }
    with open(MOCKUPS, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {len(results)} entries ({ok} scraped this run) → {MOCKUPS}")


if __name__ == "__main__":
    main()