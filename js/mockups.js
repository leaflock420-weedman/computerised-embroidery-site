/** One blank mockup per garment shape — tinted live to any catalogue colour. */

/** Canonical silhouettes (SVG). No per-product or per-colour image swapping. */
const BASE_MOCKUPS = {
  cap: 'assets/mockups/cap-front.svg',
  beanie: 'assets/mockups/beanie-front.svg',
  bucket: 'assets/mockups/bucket-front.svg',
  tee: 'assets/mockups/tee-front.svg',
  polo: 'assets/mockups/tee-front.svg',
  hoodie: 'assets/mockups/hoodie-front.svg',
};

const baseCache = new Map();

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
  baseCache.clear();
}

async function loadBaseSvg(type) {
  if (baseCache.has(type)) return baseCache.get(type);
  const src = BASE_MOCKUPS[type] || BASE_MOCKUPS.tee;
  const res = await fetch(src);
  const svgText = await res.text();
  baseCache.set(type, svgText);
  return svgText;
}

function parseHex(hex) {
  const h = (hex || '#1e293b').replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) || 0,
    parseInt(h.slice(2, 4), 16) || 0,
    parseInt(h.slice(4, 6), 16) || 0,
  ];
}

/** Map catalogue hex to SVG garment shades (dark / mid / light / highlight). */
export function tintSvg(svgText, hex) {
  const [r, g, b] = parseHex(hex);
  const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
  const darkMul = lum > 0.65 ? 0.72 : 0.48;
  const midMul = lum > 0.65 ? 0.88 : 0.76;
  const dark = `rgb(${Math.round(r * darkMul)},${Math.round(g * darkMul)},${Math.round(b * darkMul)})`;
  const mid = `rgb(${Math.round(r * midMul)},${Math.round(g * midMul)},${Math.round(b * midMul)})`;
  const light = `rgb(${Math.min(255, Math.round(r * 0.98 + 8))},${Math.min(255, Math.round(g * 0.98 + 8))},${Math.min(255, Math.round(b * 0.98 + 8))})`;
  const highlight = `rgb(${Math.min(255, r + 35)},${Math.min(255, g + 35)},${Math.min(255, b + 35)})`;
  return svgText
    .replace(/#1a1a1a/gi, dark)
    .replace(/#1f1f1f/gi, dark)
    .replace(/#2a2a2a/gi, mid)
    .replace(/#333333|#333/gi, light)
    .replace(/#3a3a3a/gi, highlight);
}

function svgTextToImage(svgText) {
  const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml' }));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Mockup render failed'));
    };
    img.src = url;
  });
}

/**
 * Load (or retint) the garment mockup for a product + catalogue colour hex.
 * Base SVG is cached per garment shape; only the tint changes when colour changes.
 */
export async function loadGarmentMockup(product, colourHex = '#1e293b') {
  const type = getMockupType(product);
  const svgText = await loadBaseSvg(type);
  const tinted = tintSvg(svgText, colourHex);
  const img = await svgTextToImage(tinted);
  return { img, kind: 'svg', type };
}

/** Fast path when only garment colour changed (same product shape). */
export async function retintGarmentMockup(product, colourHex) {
  return loadGarmentMockup(product, colourHex);
}