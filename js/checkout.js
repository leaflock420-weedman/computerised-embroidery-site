import { getCart, removeFromCart, updateQty, clearCart, formatOrderEmail, submitOrderToServer, updateCartBadge } from './cart.js';
import { PRICING } from './pricing.js';

function init() {
  renderCart();
  setupForm();
  setupNav();
  updateCartBadge();
  document.getElementById('year').textContent = new Date().getFullYear();
}

function renderCart() {
  const cart = getCart();
  const el = document.getElementById('cartItems');
  const empty = document.getElementById('cartEmpty');
  const form = document.getElementById('checkoutForm');
  const summary = document.getElementById('orderSummary');

  if (!cart.length) {
    el.innerHTML = '';
    empty.hidden = false;
    form.hidden = true;
    summary.hidden = true;
    return;
  }

  empty.hidden = true;
  form.hidden = false;
  summary.hidden = false;

  let decorTotal = 0;
  el.innerHTML = cart.map(item => {
    if (item.pricing) decorTotal += item.pricing.total;
    return `
    <div class="cart-item" data-key="${item.key}">
      <div class="cart-item__img">
        ${item.artwork?.previewUrl
          ? `<img src="${item.artwork.previewUrl}" alt="">`
          : item.image ? `<img src="${item.image}" alt="">` : '<div class="cart-item__placeholder">✦</div>'}
      </div>
      <div class="cart-item__info">
        <strong>${item.name}</strong>
        <span>${item.brand} · Style ${item.sku}</span>
        <span>${item.size} · ${item.colour} · ${item.embroidery}</span>
        ${item.designed ? '<span class="cart-item__designed">✦ Designed in studio</span>' : ''}
        ${item.artwork ? `<span>Artwork: ${item.artwork.fileName}</span>` : ''}
        ${item.pricing ? `<span>Guide decoration: ~$${item.pricing.total}</span>` : ''}
        ${item.notes ? `<span class="cart-item__notes">${item.notes}</span>` : ''}
      </div>
      <div class="cart-item__qty">
        <button type="button" class="qty-btn" data-action="minus" data-key="${item.key}">−</button>
        <span>${item.qty}</span>
        <button type="button" class="qty-btn" data-action="plus" data-key="${item.key}">+</button>
      </div>
      <button type="button" class="cart-item__remove" data-key="${item.key}" aria-label="Remove">✕</button>
    </div>`;
  }).join('');

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  document.getElementById('summaryQty').textContent = totalQty;
  document.getElementById('summaryItems').textContent = cart.length;
  document.getElementById('summaryDecor').textContent = decorTotal ? `~$${decorTotal}` : `~$${PRICING.digitizing.amount} + $${PRICING.embroidery.amount}/pc`;

  el.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = getCart().find(i => i.key === btn.dataset.key);
      if (!item) return;
      const delta = btn.dataset.action === 'plus' ? 1 : -1;
      if (item.qty + delta < 1) removeFromCart(item.key);
      else updateQty(item.key, item.qty + delta);
      renderCart();
      updateCartBadge();
    });
  });

  el.querySelectorAll('.cart-item__remove').forEach(btn => {
    btn.addEventListener('click', () => {
      removeFromCart(btn.dataset.key);
      renderCart();
      updateCartBadge();
    });
  });
}

function setupForm() {
  document.getElementById('checkoutForm').addEventListener('submit', async e => {
    e.preventDefault();
    const cart = getCart();
    if (!cart.length) return;

    const fd = new FormData(e.target);
    const customer = {
      name: fd.get('name'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      company: fd.get('company'),
      address: fd.get('address'),
      notes: fd.get('notes'),
      artworkFile: fd.get('extraArtwork')?.name || null,
    };

    await submitOrderToServer(cart, customer);

    const body = formatOrderEmail(cart, customer);
    const subject = encodeURIComponent(`Order from ${customer.name} — ${cart.reduce((s,i)=>s+i.qty,0)} items`);
    window.location.href = `mailto:compemb@onthenet.com.au?subject=${subject}&body=${encodeURIComponent(body)}`;

    document.getElementById('checkoutForm').hidden = true;
    document.getElementById('cartItems').hidden = true;
    document.getElementById('orderSummary').hidden = true;
    document.getElementById('orderSuccess').hidden = false;
    clearCart();
    updateCartBadge();
  });
}

function setupNav() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');
  if (!toggle) return;
  toggle.addEventListener('click', () => {
    nav.classList.toggle('open');
    toggle.classList.toggle('open');
  });
}

init();