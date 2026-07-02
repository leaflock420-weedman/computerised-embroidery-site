/** Real blank garment photos — tinted live via canvas colour overlay. */

const FALLBACK_SVG = {
  cap: 'assets/mockups/cap-front.svg',
  beanie: 'assets/mockups/beanie-front.svg',
  bucket: 'assets/mockups/bucket-front.svg',
  tee: 'assets/mockups/tee-front.svg',
  polo: 'assets/mockups/tee-front.svg',
  hoodie: 'assets/mockups/hoodie-front.svg',
};

const photoCache = new Map();
let basesConfig = null;

export function getMockupType(product) {
  if (!product) return 'tee';
  if (product.category === 'headwear') {
    const sub = product.subcategory || '';
    if (sub === 'beanies' || /beanie/i.test(product.name)) return 'beanie';
    if (sub === 'bucket-hats' || /bucket/i.test(product.name)) return 'bucket';
    return 'cap';
  }
  if (product.category === 'hoodies' || product.category === 'jackets') return 'hoodie';
  if (product.category === 'polos') return 'polo';
  return 'tee';
}

export function clearMockupCache() {
  photoCache.clear();
  basesConfig = null;
}

async function loadConfig() {
  if (basesConfig) return basesConfig;
  try {
    const res = await fetch('data/mockups.json');
    basesConfig = await res.json();
  } catch {
    basesConfig = { bases: {}, fallbacks: FALLBACK_SVG };
  }
  return basesConfig;
}

function parseHex(hex) {
  const h = (hex || '#1e293b').replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
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
  try {
    img = await loadImage(src);
    photoCache.set(type, { img, kind: 'photo' });
  } catch {
    img = await loadSvgFallback(type);
    photoCache.set(type, { img, kind: 'svg' });
  }
  return photoCache.get(type);
}

/**
 * Draw garment mockup with live colour overlay (multiply + screen).
 * Works on black/grey base photos — no per-colour image swap.
 */
export function drawTintedGarment(ctx, img, x, y, w, h, hex, kind = 'photo') {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.06)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.drawImage(img, x, y, w, h);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  if (kind !== 'photo') {
    ctx.restore();
    return;
  }

  const [r, g, b] = parseHex(hex);
  const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const color = `rgb(${r},${g},${b})`;

  if (lum > 0.82) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.45;
    ctx.fillRect(x, y, w, h);
  } else {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = lum < 0.2 ? 0.9 : 0.72;
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.1;
    ctx.fillRect(x, y, w, h);
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.restore();
}

/** Load base photo for product shape (cached). Tint applied at draw time. */
export async function loadGarmentMockup(product) {
  const type = getMockupType(product);
  const cached = await loadBasePhoto(type);
  return { img: cached.img, kind: cached.kind, type };
}

/** Colour changed — same cached photo, redraw only. */
export async function retintGarmentMockup(product) {
  return loadGarmentMockup(product);
}