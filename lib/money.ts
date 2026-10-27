/**
 * Money Utilities (`lib/money.ts`)
 * Decision 11: Money is stored as integer paise and shown in rupees with Indian digit grouping (e.g. ₹1,50,000).
 */

const inrFormatterWhole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const inrFormatterDecimal = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * Formats integer paise into Indian Rupee string with en-IN digit grouping.
 * Example: 15000000 -> "₹1,50,000"
 * Example: 150050 -> "₹1,500.50"
 */
export function formatPaiseToINR(paise: number): string {
  if (!Number.isFinite(paise) || !Number.isInteger(paise)) {
    throw new Error(`Invalid paise amount: must be a safe integer, got ${paise}`);
  }
  const rupees = paise / 100;
  if (paise % 100 === 0) {
    return inrFormatterWhole.format(rupees);
  }
  return inrFormatterDecimal.format(rupees);
}

/**
 * Converts a user-entered rupee amount (number or string) to exact integer paise.
 * Rejects negative, zero, NaN, or >2 decimal places.
 */
export function parseRupeesToPaise(rupeesInput: string | number): number {
  const str = typeof rupeesInput === 'number' ? String(rupeesInput) : rupeesInput.trim().replace(/,/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Invalid rupee input: "${rupeesInput}"`);
  }
  const num = Number(str);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Rupee amount must be positive: "${rupeesInput}"`);
  }
  const paise = Math.round(num * 100);
  if (!Number.isSafeInteger(paise) || paise <= 0) {
    throw new Error(`Paise conversion out of safe integer bounds: ${paise}`);
  }
  return paise;
}

/**
 * Formats game points quantity with Indian grouping (e.g., 50,000 PTS).
 */
export function formatPointsQty(points: number): string {
  return `${new Intl.NumberFormat('en-IN').format(points)} PTS`;
}
