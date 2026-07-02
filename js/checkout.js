import { getCart, removeFromCart, updateQty, clearCart, formatOrderEmail, submitOrderToServer, updateCartBadge } from './cart.js';
import { PRICING } from './pricing.js';

let siteConfig = { checkout: {} };

async function init() {
  try {
    const res = await fetch('data/site-config.json');
    siteConfig = await res.json();
  } catch (_) {}
  renderCart();
  setupForm();
  setupCheckoutMode();
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

function setupCheckoutMode() {
  const cfg = siteConfig.checkout || {};
  const note = document.getElementById('paymentModeNote');
  if (note && cfg.paymentNote) note.textContent = cfg.paymentNote;

  const payOption = document.querySelector('input[name="checkoutMode"][value="pay"]');
  if (!cfg.stripePaymentLink && payOption) {
    payOption.closest('.checkout-mode__option').querySelector('span').innerHTML =
      '<strong>Pay deposit online</strong> — call <a href="tel:0755913383">07 5591 3383</a> to pay by card, or we\'ll send a payment link with your quote.';
  }

  document.querySelectorAll('input[name="checkoutMode"]').forEach(r => {
    r.addEventListener('change', syncCheckoutModeUI);
  });
  syncCheckoutModeUI();
}

function syncCheckoutModeUI() {
  const mode = document.querySelector('input[name="checkoutMode"]:checked')?.value || 'quote';
  const btn = document.getElementById('checkoutSubmit');
  const note = document.getElementById('checkoutNote');
  const cfg = siteConfig.checkout || {};

  if (mode === 'pay') {
    btn.textContent = cfg.stripePaymentLink ? 'Place Order & Pay Deposit' : 'Place Order & Request Payment Link';
    note.textContent = cfg.stripePaymentLink
      ? 'Your order will be saved, then you\'ll be taken to secure card checkout for the deposit.'
      : 'Your order will be saved and we\'ll email you a secure payment link for the deposit.';
  } else {
    btn.textContent = 'Place Order & Request Quote';
    note.textContent = 'By placing this order you request a quote. We\'ll confirm garment availability, embroidery pricing and delivery timeframe before any work begins.';
  }
}

function setupForm() {
  document.getElementById('checkoutForm').addEventListener('submit', async e => {
    e.preventDefault();
    const cart = getCart();
    if (!cart.length) return;

    const fd = new FormData(e.target);
    const mode = fd.get('checkoutMode') || 'quote';
    const customer = {
      name: fd.get('name'),
      email: fd.get('email'),
      phone: fd.get('phone'),
      company: fd.get('company'),
      address: fd.get('address'),
      notes: fd.get('notes'),
      artworkFile: fd.get('extraArtwork')?.name || null,
      checkoutMode: mode,
    };

    await submitOrderToServer(cart, customer);

    const body = formatOrderEmail(cart, customer) +
      `\nCheckout preference: ${mode === 'pay' ? 'Pay deposit online' : 'Request quote'}\n`;
    const subject = encodeURIComponent(`Order from ${customer.name} — ${cart.reduce((s, i) => s + i.qty, 0)} items`);
    window.location.href = `mailto:compemb@onthenet.com.au?subject=${subject}&body=${encodeURIComponent(body)}`;

    const cfg = siteConfig.checkout || {};
    if (mode === 'pay' && cfg.stripePaymentLink) {
      setTimeout(() => { window.open(cfg.stripePaymentLink, '_blank'); }, 600);
    }

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