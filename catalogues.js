let catalogues = [];
let activeType = 'all';
let activeCat = 'all';

async function init() {
  const res = await fetch('data/catalog.json');
  const data = await res.json();
  catalogues = data.catalogues;

  document.getElementById('catalogueHeadline').textContent = data.catalogueModel.headline;
  document.getElementById('catalogueSummary').textContent = data.catalogueModel.summary;
  document.getElementById('catalogueNote').textContent = data.catalogueModel.note;

  renderOrderFlow(data.orderSteps);
  renderCatalogues();
  renderMoreSuppliers(data.moreSuppliers);

  document.getElementById('year').textContent = new Date().getFullYear();
  setupNav();
  setupFilters();
}

function renderOrderFlow(steps) {
  document.getElementById('orderFlow').innerHTML = steps.map(s => `
    <div class="order-flow__step">
      <div class="order-flow__num">${s.step}</div>
      <h3>${s.title}</h3>
      <p>${s.description}</p>
    </div>
  `).join('');
}

function renderCatalogues() {
  const el = document.getElementById('catalogueList');
  const filtered = catalogues.filter(c => {
    const typeMatch = activeType === 'all' || c.type === activeType;
    const catMatch = activeCat === 'all' || c.categories.includes(activeCat);
    return typeMatch && catMatch;
  });

  if (!filtered.length) {
    el.innerHTML = '<p class="catalogue-empty">No catalogues match this filter. Try another category.</p>';
    return;
  }

  el.innerHTML = filtered.map(c => `
    <article class="catalogue-card" data-type="${c.type}">
      <div class="catalogue-card__header">
        <div class="catalogue-card__logo">
          <img src="${c.image}" alt="${c.name} logo" loading="lazy">
        </div>
        <span class="catalogue-card__type catalogue-card__type--${c.type}">${c.typeLabel}</span>
      </div>
      <div class="catalogue-card__body">
        <h3>${c.name}</h3>
        <p class="catalogue-card__desc">${c.description}</p>
        <div class="catalogue-card__ranges-wrap">
          <strong>Available ranges:</strong>
          <ul class="catalogue-card__ranges">
            ${c.ranges.map(r => `<li>${r}</li>`).join('')}
          </ul>
        </div>
        <div class="catalogue-card__actions">
          <a href="${c.catalogueUrl}" class="btn btn--primary" target="_blank" rel="noopener">
            ${c.type === 'pdf' ? 'Open PDF Catalogue' : 'Browse Catalogue'}
          </a>
          <a href="index.html#quote" class="btn btn--outline" data-brand="${c.name}">Order This Brand</a>
        </div>
        ${c.type === 'pdf' ? '<p class="catalogue-card__tip">Tip: Note the style name and page number, then send us a quote.</p>' : '<p class="catalogue-card__tip">Tip: Copy the style code or product name, then send us a quote.</p>'}
      </div>
    </article>
  `).join('');

  el.querySelectorAll('[data-brand]').forEach(btn => {
    btn.addEventListener('click', () => {
      sessionStorage.setItem('quoteBrand', btn.dataset.brand);
    });
  });
}

function renderMoreSuppliers(suppliers) {
  document.getElementById('moreSuppliers').innerHTML = suppliers.map(s => `
    <a href="${s.catalogueUrl}" class="more-supplier" target="_blank" rel="noopener">
      <img src="${s.image}" alt="${s.name}" loading="lazy">
      <span>${s.name}</span>
    </a>
  `).join('');
}

function setupFilters() {
  document.querySelectorAll('#typeFilters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#typeFilters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeType = btn.dataset.filter;
      renderCatalogues();
    });
  });

  document.querySelectorAll('#categoryFilters .filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#categoryFilters .filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeCat = btn.dataset.cat;
      renderCatalogues();
    });
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

init();