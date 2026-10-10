import type { EnergyPeriod, StatPeriod } from "../types";

/** Statistics period for a date range, same rule as the HA frontend energy collection. */
export function statisticsPeriod(start: Date, end: Date | undefined, now: Date = new Date()): StatPeriod {
  void start;
  void end;
  void now;
  throw new Error("statisticsPeriod: not implemented");
}

/** Fallback range when no Energy date picker exists: today, local 00:00 to 23:59:59.999. */
export function todayPeriod(now: Date = new Date()): EnergyPeriod {
  void now;
  throw new Error("todayPeriod: not implemented");
}
