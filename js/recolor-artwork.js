/** Recolour uploaded artwork — hue shift or replace dominant ink/outline colour. */

function parseHex(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      default: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s, l];
}

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = l - c / 2;
  let r = 0; let g = 0; let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

function luminance(r, g, b) {
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

function colorDist(r1, g1, b1, r2, g2, b2) {
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
}

/** Find the main ink/outline colour (ignores transparent + near-white background). */
export function detectInkColor(imageData) {
  const d = imageData.data;
  const buckets = new Map();

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 20) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (luminance(r, g, b) > 0.92) continue;
    const key = `${Math.round(r / 10)},${Math.round(g / 10)},${Math.round(b / 10)}`;
    const prev = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    prev.count += 1;
    prev.r += r;
    prev.g += g;
    prev.b += b;
    buckets.set(key, prev);
  }

  let best = null;
  for (const bucket of buckets.values()) {
    const avgLum = luminance(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count);
    const score = bucket.count * (1 - avgLum * 0.35);
    if (!best || score > best.score) {
      best = {
        score,
        r: Math.round(bucket.r / bucket.count),
        g: Math.round(bucket.g / bucket.count),
        b: Math.round(bucket.b / bucket.count),
      };
    }
  }

  return best ? [best.r, best.g, best.b] : [30, 41, 59];
}

function replaceInkPixels(d, ink, target, tolerance, mix) {
  const [ir, ig, ib] = ink;
  const [tr, tg, tb] = target;
  const inkLum = Math.max(0.08, luminance(ir, ig, ib));

  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 8) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];
    if (colorDist(r, g, b, ir, ig, ib) > tolerance) continue;

    const rel = luminance(r, g, b) / inkLum;
    const shade = Math.max(0.2, Math.min(1.15, 0.3 + rel * 0.7));
    const nr = Math.round(tr * shade);
    const ng = Math.round(tg * shade);
    const nb = Math.round(tb * shade);

    d[i] = Math.round(r + (nr - r) * mix);
    d[i + 1] = Math.round(g + (ng - g) * mix);
    d[i + 2] = Math.round(b + (nb - b) * mix);
  }
}

/**
 * @param {HTMLImageElement} img source (original or bg-removed)
 * @param {{ mode: 'none'|'hue'|'solid', hue?: number, color?: string, intensity?: number, inkColor?: number[] }} opts
 */
export function recolorArtwork(img, opts = {}) {
  const { mode = 'none', hue = 0, color = '#1e293b', intensity = 100 } = opts;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  if (mode === 'none') return canvas;

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const mix = Math.max(0, Math.min(100, intensity)) / 100;
  const [tr, tg, tb] = parseHex(color);

  if (mode === 'solid') {
    const ink = opts.inkColor || detectInkColor(imageData);
    const tol = 55 + (100 - intensity) * 0.35;
    replaceInkPixels(d, ink, [tr, tg, tb], tol, mix);
  } else if (mode === 'hue') {
    for (let i = 0; i < d.length; i += 4) {
      const a = d[i + 3];
      if (a < 8) continue;
      const r = d[i];
      const g = d[i + 1];
      const b = d[i + 2];
      const [oh, os, ol] = rgbToHsl(r, g, b);
      const [nr, ng, nb] = hslToRgb(oh + hue, os, ol);
      d[i] = Math.round(r + (nr - r) * mix);
      d[i + 1] = Math.round(g + (ng - g) * mix);
      d[i + 2] = Math.round(b + (nb - b) * mix);
    }
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

export function recolorArtworkToImage(img, opts) {
  const canvas = recolorArtwork(img, opts);
  return new Promise((resolve, reject) => {
    const out = new Image();
    out.onload = () => resolve(out);
    out.onerror = reject;
    out.src = canvas.toDataURL('image/png');
  });
}