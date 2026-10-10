import type { EnergyPeriod, HomeAssistant, PeriodValues, StatisticsResult, StatPeriod } from "../types";

/** Sum `change` per statistic id. See PeriodValues for the 0 / null rules. */
export function sumChanges(
  result: StatisticsResult,
  ids: string[],
  entityExists: (id: string) => boolean,
): PeriodValues {
  const values: PeriodValues = {};
  for (const id of ids) {
    const rows = result && Object.prototype.hasOwnProperty.call(result, id) ? result[id] : undefined;
    let sum = 0;
    let count = 0;
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const change = row?.change;
        if (typeof change === "number" && Number.isFinite(change)) {
          sum += change;
          count += 1;
        }
      }
    }
    values[id] = count > 0 ? sum : entityExists(id) ? 0 : null;
  }
  return values;
}

/** Fetch `recorder/statistics_during_period` (types ["change"]) for the period and sum it. */
export async function fetchPeriodValues(
  hass: HomeAssistant,
  ids: string[],
  period: EnergyPeriod,
  statPeriod: StatPeriod,
): Promise<PeriodValues> {
  if (ids.length === 0) return {};
  const message: Record<string, unknown> = {
    type: "recorder/statistics_during_period",
    start_time: period.start.toISOString(),
  };
  // The picker's inclusive end (23:59:59.999) is passed as is; omitted means "until now".
  if (period.end !== undefined) message.end_time = period.end.toISOString();
  message.statistic_ids = ids;
  message.period = statPeriod;
  message.types = ["change"];
  message.units = { energy: "kWh" };
  const result = await hass.callWS<StatisticsResult>(message);
  return sumChanges(result, ids, (id) => hass.states[id] !== undefined);
}
