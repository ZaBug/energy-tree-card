import { describe, expect, it } from "vitest";
import { buildEnergyTree } from "../src/data/tree";
import type { EnergyTree, EnergyTreeCardConfig, HassEntityState, Language, PeriodValues } from "../src/types";
import { explainNode, findParent, findTreeNode, type ExplainContext } from "../src/ui/explain";
import { august2026Values, E, findNode, makeConfig, ownerConfig, ownerOptions } from "./helpers";

type Options = Omit<EnergyTreeCardConfig, "type">;

/** Non-breaking space between a number and its currency (formatCost). */
const NB = String.fromCharCode(0xa0);

function context(language: Language, states: Record<string, HassEntityState> = {}): ExplainContext {
  return { language, locale: language, currency: "RON", kwhDecimals: 1, costDecimals: 2, states };
}

function power(entity: string, state: string): Record<string, HassEntityState> {
  return { [entity]: { entity_id: entity, state, attributes: { unit_of_measurement: "W" } } };
}

function ownerTree(overrides: PeriodValues = {}): EnergyTree {
  return buildEnergyTree(ownerConfig(), { ...august2026Values(), ...overrides });
}

function explain(tree: EnergyTree, id: string, ctx: ExplainContext = context("ro")): string[] {
  return explainNode(findNode(tree, id), tree, ctx);
}

/** Grid import 100: Casa 60 (AC 20, Server 15), Garaj 30, all with English labels. */
function familyTree(overrides: PeriodValues = {}, extra: Options = {}): EnergyTree {
  const config = makeConfig({
    sources: { grid_import: { energy: "sensor.import", cost: "sensor.import_cost" } },
    nodes: [
      { id: "casa", name: "Casa", energy: "sensor.casa", cost: "sensor.casa_cost" },
      { id: "ac", parent: "casa", name: "AC", energy: "sensor.ac" },
      { id: "server", parent: "casa", name: "Server", energy: "sensor.server" },
      { id: "garaj", name: "Garaj", energy: "sensor.garaj" },
    ],
    ...extra,
  });
  return buildEnergyTree(config, {
    "sensor.import": 100,
    "sensor.import_cost": 50,
    "sensor.casa": 60,
    "sensor.casa_cost": 30,
    "sensor.ac": 20,
    "sensor.server": 15,
    "sensor.garaj": 30,
    ...overrides,
  });
}

describe("findTreeNode / findParent", () => {
  it("finds sources, Home, consumers and automatic nodes by id", () => {
    const tree = ownerTree();
    expect(findTreeNode(tree, "grid_export")?.kind).toBe("grid_export");
    expect(findTreeNode(tree, "home")?.kind).toBe("home");
    expect(findTreeNode(tree, "server")?.name).toBe("Server");
    expect(findTreeNode(tree, "rest:casa")?.name).toBe("Rest Casa");
    expect(findTreeNode(tree, "untracked")?.name).toBe("Nemăsurat");
    expect(findTreeNode(tree, "nope")).toBeUndefined();
  });

  it("returns the parent below Home, nothing for sources and Home", () => {
    const tree = ownerTree();
    expect(findParent(tree, "rest:casa")?.id).toBe("casa");
    expect(findParent(tree, "casa")?.id).toBe("home");
    expect(findParent(tree, "solar")).toBeUndefined();
    expect(findParent(tree, "home")).toBeUndefined();
  });
});

describe("explainNode: Home", () => {
  it("shows the source formula with the period's numbers, and the cost (August 2026, ro)", () => {
    expect(explain(ownerTree(), "home")).toEqual([
      "Consum total = Solar + Import rețea − Export rețea = 1.079,6 + 315,7 − 605,4 = 789,9 kWh",
      `Cost = Import rețea − Export rețea = 350,42 − 272,44 = 77,98${NB}RON`,
    ]);
  });

  it("uses only the configured sources (en)", () => {
    const tree = familyTree();
    expect(explain(tree, "home", context("en"))).toEqual([
      "Home = Grid import = 100.0 = 100.0 kWh",
      `Cost = Grid import = 50.00 = 50.00${NB}RON`,
    ]);
  });

  it("says when the result is below 0 and shown as 0", () => {
    const config = makeConfig({ sources: { solar: { energy: "sensor.solar" }, grid_export: { energy: "sensor.export" } } });
    const tree = buildEnergyTree(config, { "sensor.solar": 2, "sensor.export": 5 });
    expect(explain(tree, "home", context("en"))).toEqual([
      "Home = Solar − Grid export = 2.0 − 5.0 = −3.0 kWh (below 0, shown as 0)",
    ]);
    expect(explain(tree, "home", context("ro"))).toEqual([
      "Home = Solar − Grid export = 2,0 − 5,0 = −3,0 kWh (sub 0, afișat 0)",
    ]);
  });

  it("names the unavailable source and the missing cost sensor", () => {
    const values = august2026Values();
    delete values[E.gridImport];
    delete values[E.gridImportCost];
    expect(explain(buildEnergyTree(ownerConfig(), values), "home")).toEqual([
      "Consum total = Solar + Import rețea − Export rețea",
      `Import rețea: ${E.gridImport} nu există și nu are statistici`,
      `Cost: Import rețea: ${E.gridImportCost} nu există și nu are statistici`,
    ]);
  });

  it("adds a line for an unavailable live power sensor", () => {
    const config = makeConfig({ ...ownerOptions(), home: { name: "Consum total", power: "sensor.home_power" } }, "ro");
    const tree = buildEnergyTree(config, august2026Values());
    const lines = explain(tree, "home", context("ro", power("sensor.home_power", "unavailable")));
    expect(lines[lines.length - 1]).toBe("sensor.home_power: indisponibil");
    expect(explain(tree, "home", context("ro", power("sensor.home_power", "512")))).toHaveLength(2);
  });
});

describe("explainNode: Rest", () => {
  it("subtracts the children and prices Rest at the parent's average price (August 2026, ro)", () => {
    expect(explain(ownerTree(), "rest:casa")).toEqual([
      "Rest Casa = Casa − AC − Server = 478,1 − 124,5 − 0,0 = 353,6 kWh",
      `Cost la prețul mediu Casa: 0,098${NB}RON/kWh × 353,6 kWh = 34,76${NB}RON`,
    ]);
  });

  it("explains the clamp when the children exceed the parent (en)", () => {
    const tree = familyTree({ "sensor.ac": 50, "sensor.server": 20 });
    expect(explain(tree, "rest:casa", context("en"))).toEqual([
      "Other Casa = Casa − AC − Server = 60.0 − 50.0 − 20.0 = −10.0 kWh",
      "The measured consumers exceed Casa by 10.0 kWh, shown as 0",
      `Cost at the average price of Casa: 0.500${NB}RON/kWh × 0.0 kWh = 0.00${NB}RON`,
    ]);
  });

  it("explains the clamp in Romanian (no cost line without a parent cost)", () => {
    const config = makeConfig(familyOptionsRo(), "ro");
    const tree = buildEnergyTree(config, { "sensor.import": 100, "sensor.casa": 60, "sensor.ac": 50, "sensor.server": 20 });
    expect(explain(tree, "rest:casa", context("ro"))).toEqual([
      "Rest Casa = Casa − AC − Server = 60,0 − 50,0 − 20,0 = −10,0 kWh",
      "Consumatorii măsurați depășesc Casa cu 10,0 kWh, afișat 0",
    ]);
  });

  it("has no cost line when the parent has no cost (one child)", () => {
    const tree = buildEnergyTree(
      makeConfig({
        sources: { grid_import: { energy: "sensor.import" } },
        nodes: [
          { id: "casa", name: "Casa", energy: "sensor.casa" },
          { id: "ac", parent: "casa", name: "AC", energy: "sensor.ac" },
        ],
      }),
      { "sensor.import": 10, "sensor.casa": 8, "sensor.ac": 3 },
    );
    expect(explain(tree, "rest:casa", context("en"))).toEqual(["Other Casa = Casa − AC = 8.0 − 3.0 = 5.0 kWh"]);
  });

  it("says that the parent's cost is not available when Rest has no cost value", () => {
    const tree = familyTree({ "sensor.casa_cost": null });
    expect(explain(tree, "rest:casa", context("en"))).toEqual([
      "Other Casa = Casa − AC − Server = 60.0 − 20.0 − 15.0 = 25.0 kWh",
      "Cost: the cost of Casa is not available",
    ]);
  });

  it("names the unavailable child when Rest shows the placeholder", () => {
    const values = august2026Values();
    delete values[E.ac];
    expect(explain(buildEnergyTree(ownerConfig(), values), "rest:casa")).toEqual([
      "Rest Casa = Casa − AC − Server",
      `AC: ${E.ac} nu există și nu are statistici`,
    ]);
  });
});

describe("explainNode: Untracked", () => {
  it("subtracts the first-level consumers from Home, with the clamp note and the cost (August 2026, ro)", () => {
    expect(explain(ownerTree(), "untracked")).toEqual([
      "Nemăsurat = Consum total − (Casa + Căsuță + Mașină) = 789,9 − (478,1 + 28,1 + 287,0) = −3,3 kWh",
      "Consumatorii măsurați depășesc Consum total cu 3,3 kWh, afișat 0",
      `Cost la prețul mediu Consum total: 0,099${NB}RON/kWh × 0,0 kWh = 0,00${NB}RON`,
    ]);
  });

  it("prices a positive remainder at Home's average price (en)", () => {
    const tree = familyTree();
    expect(explain(tree, "untracked", context("en"))).toEqual([
      "Untracked = Home − (Casa + Garaj) = 100.0 − (60.0 + 30.0) = 10.0 kWh",
      `Cost at the average price of Home: 0.500${NB}RON/kWh × 10.0 kWh = 5.00${NB}RON`,
    ]);
  });

  it("names the unavailable consumers, and Home when it cannot be computed", () => {
    const values = august2026Values();
    delete values[E.casuta];
    delete values[E.solar];
    expect(explain(buildEnergyTree(ownerConfig(), values), "untracked")).toEqual([
      "Nemăsurat = Consum total − (Casa + Căsuță + Mașină)",
      "Consum total: indisponibil",
      `Căsuță: ${E.casuta} nu există și nu are statistici`,
    ]);
  });
});

describe("explainNode: measured nodes", () => {
  it("says that a missing energy sensor does not exist and has no statistics (ro and en)", () => {
    const values = august2026Values();
    delete values[E.casuta];
    delete values[E.casutaCost];
    const tree = buildEnergyTree(ownerConfig(), values);
    expect(explain(tree, "casuta")).toEqual([
      `${E.casuta} nu există și nu are statistici`,
      `${E.casutaCost} nu există și nu are statistici`,
    ]);
    expect(explain(tree, "casuta", context("en"))).toEqual([
      `${E.casuta} does not exist and has no statistics`,
      `${E.casutaCost} does not exist and has no statistics`,
    ]);
  });

  it("names the statistics behind the values and the unavailable power sensor", () => {
    const tree = ownerTree();
    expect(explain(tree, "casa", context("ro", power("sensor.casa_power", "unavailable")))).toEqual([
      `478,1 kWh din statisticile ${E.casa}`,
      `47,00${NB}RON din statisticile ${E.casaCost}`,
      "sensor.casa_power: indisponibil",
    ]);
    expect(explain(tree, "casa", context("en", power("sensor.casa_power", "388.5")))).toEqual([
      `478.1 kWh from the statistics of ${E.casa}`,
      `47.00${NB}RON from the statistics of ${E.casaCost}`,
    ]);
  });

  it("shows the grid export compensation as the credit the card shows", () => {
    expect(explain(ownerTree(), "grid_export")).toEqual([
      `605,4 kWh din statisticile ${E.gridExport}`,
      `−272,44${NB}RON din statisticile ${E.gridExportCompensation}`,
    ]);
  });
});

function familyOptionsRo(): Options {
  return {
    sources: { grid_import: { energy: "sensor.import" } },
    nodes: [
      { id: "casa", name: "Casa", energy: "sensor.casa" },
      { id: "ac", parent: "casa", name: "AC", energy: "sensor.ac" },
      { id: "server", parent: "casa", name: "Server", energy: "sensor.server" },
    ],
  };
}
