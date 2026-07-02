#!/usr/bin/env python3
"""Scrape per-product blank/black garment images for all suppliers."""
from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS_PATH = ROOT / "data" / "products.json"
MOCKUPS_PATH = ROOT / "data" / "mockups.json"

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CE-Scraper/1.0)"}
BLACK_KEYS = ("black", "blk", "charcoal", "navy", "_bx_", "-black")
JBS_BASE = "https://www.jbswear.com.au"
WS_BASE = "https://www.winningspirit.com.au/site/Product%20Images"
KCE_BASE = "https://kcembroidery.co.nz"
BWW_BASE = "https://www.budgetworkwear.com.au"

# Winning Spirit catalogue codes that differ from our curated SKU
WS_SKU_ALIASES = {
    "JH001": ["SW92", "SW91", "JH01"],
    "HVE001": ["JK67", "HV001", "HVE01", "HV1", "HV50", "HV55", "HV60"],
    "BS01": ["BS11", "BS1", "BS03", "BS3", "BS10"],
}


def fetch(url: str, timeout: int = 25) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read().decode("utf-8", "replace")


def head_ok(url: str) -> bool:
    req = urllib.request.Request(url, headers=HEADERS, method="HEAD")
    try:
        with urllib.request.urlopen(req, timeout=12) as r:
            return 200 <= r.status < 400
    except Exception:
        return False


def normalize_image_url(raw: str) -> str:
    """Single CDN URL — strip responsive srcset descriptors."""
    url = (raw or "").strip().split()[0]
    if url.startswith("https://"):
        return url.split("?")[0] + ("?" + url.split("?", 1)[1] if "?c=" in url else "")
    return url


def find_bigcommerce_images(html: str) -> list[str]:
    raw = re.findall(
        r'(?:data-src|data-image|src|srcset)=["\']([^"\']+)["\']',
        html,
        re.I,
    )
    imgs = []
    for chunk in raw:
        for part in chunk.split(","):
            url = normalize_image_url(part.strip())
            if (
                url.startswith("https://cdn11.bigcommerce.com/")
                and "/products/" in url
                and re.search(r"\.(?:jpg|jpeg|png|webp)", url, re.I)
                and "loading" not in url.lower()
            ):
                imgs.append(url)
    imgs = list(dict.fromkeys(imgs))
    imgs.sort(
        key=lambda u: (
            "_black" not in u.lower() and "black" not in u.lower(),
            "1280x1280" not in u and "1000w" not in u,
            "navy" in u.lower(),
            "357x476" in u,
            "75x100" in u,
        )
    )
    return imgs


def pick_black_image(html: str, images: list[str]) -> tuple[str, str]:
    for img in images:
        low = img.lower()
        if "_black" in low or "-black" in low or "__black" in low:
            return img, "black-filename"
    for key in BLACK_KEYS:
        for m in re.finditer(key, html, re.I):
            chunk = html[max(0, m.start() - 400) : m.end() + 400]
            local = find_bigcommerce_images(chunk)
            if local:
                return local[0], key
    for img in images:
        low = img.lower()
        if any(k in low for k in BLACK_KEYS):
            return img, "filename"
    return images[0] if images else "", ""


def scrape_bigcommerce(product: dict) -> dict | None:
    url = product.get("sourceUrl") or ""
    if not url:
        return None
    try:
        html = fetch(url)
        images = find_bigcommerce_images(html)
        if not images:
            return None
        blank, matched = pick_black_image(html, images)
        return {
            "productId": product["id"],
            "blankImage": blank,
            "allVariants": images[:8],
            "matched": matched,
            "source": url,
        }
    except Exception as e:
        return {"productId": product["id"], "error": str(e), "source": url}


def scrape_winning_spirit(product: dict) -> dict | None:
    sku = (product.get("sku") or "").upper()
    candidates = [sku] + WS_SKU_ALIASES.get(sku, [])
    for code in candidates:
        url = f"{WS_BASE}/{code}_01.jpg"
        if head_ok(url):
            return {
                "productId": product["id"],
                "blankImage": url.replace("%20", " "),
                "matched": "ws-pattern",
                "source": url,
            }
    bww = scrape_budgetworkwear(product)
    if bww and bww.get("blankImage"):
        return bww
    return {"productId": product["id"], "error": "no winning spirit image", "source": sku}


def upgrade_kce_url(url: str) -> str:
    # Prefer full-size catalogue shots when available
    return re.sub(r"-\d+x\d+(?=\.\w+$)", "", url)


def _bww_product_image(page: str) -> str:
    imgs = re.findall(
        r"(https://cdn\.shopify\.com/[^\"']+\.(?:jpg|jpeg|png|webp))",
        page,
        re.I,
    )
    imgs = [u for u in dict.fromkeys(imgs) if "logo" not in u.lower()]
    imgs.sort(key=lambda u: ("_grande" not in u and "width=1" not in u, "70x" in u, "icon" in u))
    black = [u for u in imgs if re.search(r"black|_blk|charcoal", u, re.I)]
    return (black or imgs)[0] if (black or imgs) else ""


def scrape_budgetworkwear(product: dict) -> dict | None:
    sku = (product.get("sku") or "").strip()
    brand = (product.get("brand") or "").strip()
    name = (product.get("name") or "").strip()
    code = sku.replace("DNC", "")
    name_core = re.sub(r"^DNC\s+", "", name, flags=re.I)
    name_core = re.sub(r"^JB's\s+", "", name_core, flags=re.I)
    queries = [
        f"{brand} {name_core}",
        f"{brand} {sku}",
        f"{brand} {code}",
        name,
    ]
    name_tokens = set(re.findall(r"[a-z0-9]{3,}", name_core.lower()))

    for q in queries:
        if not q or len(q) < 3:
            continue
        q_enc = urllib.parse.quote(q)
        try:
            raw = fetch(
                f"{BWW_BASE}/search/suggest.json?q={q_enc}"
                "&resources%5Btype%5D=product&resources%5Blimit%5D=8"
            )
            data = json.loads(raw)
            products = data.get("resources", {}).get("results", {}).get("products", [])
        except Exception:
            continue

        best = None
        best_score = 0
        for hit in products:
            title = (hit.get("title") or "").lower()
            if brand.lower().split()[0] not in title and sku[:2].lower() not in title:
                continue
            score = 0
            if sku.lower() in title or f"({code})" in title or f"({sku})" in title:
                score += 25
            title_tokens = set(re.findall(r"[a-z0-9]{3,}", title))
            score += len(name_tokens & title_tokens) * 2
            if score > best_score and hit.get("image"):
                best_score = score
                best = hit

        if best and best_score >= 4:
            img = best["image"]
            if img.startswith("//"):
                img = "https:" + img
            return {
                "productId": product["id"],
                "blankImage": img,
                "matched": "budgetworkwear-api",
                "source": BWW_BASE + best.get("url", ""),
                "title": best.get("title"),
            }
    return None


def scrape_kcembroidery(product: dict) -> dict | None:
    sku = (product.get("sku") or "").strip()
    name = product.get("name", "")
    short = re.sub(r"^JB's\s+", "", name, flags=re.I)
    queries = [
        sku,
        short,
        name.split(" - ")[0].strip(),
        " ".join(short.split()[:3]),
    ]
    for q in queries:
        if not q or len(q) < 2:
            continue
        q_enc = urllib.parse.quote(q)
        try:
            html = fetch(f"{KCE_BASE}/shop/?s={q_enc}&post_type=product")
        except Exception as e:
            return {"productId": product["id"], "error": str(e)}
        imgs = re.findall(
            rf"({KCE_BASE}/wp-content/uploads/[^\"']+\.(?:jpg|jpeg|png))",
            html,
            re.I,
        )
        imgs = [
            u
            for u in dict.fromkeys(imgs)
            if "logo" not in u.lower() and "icon" not in u.lower()
        ]
        sku_low = sku.lower()
        for img in imgs:
            if sku_low in img.lower():
                return {
                    "productId": product["id"],
                    "blankImage": upgrade_kce_url(img),
                    "matched": "kce-sku",
                    "source": f"{KCE_BASE}/shop/?s={q_enc}",
                }
        if imgs:
            return {
                "productId": product["id"],
                "blankImage": upgrade_kce_url(imgs[0]),
                "matched": "kce-search",
                "source": f"{KCE_BASE}/shop/?s={q_enc}",
            }
    return {"productId": product["id"], "error": "kce not found", "source": sku}


def scrape_jbs_wear(product: dict) -> dict | None:
    sku = (product.get("sku") or "").strip()
    # Site often serves a fallback page; still try to read SKU-specific assets.
    try:
        html = fetch(f"{JBS_BASE}/product-detail/{sku}")
    except Exception as e:
        html = ""

    if html:
        # Prefer black colourway shots for the actual SKU prefix
        colour_paths = re.findall(
            rf"/ClientData/ClientImages/Colours/{re.escape(sku)}_BX_[^\"']+\.jpg",
            html,
            re.I,
        )
        for path in colour_paths:
            if "_SM" not in path and "_LG" not in path:
                url = JBS_BASE + path.replace(" ", "%20")
                if head_ok(url):
                    return {
                        "productId": product["id"],
                        "blankImage": url,
                        "matched": "jbs-black",
                        "source": f"{JBS_BASE}/product-detail/{sku}",
                    }
        # Any product gallery image prefixed with SKU
        product_paths = re.findall(
            rf"/ClientData/ClientImages/Products/{re.escape(sku)}_[^\"']+\.jpg",
            html,
            re.I,
        )
        for path in product_paths:
            if "_SM" not in path and "_LG" not in path:
                url = JBS_BASE + path.replace(" ", "%20")
                if head_ok(url):
                    return {
                        "productId": product["id"],
                        "blankImage": url,
                        "matched": "jbs-product",
                        "source": f"{JBS_BASE}/product-detail/{sku}",
                    }

    # Retailer fallback (same garments, catalogue photography)
    for fallback in (scrape_kcembroidery, scrape_budgetworkwear):
        alt = fallback(product)
        if alt and alt.get("blankImage"):
            alt["matched"] = f"{alt.get('matched', 'fallback')}-jbs"
            return alt
    return {"productId": product["id"], "error": "jbs not found", "source": sku}


def scrape_dnc(product: dict) -> dict | None:
    sku = (product.get("sku") or "").strip()
    code = sku.replace("DNC", "")
    guesses = [
        f"https://www.dncworkwear.com.au/documents/images/products/{sku}.jpg",
        f"https://www.dncworkwear.com.au/documents/images/products/{code}.jpg",
        f"https://www.dncworkwear.com.au/images/products/{sku}.jpg",
        f"https://www.dncworkwear.com.au/productimages/{sku}.jpg",
    ]
    for url in guesses:
        if head_ok(url):
            return {
                "productId": product["id"],
                "blankImage": url,
                "matched": "dnc-static",
                "source": url,
            }
    bww = scrape_budgetworkwear(product)
    if bww and bww.get("blankImage"):
        return bww
    kce = scrape_kcembroidery(product)
    if kce and kce.get("blankImage"):
        kce["matched"] = "kce-fallback"
        return kce
    return {"productId": product["id"], "error": "dnc not found", "source": sku}


def scrape_biz_collection(product: dict) -> dict | None:
    sku = (product.get("sku") or "").strip()
    for source in (scrape_kcembroidery, scrape_budgetworkwear):
        hit = source(product)
        if hit and hit.get("blankImage"):
            return hit
    return {"productId": product["id"], "error": "biz not found", "source": sku}


SCRAPERS = {
    "headwear": scrape_bigcommerce,
    "as-colour": scrape_bigcommerce,
    "winning-spirit": scrape_winning_spirit,
    "biz-collection": scrape_biz_collection,
    "jbs-wear": scrape_jbs_wear,
    "dnc-workwear": scrape_dnc,
}


def load_existing() -> dict:
    if not MOCKUPS_PATH.exists():
        return {}
    with open(MOCKUPS_PATH, encoding="utf-8") as f:
        catalog = json.load(f)
    return {m["productId"]: m for m in catalog.get("products", [])}


def main():
    only_supplier = sys.argv[1] if len(sys.argv) > 1 else ""
    force = "--force" in sys.argv

    with open(PRODUCTS_PATH, encoding="utf-8") as f:
        products = json.load(f)["products"]

    existing = load_existing()
    if MOCKUPS_PATH.exists():
        with open(MOCKUPS_PATH, encoding="utf-8") as f:
            catalog = json.load(f)
    else:
        catalog = {}

    ok = 0
    fail = 0
    skipped = 0
    total = len(products)

    for i, p in enumerate(products):
        supplier = p.get("supplier", "")
        if only_supplier and supplier != only_supplier:
            continue

        if not force and existing.get(p["id"], {}).get("blankImage"):
            skipped += 1
            continue

        scraper = SCRAPERS.get(supplier)
        if not scraper:
            continue

        print(f"[{i + 1}/{total}] {supplier:16} {p['name'][:50]}")
        result = scraper(p)
        if result:
            existing[p["id"]] = result
            if result.get("blankImage"):
                ok += 1
                print(f"  OK {result['blankImage'][:90]}")
            else:
                fail += 1
                print(f"  FAIL {result.get('error', '?')}")
        time.sleep(0.2)

    results = [existing[k] for k in sorted(existing.keys())]
    with_blank = sum(1 for r in results if r.get("blankImage"))

    out = {
        "bases": catalog.get("bases") or {
            "cap": "assets/mockups/photos/cap-black.png",
            "beanie": "assets/mockups/photos/beanie-black.png",
            "bucket": "assets/mockups/photos/bucket-black.png",
            "tee": "assets/mockups/photos/tee-black.png",
            "polo": "assets/mockups/photos/tee-black.png",
            "hoodie": "assets/mockups/photos/hoodie-black.png",
        },
        "fallbacks": catalog.get("fallbacks") or {
            "cap": "assets/mockups/cap-front.svg",
            "beanie": "assets/mockups/beanie-front.svg",
            "bucket": "assets/mockups/bucket-front.svg",
            "tee": "assets/mockups/tee-front.svg",
            "polo": "assets/mockups/tee-front.svg",
            "hoodie": "assets/mockups/hoodie-front.svg",
        },
        "products": results,
        "meta": {
            "total": len(results),
            "withBlankImage": with_blank,
            "scrapedOk": ok,
            "scrapedFail": fail,
            "skippedExisting": skipped,
            "note": "blankImage = supplier catalogue photo (black/neutral) per productId",
        },
    }

    with open(MOCKUPS_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, indent=2)

    # Sync products.json image field (single URL only)
    blank_by_id = {
        r["productId"]: normalize_image_url(r["blankImage"])
        for r in results
        if r.get("blankImage")
    }
    with open(PRODUCTS_PATH, encoding="utf-8") as f:
        pdata = json.load(f)
    for p in pdata["products"]:
        if p["id"] in blank_by_id:
            p["image"] = blank_by_id[p["id"]]
    with open(PRODUCTS_PATH, "w", encoding="utf-8") as f:
        json.dump(pdata, f, indent=2)

    print(f"\nDone: {with_blank}/{len(products)} products have blankImage")
    print(f"This run: {ok} ok, {fail} fail, {skipped} skipped → {MOCKUPS_PATH}")


if __name__ == "__main__":
    main()