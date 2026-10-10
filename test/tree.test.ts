import { describe, expect, it } from "vitest";
import {
  buildEnergyTree,
  differenceCost,
  energyShare,
  homeEnergy,
  periodValue,
  remainderEnergy,
  sumOrNull,
} from "../src/data/tree";
import type { EnergyTreeCardConfig, PeriodValues, SourceConfig } from "../src/types";
import {
  august2026Values,
  childIds,
  findNode,
  hasNode,
  lastChild,
  makeConfig,
  ownerConfig,
} from "./helpers";

type Options = Omit<EnergyTreeCardConfig, "type">;
type SourceKey = "solar" | "grid_import" | "grid_export";

const SOURCE_ENTITY: Record<SourceKey, string> = {
  solar: "sensor.solar",
  grid_import: "sensor.import",
  grid_export: "sensor.export",
};

/** Only the given sources, each with just its energy sensor. */
function sourcesOf(...keys: SourceKey[]): Options["sources"] {
  const sources: Partial<Record<SourceKey, SourceConfig>> = {};
  for (const key of keys) sources[key] = { energy: SOURCE_ENTITY[key] };
  return sources;
}

/**
 * Grid import only (Home = import), Casa with children AC and Server, Garaj without children:
 *   Home 100 = import
 *   ├── Casa 60 ── AC 20, Server 15, Rest Casa 25
 *   ├── Garaj 30
 *   └── Untracked 10
 */
function familyOptions(extra: Options = {}): Options {
  return {
    sources: sourcesOf("grid_import"),
    nodes: [
      { id: "casa", name: "Casa", energy: "sensor.casa" },
      { id: "ac", parent: "casa", name: "AC", energy: "sensor.ac" },
      { id: "server", parent: "casa", name: "Server", energy: "sensor.server" },
      { id: "garaj", name: "Garaj", energy: "sensor.garaj" },
    ],
    ...extra,
  };
}

function familyValues(overrides: PeriodValues = {}): PeriodValues {
  return {
    "sensor.import": 100,
    "sensor.casa": 60,
    "sensor.ac": 20,
    "sensor.server": 15,
    "sensor.garaj": 30,
    ...overrides,
  };
}

function familyTree(overrides: PeriodValues = {}, extra: Options = {}, language: "en" | "ro" = "en") {
  return buildEnergyTree(makeConfig(familyOptions(extra), language), familyValues(overrides));
}

// ---------------------------------------------------------------------------
// Helpers exported from tree.ts
// ---------------------------------------------------------------------------

describe("periodValue", () => {
  it("returns the summed value of a statistic id, including 0", () => {
    expect(periodValue({ "sensor.a": 12.5, "sensor.b": 0 }, "sensor.a")).toBe(12.5);
    expect(periodValue({ "sensor.a": 12.5, "sensor.b": 0 }, "sensor.b")).toBe(0);
    expect(periodValue({ "sensor.a": -3 }, "sensor.a")).toBe(-3);
  });

  it("returns null for an undefined id, a missing id or a null value", () => {
    expect(periodValue({ "sensor.a": 1 }, undefined)).toBeNull();
    expect(periodValue({ "sensor.a": 1 }, "sensor.missing")).toBeNull();
    expect(periodValue({ "sensor.a": null }, "sensor.a")).toBeNull();
  });

  it("returns null for NaN and infinite values", () => {
    expect(periodValue({ "sensor.a": Number.NaN }, "sensor.a")).toBeNull();
    expect(periodValue({ "sensor.a": Number.POSITIVE_INFINITY }, "sensor.a")).toBeNull();
    expect(periodValue({ "sensor.a": Number.NEGATIVE_INFINITY }, "sensor.a")).toBeNull();
  });

  it("does not read inherited object properties as values", () => {
    expect(periodValue({}, "toString")).toBeNull();
    expect(periodValue({}, "constructor")).toBeNull();
  });
});

describe("sumOrNull", () => {
  it("sums the values (0 for an empty list)", () => {
    expect(sumOrNull([])).toBe(0);
    expect(sumOrNull([1.5, 2.25, -0.75])).toBeCloseTo(3, 10);
  });

  it("returns null when any value is null", () => {
    expect(sumOrNull([1, null, 2])).toBeNull();
    expect(sumOrNull([null])).toBeNull();
  });
});

describe("homeEnergy", () => {
  it("is solar + import - export", () => {
    expect(homeEnergy(10, 7, 4)).toBe(13);
  });

  it("counts an unconfigured (undefined) source as 0", () => {
    expect(homeEnergy(10, undefined, undefined)).toBe(10);
    expect(homeEnergy(undefined, 7, undefined)).toBe(7);
    expect(homeEnergy(10, undefined, 4)).toBe(6);
    expect(homeEnergy(undefined, 7, 4)).toBe(3);
    expect(homeEnergy(10, 7, undefined)).toBe(17);
    expect(homeEnergy(undefined, undefined, undefined)).toBe(0);
  });

  it("is null when any configured source is unknown (null)", () => {
    expect(homeEnergy(null, 7, 4)).toBeNull();
    expect(homeEnergy(10, null, 4)).toBeNull();
    expect(homeEnergy(10, 7, null)).toBeNull();
    expect(homeEnergy(null, undefined, undefined)).toBeNull();
  });

  it("is never negative: export larger than solar + import gives 0", () => {
    expect(homeEnergy(10, 2, 15)).toBe(0);
    expect(homeEnergy(undefined, undefined, 4)).toBe(0);
  });
});

describe("remainderEnergy", () => {
  it("is total - sum of the parts", () => {
    expect(remainderEnergy(60, [20, 15])).toBe(25);
    expect(remainderEnergy(60, [])).toBe(60);
  });

  it("is never negative: parts larger than the total give 0", () => {
    expect(remainderEnergy(30, [20, 15])).toBe(0);
  });

  it("is null when the total or any part is null", () => {
    expect(remainderEnergy(null, [20])).toBeNull();
    expect(remainderEnergy(60, [20, null])).toBeNull();
  });
});

describe("differenceCost", () => {
  it("is total - sum of the parts", () => {
    expect(differenceCost(47, [12.24, 0])).toBeCloseTo(34.76, 10);
  });

  it("is not clamped: parts larger than the total give a negative value", () => {
    expect(differenceCost(5, [4, 3])).toBe(-2);
    expect(differenceCost(-0.72, [0.5, 0.1])).toBeCloseTo(-1.32, 10);
  });

  it("is null when the total or any part is null", () => {
    expect(differenceCost(null, [1])).toBeNull();
    expect(differenceCost(10, [1, null])).toBeNull();
  });
});

describe("energyShare", () => {
  it("is energy / parent energy", () => {
    expect(energyShare(20, 80)).toBe(0.25);
    expect(energyShare(0, 80)).toBe(0);
  });

  it("is clamped to 0..1", () => {
    expect(energyShare(120, 80)).toBe(1);
    expect(energyShare(-5, 80)).toBe(0);
  });

  it("is null when either value is unknown or the parent energy is 0 or negative", () => {
    expect(energyShare(null, 80)).toBeNull();
    expect(energyShare(20, null)).toBeNull();
    expect(energyShare(20, 0)).toBeNull();
    expect(energyShare(20, -10)).toBeNull();
    expect(energyShare(20, Number.NaN)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// buildEnergyTree
// ---------------------------------------------------------------------------

describe("buildEnergyTree: sources", () => {
  it("lists only the configured sources, in the order solar, grid_import, grid_export", () => {
    const config = makeConfig({
      sources: {
        grid_export: { energy: "sensor.export" },
        solar: { energy: "sensor.solar" },
        grid_import: { energy: "sensor.import" },
      },
    });
    expect(buildEnergyTree(config, {}).sources.map((node) => node.id)).toEqual(["solar", "grid_import", "grid_export"]);

    const partial = makeConfig({ sources: { grid_export: { energy: "sensor.export" }, solar: { energy: "sensor.solar" } } });
    expect(buildEnergyTree(partial, {}).sources.map((node) => node.id)).toEqual(["solar", "grid_export"]);
  });

  it("builds source nodes with kind, energy, entity, power, colour, depth 0, no share and no children", () => {
    const config = makeConfig({
      sources: {
        solar: { energy: "sensor.solar", power: "sensor.solar_power", color: "#ffb300", name: "PV", icon: "mdi:sun" },
      },
    });
    const [solar] = buildEnergyTree(config, { "sensor.solar": 42 }).sources;
    expect(solar).toStrictEqual({
      id: "solar",
      kind: "solar",
      name: "PV",
      icon: "mdi:sun",
      color: "#ffb300",
      energy: 42,
      cost: null,
      hasCost: false,
      power: "sensor.solar_power",
      energyEntity: "sensor.solar",
      depth: 0,
      share: null,
      children: [],
    });
  });
});

describe("buildEnergyTree: Home energy", () => {
  // Values exist for all three sensors; only the configured sources may count.
  const allValues: PeriodValues = { "sensor.solar": 10, "sensor.import": 7, "sensor.export": 4 };

  it.each<[string, SourceKey[], number]>([
    ["solar only", ["solar"], 10],
    ["grid import only", ["grid_import"], 7],
    ["grid export only (clamped to 0)", ["grid_export"], 0],
    ["solar + grid import", ["solar", "grid_import"], 17],
    ["solar + grid export", ["solar", "grid_export"], 6],
    ["grid import + grid export", ["grid_import", "grid_export"], 3],
    ["solar + grid import + grid export", ["solar", "grid_import", "grid_export"], 13],
  ])("Home = solar + import - export with %s configured (unconfigured sources count 0)", (_label, keys, expected) => {
    const tree = buildEnergyTree(makeConfig({ sources: sourcesOf(...keys) }), allValues);
    expect(tree.home.energy).toBe(expected);
  });

  it.each<SourceKey>(["solar", "grid_import", "grid_export"])(
    "Home is null when the configured %s source has no value",
    (missing) => {
      const values = { ...allValues };
      delete values[SOURCE_ENTITY[missing]];
      const config = makeConfig({ sources: sourcesOf("solar", "grid_import", "grid_export") });
      expect(buildEnergyTree(config, values).home.energy).toBeNull();
      expect(buildEnergyTree(config, { ...allValues, [SOURCE_ENTITY[missing]]: null }).home.energy).toBeNull();
    },
  );

  it("Home is never negative: export larger than solar + import gives 0", () => {
    const config = makeConfig({ sources: sourcesOf("solar", "grid_import", "grid_export") });
    const tree = buildEnergyTree(config, { "sensor.solar": 3, "sensor.import": 1, "sensor.export": 9.5 });
    expect(tree.home.energy).toBe(0);
  });

  it("builds the Home node with id home, depth 0, no share, the configured name, icon, colour and power", () => {
    const config = makeConfig({
      sources: sourcesOf("grid_import"),
      home: { name: "Casă", icon: "mdi:home", color: "#123456", power: "sensor.home_power" },
    });
    const { home } = buildEnergyTree(config, { "sensor.import": 5 });
    expect(home).toMatchObject({
      id: "home",
      kind: "home",
      name: "Casă",
      icon: "mdi:home",
      color: "#123456",
      power: "sensor.home_power",
      energy: 5,
      depth: 0,
      share: null,
      children: [],
    });
    expect(home).not.toHaveProperty("energyEntity");
  });
});

describe("buildEnergyTree: consumers and Rest nodes", () => {
  it("puts first-level consumers under Home and children under their parent, in config order", () => {
    const tree = familyTree();
    expect(childIds(tree.home)).toEqual(["casa", "garaj", "untracked"]);
    expect(childIds(findNode(tree, "casa"))).toEqual(["ac", "server", "rest:casa"]);
    expect(childIds(findNode(tree, "garaj"))).toEqual([]);
  });

  it("keeps siblings in config order even when a child is listed before its parent", () => {
    const config = makeConfig({
      sources: sourcesOf("grid_import"),
      nodes: [
        { id: "server", parent: "casa", name: "Server", energy: "sensor.server" },
        { id: "garaj", name: "Garaj", energy: "sensor.garaj" },
        { id: "casa", name: "Casa", energy: "sensor.casa" },
        { id: "ac", parent: "casa", name: "AC", energy: "sensor.ac" },
      ],
    });
    const tree = buildEnergyTree(config, familyValues());
    expect(childIds(tree.home)).toEqual(["garaj", "casa", "untracked"]);
    expect(childIds(findNode(tree, "casa"))).toEqual(["server", "ac", "rest:casa"]);
  });

  it("builds consumer nodes with kind consumer, energy entity, power and colour", () => {
    const config = makeConfig({
      sources: sourcesOf("grid_import"),
      nodes: [
        { id: "ac", name: "AC", energy: "sensor.ac", power: "sensor.ac_power", color: "#00acc1", icon: "mdi:air-conditioner" },
      ],
    });
    const ac = findNode(buildEnergyTree(config, { "sensor.import": 100, "sensor.ac": 20 }), "ac");
    expect(ac).toStrictEqual({
      id: "ac",
      kind: "consumer",
      name: "AC",
      icon: "mdi:air-conditioner",
      color: "#00acc1",
      energy: 20,
      cost: null,
      hasCost: false,
      power: "sensor.ac_power",
      energyEntity: "sensor.ac",
      depth: 1,
      share: 0.2,
      children: [],
    });
  });

  it("appends a Rest node as the last child of a consumer that has children", () => {
    const casa = findNode(familyTree(), "casa");
    const rest = lastChild(casa);
    expect(rest).toMatchObject({ id: "rest:casa", kind: "rest", depth: 2, children: [] });
    expect(rest).not.toHaveProperty("energyEntity");
    expect(rest).not.toHaveProperty("power");
  });

  it("adds no Rest node to a consumer without children", () => {
    const tree = familyTree();
    expect(hasNode(tree, "rest:garaj")).toBe(false);
    expect(hasNode(tree, "rest:ac")).toBe(false);
  });

  it("Rest = parent - sum of its children (Casa 60 - AC 20 - Server 15 = 25)", () => {
    const rest = findNode(familyTree(), "rest:casa");
    expect(rest.energy).toBe(25);
    expect(rest.share).toBeCloseTo(25 / 60, 10);
  });

  it("Rest is never negative: children larger than the parent give 0", () => {
    const tree = familyTree({ "sensor.casa": 30 });
    expect(findNode(tree, "rest:casa").energy).toBe(0);
    expect(findNode(tree, "rest:casa").share).toBe(0);
  });

  it("Rest is null when a child has no value", () => {
    const tree = familyTree({ "sensor.server": null });
    expect(findNode(tree, "rest:casa").energy).toBeNull();
    expect(findNode(tree, "rest:casa").share).toBeNull();
  });

  it("Rest is null when the parent has no value", () => {
    const tree = familyTree({ "sensor.casa": null });
    expect(findNode(tree, "rest:casa").energy).toBeNull();
  });

  it('names Rest from the template with "{parent}" replaced: "Other Casa" (en), "Rest Casa" (ro)', () => {
    expect(findNode(familyTree(), "rest:casa").name).toBe("Other Casa");
    expect(findNode(familyTree({}, {}, "ro"), "rest:casa").name).toBe("Rest Casa");
  });

  it("uses the configured rest name template, icon and colour", () => {
    const tree = familyTree({}, { rest: { name: "{parent}: altele", icon: "mdi:dots-horizontal", color: "#9e9e9e" } });
    expect(findNode(tree, "rest:casa")).toMatchObject({
      name: "Casa: altele",
      icon: "mdi:dots-horizontal",
      color: "#9e9e9e",
    });
  });

  it("adds no Rest node anywhere with rest.show: false", () => {
    const tree = familyTree({}, { rest: { show: false } });
    expect(childIds(findNode(tree, "casa"))).toEqual(["ac", "server"]);
    expect(hasNode(tree, "rest:casa")).toBe(false);
    expect(childIds(tree.home)).toEqual(["casa", "garaj", "untracked"]);
  });
});

describe("buildEnergyTree: Untracked node", () => {
  it("appends Untracked (id untracked) as the last child of Home, at depth 1", () => {
    const tree = familyTree();
    const untracked = lastChild(tree.home);
    expect(untracked).toMatchObject({
      id: "untracked",
      kind: "untracked",
      name: "Untracked",
      icon: "mdi:help-circle-outline",
      depth: 1,
      children: [],
    });
    expect(untracked).not.toHaveProperty("energyEntity");
    expect(findNode(familyTree({}, {}, "ro"), "untracked").name).toBe("Nemăsurat");
  });

  it("Untracked = Home - sum of the first-level consumers (100 - Casa 60 - Garaj 30 = 10)", () => {
    const untracked = findNode(familyTree(), "untracked");
    expect(untracked.energy).toBe(10);
    expect(untracked.share).toBe(0.1);
  });

  it("Untracked does not subtract Rest nodes or grandchildren, only first-level consumers", () => {
    // Rest Casa (25), AC (20) and Server (15) must not be subtracted again: 100 - 60 - 30 = 10.
    expect(findNode(familyTree(), "untracked").energy).toBe(10);
    expect(findNode(familyTree({}, { rest: { show: false } }), "untracked").energy).toBe(10);
  });

  it("Untracked is never negative: first-level consumers larger than Home give 0", () => {
    const tree = familyTree({ "sensor.casa": 80 });
    expect(findNode(tree, "untracked").energy).toBe(0);
    expect(findNode(tree, "untracked").share).toBe(0);
  });

  it("Untracked is null when a first-level consumer has no value, but not when only a grandchild has none", () => {
    expect(findNode(familyTree({ "sensor.garaj": null }), "untracked").energy).toBeNull();

    const tree = familyTree({ "sensor.ac": null });
    expect(findNode(tree, "rest:casa").energy).toBeNull();
    expect(findNode(tree, "untracked").energy).toBe(10);
  });

  it("Untracked is null when Home is null", () => {
    const tree = familyTree({ "sensor.import": null });
    expect(tree.home.energy).toBeNull();
    expect(findNode(tree, "untracked").energy).toBeNull();
  });

  it("uses the configured untracked name, icon and colour", () => {
    const tree = familyTree({}, { untracked: { name: "Altele", icon: "mdi:help", color: "#bdbdbd" } });
    expect(findNode(tree, "untracked")).toMatchObject({ name: "Altele", icon: "mdi:help", color: "#bdbdbd" });
  });

  it("adds no Untracked node with untracked.show: false", () => {
    const tree = familyTree({}, { untracked: { show: false } });
    expect(childIds(tree.home)).toEqual(["casa", "garaj"]);
    expect(hasNode(tree, "untracked")).toBe(false);
  });

  it("adds no Untracked node when there are no consumers", () => {
    const tree = buildEnergyTree(makeConfig({ sources: sourcesOf("grid_import") }), { "sensor.import": 5 });
    expect(tree.home.children).toEqual([]);
  });
});

describe("buildEnergyTree: depth, nesting and share", () => {
  /**
   * Home 100 (import)
   * ├── Casa 80
   * │   ├── Etaj 50
   * │   │   ├── Birou 20
   * │   │   └── Rest Etaj 30
   * │   ├── Bucătărie 10
   * │   └── Rest Casa 20
   * └── Untracked 20
   */
  const config = makeConfig({
    sources: sourcesOf("grid_import"),
    nodes: [
      { id: "birou", parent: "etaj", name: "Birou", energy: "sensor.birou" },
      { id: "casa", name: "Casa", energy: "sensor.casa" },
      { id: "etaj", parent: "casa", name: "Etaj", energy: "sensor.etaj" },
      { id: "bucatarie", parent: "casa", name: "Bucătărie", energy: "sensor.bucatarie" },
    ],
  });
  const values: PeriodValues = {
    "sensor.import": 100,
    "sensor.casa": 80,
    "sensor.etaj": 50,
    "sensor.birou": 20,
    "sensor.bucatarie": 10,
  };
  const tree = buildEnergyTree(config, values);

  it("nests three consumer levels with a Rest node under each parent", () => {
    expect(childIds(tree.home)).toEqual(["casa", "untracked"]);
    expect(childIds(findNode(tree, "casa"))).toEqual(["etaj", "bucatarie", "rest:casa"]);
    expect(childIds(findNode(tree, "etaj"))).toEqual(["birou", "rest:etaj"]);
    expect(childIds(findNode(tree, "birou"))).toEqual([]);
  });

  it("sets depth: Home 0, first level 1, children 2, grandchildren 3 (Rest = parent depth + 1)", () => {
    const depth = (id: string): number => findNode(tree, id).depth;
    expect(tree.home.depth).toBe(0);
    expect([depth("casa"), depth("untracked")]).toEqual([1, 1]);
    expect([depth("etaj"), depth("bucatarie"), depth("rest:casa")]).toEqual([2, 2, 2]);
    expect([depth("birou"), depth("rest:etaj")]).toEqual([3, 3]);
  });

  it("computes Rest at every level (Rest Casa = 80 - 50 - 10, Rest Etaj = 50 - 20)", () => {
    expect(findNode(tree, "rest:casa").energy).toBe(20);
    expect(findNode(tree, "rest:etaj").energy).toBe(30);
    expect(findNode(tree, "untracked").energy).toBe(20);
  });

  it("sets share = energy / parent energy at every level", () => {
    const share = (id: string): number | null => findNode(tree, id).share;
    expect(share("casa")).toBe(0.8);
    expect(share("untracked")).toBe(0.2);
    expect(share("etaj")).toBe(0.625);
    expect(share("bucatarie")).toBe(0.125);
    expect(share("rest:casa")).toBe(0.25);
    expect(share("birou")).toBe(0.4);
    expect(share("rest:etaj")).toBe(0.6);
  });

  it("share is null for sources and Home", () => {
    expect(tree.home.share).toBeNull();
    for (const source of tree.sources) expect(source.share).toBeNull();
  });

  it("share is clamped to 1 when a child is larger than its parent", () => {
    const big = buildEnergyTree(config, { ...values, "sensor.etaj": 120 });
    expect(findNode(big, "etaj").share).toBe(1);
  });

  it("share is null when the node's energy is unknown", () => {
    const unknown = buildEnergyTree(config, { ...values, "sensor.etaj": null });
    expect(findNode(unknown, "etaj").share).toBeNull();
    expect(findNode(unknown, "birou").share).toBeNull();
  });

  it("share is null when the parent energy is 0", () => {
    const zero = buildEnergyTree(config, { ...values, "sensor.import": 0, "sensor.etaj": 0 });
    expect(findNode(zero, "casa").share).toBeNull();
    expect(findNode(zero, "untracked").share).toBeNull();
    expect(findNode(zero, "birou").share).toBeNull();
    expect(findNode(zero, "rest:etaj").share).toBeNull();
  });
});

describe("buildEnergyTree: owner's August 2026 totals", () => {
  const tree = buildEnergyTree(ownerConfig(), august2026Values());

  it("builds Consum total -> Casa (AC, Server, Rest Casa), Căsuță, Mașină, Nemăsurat", () => {
    expect(tree.sources.map((node) => node.name)).toEqual(["Solar", "Import rețea", "Export rețea"]);
    expect(tree.home.name).toBe("Consum total");
    expect(tree.home.children.map((node) => node.name)).toEqual(["Casa", "Căsuță", "Mașină", "Nemăsurat"]);
    expect(findNode(tree, "casa").children.map((node) => node.name)).toEqual(["AC", "Server", "Rest Casa"]);
  });

  it("Home = 1079.59 + 315.69 - 605.43 = 789.85 kWh and 350.42 - 272.44 = 77.98 RON", () => {
    expect(tree.home.energy).toBeCloseTo(789.85, 2);
    expect(tree.home.cost).toBeCloseTo(77.98, 2);
    expect(tree.home.hasCost).toBe(true);
  });

  it("sources: export compensation 272.44 is shown as -272.44 RON", () => {
    expect(findNode(tree, "solar").energy).toBeCloseTo(1079.59, 2);
    expect(findNode(tree, "grid_import").cost).toBeCloseTo(350.42, 2);
    expect(findNode(tree, "grid_export").energy).toBeCloseTo(605.43, 2);
    expect(findNode(tree, "grid_export").cost).toBeCloseTo(-272.44, 2);
  });

  it("Rest Casa = 478.08 - 124.49 - 0.00 = 353.59 kWh and 47.00 - 12.24 - 0.00 = 34.76 RON", () => {
    const rest = findNode(tree, "rest:casa");
    expect(rest.energy).toBeCloseTo(353.59, 2);
    expect(rest.cost).toBeCloseTo(34.76, 2);
    expect(rest.hasCost).toBe(true);
    expect(rest.share).toBeCloseTo(353.59 / 478.08, 4);
  });

  it("Nemăsurat = 789.85 - 793.13 clamped to 0 kWh, while its cost 77.98 - 77.97 = 0.01 RON is not clamped", () => {
    const untracked = findNode(tree, "untracked");
    expect(untracked.energy).toBe(0);
    expect(untracked.share).toBe(0);
    expect(untracked.cost).toBeCloseTo(0.01, 2);
    expect(untracked.hasCost).toBe(true);
  });

  it("Server with 0.00 kWh and 0.00 RON keeps 0, not null", () => {
    const server = findNode(tree, "server");
    expect(server.energy).toBe(0);
    expect(server.cost).toBe(0);
    expect(server.share).toBe(0);
  });

  it("first-level shares are relative to Home and children shares to Casa", () => {
    expect(findNode(tree, "casa").share).toBeCloseTo(478.08 / 789.85, 4);
    expect(findNode(tree, "masina").share).toBeCloseTo(286.97 / 789.85, 4);
    expect(findNode(tree, "ac").share).toBeCloseTo(124.49 / 478.08, 4);
  });
});
