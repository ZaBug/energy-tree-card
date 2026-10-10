import type { EnergyPeriod, StatPeriod } from "../types";

const MS_PER_DAY = 86_400_000;

/** Sign of later − earlier comparing local date and time fields (date-fns compareLocalAsc). */
function compareLocal(later: Date, earlier: Date): number {
  const diff =
    later.getFullYear() - earlier.getFullYear() ||
    later.getMonth() - earlier.getMonth() ||
    later.getDate() - earlier.getDate() ||
    later.getHours() - earlier.getHours() ||
    later.getMinutes() - earlier.getMinutes() ||
    later.getSeconds() - earlier.getSeconds() ||
    later.getMilliseconds() - earlier.getMilliseconds();
  return diff < 0 ? -1 : diff > 0 ? 1 : 0;
}

/** Local calendar days between the two dates, ignoring time of day (date-fns differenceInCalendarDays). */
export function differenceInCalendarDays(later: Date, earlier: Date): number {
  const laterDay = Date.UTC(later.getFullYear(), later.getMonth(), later.getDate());
  const earlierDay = Date.UTC(earlier.getFullYear(), earlier.getMonth(), earlier.getDate());
  return Math.round((laterDay - earlierDay) / MS_PER_DAY);
}

/** Full local days between the two dates, truncated toward zero (date-fns differenceInDays). */
export function differenceInDays(later: Date, earlier: Date): number {
  const sign = compareLocal(later, earlier);
  const difference = Math.abs(differenceInCalendarDays(later, earlier));
  const shifted = new Date(later.getTime());
  shifted.setDate(shifted.getDate() - sign * difference);
  // The last calendar day is not full when, on the same day, later's time of day is before earlier's.
  const lastDayNotFull = compareLocal(shifted, earlier) === -sign ? 1 : 0;
  const result = sign * (difference - lastDayNotFull);
  return result === 0 ? 0 : result;
}

/** True on the 1st of the local month. */
export function isFirstDayOfMonth(date: Date): boolean {
  return date.getDate() === 1;
}

/** True on the last calendar day of the local month. */
export function isLastDayOfMonth(date: Date): boolean {
  return date.getDate() === new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** Statistics period for a date range, same rule as the HA frontend energy collection. */
export function statisticsPeriod(start: Date, end: Date | undefined, now: Date = new Date()): StatPeriod {
  const days = differenceInDays(end ?? now, start);
  if (isFirstDayOfMonth(start) && (!end || isLastDayOfMonth(end)) && days > 35) return "month";
  return days > 2 ? "day" : "hour";
}

/** Fallback range when no Energy date picker exists: today, local 00:00 to 23:59:59.999. */
export function todayPeriod(now: Date = new Date()): EnergyPeriod {
  const year = now.getFullYear();
  const month = now.getMonth();
  const day = now.getDate();
  return {
    start: new Date(year, month, day, 0, 0, 0, 0),
    end: new Date(year, month, day, 23, 59, 59, 999),
  };
}
