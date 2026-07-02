import { addToCart, updateCartBadge } from './cart.js';
import { validateArtworkFile, uploadArtwork } from './artwork.js';
import { estimateOrderTotal } from './pricing.js';
import { getProductImage } from './images.js';
import { resolveBlankMockup, loadTintedMockupImage } from './mockups.js';
import { removeBackground } from './remove-background.js';
import { recolorArtworkToImage } from './recolor-artwork.js';
import { exportEmbroideryPackage } from './export-design.js';

const VIEWS = {
  default: ['Front', 'Back', 'Left', 'Right'],
  headwear: ['Front', 'Left', 'Right', 'Back'],
  cap: ['Front', 'Side left', 'Side right'],
};

const COLOUR_SWATCHES = [
  { name: 'Black', hex: '#1e293b' },
  { name: 'Navy', hex: '#1e3a5f' },
  { name: 'White', hex: '#f8fafc' },
  { name: 'Grey', hex: '#94a3b8' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Royal Blue', hex: '#2563eb' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Yellow', hex: '#facc15' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Maroon', hex: '#7f1d1d' },
];

const MOCKUP = {
  't-shirts': { type: 'tee', fill: '#f1f5f9' },
  polos: { type: 'tee', fill: '#e2e8f0' },
  hoodies: { type: 'hoodie', fill: '#cbd5e1' },
  headwear: { type: 'cap', fill: '#1e293b' },
  hivis: { type: 'tee', fill: '#facc15' },
  workwear: { type: 'tee', fill: '#94a3b8' },
  hospitality: { type: 'tee', fill: '#f8fafc' },
  healthcare: { type: 'tee', fill: '#e0f2fe' },
  schools: { type: 'tee', fill: '#dbeafe' },
  jackets: { type: 'hoodie', fill: '#475569' },
  shirts: { type: 'tee', fill: '#f8fafc' },
  pants: { type: 'tee', fill: '#64748b' },
};

const canvas = document.getElementById('designCanvas');
const ctx = canvas.getContext('2d');

let products = [];
let product = null;
let mockupImg = null;
let mockupKind = 'svg';
let mockupTint = null;
let currentView = 'Front';
let designs = {};
let artwork = null;
let artworkImg = null;
let artworkImgOriginal = null;
let artworkImgBase = null;
let bgRemoved = false;
let artworkRecolor = { mode: 'none', hue: 0, color: '#1e293b', intensity: 100 };
let transform = { x: 250, y: 280, scale: 0.45, rotation: 0 };
let zoom = 1;
let dragging = false;
let resizing = false;
let resizeHandle = null;
let dragOffset = { x: 0, y: 0 };
let needsDraw = false;
let garmentFill = null;
const HANDLE_HIT = 14;

async function init() {
  const res = await fetch('data/products.json');
  const data = await res.json();
  products = data.products;

  const params = new URLSearchParams(location.search);
  const id = params.get('id') || products[0]?.id;
  product = products.find(p => p.id === id) || products[0];

  populateProductSelect();
  populateSizes();
  populateColourSwatches();
  setDefaultGarmentColour();
  populateThreadSwatches();
  await loadBlankMockup();
  renderViewTabs();
  syncSliders();
  updatePricing();
  scheduleDraw();
  bindEvents();
  updateCartBadge();
}

function getGarmentColourInfo() {
  const name = document.getElementById('garmentColour').value || 'Black';
  return { name, hex: getGarmentFill() };
}

async function loadBlankMockup() {
  mockupImg = null;
  mockupKind = 'svg';
  mockupTint = null;
  try {
    const info = await resolveBlankMockup(product, getGarmentColourInfo());
    const loaded = await loadTintedMockupImage(info);
    mockupImg = loaded.img;
    mockupKind = loaded.kind;
    mockupTint = loaded.tint;
  } catch (_) {}
}

function populateThreadSwatches() {
  const el = document.getElementById('threadSwatches');
  el.innerHTML = COLOUR_SWATCHES.map(c =>
    `<button type="button" class="swatch${c.name === 'Black' ? ' active' : ''}" style="background:${c.hex}" title="${c.name}" data-hex="${c.hex}"></button>`
  ).join('');
  el.querySelectorAll('.swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      artworkRecolor.color = btn.dataset.hex;
      applyArtworkRecolor();
    });
  });
}

function syncRecolorUI() {
  const mode = document.querySelector('input[name="recolorMode"]:checked')?.value || 'none';
  document.getElementById('hueShiftWrap').hidden = mode !== 'hue';
  document.getElementById('threadColourWrap').hidden = mode !== 'solid';
  document.getElementById('recolorIntensityWrap').hidden = mode === 'none';
}

async function applyArtworkRecolor() {
  if (!artworkImgBase) return;
  const mode = document.querySelector('input[name="recolorMode"]:checked')?.value || 'none';
  artworkRecolor.mode = mode;
  artworkRecolor.hue = parseInt(document.getElementById('hueShift').value, 10);
  artworkRecolor.intensity = parseInt(document.getElementById('recolorIntensity').value, 10);

  if (mode === 'none') {
    artworkImg = artworkImgBase;
    document.getElementById('artworkThumb').src = artworkImgBase.src;
  } else {
    artworkImg = await recolorArtworkToImage(artworkImgBase, artworkRecolor);
    document.getElementById('artworkThumb').src = artworkImg.src;
  }
  saveCurrentDesign();
  scheduleDraw();
}

function setDefaultGarmentColour() {
  const el = document.getElementById('colourSwatches');
  const black = el?.querySelector('[data-colour="Black"]');
  if (black && !document.getElementById('garmentColour').value) {
    black.classList.add('active');
    document.getElementById('garmentColour').value = 'Black';
    garmentFill = '#1e293b';
  }
}

function populateProductSelect() {
  const sel = document.getElementById('productSelect');
  const groups = {};
  products.forEach(p => { (groups[p.category] ||= []).push(p); });
  sel.innerHTML = Object.entries(groups).map(([cat, items]) =>
    `<optgroup label="${cat}">${items.map(p =>
      `<option value="${p.id}" ${p.id === product.id ? 'selected' : ''}>${p.brand} — ${p.name}</option>`
    ).join('')}</optgroup>`
  ).join('');
}

function populateSizes() {
  document.getElementById('sizeSelect').innerHTML =
    product.sizes.map(s => `<option value="${s}">${s}</option>`).join('');
}

function populateColourSwatches() {
  const el = document.getElementById('colourSwatches');
  el.innerHTML = COLOUR_SWATCHES.map(c =>
    `<button type="button" class="swatch" style="background:${c.hex}" title="${c.name}" data-colour="${c.name}" data-hex="${c.hex}"></button>`
  ).join('');
  el.querySelectorAll('.swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      el.querySelectorAll('.swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('garmentColour').value = btn.dataset.colour;
      garmentFill = btn.dataset.hex;
      loadBlankMockup().then(() => scheduleDraw());
    });
  });
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
      syncSliders();
      scheduleDraw();
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
    setDesignUI(true);
  } else if (artworkImg) {
    const zone = getZone(currentView, canvas.width, canvas.height);
    transform = {
      x: zone.x + zone.w / 2,
      y: zone.y + zone.h / 2,
      scale: 0.45,
      rotation: 0,
    };
    setDesignUI(true);
  } else {
    setDesignUI(false);
  }
}

function setDesignUI(hasDesign) {
  document.getElementById('removeDesign').hidden = !hasDesign;
  document.getElementById('canvasHint').hidden = hasDesign;
  document.getElementById('designControls').hidden = !hasDesign;
  document.getElementById('exportPanel').hidden = !hasDesign;
}

function syncSliders() {
  document.getElementById('scaleSlider').value = Math.round(transform.scale * 100);
  document.getElementById('rotateSlider').value = Math.round(transform.rotation);
  document.getElementById('scaleVal').textContent = Math.round(transform.scale * 100) + '%';
  document.getElementById('rotateVal').textContent = Math.round(transform.rotation) + '°';
}

/** Map screen pointer to design coordinates (CSS scale + zoom inverse) */
function pointerOnCanvas(e) {
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;
  const clientX = e.clientX ?? e.touches?.[0]?.clientX ?? 0;
  const clientY = e.clientY ?? e.touches?.[0]?.clientY ?? 0;
  let x = (clientX - rect.left) * sx;
  let y = (clientY - rect.top) * sy;
  const w = canvas.width;
  const h = canvas.height;
  x = (x - w / 2) / zoom + w / 2;
  y = (y - h / 2) / zoom + h / 2;
  return { x, y };
}

function localPointer(p) {
  const dx = p.x - transform.x;
  const dy = p.y - transform.y;
  const rad = (-transform.rotation * Math.PI) / 180;
  return {
    x: dx * Math.cos(rad) - dy * Math.sin(rad),
    y: dx * Math.sin(rad) + dy * Math.cos(rad),
  };
}

function getArtworkSize() {
  if (!artworkImg) return { w: 0, h: 0 };
  return {
    w: artworkImg.width * transform.scale,
    h: artworkImg.height * transform.scale,
  };
}

function getHandlePositions() {
  const { w, h } = getArtworkSize();
  const rad = (transform.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const corners = [
    { id: 'nw', lx: -w / 2, ly: -h / 2 },
    { id: 'ne', lx: w / 2, ly: -h / 2 },
    { id: 'sw', lx: -w / 2, ly: h / 2 },
    { id: 'se', lx: w / 2, ly: h / 2 },
  ];
  return corners.map(c => ({
    id: c.id,
    x: transform.x + c.lx * cos - c.ly * sin,
    y: transform.y + c.lx * sin + c.ly * cos,
  }));
}

function hitTest(p) {
  if (!artworkImg) return null;
  for (const h of getHandlePositions()) {
    if (Math.abs(p.x - h.x) <= HANDLE_HIT && Math.abs(p.y - h.y) <= HANDLE_HIT) {
      return { type: 'resize', handle: h.id };
    }
  }
  const local = localPointer(p);
  const { w, h } = getArtworkSize();
  if (Math.abs(local.x) <= w / 2 + 8 && Math.abs(local.y) <= h / 2 + 8) {
    return { type: 'drag' };
  }
  return null;
}

function scheduleDraw() {
  if (needsDraw) return;
  needsDraw = true;
  requestAnimationFrame(() => {
    needsDraw = false;
    draw();
  });
}

function getGarmentFill() {
  if (garmentFill) return garmentFill;
  const name = document.getElementById('garmentColour').value;
  if (!name) return (MOCKUP[product.category] || MOCKUP['t-shirts']).fill;
  const sw = COLOUR_SWATCHES.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (sw) return sw.hex;
  const map = { black: '#1e293b', navy: '#1e3a5f', white: '#f8fafc', red: '#dc2626', blue: '#2563eb', green: '#16a34a', grey: '#94a3b8', gray: '#94a3b8', yellow: '#facc15', orange: '#ea580c' };
  const key = Object.keys(map).find(k => name.toLowerCase().includes(k));
  return key ? map[key] : '#e2e8f0';
}

function draw() {
  const w = canvas.width;
  const h = canvas.height;
  const fill = getGarmentFill();
  const mock = MOCKUP[product.category] || MOCKUP['t-shirts'];

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#eef2f6';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2, -h / 2);

  if (mockupImg) {
    drawBlankMockup(w, h, fill);
  } else if (mock.type === 'cap') {
    drawCap(fill, w, h);
  } else if (mock.type === 'hoodie') {
    drawHoodie(fill, w, h);
  } else {
    drawTee(fill, w, h);
  }

  drawPlacementZone(w, h);

  if (artworkImg) {
    ctx.save();
    ctx.translate(transform.x, transform.y);
    ctx.rotate((transform.rotation * Math.PI) / 180);
    const iw = artworkImg.width * transform.scale;
    const ih = artworkImg.height * transform.scale;
    ctx.drawImage(artworkImg, -iw / 2, -ih / 2, iw, ih);
    const active = dragging || resizing;
    ctx.strokeStyle = active ? '#0d9488' : 'rgba(13, 148, 136, 0.7)';
    ctx.lineWidth = active ? 2.5 : 2;
    ctx.setLineDash(active ? [] : [6, 4]);
    ctx.strokeRect(-iw / 2, -ih / 2, iw, ih);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#0d9488';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    [[-iw / 2, -ih / 2], [iw / 2, -ih / 2], [-iw / 2, ih / 2], [iw / 2, ih / 2]].forEach(([cx, cy]) => {
      ctx.fillRect(cx - 5, cy - 5, 10, 10);
      ctx.strokeRect(cx - 5, cy - 5, 10, 10);
    });
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(15,39,68,0.55)';
  ctx.font = '600 11px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(currentView.toUpperCase(), w / 2, h - 14);

  ctx.restore();
}

function drawBlankMockup(w, h, tint) {
  const pad = 36;
  const maxW = w - pad * 2;
  const maxH = h - pad * 2;
  const ratio = Math.min(maxW / mockupImg.width, maxH / mockupImg.height);
  const iw = mockupImg.width * ratio;
  const ih = mockupImg.height * ratio;
  const ix = (w - iw) / 2;
  const iy = (h - ih) / 2;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.06)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  ctx.drawImage(mockupImg, ix, iy, iw, ih);
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
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
  ctx.strokeStyle = 'rgba(13, 148, 136, 0.3)';
  ctx.setLineDash([5, 5]);
  ctx.lineWidth = 1;
  ctx.strokeRect(zone.x, zone.y, zone.w, zone.h);
  ctx.setLineDash([]);
  ctx.font = '500 9px Inter, sans-serif';
  ctx.fillStyle = 'rgba(13, 148, 136, 0.6)';
  ctx.textAlign = 'left';
  ctx.fillText('embroidery zone', zone.x + 4, zone.y + 12);
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

  // INSTANT preview — show on canvas immediately
  const localUrl = URL.createObjectURL(file);
  artworkImg = await loadImage(localUrl);
  artworkImgOriginal = artworkImg;
  artworkImgBase = artworkImg;
  bgRemoved = false;
  resetBgRemoveUI();
  resetArtworkRecolorUI();
  artwork = { id: 'local-' + Date.now(), fileName: file.name, previewUrl: localUrl, validation };

  const zone = getZone(currentView, canvas.width, canvas.height);
  transform = { x: zone.x + zone.w / 2, y: zone.y + zone.h / 2, scale: 0.45, rotation: 0 };

  document.getElementById('artworkPanel').hidden = false;
  document.getElementById('artworkThumb').src = localUrl;
  document.getElementById('artworkMeta').innerHTML = [
    `<li>File: ${file.name}</li>`,
    validation.width ? `<li>${validation.width} × ${validation.height}px</li>` : '',
    validation.dpi ? `<li>Est. ${validation.dpi} DPI</li>` : '',
    ...validation.warnings.map(w => `<li class="warn">${w}</li>`),
  ].filter(Boolean).join('');
  document.getElementById('digitizeStatus').textContent = 'Preview live — processing in background…';

  const status = document.getElementById('uploadStatus');
  status.hidden = false;
  status.textContent = 'Processing embroidery file…';
  status.className = 'upload-status upload-status--busy';

  setDesignUI(true);
  syncSliders();
  saveCurrentDesign();
  renderViewTabs();
  updatePricing();
  scheduleDraw();

  // Background upload + digitize (non-blocking)
  uploadArtwork(file, { productId: product.id, view: currentView })
    .then(result => {
      artwork = { ...result, fileName: file.name, validation };
      if (result.previewUrl) {
        loadImage(result.previewUrl).then(img => {
          artworkImg = img;
          document.getElementById('artworkThumb').src = result.previewUrl;
          scheduleDraw();
        }).catch(() => {});
      }
      document.getElementById('digitizeStatus').textContent =
        result.digitizeNote || 'Original + digitized preview saved.';
      status.textContent = '✓ Artwork processed';
      status.className = 'upload-status upload-status--done';
      setTimeout(() => { status.hidden = true; }, 3000);
      saveCurrentDesign();
    })
    .catch(err => {
      document.getElementById('digitizeStatus').textContent =
        'Local preview active. Server upload pending — will send with order.';
      status.textContent = 'Preview ready (offline mode)';
      status.className = 'upload-status upload-status--warn';
      setTimeout(() => { status.hidden = true; }, 4000);
    });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (src.startsWith('/') || src.startsWith(location.origin)) {
      img.crossOrigin = 'anonymous';
    }
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = src;
  });
}

function resetBgRemoveUI() {
  document.getElementById('removeBgCheck').checked = false;
  document.getElementById('bgToleranceWrap').hidden = true;
  document.getElementById('restoreOriginalBg').hidden = true;
  document.getElementById('bgTolerance').value = 42;
  document.getElementById('bgToleranceVal').textContent = '42';
}

function resetArtworkRecolorUI() {
  artworkRecolor = { mode: 'none', hue: 0, color: '#1e293b', intensity: 100 };
  const none = document.querySelector('input[name="recolorMode"][value="none"]');
  if (none) none.checked = true;
  document.getElementById('hueShift').value = 0;
  document.getElementById('hueShiftVal').textContent = '0°';
  document.getElementById('recolorIntensity').value = 100;
  document.getElementById('recolorIntensityVal').textContent = '100%';
  document.querySelectorAll('#threadSwatches .swatch').forEach(b => {
    b.classList.toggle('active', b.title === 'Black');
  });
  syncRecolorUI();
}

async function applyBackgroundRemoval() {
  if (!artworkImgOriginal) return;
  const tolerance = parseInt(document.getElementById('bgTolerance').value, 10);
  const status = document.getElementById('uploadStatus');
  status.hidden = false;
  status.textContent = 'Removing background…';
  status.className = 'upload-status upload-status--busy';

  try {
    const { dataUrl } = await removeBackground(artworkImgOriginal, { tolerance });
    const processed = await loadImage(dataUrl);
    artworkImgBase = processed;
    artworkImg = processed;
    bgRemoved = true;
    document.getElementById('artworkThumb').src = dataUrl;
    if (artworkRecolor.mode !== 'none') await applyArtworkRecolor();
    document.getElementById('restoreOriginalBg').hidden = false;
    if (artwork) artwork.previewUrl = dataUrl;
    saveCurrentDesign();
    scheduleDraw();
    status.textContent = '✓ Background removed';
    status.className = 'upload-status upload-status--done';
    setTimeout(() => { status.hidden = true; }, 2000);
  } catch (e) {
    status.textContent = 'Could not remove background';
    status.className = 'upload-status upload-status--warn';
    setTimeout(() => { status.hidden = true; }, 3000);
  }
}

async function restoreOriginalArtwork() {
  if (!artworkImgOriginal) return;
  artworkImgBase = artworkImgOriginal;
  bgRemoved = false;
  document.getElementById('removeBgCheck').checked = false;
  document.getElementById('bgToleranceWrap').hidden = true;
  document.getElementById('restoreOriginalBg').hidden = true;
  const src = artwork?.originalUrl || artworkImgOriginal.src;
  if (artworkRecolor.mode !== 'none') await applyArtworkRecolor();
  else {
    artworkImg = artworkImgOriginal;
    document.getElementById('artworkThumb').src = src;
  }
  saveCurrentDesign();
  scheduleDraw();
}

function syncGarmentSwatchFromInput() {
  const name = document.getElementById('garmentColour').value.trim();
  const el = document.getElementById('colourSwatches');
  el.querySelectorAll('.swatch').forEach(b => b.classList.remove('active'));
  const match = COLOUR_SWATCHES.find(c => c.name.toLowerCase() === name.toLowerCase());
  if (match) {
    const btn = el.querySelector(`[data-colour="${match.name}"]`);
    if (btn) btn.classList.add('active');
    garmentFill = match.hex;
  } else {
    garmentFill = null;
  }
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
    image: getProductImage(product),
    size, colour, qty, embroidery,
    notes: `Threads: ${document.getElementById('threadCount').value}. Designed in studio.`,
    designed: true,
    designs: { ...designs },
    artwork: artwork ? {
      id: artwork.id,
      fileName: artwork.fileName,
      originalUrl: artwork.originalUrl,
      previewUrl: artwork.previewUrl,
      digitizePreviewUrl: artwork.digitizePreviewUrl,
      backgroundRemoved: bgRemoved,
      recolor: { ...artworkRecolor },
    } : null,
    pricing: estimateOrderTotal({ qty, positions: Math.max(positions.length, 1), newLogo: !!artwork }),
  };
}

function bindEvents() {
  document.getElementById('productSelect').addEventListener('change', e => {
    location.href = `designer.html?id=${e.target.value}`;
  });

  document.getElementById('garmentColour').addEventListener('input', () => {
    syncGarmentSwatchFromInput();
    loadBlankMockup().then(() => scheduleDraw());
  });

  document.querySelectorAll('input[name="recolorMode"]').forEach(r => {
    r.addEventListener('change', () => { syncRecolorUI(); applyArtworkRecolor(); });
  });
  document.getElementById('hueShift').addEventListener('input', e => {
    document.getElementById('hueShiftVal').textContent = e.target.value + '°';
    applyArtworkRecolor();
  });
  document.getElementById('recolorIntensity').addEventListener('input', e => {
    document.getElementById('recolorIntensityVal').textContent = e.target.value + '%';
    applyArtworkRecolor();
  });

  document.getElementById('removeBgCheck').addEventListener('change', async e => {
    document.getElementById('bgToleranceWrap').hidden = !e.target.checked;
    if (e.target.checked) await applyBackgroundRemoval();
    else await restoreOriginalArtwork();
  });

  document.getElementById('bgTolerance').addEventListener('input', e => {
    document.getElementById('bgToleranceVal').textContent = e.target.value;
    if (document.getElementById('removeBgCheck').checked) applyBackgroundRemoval();
  });

  document.getElementById('restoreOriginalBg').addEventListener('click', restoreOriginalArtwork);

  document.getElementById('exportDesign').addEventListener('click', async () => {
    if (!artworkImg) { alert('Upload artwork first.'); return; }
    saveCurrentDesign();
    const btn = document.getElementById('exportDesign');
    btn.disabled = true;
    btn.textContent = 'Preparing…';
    try {
      await exportEmbroideryPackage({
        product,
        designs,
        artwork,
        artworkImg,
        mockupImg,
        mockupKind,
        mockupTint: getGarmentFill(),
        garmentColour: document.getElementById('garmentColour').value || 'Black',
        threadCount: document.getElementById('threadCount').value,
        qty: parseInt(document.getElementById('qtyInput').value, 10) || 1,
      });
    } finally {
      btn.disabled = false;
      btn.textContent = 'Download production pack';
    }
  });

  document.getElementById('qtyInput').addEventListener('input', updatePricing);
  document.getElementById('threadCount').addEventListener('change', updatePricing);

  document.getElementById('uploadBtn').addEventListener('click', () => {
    document.getElementById('artworkInput').click();
  });

  document.getElementById('artworkInput').addEventListener('change', e => {
    if (e.target.files[0]) handleUpload(e.target.files[0]);
    e.target.value = '';
  });

  document.getElementById('scaleSlider').addEventListener('input', e => {
    transform.scale = e.target.value / 100;
    document.getElementById('scaleVal').textContent = e.target.value + '%';
    saveCurrentDesign();
    scheduleDraw();
  });

  document.getElementById('rotateSlider').addEventListener('input', e => {
    transform.rotation = parseInt(e.target.value, 10);
    document.getElementById('rotateVal').textContent = e.target.value + '°';
    saveCurrentDesign();
    scheduleDraw();
  });

  document.getElementById('zoomIn').addEventListener('click', () => {
    zoom = Math.min(1.5, zoom + 0.1);
    document.getElementById('zoomLevel').textContent = Math.round(zoom * 100) + '%';
    scheduleDraw();
  });

  document.getElementById('zoomOut').addEventListener('click', () => {
    zoom = Math.max(0.6, zoom - 0.1);
    document.getElementById('zoomLevel').textContent = Math.round(zoom * 100) + '%';
    scheduleDraw();
  });

  document.getElementById('centerDesign').addEventListener('click', () => {
    const zone = getZone(currentView, canvas.width, canvas.height);
    transform.x = zone.x + zone.w / 2;
    transform.y = zone.y + zone.h / 2;
    syncSliders();
    saveCurrentDesign();
    scheduleDraw();
  });

  document.getElementById('removeDesign').addEventListener('click', () => {
    delete designs[currentView];
    if (!Object.keys(designs).length) {
      artwork = null;
      artworkImg = null;
      artworkImgOriginal = null;
      artworkImgBase = null;
      bgRemoved = false;
      resetBgRemoveUI();
      resetArtworkRecolorUI();
      document.getElementById('artworkPanel').hidden = true;
      setDesignUI(false);
    }
    renderViewTabs();
    updatePricing();
    scheduleDraw();
  });

  canvas.style.touchAction = 'none';

  const onPointerDown = e => {
    if (!artworkImg) return;
    const hit = hitTest(pointerOnCanvas(e));
    if (!hit) return;
    e.preventDefault();
    if (hit.type === 'resize') {
      resizing = true;
      resizeHandle = hit.handle;
      canvas.style.cursor = 'nwse-resize';
    } else {
      dragging = true;
      const p = pointerOnCanvas(e);
      dragOffset = { x: p.x - transform.x, y: p.y - transform.y };
      canvas.style.cursor = 'grabbing';
    }
    canvas.setPointerCapture(e.pointerId);
    scheduleDraw();
  };

  const onPointerMove = e => {
    if (!dragging && !resizing) {
      if (artworkImg) {
        const hit = hitTest(pointerOnCanvas(e));
        if (hit?.type === 'resize') canvas.style.cursor = 'nwse-resize';
        else if (hit?.type === 'drag') canvas.style.cursor = 'grab';
        else canvas.style.cursor = 'default';
      }
      return;
    }
    e.preventDefault();
    const p = pointerOnCanvas(e);
    if (resizing) {
      const local = localPointer(p);
      const scaleX = (Math.abs(local.x) * 2) / artworkImg.width;
      const scaleY = (Math.abs(local.y) * 2) / artworkImg.height;
      transform.scale = Math.max(0.05, Math.min(1.2, Math.max(scaleX, scaleY)));
      syncSliders();
    } else {
      transform.x = p.x - dragOffset.x;
      transform.y = p.y - dragOffset.y;
    }
    scheduleDraw();
  };

  const endInteraction = () => {
    if (!dragging && !resizing) return;
    dragging = false;
    resizing = false;
    resizeHandle = null;
    canvas.style.cursor = artworkImg ? 'grab' : 'default';
    saveCurrentDesign();
    scheduleDraw();
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', endInteraction);
  canvas.addEventListener('pointercancel', endInteraction);
  canvas.addEventListener('lostpointercapture', endInteraction);

  canvas.addEventListener('wheel', e => {
    if (!artworkImg) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.03 : 0.03;
    transform.scale = Math.max(0.05, Math.min(1.2, transform.scale + delta));
    syncSliders();
    saveCurrentDesign();
    scheduleDraw();
  }, { passive: false });

  const addHandler = () => {
    if (!document.getElementById('copyrightCheck').checked) {
      alert('Please confirm you own the rights to this artwork.');
      return;
    }
    if (!artworkImg) {
      alert('Upload your artwork first.');
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