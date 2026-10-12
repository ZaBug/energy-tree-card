import { describe, expect, it } from "vitest";
import { buildEnergyTree } from "../src/data/tree";
import type { EnergyTree, PeriodValues } from "../src/types";
import { resolveTap, tapEntity } from "../src/ui/tap";
import { august2026Values, E, findNode, makeConfig, ownerOptions } from "./helpers";

/** The owner's config with live power on Casa, Home and the solar source. */
function tree(values: PeriodValues = august2026Values()): EnergyTree {
  const options = ownerOptions();
  const config = makeConfig(
    {
      ...options,
      sources: { ...options.sources, solar: { energy: E.solar, power: "sensor.solar_power" } },
      home: { name: "Consum total", power: "sensor.home_power" },
    },
    "ro",
  );
  return buildEnergyTree(config, values);
}

const moreInfo = (entity: string) => ({
  type: "action",
  detail: { config: { entity, tap_action: { action: "more-info", entity } }, action: "tap" },
});

describe("tapEntity", () => {
  it("prefers the power sensor, else the energy sensor, else nothing", () => {
    const t = tree();
    expect(tapEntity(findNode(t, "casa"))).toBe("sensor.casa_power");
    expect(tapEntity(findNode(t, "ac"))).toBe(E.ac);
    expect(tapEntity(findNode(t, "rest:casa"))).toBeUndefined();
    expect(tapEntity(findNode(t, "home"))).toBe("sensor.home_power");
  });
});

describe("resolveTap: defaults", () => {
  it("opens more-info for the power sensor of a measured consumer", () => {
    expect(resolveTap(findNode(tree(), "casa"))).toStrictEqual(moreInfo("sensor.casa_power"));
  });

  it("opens more-info for the energy sensor when there is no power sensor", () => {
    expect(resolveTap(findNode(tree(), "masina"))).toStrictEqual(moreInfo(E.masina));
  });

  it("opens more-info for sources", () => {
    const t = tree();
    expect(resolveTap(findNode(t, "solar"))).toStrictEqual(moreInfo("sensor.solar_power"));
    expect(resolveTap(findNode(t, "grid_export"))).toStrictEqual(moreInfo(E.gridExport));
  });

  it("explains Home (even with a power sensor), Rest and Untracked", () => {
    const t = tree();
    for (const id of ["home", "rest:casa", "untracked"]) expect(resolveTap(findNode(t, id))).toStrictEqual({ type: "explain" });
  });

  it("explains a measured node whose energy shows the placeholder", () => {
    const values = august2026Values();
    delete values[E.casuta];
    delete values[E.solar];
    const t = tree(values);
    expect(resolveTap(findNode(t, "casuta"))).toStrictEqual({ type: "explain" });
    expect(resolveTap(findNode(t, "solar"))).toStrictEqual({ type: "explain" });
  });

  it("opens more-info for a measured node with 0 kWh (0 is a value, not a placeholder)", () => {
    expect(resolveTap(findNode(tree({ ...august2026Values(), [E.server]: 0 }), "server"))).toStrictEqual(moreInfo(E.server));
  });
});
