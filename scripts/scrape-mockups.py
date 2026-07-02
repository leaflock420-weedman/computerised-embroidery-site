#!/usr/bin/env python3
"""Scrape blank/black variant images from headwear product pages."""
import json
import re
import urllib.request
from html import unescape

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CE-Scraper/1.0)"}
PRODUCTS = r"C:\Users\wordo\computerised-embroidery-site\data\products.json"
MOCKUPS = r"C:\Users\wordo\computerised-embroidery-site\data\mockups.json"

BLACK_KEYS = ("black", "blk", "charcoal", "navy")


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
    return [u for u in dict.fromkeys(imgs) if "loading" not in u]


def find_black_image(html, images):
    # BigCommerce variant blocks often pair colour label with image url nearby
    for key in BLACK_KEYS:
        for m in re.finditer(key, html, re.I):
            chunk = html[max(0, m.start() - 400) : m.end() + 400]
            local = find_images(chunk)
            if local:
                return local[0], key
    # fallback: darkest filename hint
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
    with open(PRODUCTS, encoding="utf-8") as f:
        data = json.load(f)

    existing = {}
    try:
        with open(MOCKUPS, encoding="utf-8") as f:
            existing = {m["productId"]: m for m in json.load(f).get("products", [])}
    except FileNotFoundError:
        pass

    headwear = [p for p in data["products"] if p.get("supplier") == "headwear"]
    results = []
    for i, p in enumerate(headwear[:30]):  # sample first 30 for speed
        print(f"[{i+1}/{min(30,len(headwear))}] {p['name'][:50]}")
        m = scrape_product_mockup(p) or existing.get(p["id"])
        if m:
            results.append(m)

    # defaults per subcategory (generic blanks)
    defaults = {
        "caps": "assets/mockups/cap-front.svg",
        "beanies": "assets/mockups/beanie-front.svg",
        "bucket-hats": "assets/mockups/bucket-front.svg",
    }

    out = {
        "defaults": defaults,
        "products": results,
        "note": "blankImage = black/neutral variant where found; designer uses SVG mockups as fallback",
    }
    with open(MOCKUPS, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)
    print(f"Wrote {len(results)} mockup entries → {MOCKUPS}")


if __name__ == "__main__":
    main()