/** Blank garment images — same rules as Design Studio (no pre-embroidered catalog photos). */

import { getMockupType } from './mockups.js';

const TYPE_BLANKS = {
  cap: 'assets/mockups/photos/cap-black.png',
  beanie: 'assets/mockups/photos/beanie-black.png',
  bucket: 'assets/mockups/photos/bucket-black.png',
  tee: 'assets/mockups/photos/tee-black.png',
  polo: 'assets/mockups/photos/tee-black.png',
  hoodie: 'assets/mockups/photos/hoodie-black.png',
};

let catalog = null;

async function loadCatalog() {
  if (catalog) return catalog;
  try {
    const res = await fetch('data/mockups.json');
    const data = await res.json();
    catalog = {
      byProduct: Object.fromEntries(
        (data.products || [])
          .filter(p => p.blankImage && !p.error)
          .map(p => [p.productId, p.blankImage]),
      ),
      bases: data.bases || TYPE_BLANKS,
    };
  } catch {
    catalog = { byProduct: {}, bases: TYPE_BLANKS };
  }
  return catalog;
}

/** Local transparent blank for a product (matches designer mockup type). */
export function getBlankImageSync(product) {
  const type = getMockupType(product);
  return TYPE_BLANKS[type] || TYPE_BLANKS.tee;
}

/** Prefer scraped black variant CDN URL for headwear, else local blank PNG. */
export async function getBlankImage(product) {
  const cat = await loadCatalog();
  const type = getMockupType(product);
  if (product?.supplier === 'headwear' && cat.byProduct[product.id]) {
    return cat.byProduct[product.id];
  }
  return cat.bases[type] || TYPE_BLANKS[type] || TYPE_BLANKS.tee;
}

export function isEmbroideredCatalogImage(url) {
  if (!url) return true;
  return /hero|mixed|default|main|logo|embroider|sample/i.test(url)
    && !/black|blk|charcoal/i.test(url);
}