import { describe, expect, it, vi } from "vitest";
import { fetchPeriodValues, sumChanges } from "../src/data/statistics";
import type { HassEntityState, HomeAssistant, StatisticsResult, StatisticsRow } from "../src/types";

const HOUR = 3_600_000;

/** Rows one hour apart with the given changes. */
function rows(...changes: (number | null | undefined)[]): StatisticsRow[] {
  const start = new Date(2026, 7, 1).getTime();
  return changes.map((change, index) => {
    const row: StatisticsRow = { start: start + index * HOUR, end: start + (index + 1) * HOUR };
    if (change !== undefined) row.change = change;
    return row;
  });
}

const exists =
  (...ids: string[]) =>
  (id: string): boolean =>
    ids.includes(id);

function state(entityId: string): HassEntityState {
  return { entity_id: entityId, state: "0", attributes: {} };
}

/** Fake hass whose callWS resolves with the response (or rejects with it when it is an Error). */
function fakeHass(response: StatisticsResult | Error, existing: string[] = []) {
  const callWS = vi.fn(async (_message: Record<string, unknown>): Promise<unknown> => {
    if (response instanceof Error) throw response;
    return response;
  });
  const states: Record<string, HassEntityState> = {};
  for (const id of existing) states[id] = state(id);
  const hass = { states, connection: {}, config: {}, callWS } as unknown as HomeAssistant;
  return { hass, callWS };
}

describe("sumChanges", () => {
  it("sums the change of every row", () => {
    const values = sumChanges({ "sensor.a": rows(1.5, 2.25, 0.25) }, ["sensor.a"], exists("sensor.a"));
    expect(values["sensor.a"]).toBeCloseTo(4, 10);
  });

  it("sums negative changes too (costs and credits)", () => {
    const values = sumChanges({ "sensor.cost": rows(0.5, -1.25, -0.03) }, ["sensor.cost"], exists("sensor.cost"));
    expect(values["sensor.cost"]).toBeCloseTo(-0.78, 10);
  });

  it("ignores rows whose change is null, missing, NaN or infinite", () => {
    const result: StatisticsResult = {
      "sensor.a": rows(1, null, undefined, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 2),
    };
    expect(sumChanges(result, ["sensor.a"], exists("sensor.a"))).toStrictEqual({ "sensor.a": 3 });
  });

  it("gives 0 for an existing entity with no rows (empty list or absent from the result)", () => {
    const result: StatisticsResult = { "sensor.empty": [] };
    expect(sumChanges(result, ["sensor.empty", "sensor.absent"], exists("sensor.empty", "sensor.absent"))).toStrictEqual({
      "sensor.empty": 0,
      "sensor.absent": 0,
    });
  });

  it("gives 0 for an existing entity whose rows all have a null change", () => {
    expect(sumChanges({ "sensor.a": rows(null, null) }, ["sensor.a"], exists("sensor.a"))).toStrictEqual({ "sensor.a": 0 });
  });

  it("gives null for an entity that does not exist and has no rows", () => {
    const result: StatisticsResult = { "sensor.empty": [] };
    expect(sumChanges(result, ["sensor.empty", "sensor.absent"], exists())).toStrictEqual({
      "sensor.empty": null,
      "sensor.absent": null,
    });
  });

  it("keeps the sum of an entity that no longer exists but has statistics in the range", () => {
    expect(sumChanges({ "sensor.old": rows(2, 3) }, ["sensor.old"], exists())).toStrictEqual({ "sensor.old": 5 });
    expect(sumChanges({ "sensor.old": rows(0) }, ["sensor.old"], exists())).toStrictEqual({ "sensor.old": 0 });
  });

  it("returns exactly the requested ids and ignores extra ids in the result", () => {
    const result: StatisticsResult = { "sensor.a": rows(1), "sensor.extra": rows(9) };
    const values = sumChanges(result, ["sensor.a", "sensor.b"], exists("sensor.b"));
    expect(Object.keys(values)).toEqual(["sensor.a", "sensor.b"]);
    expect(values).toStrictEqual({ "sensor.a": 1, "sensor.b": 0 });
  });
});

describe("fetchPeriodValues", () => {
  const ids = ["sensor.principal_energy", "sensor.principal_energy_cost", "sensor.casa_energy"];
  // August 2026 as set by the date picker, Bucharest local time (UTC+3).
  const august = { start: new Date(2026, 7, 1, 0, 0, 0, 0), end: new Date(2026, 7, 31, 23, 59, 59, 999) };

  it("sends recorder/statistics_during_period with ISO times, ids, period, types [change] and units kWh", async () => {
    const { hass, callWS } = fakeHass({}, ids);
    await fetchPeriodValues(hass, ids, august, "day");
    expect(callWS).toHaveBeenCalledTimes(1);
    expect(callWS.mock.calls[0][0]).toStrictEqual({
      type: "recorder/statistics_during_period",
      start_time: "2026-07-31T21:00:00.000Z",
      end_time: "2026-08-31T20:59:59.999Z",
      statistic_ids: ids,
      period: "day",
      types: ["change"],
      units: { energy: "kWh" },
    });
  });

  it("passes the statistics period through (hour, day, month)", async () => {
    for (const period of ["hour", "day", "month"] as const) {
      const { hass, callWS } = fakeHass({}, ids);
      await fetchPeriodValues(hass, ids, august, period);
      expect(callWS.mock.calls[0][0].period).toBe(period);
    }
  });

  it("leaves out the end_time key when the period has no end", async () => {
    const { hass, callWS } = fakeHass({}, ids);
    await fetchPeriodValues(hass, ids, { start: august.start }, "hour");
    const message = callWS.mock.calls[0][0];
    expect("end_time" in message).toBe(false);
    expect(message.start_time).toBe("2026-07-31T21:00:00.000Z");
  });

  it("returns the summed changes, 0 for existing entities without rows and null for unknown ones", async () => {
    const response: StatisticsResult = {
      "sensor.principal_energy": rows(1.25, 2.5, null),
      "sensor.principal_energy_cost": [],
    };
    const { hass } = fakeHass(response, ["sensor.principal_energy", "sensor.principal_energy_cost"]);
    await expect(fetchPeriodValues(hass, ids, august, "day")).resolves.toStrictEqual({
      "sensor.principal_energy": 3.75,
      "sensor.principal_energy_cost": 0,
      "sensor.casa_energy": null,
    });
  });

  it("does not call the API for an empty id list and returns {}", async () => {
    const { hass, callWS } = fakeHass({});
    await expect(fetchPeriodValues(hass, [], august, "day")).resolves.toStrictEqual({});
    expect(callWS).not.toHaveBeenCalled();
  });

  it("propagates a callWS error", async () => {
    const error = new Error("Unknown command");
    const { hass } = fakeHass(error, ids);
    await expect(fetchPeriodValues(hass, ids, august, "day")).rejects.toBe(error);
  });
});
