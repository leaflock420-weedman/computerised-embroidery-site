/** Guide pricing — final quote may vary by size/complexity */
export const PRICING = {
  digitizing: {
    label: 'Logo digitizing (one-off)',
    amount: 45,
    note: 'Usually ~$45 depending on logo size & complexity. Charged once per unique design.',
  },
  embroidery: {
    label: 'Embroidery per garment',
    amount: 15,
    note: 'Usually ~$15 per piece depending on stitch count & size. After digitizing is done.',
  },
  minDpi: 300,
  recommendedWidthMm: 100,
};

export function estimateOrderTotal({ qty, positions = 1, newLogo = true }) {
  const digitize = newLogo ? PRICING.digitizing.amount : 0;
  const stitch = PRICING.embroidery.amount * qty * positions;
  return { digitize, stitch, total: digitize + stitch, qty, positions };
}

export function formatPricingSummary(opts) {
  const { digitize, stitch, total, qty, positions } = estimateOrderTotal(opts);
  const lines = [
    `Guide pricing (garments quoted separately):`,
    newLogoLine(digitize),
    `Embroidery: $${PRICING.embroidery.amount} × ${qty} garments × ${positions} position(s) = $${stitch}`,
    `Estimated decoration total: $${total}`,
    `Final pricing confirmed on quote — may be less or more depending on logo size.`,
  ];
  return lines.join('\n');
}

function newLogoLine(digitize) {
  if (!digitize) return 'Digitizing: $0 (reusing existing digitized logo)';
  return `Digitizing (one-off): $${digitize}`;
}