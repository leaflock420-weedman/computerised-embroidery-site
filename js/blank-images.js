/** Per-product blank garment images from supplier catalogues (mockups.json). */

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
let catalogPromise = null;

async function loadCatalog() {
  if (catalog) return catalog;
  if (!catalogPromise) {
    catalogPromise = (async () => {
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
    })();
  }
  return catalogPromise;
}

/** Warm mockups.json so sync lookups work after first fetch. */
export function preloadBlankCatalog() {
  return loadCatalog();
}

function typeFallback(product) {
  const type = getMockupType(product);
  return TYPE_BLANKS[type] || TYPE_BLANKS.tee;
}

function resolveBlank(product, byProduct = {}) {
  if (!product) return TYPE_BLANKS.tee;
  if (product.image && !isEmbroideredCatalogImage(product.image)) {
    return product.image;
  }
  if (byProduct[product.id]) return byProduct[product.id];
  return typeFallback(product);
}

/** Best known blank for a product (catalog must be preloaded for scraped URLs). */
export function getBlankImageSync(product) {
  const byProduct = catalog?.byProduct || {};
  return resolveBlank(product, byProduct);
}

/** Prefer scraped per-product CDN URL, else product.image, else type PNG. */
export async function getBlankImage(product) {
  const cat = await loadCatalog();
  return resolveBlank(product, cat.byProduct);
}

export function isEmbroideredCatalogImage(url) {
  if (!url) return true;
  if (/assets\/mockups\/photos\//.test(url)) return false;
  return /hero|mixed|default|main|logo|embroider|sample/i.test(url)
    && !/black|blk|charcoal|_bx_|08000000/i.test(url);
}