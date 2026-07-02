#!/usr/bin/env python3
import json
import re
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PRODUCTS = ROOT / "data" / "products.json"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# Corrected slugs from ascolour.com.au (old catalogue codes may differ)
URL_FIXES = {
    "5071": "https://www.ascolour.com.au/classic-l-s-tee-5071/",
    "5165": "https://www.ascolour.com.au/box-hood-5171/",
    "5100": "https://www.ascolour.com.au/supply-crew-5100/",
    "1130": "https://www.ascolour.com.au/access-cap-1130/",
    "1112": "https://www.ascolour.com.au/cable-beanie-1120/",
    "5501": "https://www.ascolour.com.au/pique-polo-5501/",
    "5102": "https://www.ascolour.com.au/stencil-hood-5102/",
    "5001G": "https://www.ascolour.com.au/staple-organic-tee-5001g/",
    "4932": "https://www.ascolour.com.au/wos-relax-track-pants-4932/",
}

ALT_TRY = {
    "5071": [
        "https://www.ascolour.com.au/staple-stone-wash-tee-5040/",
        "https://www.ascolour.com.au/wash-tee-5071/",
    ],
    "5165": [
        "https://www.ascolour.com.au/relax-faded-crew-5165/",
        "https://www.ascolour.com.au/box-hood-5165/",
    ],
    "5100": ["https://www.ascolour.com.au/heavy-fleece-crew-neck-5100/"],
    "1130": ["https://www.ascolour.com.au/frame-cap/"],
    "1112": ["https://www.ascolour.com.au/cable-beanie/"],
    "5501": [
        "https://www.ascolour.com.au/pique-polo/",
        "https://www.ascolour.com.au/cyrus-windbreaker-5501/",
    ],
    "5102": ["https://www.ascolour.com.au/staple-hood/"],
    "5001G": ["https://www.ascolour.com.au/supply-tee/"],
    "4932": ["https://www.ascolour.com.au/relax-track-pant-4932/"],
}


def has_products(html):
    return "cdn11.bigcommerce.com" in html and "/products/" in html


def fetch(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, r.read().decode("utf-8", "replace")


with open(PRODUCTS, encoding="utf-8") as f:
    data = json.load(f)

for p in data["products"]:
    if p["supplier"] != "as-colour":
        continue
    sku = p["sku"]
    candidates = []
    if sku in URL_FIXES:
        candidates.append(URL_FIXES[sku])
    candidates.extend(ALT_TRY.get(sku, []))
    candidates.append(p.get("sourceUrl", ""))
    seen = set()
    for url in candidates:
        if not url or url in seen:
            continue
        seen.add(url)
        try:
            st, html = fetch(url)
            if st == 200 and has_products(html):
                p["sourceUrl"] = url
                title = re.search(r"<title>([^<|]+)", html)
                if title:
                    p["name"] = re.sub(r"\s*\|.*", "", title.group(1)).strip()
                print(sku, "FIXED", url)
                break
        except Exception as e:
            print(sku, url, "fail", str(e)[:50])
    else:
        print(sku, "STILL MISSING")

with open(PRODUCTS, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)