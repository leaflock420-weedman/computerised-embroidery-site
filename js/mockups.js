/** Real blank garment photos — tinted per-pixel (transparent backgrounds). */

const FALLBACK_SVG = {
  cap: 'assets/mockups/cap-front.svg',
  beanie: 'assets/mockups/beanie-front.svg',
  bucket: 'assets/mockups/bucket-front.svg',
  tee: 'assets/mockups/tee-front.svg',
  polo: 'assets/mockups/tee-front.svg',
  hoodie: 'assets/mockups/hoodie-front.svg',
};

const photoCache = new Map();
const tintCache = new Map();
let basesConfig = null;
let productBlanks = null;

export function getMockupType(product) {
  if (!product) return 'tee';
  const name = (product.name || '').toLowerCase();
  if (product.category === 'headwear') {
    const sub = product.subcategory || '';
    if (sub === 'beanies' || /beanie|toque|pom[\s-]?pom/i.test(name)) return 'beanie';
    if (sub === 'bucket-hats' || /bucket|safari/i.test(name)) return 'bucket';
    return 'cap';
  }
  if (product.category === 'hoodies' || product.category === 'jackets') return 'hoodie';
  if (product.category === 'polos') return 'polo';
  return 'tee';
}

export function clearMockupCache() {
  photoCache.clear();
  tintCache.clear();
  basesConfig = null;
  productBlanks = null;
}

async function loadConfig() {
  if (basesConfig) return basesConfig;
  try {
    const res = await fetch('data/mockups.json');
    basesConfig = await res.json();
    productBlanks = Object.fromEntries(
      (basesConfig.products || [])
        .filter(p => p.blankImage && !p.error)
        .map(p => [p.productId, p.blankImage]),
    );
  } catch {
    basesConfig = { bases: {}, fallbacks: FALLBACK_SVG, products: [] };
    productBlanks = {};
  }
  return basesConfig;
}

function proxyImageUrl(src) {
  if (!src || src.startsWith('/') || src.startsWith(location.origin)) return src;
  return `/api/proxy-image?url=${encodeURIComponent(src)}`;
}

function parseHex(hex) {
  const h = (hex || '#1e293b').replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

function loadImage(src, crossOrigin = false) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

async function loadSvgFallback(type) {
  const config = await loadConfig();
  const src = config.fallbacks?.[type] || FALLBACK_SVG[type] || FALLBACK_SVG.tee;
  const res = await fetch(src);
  const svgText = await res.text();
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  try {
    return await loadImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function loadBasePhoto(type) {
  if (photoCache.has(type)) return photoCache.get(type);
  const config = await loadConfig();
  const src = config.bases?.[type] || config.bases?.tee;
  let img;
  let kind = 'photo';
  try {
    img = await loadImage(src);
  } catch {
    img = await loadSvgFallback(type);
    kind = 'svg';
  }
  photoCache.set(type, { img, kind, type });
  return photoCache.get(type);
}

function sampleBackgroundRgb(d, w, h) {
  const pts = [
    [1, 1], [w - 2, 1], [1, h - 2], [w - 2, h - 2],
    [w >> 1, 1], [1, h >> 1], [w - 2, h >> 1], [w >> 1, h - 2],
  ];
  let r = 0;
  let g = 0;
  let b = 0;
  for (const [x, y] of pts) {
    const i = (y * w + x) * 4;
    r += d[i];
    g += d[i + 1];
    b += d[i + 2];
  }
  const n = pts.length;
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)];
}

function isPhotoBackground(r, g, b, a, bg) {
  if (a < 10) return true;
  const lum = r * 0.299 + g * 0.587 + b * 0.114;
  if (lum > 238) return true;
  const dr = r - bg[0];
  const dg = g - bg[1];
  const db = b - bg[2];
  if (Math.hypot(dr, dg, db) < 42 && lum > 185) return true;
  return false;
}

/** Recolour garment pixels; strip supplier photo backgrounds first. */
export function buildTintedMockupCanvas(img, hex, w, h, kind = 'photo') {
  const key = `${img.src}|${hex}|${w}|${h}|${kind}`;
  if (tintCache.has(key)) return tintCache.get(key);

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(w));
  canvas.height = Math.max(1, Math.ceil(h));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  if (kind === 'photo') {
    const [tr, tg, tb] = parseHex(hex);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imageData.data;
    const cw = canvas.width;
    const ch = canvas.height;
    const bg = sampleBackgroundRgb(d, cw, ch);
    let minLum = 1;
    let maxLum = 0;

    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y * cw + x) * 4;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const a = d[i + 3];
        if (isPhotoBackground(r, g, b, a, bg)) {
          d[i + 3] = 0;
          continue;
        }
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        minLum = Math.min(minLum, lum);
        maxLum = Math.max(maxLum, lum);
      }
    }

    const range = Math.max(maxLum - minLum, 0.08);
    for (let y = 0; y < ch; y++) {
      for (let x = 0; x < cw; x++) {
        const i = (y * cw + x) * 4;
        if (d[i + 3] < 10) continue;
        const r = d[i];
        const g = d[i + 1];
        const b = d[i + 2];
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const t = Math.min(1, Math.max(0, (lum - minLum) / range));
        const shade = 0.38 + t * 0.62;
        d[i] = Math.round(tr * shade);
        d[i + 1] = Math.round(tg * shade);
        d[i + 2] = Math.round(tb * shade);
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  tintCache.set(key, canvas);
  return canvas;
}

export function drawTintedGarment(ctx, img, x, y, w, h, hex, kind = 'photo') {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.08)';
  ctx.shadowBlur = 14;
  ctx.shadowOffsetY = 4;
  const tinted = buildTintedMockupCanvas(img, hex, w, h, kind);
  ctx.drawImage(tinted, x, y);
  ctx.restore();
}

async function loadProductPhoto(product) {
  const config = await loadConfig();
  const type = getMockupType(product);
  const cacheKey = product?.id || type;
  if (photoCache.has(cacheKey)) return photoCache.get(cacheKey);

  const blank =
    productBlanks?.[product?.id]
    || (product?.image && !/wixstatic\.com/i.test(product.image) ? product.image : null);

  if (blank) {
    const proxied = proxyImageUrl(blank);
    try {
      const img = await loadImage(proxied, true);
      const entry = { img, kind: 'photo', type, productId: product?.id };
      photoCache.set(cacheKey, entry);
      return entry;
    } catch {
      try {
        const img = await loadImage(blank);
        const entry = { img, kind: 'photo', type, productId: product?.id };
        photoCache.set(cacheKey, entry);
        return entry;
      } catch { /* fall through to type base */ }
    }
  }

  const cached = await loadBasePhoto(type);
  photoCache.set(cacheKey, cached);
  return cached;
}

export async function loadGarmentMockup(product) {
  return loadProductPhoto(product);
}

export async function retintGarmentMockup(product) {
  return loadGarmentMockup(product);
}