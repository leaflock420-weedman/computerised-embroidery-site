/** Recolour uploaded artwork — hue shift or solid thread colour. */

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

/**
 * @param {HTMLImageElement} img source (original or bg-removed)
 * @param {{ mode: 'none'|'hue'|'solid', hue?: number, color?: string, intensity?: number }} opts
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

  for (let i = 0; i < d.length; i += 4) {
    const a = d[i + 3];
    if (a < 8) continue;
    const r = d[i];
    const g = d[i + 1];
    const b = d[i + 2];

    let nr = r;
    let ng = g;
    let nb = b;

    if (mode === 'hue') {
      const [oh, os, ol] = rgbToHsl(r, g, b);
      const nh = oh + hue;
      [nr, ng, nb] = hslToRgb(nh, os, ol);
    } else if (mode === 'solid') {
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      const shade = 0.25 + lum * 0.75;
      nr = Math.round(tr * shade);
      ng = Math.round(tg * shade);
      nb = Math.round(tb * shade);
    }

    d[i] = Math.round(r + (nr - r) * mix);
    d[i + 1] = Math.round(g + (ng - g) * mix);
    d[i + 2] = Math.round(b + (nb - b) * mix);
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