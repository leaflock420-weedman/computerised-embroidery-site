/** Parse garment/thread colour from name or HEX (#RRGGBB or RRGGBB). */

export function parseHexInput(value) {
  if (!value) return null;
  const v = String(value).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{6}$/.test(v)) return `#${v.toUpperCase()}`;
  if (/^[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v.split('').map(c => c + c).join('').toUpperCase()}`;
  }
  return null;
}

export function isHexInput(value) {
  return !!parseHexInput(value);
}

export function hexToRgb(hex) {
  const h = parseHexInput(hex);
  if (!h) return null;
  const n = h.slice(1);
  return [
    parseInt(n.slice(0, 2), 16),
    parseInt(n.slice(2, 4), 16),
    parseInt(n.slice(4, 6), 16),
  ];
}

export function colourNameFromHex(hex, swatches = []) {
  const h = parseHexInput(hex);
  if (!h) return null;
  const match = swatches.find(s => s.hex.toUpperCase() === h);
  return match?.name || h;
}