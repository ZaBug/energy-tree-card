import type { EnergyPeriod, HomeAssistant, PeriodValues, StatisticsResult, StatPeriod } from "../types";

/** Sum `change` per statistic id. See PeriodValues for the 0 / null rules. */
export function sumChanges(
  result: StatisticsResult,
  ids: string[],
  entityExists: (id: string) => boolean,
): PeriodValues {
  void result;
  void ids;
  void entityExists;
  throw new Error("sumChanges: not implemented");
}

/** Fetch `recorder/statistics_during_period` (types ["change"]) for the period and sum it. */
export async function fetchPeriodValues(
  hass: HomeAssistant,
  ids: string[],
  period: EnergyPeriod,
  statPeriod: StatPeriod,
): Promise<PeriodValues> {
  void hass;
  void ids;
  void period;
  void statPeriod;
  throw new Error("fetchPeriodValues: not implemented");
}
