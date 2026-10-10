import type { EnergyPeriod, HassEntityState } from "../types";

/** Shown instead of a value that is unavailable. */
export const PLACEHOLDER = "—";

/** Non-breaking space (U+00A0) between a number and its unit, so the pair never wraps. */
const NBSP = String.fromCharCode(0xa0);

const numberFormats = new Map<string, Intl.NumberFormat>();

/** Cached Intl.NumberFormat with a fixed number of decimals; falls back to the default locale on a bad tag. */
function numberFormat(locale: string, decimals: number): Intl.NumberFormat {
  const key = `${locale}|${decimals}`;
  let format = numberFormats.get(key);
  if (!format) {
    const options: Intl.NumberFormatOptions = { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
    try {
      format = new Intl.NumberFormat(locale, options);
    } catch {
      format = new Intl.NumberFormat(undefined, options);
    }
    numberFormats.set(key, format);
  }
  return format;
}

/** Round half away from zero to the given decimals. Never returns -0. */
export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  const rounded = Math.round(Math.abs(value) * factor) / factor;
  if (!Number.isFinite(rounded)) return value;
  if (rounded === 0) return 0;
  return value < 0 ? -rounded : rounded;
}

/** Locale number with exactly `decimals` decimals; null for anything that is not a finite number. */
export function formatNumber(value: number | null | undefined, decimals: number, locale: string): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return numberFormat(locale, decimals).format(roundTo(value, decimals));
}

/** "47,00 RON" (currency after the number, omitted when empty); null when the value is not finite. */
export function formatCost(
  value: number | null | undefined,
  decimals: number,
  locale: string,
  currency: string,
): string | null {
  const number = formatNumber(value, decimals, locale);
  if (number === null) return null;
  return currency ? `${number}${NBSP}${currency}` : number;
}

const POWER_FACTORS: Record<string, number> = { W: 1, kW: 1_000, MW: 1_000_000 };

/** Live power of an entity in W, using its unit_of_measurement (W, kW or MW; anything else counts as W). */
export function powerWatts(state: HassEntityState | undefined): number | null {
  if (!state || typeof state.state !== "string") return null;
  const raw = state.state.trim();
  if (raw === "") return null;
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const unit = state.attributes?.unit_of_measurement;
  const factor = typeof unit === "string" ? (POWER_FACTORS[unit] ?? 1) : 1;
  return value * factor;
}

/** "389 W" below 1000 W, else "2,69 kW"; null when the entity is missing, unavailable or not numeric. */
export function formatPower(state: HassEntityState | undefined, locale: string): string | null {
  const watts = powerWatts(state);
  if (watts === null) return null;
  const rounded = roundTo(watts, 0);
  if (Math.abs(rounded) < 1000) return `${formatNumber(rounded, 0, locale)}${NBSP}W`;
  return `${formatNumber(watts / 1000, 2, locale)}${NBSP}kW`;
}

function isValidDate(date: unknown): date is Date {
  return date instanceof Date && Number.isFinite(date.getTime());
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "1–31 aug. 2026"; a single date when the period starts and ends on the same local day. */
export function formatPeriod(period: EnergyPeriod, locale: string, now: Date = new Date()): string {
  const start = period.start;
  const end = period.end ?? now;
  if (!isValidDate(start)) return "";
  const options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };
  let format: Intl.DateTimeFormat;
  try {
    format = new Intl.DateTimeFormat(locale, options);
  } catch {
    format = new Intl.DateTimeFormat(undefined, options);
  }
  if (!isValidDate(end) || end.getTime() <= start.getTime() || sameLocalDay(start, end)) return format.format(start);
  try {
    return format.formatRange(start, end);
  } catch {
    return `${format.format(start)} – ${format.format(end)}`;
  }
}
