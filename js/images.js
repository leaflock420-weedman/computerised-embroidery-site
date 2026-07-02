const SUPPLIER_IMAGES = {
  'jbs-wear': 'https://static.wixstatic.com/media/c92cd4_23bfd9f9e21b4e4aaed99f5e1a76b01f.jpg/v1/fill/w_420,h_320,al_c,q_80/c92cd4_23bfd9f9e21b4e4aaed99f5e1a76b01f.jpg',
  'biz-collection': 'https://static.wixstatic.com/media/c92cd4_c50c0a6c5001491cbf073f7a1ded83eb~mv2.jpg/v1/crop/x_215,y_341,w_300,h_200/fill/w_400,h_200,al_c,q_80/c92cd4_c50c0a6c5001491cbf073f7a1ded83eb~mv2.jpg',
  headwear: 'https://static.wixstatic.com/media/c92cd4_bd963b52e9df43ce9704bb25c72da1ad~mv2.jpg/v1/fill/w_400,h_200,al_c,q_80/c92cd4_bd963b52e9df43ce9704bb25c72da1ad~mv2.jpg',
  'as-colour': 'https://static.wixstatic.com/media/c92cd4_29d1778fc8874192b96fa7245c10179d~mv2.jpg/v1/fill/w_300,h_300,al_c,q_80/c92cd4_29d1778fc8874192b96fa7245c10179d~mv2.jpg',
  'dnc-workwear': 'https://static.wixstatic.com/media/c92cd4_b5fdcd8768b24d5c8620a648b7725f44~mv2.jpg/v1/crop/x_14,y_0,w_281,h_200,q_80/c92cd4_b5fdcd8768b24d5c8620a648b7725f44~mv2.jpg',
  'winning-spirit': 'https://static.wixstatic.com/media/c92cd4_48a9c13959284ab0a368a35451929d7c.gif',
};

const CATEGORY_EMOJI = {
  polos: '👔', 't-shirts': '👕', hoodies: '🧥', headwear: '🧢', hivis: '🦺',
  workwear: '🔧', hospitality: '👨‍🍳', healthcare: '🏥', schools: '🎓',
  jackets: '🧥', shirts: '👔', pants: '👖',
};

export function isBadImage(url) {
  if (!url) return true;
  return /loading\.svg|loading\.gif|placeholder/i.test(url);
}

export function getProductImage(product) {
  if (product?.image && !isBadImage(product.image)) return product.image;
  return SUPPLIER_IMAGES[product?.supplier] || '';
}

export function productImageHtml(product, className = '') {
  const src = getProductImage(product);
  if (src) {
    return `<img src="${src}" alt="${product.name}" class="${className}" loading="lazy" onerror="this.replaceWith(createPlaceholder(this.alt, '${product.category}'))">`;
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