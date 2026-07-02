const ICONS = {
  scissors: '✂',
  clock: '⏱',
  check: '✓',
  heart: '♥'
};

const TYPE_ICONS = { online: '🛒', pdf: '📄', search: '🔍' };

async function init() {
  const res = await fetch('data/catalog.json');
  const data = await res.json();

  renderValueProps(data.valueProps);
  renderServices(data.services);
  renderCatalogueIntro(data.catalogueModel);
  renderOrderFlow(data.orderSteps);
  await renderCataloguePreview(data.catalogues || []);
  renderCategories(data.categories, data.catalogues || []);
  renderSectors(data.sectors);
  renderAbout(data.about);
  renderClients(data.clients);
  await populateProductSelect();

  document.getElementById('year').textContent = new Date().getFullYear();
  setupNav();
  setupQuoteForm();
}

function renderValueProps(props) {
  document.getElementById('valueProps').innerHTML = props.map(p => `
    <div class="trust-item">
      <div class="trust-item__icon">${ICONS[p.icon] || '★'}</div>
      <h3>${p.title}</h3>
      <p>${p.description}</p>
    </div>
  `).join('');
}

function renderServices(services) {
  document.getElementById('servicesGrid').innerHTML = services.map(s => `
    <article class="service-card">
      <span class="service-card__tag">${s.id}</span>
      <h3>${s.title}</h3>
      <p>${s.description}</p>
      <ul>${s.features.map(f => `<li>${f}</li>`).join('')}</ul>
    </article>
  `).join('');
}

function renderCatalogueIntro(model) {
  const headline = document.getElementById('catalogueHeadline');
  const summary = document.getElementById('catalogueSummary');
  if (headline) headline.textContent = model.headline;
  if (summary) summary.textContent = model.summary;
}

function renderOrderFlow(steps) {
  const el = document.getElementById('orderFlow');
  if (!el) return;
  el.innerHTML = steps.map(s => `
    <div class="order-flow__step">
      <div class="order-flow__num">${s.step}</div>
      <h3>${s.title}</h3>
      <p>${s.description}</p>
    </div>
  `).join('');
}

async function renderCataloguePreview(catalogues) {
  const el = document.getElementById('cataloguePreview');
  if (!el) return;

  // Show real shop products as preview
  try {
    const res = await fetch('data/products.json');
    const { products } = await res.json();
    const preview = products.filter(p => p.image).slice(0, 6);
    if (preview.length) {
      el.innerHTML = preview.map(p => `
        <article class="catalogue-card catalogue-card--compact product-card">
          <a href="product.html?id=${p.id}" class="product-card__img">
            <img src="${p.image}" alt="${p.name}" loading="lazy">
          </a>
          <div class="catalogue-card__body">
            <span class="product-card__brand">${p.brand}</span>
            <h3><a href="product.html?id=${p.id}">${p.name}</a></h3>
            <a href="product.html?id=${p.id}" class="btn btn--primary btn--full">View &amp; Order</a>
          </div>
        </article>
      `).join('');
      return;
    }
  } catch (_) {}

  el.innerHTML = catalogues.map(c => `
    <article class="catalogue-card catalogue-card--compact">
      <div class="catalogue-card__header">
        <div class="catalogue-card__logo">
          <img src="${c.image}" alt="${c.name}" loading="lazy">
        </div>
        <span class="catalogue-card__type catalogue-card__type--${c.type}">${c.typeLabel}</span>
      </div>
      <div class="catalogue-card__body">
        <h3>${c.name}</h3>
        <ul class="catalogue-card__ranges">
          ${c.ranges.slice(0, 4).map(r => `<li>${r}</li>`).join('')}
        </ul>
        <a href="${c.catalogueUrl}" class="btn btn--primary btn--full" target="_blank" rel="noopener">Browse Catalogue</a>
      </div>
    </article>
  `).join('');
}

function renderCategories(categories, catalogues) {
  const el = document.getElementById('categoryGrid');
  el.innerHTML = categories.map(c => {
    const matches = catalogues.filter(cat => cat.categories.includes(c.filter)).map(cat => cat.name);
    const title = matches.length ? `Available in: ${matches.join(', ')}` : '';
    return `
      <a href="shop.html" class="category-card" title="${title}">
        <div class="category-card__icon">${c.icon}</div>
        <span>${c.name}</span>
      </a>
    `;
  }).join('');
}

function renderSectors(sectors) {
  document.getElementById('sectorGrid').innerHTML = sectors.map(s => `
    <a href="shop.html" class="sector-card">${s.name}</a>
  `).join('');
}

function renderAbout(about) {
  document.getElementById('aboutText').innerHTML = about.paragraphs.map(p => `<p>${p}</p>`).join('');
}

function renderClients(clients) {
  document.getElementById('clientsGrid').innerHTML = clients.map(c => `
    <div class="client-logo">
      <img src="${c.image}" alt="${c.name}" loading="lazy">
    </div>
  `).join('');
}

let quoteProducts = [];

async function populateProductSelect() {
  const select = document.getElementById('productSelect');
  if (!select) return;
  try {
    const res = await fetch('data/products.json');
    const data = await res.json();
    quoteProducts = data.products;
    const groups = {};
    quoteProducts.forEach(p => { (groups[p.category] ||= []).push(p); });
    select.innerHTML = '<option value="">Select a garment…</option>' +
      Object.entries(groups).map(([cat, items]) =>
        `<optgroup label="${cat}">${items.map(p =>
          `<option value="${p.id}">${p.brand} — ${p.name} (${p.sku})</option>`
        ).join('')}</optgroup>`
      ).join('');

    select.addEventListener('change', () => {
      const p = quoteProducts.find(x => x.id === select.value);
      const sizeSel = document.getElementById('sizeSelect');
      if (!p || !sizeSel) return;
      sizeSel.innerHTML = p.sizes.map(s => `<option value="${s}">${s}</option>`).join('') +
        '<option value="Mixed sizes">Mixed sizes</option>';
    });
  } catch (_) {}

  const artworkInput = document.getElementById('quoteArtwork');
  artworkInput?.addEventListener('change', async e => {
    const file = e.target.files[0];
    const hint = document.getElementById('quoteUploadHint');
    if (!file || !hint) return;
    try {
      const { validateArtworkFile } = await import('./js/artwork.js');
      const v = await validateArtworkFile(file);
      hint.textContent = v.warnings.length ? v.warnings.join(' ') : 'Artwork looks good — 300 DPI recommended.';
      hint.className = 'upload-hint' + (v.warnings.length ? ' upload-hint--warn' : ' upload-hint--ok');
    } catch (_) {
      hint.textContent = 'File selected.';
    }
  });
}

function setupNav() {
  const toggle = document.getElementById('menuToggle');
  const nav = document.getElementById('nav');
  if (!toggle || !nav) return;

  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', open);
  });

  nav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.classList.remove('open');
      toggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function setupQuoteForm() {
  const form = document.getElementById('quoteForm');
  const success = document.getElementById('formSuccess');
  if (!form) return;

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const fd = new FormData(form);
    const product = quoteProducts.find(p => p.id === fd.get('product'));
    let artworkLines = ['Artwork: Not uploaded'];
    const file = fd.get('artwork');
    if (file?.size) {
      try {
        const { uploadArtwork } = await import('./js/artwork.js');
        const up = await uploadArtwork(file, { source: 'quick-quote' });
        artworkLines = [
          `Artwork: ${file.name}`,
          up.originalUrl ? `Original: ${location.origin}${up.originalUrl}` : '',
          up.previewUrl ? `Preview: ${location.origin}${up.previewUrl}` : '',
          up.digitizePreviewUrl ? `Digitize preview: ${location.origin}${up.digitizePreviewUrl}` : '',
        ].filter(Boolean);
      } catch (err) {
        artworkLines = [`Artwork: ${file.name} (upload pending — ${err.message})`];
      }
    }

    const body = [
      'QUICK QUOTE REQUEST',
      '',
      `Name: ${fd.get('name')}`,
      `Email: ${fd.get('email')}`,
      `Phone: ${fd.get('phone') || 'N/A'}`,
      `Quantity: ${fd.get('quantity') || 'N/A'}`,
      '',
      '--- PRODUCT ---',
      product ? `${product.brand} — ${product.name} (Style ${product.sku})` : fd.get('product'),
      `Size: ${fd.get('size')}`,
      `Colour: ${fd.get('colour') || 'TBC'}`,
      `Embroidery: ${fd.get('embroidery')}`,
      '',
      '--- ARTWORK ---',
      ...artworkLines,
      '',
      '--- PRICING GUIDE ---',
      '~$45 one-off digitizing + ~$15 per garment embroidery',
      '',
      '--- NOTES ---',
      fd.get('message') || 'None',
    ].join('\n');

    window.location.href = `mailto:compemb@onthenet.com.au?subject=${encodeURIComponent('Quote Request')}&body=${encodeURIComponent(body)}`;
    form.reset();
    success.hidden = false;
    setTimeout(() => { success.hidden = true; }, 5000);
  });
}

init();