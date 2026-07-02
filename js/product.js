import { addToCart, updateCartBadge } from './cart.js';
import { validateArtworkFile, uploadArtwork } from './artwork.js';

let product = null;

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get('id');
  if (!id) { location.href = 'shop.html'; return; }

  const res = await fetch('data/products.json');
  const data = await res.json();
  product = data.products.find(p => p.id === id);
  if (!product) { location.href = 'shop.html'; return; }

  renderProduct();
  setupForm();
  setupNav();
  updateCartBadge();
  document.getElementById('year').textContent = new Date().getFullYear();
}

function renderProduct() {
  const p = product;
  document.title = `${p.name} | Computerised Embroidery`;
  document.getElementById('breadcrumbName').textContent = p.name;

  document.getElementById('productDetail').innerHTML = `
    <div class="product-detail__gallery">
      ${p.image
        ? `<img src="${p.image}" alt="${p.name}">`
        : `<div class="product-card__placeholder product-card__placeholder--lg">${p.brand}</div>`}
    </div>
    <div class="product-detail__info">
      <span class="product-card__brand">${p.brand}</span>
      <h1>${p.name}</h1>
      <p class="product-detail__sku">Style code: <strong>${p.sku}</strong></p>
      <p class="product-detail__desc">${p.description}</p>
      <p class="product-detail__price">Garment quoted on request <span>+ ~$45 digitizing + ~$15 embroidery/pc</span></p>

      <a href="designer.html?id=${p.id}" class="btn btn--primary btn--lg btn--full" style="margin-bottom:1rem">Open Design Studio</a>

      <form id="addForm" class="product-form">
        <p class="form-divider">Or quick add without the builder</p>
        <div class="form-row">
          <label>
            <span>Size</span>
            <select name="size" required>
              ${p.sizes.map(s => `<option value="${s}">${s}</option>`).join('')}
            </select>
          </label>
          <label>
            <span>Colour</span>
            <input type="text" name="colour" placeholder="e.g. Navy, Black" required>
          </label>
        </div>
        <div class="form-row">
          <label>
            <span>Quantity</span>
            <input type="number" name="qty" min="1" value="10" required>
          </label>
          <label>
            <span>Embroidery position</span>
            <select name="embroidery">
              <option value="Left chest">Left chest</option>
              <option value="Right chest">Right chest</option>
              <option value="Centre chest">Centre chest</option>
              <option value="Back">Back</option>
              <option value="Left sleeve">Left sleeve</option>
              <option value="Right sleeve">Right sleeve</option>
              <option value="Cap front">Cap front</option>
              <option value="No embroidery (blanks only)">Blanks only</option>
            </select>
          </label>
        </div>
        <label>
          <span>Upload logo <small>(300 DPI PNG/JPG/PDF — optional)</small></span>
          <input type="file" name="artwork" accept="image/png,image/jpeg,image/webp,.pdf,.ai,.eps">
          <span class="upload-hint" id="uploadHint"></span>
        </label>
        <label>
          <span>Notes</span>
          <textarea name="notes" rows="2" placeholder="Logo colours, deadline…"></textarea>
        </label>
        <div class="product-form__actions">
          <button type="submit" class="btn btn--primary btn--lg">Add to Order</button>
          <a href="checkout.html" class="btn btn--outline btn--lg">Checkout</a>
        </div>
      </form>
    </div>
  `;
}

function setupForm() {
  const form = document.getElementById('addForm');
  const fileInput = form.querySelector('[name="artwork"]');
  fileInput?.addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const v = await validateArtworkFile(file);
    const hint = document.getElementById('uploadHint');
    hint.textContent = v.warnings.length ? v.warnings.join(' ') : 'Artwork looks good.';
    hint.className = 'upload-hint' + (v.warnings.length ? ' upload-hint--warn' : ' upload-hint--ok');
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    let artwork = null;
    const file = fd.get('artwork');
    if (file?.size) {
      try {
        artwork = await uploadArtwork(file, { productId: product.id });
        artwork.fileName = file.name;
      } catch (err) {
        artwork = { fileName: file.name, note: err.message };
      }
    }

    addToCart({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      image: product.image,
      size: fd.get('size'),
      colour: fd.get('colour'),
      qty: parseInt(fd.get('qty'), 10),
      embroidery: fd.get('embroidery'),
      notes: fd.get('notes') || '',
      artwork,
    });

    const toast = document.getElementById('toast');
    toast.hidden = false;
    toast.textContent = `Added ${fd.get('qty')}× ${product.name} to your order`;
    setTimeout(() => { toast.hidden = true; }, 3000);
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