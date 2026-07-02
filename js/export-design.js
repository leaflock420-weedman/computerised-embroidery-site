/** Build embroidery-ready export package (Spreadshirt / Ember style). */

const PROD_WIDTH_MM = 100;
const EXPORT_DPI = 300;

export function mmToPx(mm, dpi = EXPORT_DPI) {
  return Math.round((mm / 25.4) * dpi);
}

export function buildEmbroiderySpec({
  product, designs, artwork, garmentColour, threadCount, qty, views,
}) {
  const positions = Object.entries(designs).map(([view, d]) => {
    const t = d.transform;
    const widthMm = PROD_WIDTH_MM * (t.scale / 0.45);
    const heightMm = artwork?.height && artwork?.width
      ? widthMm * (artwork.height / artwork.width)
      : widthMm;
    return {
      view,
      centerXmm: ((t.x / 500) * 280).toFixed(1),
      centerYmm: ((t.y / 560) * 320).toFixed(1),
      widthMm: +widthMm.toFixed(1),
      heightMm: +heightMm.toFixed(1),
      rotationDeg: t.rotation,
      scale: t.scale,
    };
  });

  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    shop: 'Computerised Embroidery',
    product: {
      id: product.id,
      sku: product.sku,
      name: product.name,
      brand: product.brand,
      category: product.category,
    },
    order: { qty, garmentColour, threadCount },
    artwork: artwork ? {
      fileName: artwork.fileName,
      originalUrl: artwork.originalUrl,
      previewUrl: artwork.previewUrl,
      widthPx: artwork.validation?.width,
      heightPx: artwork.validation?.height,
      estimatedDpi: artwork.validation?.dpi,
    } : null,
    placements: positions,
    production: {
      targetDpi: EXPORT_DPI,
      defaultWidthMm: PROD_WIDTH_MM,
      formats: ['PNG artwork @ 300 DPI', 'Placement mockups', 'JSON spec'],
      machineFiles: 'DST/PES/JEF — use Ember digitizer or our manual digitizing service',
      emberUrl: 'https://emberdesign.net/',
    },
    views: views || [],
  };
}

export async function renderArtworkPng(artworkImg, scale, rotation, widthMm = PROD_WIDTH_MM) {
  const pxW = mmToPx(widthMm);
  const ratio = artworkImg.height / artworkImg.width;
  const pxH = Math.round(pxW * ratio);
  const c = document.createElement('canvas');
  c.width = pxW;
  c.height = pxH;
  const cx = c.getContext('2d');
  cx.fillStyle = 'transparent';
  cx.clearRect(0, 0, pxW, pxH);
  cx.translate(pxW / 2, pxH / 2);
  cx.rotate((rotation * Math.PI) / 180);
  cx.drawImage(artworkImg, -pxW / 2, -pxH / 2, pxW, pxH);
  return canvasToBlob(c);
}

export async function renderPlacementMockup({
  mockupImg, mockupKind, tint, artworkImg, transform, viewLabel, canvasW = 500, canvasH = 560,
}) {
  const c = document.createElement('canvas');
  c.width = canvasW;
  c.height = canvasH;
  const cx = c.getContext('2d');
  cx.fillStyle = '#eef2f6';
  cx.fillRect(0, 0, canvasW, canvasH);

  if (mockupImg) {
    const pad = 40;
    const ratio = Math.min((canvasW - pad * 2) / mockupImg.width, (canvasH - pad * 2) / mockupImg.height);
    const iw = mockupImg.width * ratio;
    const ih = mockupImg.height * ratio;
    const ix = (canvasW - iw) / 2;
    const iy = (canvasH - ih) / 2;
    cx.drawImage(mockupImg, ix, iy, iw, ih);
    if (mockupKind === 'photo' && tint) {
      cx.globalCompositeOperation = 'multiply';
      cx.fillStyle = tint;
      cx.globalAlpha = 0.4;
      cx.fillRect(ix, iy, iw, ih);
      cx.globalAlpha = 1;
      cx.globalCompositeOperation = 'source-over';
    }
  }

  if (artworkImg) {
    cx.save();
    cx.translate(transform.x, transform.y);
    cx.rotate((transform.rotation * Math.PI) / 180);
    const iw = artworkImg.width * transform.scale;
    const ih = artworkImg.height * transform.scale;
    cx.drawImage(artworkImg, -iw / 2, -ih / 2, iw, ih);
    cx.restore();
  }

  cx.fillStyle = 'rgba(15,39,68,0.55)';
  cx.font = '600 11px Inter, system-ui, sans-serif';
  cx.textAlign = 'center';
  cx.fillText(viewLabel.toUpperCase(), canvasW / 2, canvasH - 14);

  return canvasToBlob(c);
}

function canvasToBlob(canvas) {
  return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result.split(',')[1]);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

export async function exportEmbroideryPackage(ctx) {
  const { product, designs, artwork, artworkImg, mockupImg, mockupKind, mockupTint, garmentColour, threadCount, qty } = ctx;
  const viewExports = [];

  for (const [view, d] of Object.entries(designs)) {
    const mockBlob = await renderPlacementMockup({
      mockupImg, mockupKind, tint: mockupTint, artworkImg, transform: d.transform, viewLabel: view,
    });
    const artBlob = await renderArtworkPng(artworkImg, d.transform.scale, d.transform.rotation);
    viewExports.push({
      view,
      mockupPng: await blobToBase64(mockBlob),
      artworkPng: await blobToBase64(artBlob),
    });
  }

  const spec = buildEmbroiderySpec({
    product, designs, artwork, garmentColour, threadCount, qty,
    views: viewExports.map(v => v.view),
  });

  try {
    const res = await fetch('/api/export-design', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ spec, views: viewExports, artworkFileName: artwork?.fileName }),
    });
    if (!res.ok) throw new Error('Server export failed');
    const blob = await res.blob();
    downloadBlob(blob, `embroidery-${product.sku || product.id}.zip`);
    return { ok: true, mode: 'zip' };
  } catch (_) {
    downloadBlob(new Blob([JSON.stringify(spec, null, 2)], { type: 'application/json' }), `embroidery-spec-${product.id}.json`);
    for (const v of viewExports) {
      downloadBlob(base64ToBlob(v.artworkPng), `artwork-${v.view}-300dpi.png`);
      downloadBlob(base64ToBlob(v.mockupPng), `placement-${v.view}.png`);
    }
    return { ok: true, mode: 'files' };
  }
}

function base64ToBlob(b64) {
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: 'image/png' });
}

export function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}