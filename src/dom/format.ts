/**
 * Money formatting for the DOM kit.
 *
 * The SDK is major-unit throughout (a $4.30 product has `price === 4.3`), matching
 * the catalogue adapter and the FleekSite kit. We format via `Intl.NumberFormat`,
 * doing the multiply in integer minor units so `0.1 + 0.2` never reaches a customer,
 * then converting back to major for display.
 */

/** Major units → integer minor units (cents). */
export function toMinor(major: number | string | null | undefined): number {
  return Math.round(Number(major || 0) * 100);
}

/** Integer minor units → major units. */
export function toMajor(minor: number): number {
  return minor / 100;
}

/**
 * Format a major-unit amount as currency. Falls back to `CODE 0.00` when the
 * runtime lacks `Intl` support for the currency/locale.
 */
export function money(amountMajor: number, currency = 'USD', locale = 'en'): string {
  const minor = toMinor(amountMajor);
  try {
    return new Intl.NumberFormat(locale || 'en', {
      style: 'currency',
      currency: currency || 'USD',
    }).format(toMajor(minor));
  } catch (_e) {
    return `${currency || 'USD'} ${toMajor(minor).toFixed(2)}`;
  }
}
