// Whole dollars read cleaner ($50). When there are cents, always show both digits ($1,250.50,
// never $1,250.5).
export function formatMoney(amount: number): string {
  const digits = Number.isInteger(amount) ? 0 : 2;
  return amount.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

// A percentage or a gap in points without a trailing ".0": 78 -> "78", 62.5 -> "62.5".
export function formatNumber(value: number): string {
  return String(Math.round(value * 10) / 10);
}
