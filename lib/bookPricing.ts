// ── Single source of truth for memory book pricing ────────────────────────────
// Gelato costs confirmed from dashboard, May 2026. Delivery to Canada, 30 pages.
// Formula: (product + shipping) × 1.7  — shipping is inside the markup.
//
// Confirmed available combinations:
//   Softcover (vertical only): 5.5×5.5", 8×8", 8×11"
//   Hardcover (vertical):      8×8", 8×11", 11×11"
//   Hardcover (horizontal):    8×11" only

const MARKUP     = 0.70; // 70% markup on (product + shipping)
const CAD_TO_USD = 1.20; // locked conversion rate: 1 USD = 1.20 CAD (we always win on FX)

// Gelato costs in CAD cents — verified from Gelato dashboard May 2026
// (stored in CAD; converted to USD at runtime using CAD_TO_USD rate)
export const GELATO_COSTS_CAD: Record<string, Record<string, { product: number; shipping: number }>> = {
  softcover: {
    '5.5x5.5': { product: 1025, shipping: 923 },  // $10.25 + $9.23
    '8x8':     { product: 1332, shipping: 923 },  // $13.32 + $9.23
    '8x11':    { product: 1359, shipping: 923 },  // $13.59 + $9.23
  },
  hardcover: {
    '8x8':   { product: 1757, shipping: 923 },  // $17.57 + $9.23
    '8x11':  { product: 1772, shipping: 923 },  // $17.72 + $9.23
    '11x11': { product: 2292, shipping: 923 },  // $22.92 + $9.23
  },
};

// Gelato per-2-page product cost in CAD cents (verified May 2026, shipping unchanged)
export const PAGE_INCREMENT_CAD: Record<string, Record<string, number>> = {
  softcover: { '5.5x5.5': 26, '8x8': 39, '8x11': 44 },
  hardcover: { '8x8': 45, '8x11': 60, '11x11': 97 },
};

// Softcover is only available for these size+orientation combos
const SOFTCOVER_VALID = new Set(['5.5x5.5_portrait', '8x8_portrait', '8x11_portrait']);

/** Returns true if softcover is a valid option for this size + orientation. */
export function isSoftcoverAvailable(bookSize: string, orientation: string): boolean {
  return SOFTCOVER_VALID.has(`${bookSize}_${orientation}`);
}

/**
 * Applies markup and rounds to nearest .99 (retail pricing feel).
 * Input is the total Gelato cost in USD cents (product + shipping).
 * e.g. (1359 + 923) × 1.7 = 3879 → $38.99
 */
export function markupPrice(totalCents: number): number {
  const marked = Math.ceil(totalCents * (1 + MARKUP));
  return Math.ceil(marked / 100) * 100 - 1;
}

/**
 * Returns the customer-facing price in USD cents for a given cover type, book size, and page count.
 * Formula: (product_cad(pages) + shipping_cad) / 1.20 × 1.70
 * Shipping is flat regardless of page count. Only product cost scales.
 * Falls back to hardcover 8×11 if combination is unknown.
 */
export function getBookPrice(coverType: string, bookSize: string, pageCount = 30): number {
  const ct        = coverType === 'hardcover' ? 'hardcover' : 'softcover';
  const costs     = GELATO_COSTS_CAD[ct]?.[bookSize] ?? GELATO_COSTS_CAD.hardcover['8x11'];
  const increment = PAGE_INCREMENT_CAD[ct]?.[bookSize] ?? PAGE_INCREMENT_CAD.hardcover['8x11'];
  const extraPages = Math.max(0, pageCount - 30);
  const productCad = costs.product + (extraPages / 2) * increment;
  const totalCad   = productCad + costs.shipping;
  const totalUsd   = Math.round(totalCad / CAD_TO_USD);
  return markupPrice(totalUsd);
}
