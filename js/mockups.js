/** Blank garment mockups for the design studio (no pre-embroidered catalog photos). */

let mockupData = null;

export async function loadMockupCatalog() {
  if (mockupData) return mockupData;
  try {
    const res = await fetch('data/mockups.json');
    mockupData = await res.json();
  } catch (_) {
    mockupData = { defaults: {}, products: {} };
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

export async function resolveBlankMockup(product, colourHex = '#1e293b') {
  const catalog = await loadMockupCatalog();
  const products = catalog.products;
  const productEntry = Array.isArray(products)
    ? products.find(p => p.productId === product?.id)
    : products?.[product?.id];

  // Prefer scraped blank/black photo for this exact product style
  if (productEntry?.blankImage) {
    return { src: productEntry.blankImage, kind: 'photo', tint: colourHex };
  }

  const type = getMockupType(product);
  const defaults = catalog.defaults || {};
  const sub = product?.subcategory;
  const svg =
    defaults[sub] ||
    defaults[product?.category] ||
    defaults[type] ||
    `assets/mockups/${type === 'cap' ? 'cap' : type === 'beanie' ? 'beanie' : type === 'bucket' ? 'bucket' : type === 'hoodie' ? 'hoodie' : 'tee'}-front.svg`;

  return { src: svg, kind: 'svg', tint: colourHex };
}

/** Recolour an SVG mockup string to match garment colour */
export function tintSvg(svgText, hex) {
  const base = hex.replace('#', '');
  const r = parseInt(base.slice(0, 2), 16);
  const g = parseInt(base.slice(2, 4), 16);
  const b = parseInt(base.slice(4, 6), 16);
  const dark = `rgb(${Math.round(r * 0.55)},${Math.round(g * 0.55)},${Math.round(b * 0.55)})`;
  const mid = `rgb(${Math.round(r * 0.75)},${Math.round(g * 0.75)},${Math.round(b * 0.75)})`;
  const light = `rgb(${Math.min(255, Math.round(r * 0.95))},${Math.min(255, Math.round(g * 0.95))},${Math.min(255, Math.round(b * 0.95))})`;
  return svgText
    .replace(/#1a1a1a/gi, dark)
    .replace(/#1f1f1f/gi, dark)
    .replace(/#2a2a2a/gi, mid)
    .replace(/#333333|#333/gi, light)
    .replace(/#3a3a3a/gi, light);
}

export async function loadTintedMockupImage(mockupInfo) {
  if (mockupInfo.kind === 'photo') {
    return { img: await loadImg(mockupInfo.src), tint: mockupInfo.tint, kind: 'photo' };
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

function loadImg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Mockup load failed'));
    img.src = src;
  });
}