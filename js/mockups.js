/** Blank garment mockups for the design studio (no pre-embroidered catalog photos). */

let mockupData = null;

const COLOUR_VARIANT_KEYS = {
  Black: ['black', 'blk', '_black'],
  Navy: ['navy', '_navy'],
  White: ['white', 'natural', 'cream', 'stone'],
  Grey: ['grey', 'gray', 'charcoal', 'heather', 'marle'],
  Red: ['red', '_red'],
  'Royal Blue': ['royal', 'cobalt', 'azure'],
  Green: ['green', 'forest', 'lime', 'olive'],
  Yellow: ['yellow', 'gold', 'lemon'],
  Orange: ['orange', 'rust', 'pumpkin'],
  Maroon: ['maroon', 'burgundy', 'wine', 'claret'],
};

export async function loadMockupCatalog() {
  if (mockupData) return mockupData;
  try {
    const res = await fetch('data/mockups.json');
    mockupData = await res.json();
  } catch (_) {
    mockupData = { defaults: {}, products: [] };
  }
  return mockupData;
}

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

function getProductEntry(catalog, product) {
  const products = catalog.products;
  return Array.isArray(products)
    ? products.find(p => p.productId === product?.id)
    : products?.[product?.id];
}

/** Pick supplier photo matching garment colour name from variant URLs. */
export function findVariantForColour(productEntry, colourName) {
  if (!productEntry) return null;
  const variants = (productEntry.allVariants || []).filter(u => /1280x1280|357x476/.test(u));
  const keys = COLOUR_VARIANT_KEYS[colourName] || [colourName.toLowerCase().split(/\s+/)[0]];
  for (const key of keys) {
    const hit = variants.find(u => u.toLowerCase().includes(key));
    if (hit) return hit;
  }
  return productEntry.blankImage || variants[0] || null;
}

function parseHex(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

/** Luminance-preserving tint for photo mockups when no colour variant exists. */
export function recolorPhotoMockup(img, hex) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const [tr, tg, tb] = parseHex(hex);
  const id = ctx.getImageData(0, 0, w, h);
  const d = id.data;
  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 12) continue;
    const lum = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 255;
    const shade = 0.2 + lum * 0.85;
    d[i] = Math.min(255, Math.round(tr * shade));
    d[i + 1] = Math.min(255, Math.round(tg * shade));
    d[i + 2] = Math.min(255, Math.round(tb * shade));
  }
  ctx.putImageData(id, 0, 0);
  return canvas;
}

export async function resolveBlankMockup(product, colour = { name: 'Black', hex: '#1e293b' }) {
  const catalog = await loadMockupCatalog();
  const productEntry = getProductEntry(catalog, product);
  const colourName = colour.name || 'Black';
  const colourHex = colour.hex || '#1e293b';

  const variantUrl = findVariantForColour(productEntry, colourName);
  if (variantUrl) {
    const exactMatch = COLOUR_VARIANT_KEYS[colourName]?.some(k => variantUrl.toLowerCase().includes(k));
    return {
      src: variantUrl,
      kind: 'photo',
      tint: exactMatch ? null : colourHex,
      variantMatched: exactMatch,
    };
  }

  if (productEntry?.blankImage) {
    return { src: productEntry.blankImage, kind: 'photo', tint: colourHex, variantMatched: false };
  }

  const type = getMockupType(product);
  const defaults = catalog.defaults || {};
  const sub = product?.subcategory;
  const svg =
    defaults[sub] ||
    defaults[product?.category] ||
    defaults[type] ||
    `assets/mockups/${type === 'cap' ? 'cap' : type === 'beanie' ? 'beanie' : type === 'bucket' ? 'bucket' : type === 'hoodie' ? 'hoodie' : 'tee'}-front.svg`;

  return { src: svg, kind: 'svg', tint: colourHex, variantMatched: true };
}

export function tintSvg(svgText, hex) {
  const base = hex.replace('#', '');
  const r = parseInt(base.slice(0, 2), 16);
  const g = parseInt(base.slice(2, 4), 16);
  const b = parseInt(base.slice(4, 6), 16);
  const dark = `rgb(${Math.round(r * 0.5)},${Math.round(g * 0.5)},${Math.round(b * 0.5)})`;
  const mid = `rgb(${Math.round(r * 0.78)},${Math.round(g * 0.78)},${Math.round(b * 0.78)})`;
  const light = `rgb(${Math.min(255, Math.round(r * 0.98))},${Math.min(255, Math.round(g * 0.98))},${Math.min(255, Math.round(b * 0.98))})`;
  const highlight = `rgb(${Math.min(255, r + 30)},${Math.min(255, g + 30)},${Math.min(255, b + 30)})`;
  return svgText
    .replace(/#1a1a1a/gi, dark)
    .replace(/#1f1f1f/gi, dark)
    .replace(/#2a2a2a/gi, mid)
    .replace(/#333333|#333/gi, light)
    .replace(/#3a3a3a/gi, highlight);
}

export async function loadTintedMockupImage(mockupInfo) {
  if (mockupInfo.kind === 'photo') {
    const base = await loadImg(mockupInfo.src);
    if (mockupInfo.variantMatched || !mockupInfo.tint) {
      return { img: base, tint: null, kind: 'photo' };
    }
    const canvas = recolorPhotoMockup(base, mockupInfo.tint);
    const tinted = await canvasToImg(canvas);
    return { img: tinted, tint: null, kind: 'photo' };
  }
  const res = await fetch(mockupInfo.src);
  const svg = await res.text();
  const tinted = tintSvg(svg, mockupInfo.tint);
  const url = URL.createObjectURL(new Blob([tinted], { type: 'image/svg+xml' }));
  try {
    const img = await loadImg(url);
    return { img, tint: null, kind: 'svg' };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function canvasToImg(canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = canvas.toDataURL('image/png');
  });
}

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Mockup load failed'));
    img.src = src;
  });
}