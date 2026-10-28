const formatters = new Map<string, Intl.NumberFormat>();

export function formatNumber(locale: string, value: number, digits = 0): string {
  const key = `${locale}:${digits}`;
  let formatter = formatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits });
    formatters.set(key, formatter);
  }
  // Avoid showing "-0" for tiny negative values.
  return formatter.format(Number(value.toFixed(digits)) || 0);
}

export const formatBearing = (degrees: number): string => `${String(Math.round(degrees) % 360).padStart(3, '0')}°`;

export function formatDistance(locale: string, metres: number): string {
  return metres >= 1000 ? `${formatNumber(locale, metres / 1000, 2)} km` : `${formatNumber(locale, metres)} m`;
}
