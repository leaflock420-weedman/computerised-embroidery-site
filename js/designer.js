import { addToCart, updateCartBadge } from './cart.js';
import { validateArtworkFile, uploadArtwork } from './artwork.js';
import { estimateOrderTotal, PRICING } from './pricing.js';

const VIEWS = {
  default: ['Front', 'Back', 'Left', 'Right'],
  headwear: ['Front', 'Left', 'Right', 'Back'],
  cap: ['Front', 'Side left', 'Side right'],
};

const MOCKUP = {
  't-shirts': { color: '#f1f5f9', type: 'tee' },
  polos: { color: '#e2e8f0', type: 'tee' },
  hoodies: { color: '#cbd5e1', type: 'hoodie' },
  headwear: { color: '#1e293b', type: 'cap' },
  hivis: { color: '#facc15', type: 'tee' },
  workwear: { color: '#94a3b8', type: 'tee' },
  hospitality: { color: '#f8fafc', type: 'tee' },
  healthcare: { color: '#e0f2fe', type: 'tee' },
  schools: { color: '#dbeafe', type: 'tee' },
  jackets: { color: '#475569', type: 'hoodie' },
  shirts: { color: '#f8fafc', type: 'tee' },
  pants: { color: '#64748b', type: 'tee' },
};

let products = [];
let product = null;
let currentView = 'Front';
let designs = {};
let artwork = null;
let artworkImg = null;
let transform = { x: 250, y: 280, scale: 0.5, rotation: 0 };
let zoom = 1;
let dragging = false;
let dragStart = { x: 0, y: 0 };
const canvas = document.getElementById('designCanvas');
const ctx = canvas.getContext('2d');

async function init() {
  const res = await fetch('data/products.json');
  const data = await res.json();
  products = data.products;

  const params = new URLSearchParams(location.search);
  const id = params.get('id') || products[0]?.id;
  product = products.find(p => p.id === id) || products[0];

  populateProductSelect();
  populateSizes();
  renderViewTabs();
  updatePricing();
  draw();
  bindEvents();
  updateCartBadge();
}

function populateProductSelect() {
  const sel = document.getElementById('productSelect');
  const groups = {};
  products.forEach(p => {
    (groups[p.category] ||= []).push(p);
  });
  sel.innerHTML = Object.entries(groups).map(([cat, items]) =>
    `<optgroup label="${cat}">${items.map(p =>
      `<option value="${p.id}" ${p.id === product.id ? 'selected' : ''}>${p.brand} — ${p.name}</option>`
    ).join('')}</optgroup>`
  ).join('');
}

function populateSizes() {
  const sel = document.getElementById('sizeSelect');
  sel.innerHTML = product.sizes.map(s => `<option value="${s}">${s}</option>`).join('');
}

function getViews() {
  if (product.category === 'headwear') {
    return product.subcategory === 'caps' || product.name.toLowerCase().includes('cap')
      ? VIEWS.cap : VIEWS.headwear;
  }
  return VIEWS.default;
}

function renderViewTabs() {
  const tabs = document.getElementById('viewTabs');
  const views = getViews();
  if (!views.includes(currentView)) currentView = views[0];
  tabs.innerHTML = views.map(v =>
    `<button type="button" class="view-tab${v === currentView ? ' active' : ''}${designs[v] ? ' has-design' : ''}" data-view="${v}">${v}</button>`
  ).join('');
  tabs.querySelectorAll('.view-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      saveCurrentDesign();
      currentView = btn.dataset.view;
      loadViewDesign();
      renderViewTabs();
      draw();
    });
  });
}

function saveCurrentDesign() {
  if (!artworkImg) return;
  designs[currentView] = {
    transform: { ...transform },
    artworkId: artwork?.id,
    previewUrl: artwork?.previewUrl,
    originalUrl: artwork?.originalUrl,
    fileName: artwork?.fileName,
  };
}

function loadViewDesign() {
  const d = designs[currentView];
  if (d) {
    transform = { ...d.transform };
    document.getElementById('removeDesign').hidden = false;
    document.getElementById('canvasHint').hidden = true;
  } else if (artworkImg) {
    transform = { x: 250, y: 280, scale: 0.5, rotation: 0 };
    document.getElementById('removeDesign').hidden = false;
    document.getElementById('canvasHint').hidden = true;
  } else {
    transform = { x: 250, y: 280, scale: 0.5, rotation: 0 };
    document.getElementById('removeDesign').hidden = true;
    document.getElementById('canvasHint').hidden = false;
  }
}

function drawGarment() {
  const garmentColour = document.getElementById('garmentColour').value;
  const mock = MOCKUP[product.category] || MOCKUP['t-shirts'];
  const fill = garmentColour ? guessColour(garmentColour) : mock.color;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#fafafa';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2, -h / 2);

  if (mock.type === 'cap') {
    drawCap(fill, w, h);
  } else if (mock.type === 'hoodie') {
    drawHoodie(fill, w, h);
  } else {
    drawTee(fill, w, h);
  }

  drawPlacementZone(w, h);

  if (artworkImg && (designs[currentView] || artworkImg)) {
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    const iw = artworkImg.width * transform.scale;
    const ih = artworkImg.height * transform.scale;
    ctx.drawImage(artworkImg, -iw / 2, -ih / 2, iw, ih);
    ctx.strokeStyle = 'rgba(13, 148, 136, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(-iw / 2, -ih / 2, iw, ih);
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(15,39,68,0.5)';
  ctx.font = '600 11px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(currentView.toUpperCase(), w / 2, h - 16);

  ctx.restore();
}

function drawTee(fill, w, h) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(w * 0.3, h * 0.12);
  ctx.lineTo(w * 0.7, h * 0.12);
  ctx.lineTo(w * 0.82, h * 0.22);
  ctx.lineTo(w * 0.75, h * 0.28);
  ctx.lineTo(w * 0.72, h * 0.88);
  ctx.lineTo(w * 0.28, h * 0.88);
  ctx.lineTo(w * 0.25, h * 0.28);
  ctx.lineTo(w * 0.18, h * 0.22);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.stroke();
}

function drawHoodie(fill, w, h) {
  drawTee(fill, w, h);
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(w * 0.5, h * 0.14, w * 0.12, Math.PI, 0);
  ctx.fill();
}

function drawCap(fill, w, h) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.ellipse(w * 0.5, h * 0.45, w * 0.32, h * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.18, h * 0.45);
  ctx.quadraticCurveTo(w * 0.5, h * 0.62, w * 0.82, h * 0.45);
  ctx.lineTo(w * 0.82, h * 0.48);
  ctx.quadraticCurveTo(w * 0.5, h * 0.66, w * 0.18, h * 0.48);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.1)';
  ctx.stroke();
}

function drawPlacementZone(w, h) {
  const zone = getZone(currentView, w, h);
  ctx.strokeStyle = 'rgba(13, 148, 136, 0.25)';
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
  ctx.setLineDash([]);
}

function getZone(view, w, h) {
  const zones = {
    Front: { x: w * 0.35, y: h * 0.28, w: w * 0.3, h: h * 0.22 },
    Back: { x: w * 0.32, y: h * 0.25, w: w * 0.36, h: h * 0.35 },
    Left: { x: w * 0.38, y: h * 0.38, w: w * 0.12, h: h * 0.18 },
    Right: { x: w * 0.5, y: h * 0.38, w: w * 0.12, h: h * 0.18 },
    'Side left': { x: w * 0.2, y: h * 0.35, w: w * 0.25, h: h * 0.15 },
    'Side right': { x: w * 0.55, y: h * 0.35, w: w * 0.25, h: h * 0.15 },
  };
  return zones[view] || zones.Front;
}

function guessColour(name) {
  const map = { black: '#1e293b', navy: '#1e3a5f', white: '#f8fafc', red: '#dc2626', blue: '#2563eb', green: '#16a34a', grey: '#94a3b8', gray: '#94a3b8', yellow: '#facc15', orange: '#ea580c', maroon: '#7f1d1d', pink: '#ec4899' };
  const key = Object.keys(map).find(k => name.toLowerCase().includes(k));
  return key ? map[key] : '#e2e8f0';
}

function draw() { drawGarment(); }

function updatePricing() {
  const qty = parseInt(document.getElementById('qtyInput').value, 10) || 1;
  const positions = Object.keys(designs).length || (artworkImg ? 1 : 0);
  const { total } = estimateOrderTotal({ qty, positions: Math.max(positions, 1), newLogo: !!artwork });
  document.getElementById('priceTotal').textContent = artwork ? `~$${total}` : '$0';
}

async function handleUpload(file) {
  const validation = await validateArtworkFile(file);
  if (!validation.ok) {
    alert(validation.errors.join('\n'));
    return;
  }

  showProcessing('Validating artwork…');
  showProcessing('Making embroidery-ready copy…');

  let uploadResult = null;
  try {
    uploadResult = await uploadArtwork(file, { productId: product.id, view: currentView });
  } catch (e) {
    showProcessing('Server offline — saving locally…');
    uploadResult = {
      id: 'local-' + Date.now(),
      fileName: file.name,
      previewUrl: await blobPreview(file),
      originalUrl: null,
      digitizeNote: 'Upload server unavailable — original will be sent with order.',
      warnings: [e.message],
    };
  }

  hideProcessing();

  artwork = { ...uploadResult, fileName: file.name, validation };
  artworkImg = await loadImage(uploadResult.previewUrl || URL.createObjectURL(file));

  document.getElementById('artworkPanel').hidden = false;
  document.getElementById('artworkThumb').src = artworkImg.src;
  document.getElementById('artworkMeta').innerHTML = [
    `<li>File: ${file.name}</li>`,
    validation.width ? `<li>${validation.width} × ${validation.height}px</li>` : '',
    validation.dpi ? `<li>Est. ${validation.dpi} DPI</li>` : '',
    ...validation.warnings.map(w => `<li class="warn">${w}</li>`),
  ].filter(Boolean).join('');
  document.getElementById('digitizeStatus').textContent = uploadResult.digitizeNote || 'Original + digitized preview saved.';

  document.getElementById('removeDesign').hidden = false;
  document.getElementById('canvasHint').hidden = true;
  transform = { x: 250, y: 280, scale: 0.45, rotation: 0 };
  saveCurrentDesign();
  renderViewTabs();
  updatePricing();
  draw();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function blobPreview(file) {
  return new Promise(r => {
    const reader = new FileReader();
    reader.onload = () => r(reader.result);
    reader.readAsDataURL(file);
  });
}

function showProcessing(text) {
  document.getElementById('processingOverlay').hidden = false;
  document.getElementById('processingText').textContent = text;
}

function hideProcessing() {
  document.getElementById('processingOverlay').hidden = true;
}

function buildCartItem() {
  saveCurrentDesign();
  const qty = parseInt(document.getElementById('qtyInput').value, 10);
  const size = document.getElementById('sizeSelect').value;
  const colour = document.getElementById('garmentColour').value || 'TBC';
  const positions = Object.keys(designs);
  const embroidery = positions.length ? positions.join(', ') : 'Left chest';

  return {
    productId: product.id,
    sku: product.sku,
    name: product.name,
    brand: product.brand,
    image: product.image,
    size,
    colour,
    qty,
    embroidery,
    notes: `Threads: ${document.getElementById('threadCount').value}. Designed in studio.`,
    designed: true,
    designs: { ...designs },
    artwork: artwork ? {
      id: artwork.id,
      fileName: artwork.fileName,
      originalUrl: artwork.originalUrl,
      previewUrl: artwork.previewUrl,
      digitizePreviewUrl: artwork.digitizePreviewUrl,
    } : null,
    pricing: estimateOrderTotal({ qty, positions: Math.max(positions.length, 1), newLogo: !!artwork }),
  };
}

function bindEvents() {
  document.getElementById('productSelect').addEventListener('change', e => {
    location.href = `designer.html?id=${e.target.value}`;
  });

  document.getElementById('changeProduct').href = 'shop.html';

  document.getElementById('garmentColour').addEventListener('input', draw);
  document.getElementById('qtyInput').addEventListener('input', updatePricing);

  document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('artworkInput').click();
  });

  document.getElementById('artworkInput').addEventListener('change', e => {
    if (e.target.files[0]) handleUpload(e.target.files[0]);
  });

  document.getElementById('zoomIn').addEventListener('click', () => { zoom = Math.min(1.5, zoom + 0.1); document.getElementById('zoomLevel').textContent = Math.round(zoom * 100) + '%'; draw(); });
  document.getElementById('zoomOut').addEventListener('click', () => { zoom = Math.max(0.6, zoom - 0.1); document.getElementById('zoomLevel').textContent = Math.round(zoom * 100) + '%'; draw(); });

  document.getElementById('centerDesign').addEventListener('click', () => {
    transform.x = 250;
    transform.y = 280;
    draw();
  });

  document.getElementById('removeDesign').addEventListener('click', () => {
    delete designs[currentView];
    if (!Object.keys(designs).length) {
      artwork = null;
      artworkImg = null;
      document.getElementById('artworkPanel').hidden = true;
    }
    document.getElementById('removeDesign').hidden = !artworkImg;
    document.getElementById('canvasHint').hidden = !!artworkImg;
    renderViewTabs();
    updatePricing();
    draw();
  });

  canvas.addEventListener('mousedown', e => {
    if (!artworkImg) return;
    dragging = true;
    const rect = canvas.getBoundingClientRect();
    dragStart = { x: e.clientX - rect.left - transform.x, y: e.clientY - rect.top - transform.y };
  });
  canvas.addEventListener('mousemove', e => {
    if (!dragging) return;
    const rect = canvas.getBoundingClientRect();
    transform.x = e.clientX - rect.left - dragStart.x;
    transform.y = e.clientY - rect.top - dragStart.y;
    draw();
  });
  canvas.addEventListener('mouseup', () => { dragging = false; saveCurrentDesign(); });
  canvas.addEventListener('mouseleave', () => { dragging = false; });

  canvas.addEventListener('wheel', e => {
    if (!artworkImg) return;
    e.preventDefault();
    transform.scale = Math.max(0.1, Math.min(1.2, transform.scale + (e.deltaY > 0 ? -0.05 : 0.05)));
    draw();
    saveCurrentDesign();
  });

  const addHandler = () => {
    if (!document.getElementById('copyrightCheck').checked) {
      alert('Please confirm you own the rights to this artwork.');
      return;
    }
    if (!artwork && !Object.keys(designs).length) {
      alert('Upload your artwork first, or use Quick Quote on the homepage.');
      return;
    }
    addToCart(buildCartItem());
    updateCartBadge();
    if (confirm('Added to order! Go to checkout?')) location.href = 'checkout.html';
  };

  document.getElementById('addToOrder').addEventListener('click', addHandler);
  document.getElementById('saveDesign').addEventListener('click', addHandler);
}

init();