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

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// "2026-12-01" -> "Dec 1". Plain text work, so no time zone can move the day. The backend
// writes the notification with the same rule, so the preview shows what members get.
export function formatDueDate(isoDate: string): string {
  const [, month, day] = isoDate.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}
