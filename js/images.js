import { getBlankImage, getBlankImageSync, preloadBlankCatalog } from './blank-images.js';

const CATEGORY_EMOJI = {
  polos: '👔', 't-shirts': '👕', hoodies: '🧥', headwear: '🧢', hivis: '🦺',
  workwear: '🔧', hospitality: '👨‍🍳', healthcare: '🏥', schools: '🎓',
  jackets: '🧥', shirts: '👔', pants: '👖',
};

/** Load mockups.json before shop/designer render. */
export const blankCatalogReady = preloadBlankCatalog();

export function isBadImage(url) {
  if (!url) return true;
  return /loading\.svg|loading\.gif|placeholder/i.test(url);
}

/** Specific supplier blank — never generic type photo when a product match exists. */
export function getProductImage(product) {
  if (!product) return '';
  return getBlankImageSync(product);
}

export async function getProductImageAsync(product) {
  if (!product) return '';
  return getBlankImage(product);
}

export function productImageHtml(product, className = '') {
  const src = getProductImage(product);
  if (src) {
    return `<img src="${src}" alt="${product.name} (blank)" class="${className}" loading="lazy" onerror="this.replaceWith(createPlaceholder(this.alt, '${product.category}'))">`;
  }
  return categoryPlaceholder(product);
}

export function categoryPlaceholder(product) {
  const emoji = CATEGORY_EMOJI[product?.category] || '✦';
  return `<div class="product-card__placeholder ${product?.category || ''}">${emoji}<span>${product?.brand || ''}</span></div>`;
}

window.createPlaceholder = (name, category) => {
  const div = document.createElement('div');
  div.className = 'product-card__placeholder';
  div.innerHTML = `${CATEGORY_EMOJI[category] || '✦'}<span>${name || ''}</span>`;
  return div;
};