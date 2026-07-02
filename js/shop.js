import { updateCartBadge } from './cart.js';
import { getProductImage, categoryPlaceholder } from './images.js';

let products = [];
let activeCategory = 'all';
let activeBrand = 'all';
let searchQuery = '';

async function init() {
  const res = await fetch('data/products.json');
  const data = await res.json();
  products = data.products;

  renderFilters(data.categories, data.brands);
  renderProducts();
  setupSearch();
  setupNav();
  updateCartBadge();
  document.getElementById('year').textContent = new Date().getFullYear();
  document.getElementById('productCount').textContent = products.length;
}

function filtered() {
  return products.filter(p => {
    const cat = activeCategory === 'all' || p.category === activeCategory;
    const brand = activeBrand === 'all' || p.supplier === activeBrand;
    const q = !searchQuery || [
      p.name, p.sku, p.brand, p.category, p.description
    ].join(' ').toLowerCase().includes(searchQuery);
    return cat && brand && q;
  });
}

function renderFilters(categories, brands) {
  const catEl = document.getElementById('categoryFilters');
  const brandEl = document.getElementById('brandFilters');

  catEl.innerHTML = categories.map(c =>
    `<button class="filter-btn${c.id === 'all' ? ' active' : ''}" data-cat="${c.id}">${c.name}</button>`
  ).join('');

  brandEl.innerHTML = brands.map(b =>
    `<button class="filter-btn${b.id === 'all' ? ' active' : ''}" data-brand="${b.id}">${b.name}</button>`
  ).join('');

  catEl.addEventListener('click', e => {
    if (!e.target.matches('[data-cat]')) return;
    catEl.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeCategory = e.target.dataset.cat;
    renderProducts();
  });

  brandEl.addEventListener('click', e => {
    if (!e.target.matches('[data-brand]')) return;
    brandEl.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    activeBrand = e.target.dataset.brand;
    renderProducts();
  });
}

function renderProducts() {
  const list = filtered();
  const grid = document.getElementById('productGrid');
  document.getElementById('resultCount').textContent = `${list.length} product${list.length !== 1 ? 's' : ''}`;

  if (!list.length) {
    grid.innerHTML = '<p class="shop-empty">No products match your filters. Try a different category or search.</p>';
    return;
  }

  grid.innerHTML = list.map(p => {
    const img = getProductImage(p);
    const imgHtml = img
      ? `<img src="${img}" alt="${p.name}" loading="lazy" onerror="this.onerror=null;this.parentElement.innerHTML='';this.parentElement.appendChild(window.createPlaceholder('${p.name.replace(/'/g, '')}','${p.category}'))">`
      : categoryPlaceholder(p);
    return `
    <article class="product-card">
      <a href="product.html?id=${p.id}" class="product-card__img">${imgHtml}</a>
      <div class="product-card__body">
        <span class="product-card__brand">${p.brand}</span>
        <h3><a href="product.html?id=${p.id}">${p.name}</a></h3>
        <p class="product-card__sku">Style ${p.sku}</p>
        <div class="product-card__footer product-card__footer--dual">
          <a href="designer.html?id=${p.id}" class="btn btn--primary btn--sm">Design</a>
          <a href="product.html?id=${p.id}" class="btn btn--outline btn--sm">Quick add</a>
        </div>
      </div>
    </article>`;
  }).join('');
}

function setupSearch() {
  const input = document.getElementById('searchInput');
  let timer;
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      searchQuery = input.value.trim().toLowerCase();
      renderProducts();
    }, 200);
  });
}

function setupNav() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
  });
}

init();