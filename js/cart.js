import { formatPricingSummary } from './pricing.js';

const CART_KEY = 'ce-cart';

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  updateCartBadge();
}

function makeKey(item) {
  const art = item.artwork?.id || item.artwork?.fileName || '';
  return `${item.productId}|${item.size}|${item.colour}|${item.embroidery}|${art}`;
}

export function addToCart(item) {
  const cart = getCart();
  const key = makeKey(item);
  const existing = cart.find(i => i.key === key);
  if (existing) {
    existing.qty += item.qty;
    if (item.designed) Object.assign(existing, item);
  } else {
    cart.push({ ...item, key });
  }
  saveCart(cart);
  return cart;
}

export function removeFromCart(key) {
  const cart = getCart().filter(i => i.key !== key);
  saveCart(cart);
  return cart;
}

export function updateQty(key, qty) {
  const cart = getCart();
  const item = cart.find(i => i.key === key);
  if (item) {
    item.qty = Math.max(1, qty);
    saveCart(cart);
  }
  return cart;
}

export function clearCart() {
  saveCart([]);
}

export function cartCount() {
  return getCart().reduce((sum, i) => sum + i.qty, 0);
}

export function updateCartBadge() {
  const count = cartCount();
  document.querySelectorAll('[data-cart-count]').forEach(el => {
    el.textContent = count;
    el.hidden = count === 0;
  });
}

function absUrl(path) {
  if (!path) return '';
  if (/^https?:/i.test(path)) return path;
  const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost:8765';
  return `${origin}${path.startsWith('/') ? path : `/${path}`}`;
}

export function formatOrderEmail(cart, customer) {
  const hub = typeof location !== 'undefined' ? `${location.origin}/admin.html` : '';
  const lines = [
    'NEW ORDER — Computerised Embroidery',
    '',
    '--- CUSTOMER ---',
    `Name: ${customer.name}`,
    `Email: ${customer.email}`,
    `Phone: ${customer.phone || 'N/A'}`,
    `Company: ${customer.company || 'N/A'}`,
    `Address: ${customer.address || 'N/A'}`,
    '',
    '--- ITEMS ---',
  ];

  cart.forEach((item, i) => {
    lines.push(
      `${i + 1}. ${item.name} (${item.brand})`,
      `   Style: ${item.sku}`,
      `   Size: ${item.size} | Colour: ${item.colour} | Qty: ${item.qty}`,
      `   Embroidery: ${item.embroidery}`,
    );
    if (item.designed) lines.push('   Designed in online studio: Yes');
    if (item.artwork) {
      lines.push(`   Artwork: ${item.artwork.fileName}`);
      if (item.artwork.id) lines.push(`   Production job ID: ${item.artwork.id}`);
      if (item.artwork.originalUrl) lines.push(`   Original file: ${absUrl(item.artwork.originalUrl)}`);
      if (item.artwork.previewUrl) lines.push(`   Preview: ${absUrl(item.artwork.previewUrl)}`);
      if (item.artwork.digitizePreviewUrl) lines.push(`   Digitize preview: ${absUrl(item.artwork.digitizePreviewUrl)}`);
      if (item.garmentHex) lines.push(`   Garment HEX: ${item.garmentHex}`);
      if (item.artwork.recolor?.color) lines.push(`   Thread HEX: ${item.artwork.recolor.color}`);
    }
    if (item.pricing) {
      lines.push(`   Guide decoration: ~$${item.pricing.total} (digitize $${item.pricing.digitize} + embroidery $${item.pricing.stitch})`);
    }
    if (item.notes) lines.push(`   Notes: ${item.notes}`);
    lines.push('');
  });

  if (customer.artworkFile) lines.push('--- UPLOADED ARTWORK ---', customer.artworkFile, '');
  if (customer.checkoutMode) lines.push('--- CHECKOUT ---', `Mode: ${customer.checkoutMode}`, '');
  lines.push('--- ORDER NOTES ---', customer.notes || 'None');
  if (hub) {
    lines.push('', '--- TEAM ---', `Orders & DST/PES/JEF files: ${hub}`, 'Sign in with production key to download machine files.');
  }
  return lines.filter(s => s !== undefined).join('\n');
}

export async function submitOrderToServer(cart, customer) {
  try {
    const res = await fetch('/api/submit-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cart, customer, emailBody: formatOrderEmail(cart, customer) }),
    });
    if (res.ok) return await res.json();
  } catch (_) {}
  return null;
}

document.addEventListener('DOMContentLoaded', updateCartBadge);