# Computerised Embroidery — Gold Coast

Modern website for **Computerised Embroidery**, Southport QLD. Short-run logo embroidery, digitizing, and workwear supply.

## Live demo

- **Full site (shop + Design Studio + uploads API):** https://computerised-embroidery.onrender.com
- **GitHub Pages (static browse only):** https://leaflock420-weedman.github.io/computerised-embroidery-site/
- **Local dev:** `npm start` → http://localhost:8765

## Features

- **Shop** — 220+ garments from JB's Wear, Biz Collection, Headwear, AS Colour, DNC, Winning Spirit
- **Design Studio** — upload artwork, place on garment mockup, multi-view (front/back/sleeves)
- **Quick Quote** — product dropdown + logo upload without using the builder
- **Checkout** — cart, guide pricing (~$45 digitizing + ~$15 embroidery/garment)
- **Auto-digitize preview** — saves original artwork + reduced-colour embroidery preview for production

## Run locally (full features)

```bash
npm install
npm start
```

Open http://localhost:8765

- Shop: `/shop.html`
- Design Studio: `/designer.html`
- Checkout: `/checkout.html`

## Refresh product catalogue

```bash
npm run scrape
```

Pulls live products from Headwear + curated items from supplier catalogues.

## Deploy full site (uploads API)

GitHub Pages serves static files only. For artwork upload and auto-digitizing, deploy to [Render](https://render.com):

1. Connect this GitHub repo
2. New **Web Service**, build: `npm install`, start: `npm start`
3. Set `PORT` (Render sets automatically)

Or use the included `render.yaml` blueprint.

## Contact (business)

- **Computerised Embroidery** — 2B 11/13 Olympic Circuit, Southport 4215 QLD
- Phone: 07 5591 3383
- Email: compemb@onthenet.com.au