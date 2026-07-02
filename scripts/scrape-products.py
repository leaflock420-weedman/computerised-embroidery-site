#!/usr/bin/env python3
"""Scrape starter product catalogue from supplier sites."""
import json
import re
import urllib.request
from html import unescape

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; CE-Scraper/1.0)"}
OUT = r"C:\Users\wordo\computerised-embroidery-site\data\products.json"


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.read().decode("utf-8", "replace")


def scrape_headwear(pages=5):
    products = []
    seen = set()
    for page in range(1, pages + 1):
        url = f"https://qld.headwear.com.au/headwear-styles/?page={page}"
        html = fetch(url)
        titles = re.findall(
            r'class="card-title"[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>\s*([^<]+?)\s*</a>',
            html,
        )
        for href, name in titles:
            slug = href.split("?")[0].rstrip("/")
            if slug in seen:
                continue
            seen.add(slug)
            idx = html.find(name)
            chunk = html[max(0, idx - 1500) : idx + 800]
            # BigCommerce lazy-loads: real image is in data-src, src is loading.svg
            imgs = re.findall(
                r'(?:data-src|data-lazy)=["\'](https://cdn11\.bigcommerce\.com/[^"\']+/products/[^"\']+)["\']',
                chunk,
            )
            img = imgs[0] if imgs else ""
            if not img:
                try:
                    page_html = fetch(href if href.startswith("http") else f"https://qld.headwear.com.au{href}")
                    page_imgs = re.findall(
                        r'(?:data-src|src)=["\'](https://cdn11\.bigcommerce\.com/[^"\']+/products/[^"\']+\.(?:jpg|jpeg|png|webp)[^"\']*)["\']',
                        page_html,
                    )
                    page_imgs = [u for u in page_imgs if "loading" not in u]
                    img = page_imgs[0] if page_imgs else ""
                except Exception:
                    pass
            sub = "beanies" if "beanie" in name.lower() else "bucket-hats" if "bucket" in name.lower() else "caps"
            slug_id = slug.split("/")[-1][:40]
            products.append({
                "id": f"hw-{slug_id}",
                "sku": slug_id.upper()[:12],
                "name": unescape(name.strip()),
                "brand": "Headwear Professionals",
                "supplier": "headwear",
                "category": "headwear",
                "subcategory": sub,
                "image": img,
                "sourceUrl": href,
                "priceFrom": None,
                "description": f"{name.strip()} — custom embroidery available.",
                "sizes": ["One size / adjustable"],
                "colours": ["Multiple colours available"],
            })
    return products


def scrape_ascolour_products():
    """Scrape AS Colour product pages + curated bestsellers."""
    pages = [
        ("5001", "Staple Tee", "t-shirts", "https://www.ascolour.com.au/staple-tee-5001/"),
        ("5026", "Classic Tee", "t-shirts", "https://www.ascolour.com.au/classic-tee-5026/"),
        ("5071", "Wash Tee", "t-shirts", "https://www.ascolour.com.au/wash-tee-5071/"),
        ("5082", "Heavy Faded Tee", "t-shirts", "https://www.ascolour.com.au/heavy-faded-tee-5082/"),
        ("5165", "Box Hood", "hoodies", "https://www.ascolour.com.au/box-hood-5165/"),
        ("5161", "Relax Hood", "hoodies", "https://www.ascolour.com.au/relax-hood-5161/"),
        ("5100", "Heavy Fleece Crew", "hoodies", "https://www.ascolour.com.au/heavy-fleece-crew-5100/"),
        ("1130", "Frame Cap", "headwear", "https://www.ascolour.com.au/frame-cap-1130/"),
        ("1112", "Cable Beanie", "headwear", "https://www.ascolour.com.au/cable-beanie-1112/"),
        ("1114", "Surf Cap", "headwear", "https://www.ascolour.com.au/surf-cap-1114/"),
        ("5501", "Pique Polo", "polos", "https://www.ascolour.com.au/pique-polo-5501/"),
        ("5102", "Staple Hood", "hoodies", "https://www.ascolour.com.au/staple-hood-5102/"),
        ("5001G", "Supply Tee", "t-shirts", "https://www.ascolour.com.au/supply-tee-5001g/"),
        ("5533", "Canvas Cord Collar Jacket", "jackets", "https://www.ascolour.com.au/canvas-cord-collar-jacket-5533/"),
        ("4932", "Relax Trackpants", "pants", "https://www.ascolour.com.au/relax-trackpants-4932/"),
    ]
    products = []
    for sku, fallback_name, cat, url in pages:
        name, img, desc = fallback_name, "", f"Premium AS Colour blank — style {sku}. Ready for embroidery."
        try:
            html = fetch(url)
            title_m = re.search(r"<title>([^<|]+)", html)
            if title_m:
                name = re.sub(r"\s*\|.*", "", title_m.group(1)).strip()
            img_m = re.search(r"(https://i\.shgcdn\.com/[^\"\s]+)", html)
            if img_m:
                img = img_m.group(1)
            desc_m = re.search(r'"description"\s*:\s*"([^"]+)"', html)
            if desc_m:
                desc = desc_m.group(1)[:200]
        except Exception:
            pass
        products.append({
            "id": f"asc-{sku.lower()}",
            "sku": sku,
            "name": name,
            "brand": "AS Colour",
            "supplier": "as-colour",
            "category": cat,
            "subcategory": cat,
            "image": img,
            "sourceUrl": url,
            "priceFrom": None,
            "description": desc,
            "sizes": ["XS", "S", "M", "L", "XL", "2XL", "3XL"],
            "colours": ["70+ colours" if sku == "5001" else "Multiple colours available"],
        })
    return products


def curated_biz_collection():
    """Curated Biz Collection bestsellers (from public catalogue)."""
    items = [
        ("RXP", "Biz Cool Mens Sprint Polo", "polos", "Breathable polo for corporate and teamwear."),
        ("RXPW", "Biz Cool Womens Sprint Polo", "polos", "Ladies fit breathable polo."),
        ("RXPJ", "Biz Collection Kids Polo", "schools", "Kids school and club polo."),
        ("BSC", "Biz Collection Mens Oxford Shirt", "shirts", "Classic corporate oxford shirt."),
        ("BSCW", "Biz Collection Womens Oxford Shirt", "shirts", "Ladies corporate oxford shirt."),
        ("BSH", "Biz Collection Mens Chino", "pants", "Corporate chino pant."),
        ("BSHW", "Biz Collection Womens Chino", "pants", "Ladies corporate chino."),
        ("BSJ", "Biz Collection Mens Jacket", "jackets", "Lightweight corporate jacket."),
        ("BSHP", "Biz Collection Hospitality Apron", "hospitality", "Hospitality apron — bib style."),
        ("BSR", "Biz Collection Scrubs Top", "healthcare", "Healthcare scrubs top."),
        ("BSRP", "Biz Collection Scrubs Pant", "healthcare", "Healthcare scrubs pant."),
        ("BSHV", "Biz Collection Hi-Vis Vest", "hivis", "Hi-vis safety vest."),
        ("RXL", "Biz Cool Mens Long Sleeve Polo", "polos", "Long sleeve corporate polo."),
        ("RXLW", "Biz Cool Womens Long Sleeve Polo", "polos", "Ladies long sleeve polo."),
        ("BSHS", "Biz Collection Soft Shell Jacket", "jackets", "Soft shell corporate jacket."),
        ("BSHK", "Biz Collection Knit Polo", "polos", "Knit corporate polo."),
        ("BSHF", "Biz Collection Fleece Jacket", "jackets", "Corporate fleece jacket."),
        ("BSHA", "Biz Collection Chef Jacket", "hospitality", "Chef jacket for hospitality."),
    ]
    return [{
        "id": f"biz-{sku.lower()}",
        "sku": sku,
        "name": name,
        "brand": "Biz Collection",
        "supplier": "biz-collection",
        "category": cat,
        "subcategory": cat,
        "image": "https://static.wixstatic.com/media/c92cd4_c50c0a6c5001491cbf073f7a1ded83eb~mv2.jpg/v1/crop/x_215,y_341,w_300,h_53/fill/w_347,h_74,al_c,lg_1,q_80,enc_avif,quality_auto/c92cd4_c50c0a6c5001491cbf073f7a1ded83eb~mv2.jpg",
        "sourceUrl": f"https://www.fashionbiz.com.au/product-search?brand=biz-collection&search={sku}",
        "priceFrom": None,
        "description": desc,
        "sizes": ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
        "colours": ["Multiple colours available"],
    } for sku, name, cat, desc in items]


def curated_jbs_wear():
    items = [
        ("1PO", "JB's Podium Polo", "polos", "Classic work and school polo."),
        ("1PP", "JB's Premium Polo", "polos", "Premium cotton polo for corporate wear."),
        ("1PPL", "JB's Premium Polo Long Sleeve", "polos", "Long sleeve premium polo."),
        ("1HT", "JB's Heritage Tee", "t-shirts", "Heavyweight cotton tee."),
        ("1HTL", "JB's Heritage Tee Long Sleeve", "t-shirts", "Long sleeve heritage tee."),
        ("1HFL", "JB's Hoodie", "hoodies", "Fleece hoodie for work and leisure."),
        ("1HFLZ", "JB's Zip Hoodie", "hoodies", "Zip-through fleece hoodie."),
        ("1HV", "JB's Hi-Vis Singlet", "hivis", "AS/NZS approved hi-vis singlet."),
        ("1HVP", "JB's Hi-Vis Polo", "hivis", "Hi-vis safety polo shirt."),
        ("1HVJ", "JB's Hi-Vis Jacket", "hivis", "Hi-vis wet weather jacket."),
        ("1HVV", "JB's Hi-Vis Vest", "hivis", "Hi-vis safety vest."),
        ("1CHE", "JB's Chef Shirt", "hospitality", "Hospitality chef shirt."),
        ("1AP", "JB's Apron", "hospitality", "Bib apron for hospitality."),
        ("1CP", "JB's Childcare Polo", "schools", "Childcare and school polo."),
        ("1WS", "JB's Work Shirt", "workwear", "Cotton drill work shirt."),
        ("1WP", "JB's Work Pant", "workwear", "Reinforced work pant."),
        ("1BK", "JB's Bucket Hat", "headwear", "Cotton bucket hat."),
        ("1CPK", "JB's Cap", "headwear", "Brushed cotton cap."),
    ]
    return [{
        "id": f"jbs-{sku.lower()}",
        "sku": sku,
        "name": name,
        "brand": "JB's Wear",
        "supplier": "jbs-wear",
        "category": cat,
        "subcategory": cat,
        "image": "https://static.wixstatic.com/media/c92cd4_23bfd9f9e21b4e4aaed99f5e1a76b01f.jpg/v1/fill/w_420,h_152,al_c,lg_1,q_80,enc_avif,quality_auto/c92cd4_23bfd9f9e21b4e4aaed99f5e1a76b01f.jpg",
        "sourceUrl": "https://www.jbswear.com.au/general/catalogue",
        "priceFrom": None,
        "description": desc,
        "sizes": ["2XS", "XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
        "colours": ["Multiple colours available"],
    } for sku, name, cat, desc in items]


def curated_dnc_workwear():
    items = [
        ("DNC3900", "DNC Hi-Vis Safety Vest", "hivis", "Day/night hi-vis vest."),
        ("DNC3950", "DNC Hi-Vis Polo", "hivis", "Breathable hi-vis polo."),
        ("DNC3960", "DNC Hi-Vis Long Sleeve Shirt", "hivis", "Long sleeve hi-vis shirt."),
        ("DNC1200", "DNC Cotton Drill Work Shirt", "workwear", "Heavy cotton drill work shirt."),
        ("DNC1300", "DNC Cargo Work Pant", "workwear", "Reinforced cargo work pant."),
        ("DNC1500", "DNC Softshell Jacket", "jackets", "Wind/water resistant softshell."),
        ("DNC2100", "DNC Coverall", "workwear", "Full coverall for industrial use."),
        ("DNC3100", "DNC Wet Weather Jacket", "jackets", "Waterproof work jacket."),
        ("DNC4100", "DNC Polo Shirt", "polos", "Industrial polo shirt."),
        ("DNC4200", "DNC Fleecy Sweat", "hoodies", "Industrial fleece sweat."),
        ("DNC4300", "DNC Hoodie", "hoodies", "Industrial hooded fleece."),
        ("DNC4400", "DNC Beanie", "headwear", "Acrylic work beanie."),
        ("DNC4500", "DNC Cap", "headwear", "Cotton drill cap."),
        ("DNC1600", "DNC Flame Retardant Shirt", "workwear", "Flame retardant work shirt."),
    ]
    return [{
        "id": f"dnc-{sku.lower()}",
        "sku": sku,
        "name": name,
        "brand": "DNC Workwear",
        "supplier": "dnc-workwear",
        "category": cat,
        "subcategory": cat,
        "image": "https://static.wixstatic.com/media/c92cd4_b5fdcd8768b24d5c8620a648b7725f44~mv2.jpg/v1/crop/x_14,y_0,w_281,h_306,q_80,enc_avif,quality_auto/c92cd4_b5fdcd8768b24d5c8620a648b7725f44~mv2.jpg",
        "sourceUrl": "https://www.dncworkwear.com.au/documents/Catalogue13.pdf",
        "priceFrom": None,
        "description": desc,
        "sizes": ["S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"],
        "colours": ["Multiple colours available"],
    } for sku, name, cat, desc in items]


def curated_winning_spirit():
    items = [
        ("PS55", "Winning Spirit Polo", "polos", "Classic promotional polo."),
        ("PS59", "Winning Spirit Ladies Polo", "polos", "Ladies fit promotional polo."),
        ("TS20", "Winning Spirit Tee", "t-shirts", "Cotton promotional tee."),
        ("JH001", "Winning Spirit Hoodie", "hoodies", "Fleece hoodie for teams."),
        ("HVE001", "Winning Spirit Hi-Vis Vest", "hivis", "Safety hi-vis vest."),
        ("AP01", "Winning Spirit Apron", "hospitality", "Bib apron for hospitality."),
        ("BS01", "Benchmark Scrubs Top", "healthcare", "Healthcare scrubs top."),
        ("BS02", "Benchmark Scrubs Pant", "healthcare", "Healthcare scrubs pant."),
    ]
    return [{
        "id": f"ws-{sku.lower()}",
        "sku": sku,
        "name": name,
        "brand": "Winning Spirit",
        "supplier": "winning-spirit",
        "category": cat,
        "subcategory": cat,
        "image": "https://static.wixstatic.com/media/c92cd4_48a9c13959284ab0a368a35451929d7c.gif",
        "sourceUrl": "https://ws-au-imgs.s3.amazonaws.com/2024+catalogue/2024_CATALOGUE.pdf",
        "priceFrom": None,
        "description": desc,
        "sizes": ["XS", "S", "M", "L", "XL", "2XL", "3XL", "5XL"],
        "colours": ["Multiple colours available"],
    } for sku, name, cat, desc in items]


def main():
    print("Scraping Headwear...")
    headwear = scrape_headwear(pages=5)
    print(f"  {len(headwear)} headwear products")

    print("Scraping AS Colour...")
    ascolour = scrape_ascolour_products()
    print(f"  {len(ascolour)} AS Colour products")

    curated = (
        curated_biz_collection()
        + curated_jbs_wear()
        + curated_dnc_workwear()
        + curated_winning_spirit()
    )
    print(f"  {len(curated)} curated products from PDF/print catalogues")

    all_products = headwear + ascolour + curated
    categories = sorted({p["category"] for p in all_products})

    data = {
        "meta": {
            "total": len(all_products),
            "lastUpdated": "2026-07-02",
            "note": "Products sourced from supplier catalogues. Prices quoted on request — includes garment + embroidery."
        },
        "categories": [
            {"id": "all", "name": "All Products"},
            {"id": "polos", "name": "Polos"},
            {"id": "t-shirts", "name": "T-Shirts"},
            {"id": "hoodies", "name": "Hoodies & Fleece"},
            {"id": "headwear", "name": "Caps & Headwear"},
            {"id": "hivis", "name": "Hi-Vis & Safety"},
            {"id": "workwear", "name": "Workwear"},
            {"id": "hospitality", "name": "Hospitality"},
            {"id": "healthcare", "name": "Healthcare"},
            {"id": "schools", "name": "Schools & Kids"},
            {"id": "jackets", "name": "Jackets"},
            {"id": "shirts", "name": "Shirts"},
            {"id": "pants", "name": "Pants"},
        ],
        "brands": [
            {"id": "all", "name": "All Brands"},
            {"id": "headwear", "name": "Headwear Professionals"},
            {"id": "as-colour", "name": "AS Colour"},
            {"id": "biz-collection", "name": "Biz Collection"},
            {"id": "jbs-wear", "name": "JB's Wear"},
            {"id": "dnc-workwear", "name": "DNC Workwear"},
            {"id": "winning-spirit", "name": "Winning Spirit"},
        ],
        "products": all_products,
    }

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    print(f"Wrote {len(all_products)} products to {OUT}")


if __name__ == "__main__":
    main()