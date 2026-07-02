/** Remove solid/light backgrounds from uploaded artwork (client-side, real-time). */

function px(data, x, y, w) {
  const i = (y * w + x) * 4;
  return [data[i], data[i + 1], data[i + 2], data[i + 3]];
}

function setPx(data, x, y, w, r, g, b, a) {
  const i = (y * w + x) * 4;
  data[i] = r;
  data[i + 1] = g;
  data[i + 2] = b;
  data[i + 3] = a;
}

function colorDist(a, b) {
  return Math.sqrt(
    (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2,
  );
}

/** Sample background colour from image edges (corners + border). */
function detectBackgroundColor(imageData, w, h) {
  const d = imageData.data;
  const samples = [];
  const step = Math.max(2, Math.floor(Math.min(w, h) / 24));

  for (let x = 0; x < w; x += step) {
    samples.push(px(d, x, 0, w));
    samples.push(px(d, x, h - 1, w));
  }
  for (let y = step; y < h - step; y += step) {
    samples.push(px(d, 0, y, w));
    samples.push(px(d, w - 1, y, w));
  }

  // Pick the most common colour bucket (mode)
  const buckets = new Map();
  for (const s of samples) {
    const key = `${Math.round(s[0] / 16)},${Math.round(s[1] / 16)},${Math.round(s[2] / 16)}`;
    buckets.set(key, (buckets.get(key) || 0) + 1);
  }
  let bestKey = '';
  let bestCount = 0;
  for (const [k, c] of buckets) {
    if (c > bestCount) { bestKey = k; bestCount = c; }
  }
  const [br, bg, bb] = bestKey.split(',').map(n => parseInt(n, 10) * 16 + 8);
  return [br, bg, bb];
}

/**
 * Remove background pixels similar to edge colour.
 * @param {HTMLImageElement} img
 * @param {{ tolerance?: number, feather?: number }} opts
 * @returns {Promise<{ canvas: HTMLCanvasElement, dataUrl: string, blob: Blob }>}
 */
export async function removeBackground(img, { tolerance = 42, feather = 12 } = {}) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);

  const imageData = ctx.getImageData(0, 0, w, h);
  const d = imageData.data;
  const bg = detectBackgroundColor(imageData, w, h);
  const soft = Math.max(4, feather);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = px(d, x, y, w);
      const dist = colorDist(p, bg);
      if (dist <= tolerance) {
        setPx(d, x, y, w, p[0], p[1], p[2], 0);
      } else if (dist <= tolerance + soft) {
        const alpha = Math.round(255 * (dist - tolerance) / soft);
        setPx(d, x, y, w, p[0], p[1], p[2], Math.min(p[3], alpha));
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const dataUrl = canvas.toDataURL('image/png');
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  return { canvas, dataUrl, blob };
}

export function canvasToImage(canvas) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = canvas.toDataURL('image/png');
  });
}