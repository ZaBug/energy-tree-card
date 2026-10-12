import { describe, expect, it } from "vitest";
import { buildEnergyTree } from "../src/data/tree";
import type { EnergyTreeCardConfig, PeriodValues, SourceConfig } from "../src/types";
import { allNodes, august2026Values, E, findNode, makeConfig, ownerConfig, ownerOptions } from "./helpers";

type Options = Omit<EnergyTreeCardConfig, "type">;

interface SourceSetup {
  solar?: "energy" | "cost";
  gridImport?: "energy" | "cost";
  gridExport?: "energy" | "cost";
}

/** Sources with only an energy sensor ("energy") or also a cost sensor ("cost"); absent = not configured. */
function sources(setup: SourceSetup): Options["sources"] {
  const source = (energy: string, cost: string, mode: "energy" | "cost"): SourceConfig =>
    mode === "cost" ? { energy, cost } : { energy };
  const result: Options["sources"] = {};
  if (setup.solar) result.solar = source("sensor.solar", "sensor.solar_cost", setup.solar);
  if (setup.gridImport) result.grid_import = source("sensor.import", "sensor.import_cost", setup.gridImport);
  if (setup.gridExport) result.grid_export = source("sensor.export", "sensor.export_compensation", setup.gridExport);
  return result;
}

const SOURCE_VALUES: PeriodValues = {
  "sensor.solar": 10,
  "sensor.solar_cost": 3,
  "sensor.import": 7,
  "sensor.import_cost": 8.4,
  "sensor.export": 4,
  "sensor.export_compensation": 1.8,
};

function sourceTree(setup: SourceSetup, overrides: PeriodValues = {}) {
  return buildEnergyTree(makeConfig({ sources: sources(setup) }), { ...SOURCE_VALUES, ...overrides });
}

/**
 * The owner's config in a month with more export than import: the net bill is negative
 * and so are the consumers' monthly shares.
 *   Home: 20.00 - 35.00 = -15.00 RON
 *   Casa -0.72 (AC -0.19, Server -0.08), Căsuță -0.05, Mașină -14.00
 *   Rest Casa: 90 kWh at Casa's average price: -0.72 × 90 / 150 = -0.432
 *   Nemăsurat: 40 kWh at Home's average price: -15.00 × 40 / 300 = -2.00
 */
function negativeMonthValues(overrides: PeriodValues = {}): PeriodValues {
  return {
    [E.solar]: 400,
    [E.gridImport]: 50,
    [E.gridImportCost]: 20.0,
    [E.gridExport]: 150,
    [E.gridExportCompensation]: 35.0,
    [E.casa]: 150,
    [E.casaCost]: -0.72,
    [E.ac]: 40,
    [E.acCost]: -0.19,
    [E.server]: 20,
    [E.serverCost]: -0.08,
    [E.casuta]: 10,
    [E.casutaCost]: -0.05,
    [E.masina]: 100,
    [E.masinaCost]: -14.0,
    ...overrides,
  };
}

/** Owner's options with the cost sensor removed from the given consumers. */
function ownerWithoutCost(...ids: string[]): Options {
  const options = ownerOptions();
  options.nodes = (options.nodes ?? []).map((node) => {
    if (!ids.includes(node.id)) return node;
    const copy = { ...node };
    delete copy.cost;
    return copy;
  });
  return options;
}

describe("source costs", () => {
  it("grid import cost is the summed cost statistic", () => {
    const node = findNode(sourceTree({ gridImport: "cost" }), "grid_import");
    expect(node.cost).toBe(8.4);
    expect(node.hasCost).toBe(true);
  });

  it("grid export compensation is negated and shown as a credit (1.8 -> -1.8)", () => {
    const node = findNode(sourceTree({ gridImport: "cost", gridExport: "cost" }), "grid_export");
    expect(node.cost).toBe(-1.8);
    expect(node.hasCost).toBe(true);
  });

  it("a grid export compensation of 0 gives cost 0, not -0", () => {
    const node = findNode(
      sourceTree({ gridImport: "cost", gridExport: "cost" }, { "sensor.export_compensation": 0 }),
      "grid_export",
    );
    expect(Object.is(node.cost, 0)).toBe(true);
  });

  it("a solar cost is shown on the solar node as is", () => {
    const node = findNode(sourceTree({ solar: "cost", gridImport: "cost" }), "solar");
    expect(node.cost).toBe(3);
    expect(node.hasCost).toBe(true);
  });

  it("a source without cost has hasCost false and cost null", () => {
    const tree = sourceTree({ solar: "energy", gridImport: "energy", gridExport: "energy" });
    for (const node of tree.sources) {
      expect(node.hasCost).toBe(false);
      expect(node.cost).toBeNull();
    }
  });

  it("a configured source cost without a value keeps hasCost true with cost null", () => {
    const tree = sourceTree(
      { gridImport: "cost", gridExport: "cost" },
      { "sensor.import_cost": null, "sensor.export_compensation": null },
    );
    expect(findNode(tree, "grid_import")).toMatchObject({ hasCost: true, cost: null });
    expect(findNode(tree, "grid_export")).toMatchObject({ hasCost: true, cost: null });
  });
});

describe("Home cost", () => {
  it("Home cost = grid import cost - grid export compensation (8.4 - 1.8 = 6.6)", () => {
    const { home } = sourceTree({ gridImport: "cost", gridExport: "cost" });
    expect(home.hasCost).toBe(true);
    expect(home.cost).toBeCloseTo(6.6, 10);
  });

  it("Home cost does not include the solar cost", () => {
    const { home } = sourceTree({ solar: "cost", gridImport: "cost", gridExport: "cost" });
    expect(home.cost).toBeCloseTo(6.6, 10);
  });

  it("Home has a cost with a grid import cost and no grid export source (= import cost)", () => {
    const { home } = sourceTree({ solar: "energy", gridImport: "cost" });
    expect(home.hasCost).toBe(true);
    expect(home.cost).toBe(8.4);
  });

  it("Home has no cost when grid export is configured without a compensation sensor", () => {
    const { home } = sourceTree({ gridImport: "cost", gridExport: "energy" });
    expect(home.hasCost).toBe(false);
    expect(home.cost).toBeNull();
  });

  it("Home has no cost when grid import has no cost sensor", () => {
    const { home } = sourceTree({ gridImport: "energy", gridExport: "cost" });
    expect(home.hasCost).toBe(false);
    expect(home.cost).toBeNull();
  });

  it("Home has no cost without a grid import source, even with solar and export costs", () => {
    const { home } = sourceTree({ solar: "cost", gridExport: "cost" });
    expect(home.hasCost).toBe(false);
    expect(home.cost).toBeNull();
  });

  it("Home cost is null (hasCost true) when the import cost or the compensation has no value", () => {
    const noImport = sourceTree({ gridImport: "cost", gridExport: "cost" }, { "sensor.import_cost": null });
    expect(noImport.home).toMatchObject({ hasCost: true, cost: null });

    const noCompensation = sourceTree({ gridImport: "cost", gridExport: "cost" }, { "sensor.export_compensation": null });
    expect(noCompensation.home).toMatchObject({ hasCost: true, cost: null });
  });

  it("a compensation of 0 leaves Home cost equal to the import cost", () => {
    const { home } = sourceTree({ gridImport: "cost", gridExport: "cost" }, { "sensor.export_compensation": 0 });
    expect(home.cost).toBe(8.4);
  });

  it("Home cost is negative when the compensation exceeds the import cost (20.00 - 35.00 = -15.00)", () => {
    const tree = buildEnergyTree(ownerConfig(), negativeMonthValues());
    expect(tree.home.cost).toBeCloseTo(-15, 10);
  });
});

describe("consumer costs", () => {
  it("a consumer with a cost sensor has hasCost true and the summed cost, including 0 and negative values", () => {
    const tree = buildEnergyTree(ownerConfig(), august2026Values());
    expect(findNode(tree, "casa")).toMatchObject({ hasCost: true, cost: 47.0 });
    expect(findNode(tree, "server")).toMatchObject({ hasCost: true, cost: 0 });
    const negative = buildEnergyTree(ownerConfig(), negativeMonthValues());
    expect(findNode(negative, "casa").cost).toBe(-0.72);
  });

  it("a consumer cost sensor without a value keeps hasCost true with cost null", () => {
    const values = august2026Values();
    delete values[E.casutaCost];
    const node = findNode(buildEnergyTree(ownerConfig(), values), "casuta");
    expect(node).toMatchObject({ hasCost: true, cost: null });
    expect(node.energy).toBeCloseTo(28.08, 2);
  });

  it("a consumer without a cost sensor has hasCost false and cost null", () => {
    const node = findNode(buildEnergyTree(makeConfig(ownerWithoutCost("casuta"), "ro"), august2026Values()), "casuta");
    expect(node).toMatchObject({ hasCost: false, cost: null });
  });

  it("a config without any cost sensor gives hasCost false and cost null on every node", () => {
    const config = makeConfig({
      sources: sources({ solar: "energy", gridImport: "energy", gridExport: "energy" }),
      nodes: [
        { id: "casa", name: "Casa", energy: "sensor.casa" },
        { id: "ac", parent: "casa", name: "AC", energy: "sensor.ac" },
      ],
    });
    const tree = buildEnergyTree(config, { ...SOURCE_VALUES, "sensor.casa": 5, "sensor.ac": 2 });
    const nodes = allNodes(tree);
    expect(nodes.map((node) => node.id)).toEqual([
      "solar",
      "grid_import",
      "grid_export",
      "home",
      "casa",
      "ac",
      "rest:casa",
      "untracked",
    ]);
    for (const node of nodes) expect(node).toMatchObject({ hasCost: false, cost: null });
  });
});

describe("Rest cost", () => {
  it("Rest cost = Rest energy at the parent's average price (-0.72 × 90 / 150 = -0.432)", () => {
    const rest = findNode(buildEnergyTree(ownerConfig(), negativeMonthValues()), "rest:casa");
    expect(rest.hasCost).toBe(true);
    expect(rest.cost).toBeCloseTo(-0.432, 10);
    expect(rest.energy).toBe(90);
  });

  it("Rest cost does not depend on the children's costs: a gap in a child's cost stays in that child", () => {
    const tree = buildEnergyTree(ownerConfig(), negativeMonthValues({ [E.acCost]: 5 }));
    expect(findNode(tree, "rest:casa").cost).toBeCloseTo(-0.432, 10);
  });

  it("Rest cost is 0 when Rest energy is clamped to 0", () => {
    const tree = buildEnergyTree(ownerConfig(), negativeMonthValues({ [E.ac]: 200 }));
    const rest = findNode(tree, "rest:casa");
    expect(rest.energy).toBe(0);
    expect(rest.cost).toBe(0);
  });

  it("Rest keeps its cost when a child has no cost sensor", () => {
    const tree = buildEnergyTree(makeConfig(ownerWithoutCost("server"), "ro"), negativeMonthValues());
    expect(findNode(tree, "rest:casa")).toMatchObject({ hasCost: true, energy: 90 });
    expect(findNode(tree, "rest:casa").cost).toBeCloseTo(-0.432, 10);
  });

  it("Rest has no cost when the parent has no cost sensor", () => {
    const tree = buildEnergyTree(makeConfig(ownerWithoutCost("casa"), "ro"), negativeMonthValues());
    expect(findNode(tree, "rest:casa")).toMatchObject({ hasCost: false, cost: null });
  });

  it("Rest cost is null (hasCost true) when the parent's cost or energy has no value", () => {
    const costMissing = buildEnergyTree(ownerConfig(), negativeMonthValues({ [E.casaCost]: null }));
    expect(findNode(costMissing, "rest:casa")).toMatchObject({ hasCost: true, cost: null });

    const energyMissing = buildEnergyTree(ownerConfig(), negativeMonthValues({ [E.casa]: null }));
    expect(findNode(energyMissing, "rest:casa")).toMatchObject({ hasCost: true, cost: null });
  });

  it("a child's cost without a value leaves the Rest cost unchanged", () => {
    const tree = buildEnergyTree(ownerConfig(), negativeMonthValues({ [E.acCost]: null }));
    expect(findNode(tree, "rest:casa").cost).toBeCloseTo(-0.432, 10);
  });
});

describe("Untracked cost", () => {
  it("Untracked cost = Untracked energy at Home's average price (-15.00 × 40 / 300 = -2.00)", () => {
    const untracked = findNode(buildEnergyTree(ownerConfig(), negativeMonthValues()), "untracked");
    expect(untracked.hasCost).toBe(true);
    expect(untracked.cost).toBeCloseTo(-2, 10);
    expect(untracked.energy).toBe(40);
  });

  it("Untracked cost does not depend on the consumers' costs: missing cost statistics do not move into it", () => {
    // Casa's cost statistics missing part of the month (October 2026 on the live instance).
    const tree = buildEnergyTree(ownerConfig(), negativeMonthValues({ [E.casaCost]: -10 }));
    expect(findNode(tree, "untracked").cost).toBeCloseTo(-2, 10);
  });

  it("Untracked has no cost when Home has no cost (grid export without compensation)", () => {
    const options = ownerOptions();
    options.sources = { ...options.sources, grid_export: { energy: E.gridExport } };
    const tree = buildEnergyTree(makeConfig(options, "ro"), negativeMonthValues());
    expect(tree.home.hasCost).toBe(false);
    expect(findNode(tree, "untracked")).toMatchObject({ hasCost: false, cost: null });
  });

  it("Untracked keeps its cost when a consumer has no cost sensor", () => {
    const tree = buildEnergyTree(makeConfig(ownerWithoutCost("masina", "ac"), "ro"), negativeMonthValues());
    expect(findNode(tree, "untracked").cost).toBeCloseTo(-2, 10);
  });

  it("Untracked cost is null (hasCost true) when the Home cost has no value, not when a consumer's has none", () => {
    const consumerMissing = buildEnergyTree(ownerConfig(), negativeMonthValues({ [E.casutaCost]: null }));
    expect(findNode(consumerMissing, "untracked").cost).toBeCloseTo(-2, 10);

    const homeMissing = buildEnergyTree(ownerConfig(), negativeMonthValues({ [E.gridImportCost]: null }));
    expect(homeMissing.home.cost).toBeNull();
    expect(findNode(homeMissing, "untracked")).toMatchObject({ hasCost: true, cost: null });
  });
});
