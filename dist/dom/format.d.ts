/**
 * Money formatting for the DOM kit.
 *
 * The SDK is major-unit throughout (a $4.30 product has `price === 4.3`), matching
 * the catalogue adapter and the FleekSite kit. We format via `Intl.NumberFormat`,
 * doing the multiply in integer minor units so `0.1 + 0.2` never reaches a customer,
 * then converting back to major for display.
 */
/** Major units → integer minor units (cents). */
export declare function toMinor(major: number | string | null | undefined): number;
/** Integer minor units → major units. */
export declare function toMajor(minor: number): number;
/**
 * Format a major-unit amount as currency. Falls back to `CODE 0.00` when the
 * runtime lacks `Intl` support for the currency/locale.
 */
export declare function money(amountMajor: number, currency?: string, locale?: string): string;
//# sourceMappingURL=format.d.ts.map