/**
 * Money Utilities (`lib/money.ts`)
 * Money is stored as integer cents and displayed in US Dollars ($) with US digit grouping (e.g. $150,000).
 */

const usdFormatterWhole = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

const usdFormatterDecimal = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

/**
 * Formats integer cents into US Dollar string with en-US digit grouping.
 * Example: 15000000 -> "$150,000"
 * Example: 150050 -> "$1,500.50"
 */
export function formatPaiseToINR(cents: number): string {
  if (!Number.isFinite(cents) || !Number.isInteger(cents)) {
    throw new Error(`Invalid cents amount: must be a safe integer, got ${cents}`);
  }
  const dollars = cents / 100;
  if (cents % 100 === 0) {
    return usdFormatterWhole.format(dollars);
  }
  return usdFormatterDecimal.format(dollars);
}

/**
 * Converts a user-entered dollar amount (number or string) to exact integer cents.
 * Rejects negative, zero, NaN, or >2 decimal places.
 */
export function parseRupeesToPaise(dollarsInput: string | number): number {
  const str = typeof dollarsInput === 'number' ? String(dollarsInput) : dollarsInput.trim().replace(/[$,]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(str)) {
    throw new Error(`Invalid dollar input: "${dollarsInput}"`);
  }
  const num = Number(str);
  if (!Number.isFinite(num) || num <= 0) {
    throw new Error(`Dollar amount must be positive: "${dollarsInput}"`);
  }
  const cents = Math.round(num * 100);
  if (!Number.isSafeInteger(cents) || cents <= 0) {
    throw new Error(`Cents conversion out of safe integer bounds: ${cents}`);
  }
  return cents;
}

/**
 * Formats game points quantity with US grouping (e.g., 50,000 PTS).
 */
export function formatPointsQty(points: number): string {
  return `${new Intl.NumberFormat('en-US').format(points)} PTS`;
}
