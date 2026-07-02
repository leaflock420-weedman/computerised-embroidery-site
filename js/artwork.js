import { PRICING } from './pricing.js';

const API_BASE = ''; // same origin when served via server.js

export async function validateArtworkFile(file) {
  const warnings = [];
  const errors = [];

  const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'application/pdf'];
  if (!allowed.includes(file.type) && !file.name.match(/\.(ai|eps)$/i)) {
    errors.push('Please upload PNG, JPG, PDF, SVG, AI or EPS.');
  }
  if (file.size > 25 * 1024 * 1024) {
    errors.push('File must be under 25 MB.');
  }

  let width = 0, height = 0, dpi = null;
  if (file.type.startsWith('image/') && file.type !== 'image/svg+xml') {
    const dims = await readImageDimensions(file);
    width = dims.width;
    height = dims.height;
    dpi = estimateDpi(file, dims);
    if (dpi && dpi < PRICING.minDpi) {
      warnings.push(`Image appears to be ~${dpi} DPI. We recommend ${PRICING.minDpi} DPI for sharp embroidery.`);
    }
    if (width < 800) {
      warnings.push('Image may be too small — aim for at least 1200px on the longest side at 300 DPI.');
    }
  }

  return { ok: !errors.length, errors, warnings, width, height, dpi, fileName: file.name };
}

function readImageDimensions(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

function estimateDpi(file, { width }) {
  // Common embroidery logo target ~100mm wide; if user intended that, infer DPI
  const targetWidthInches = PRICING.recommendedWidthMm / 25.4;
  return Math.round(width / targetWidthInches);
}

export async function uploadArtwork(file, meta = {}) {
  const fd = new FormData();
  fd.append('artwork', file);
  fd.append('meta', JSON.stringify(meta));

  const res = await fetch(`${API_BASE}/api/upload-artwork`, { method: 'POST', body: fd });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Upload failed — is the server running?');
  }
  return res.json();
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}