import { describe, expect, it } from "vitest";
import { normalizeConfig, statisticIds } from "../src/data/config";
import type { EnergyTreeCardConfig, Language } from "../src/types";
import { CARD_TYPE, E, makeConfig, ownerConfig, ownerOptions } from "./helpers";

/** Untyped YAML as HA passes it (may be invalid). */
function raw(config: Record<string, unknown>): EnergyTreeCardConfig {
  return { type: CARD_TYPE, ...config } as unknown as EnergyTreeCardConfig;
}

const IMPORT_ONLY = { grid_import: { energy: "sensor.import" } };

/** normalizeConfig on untyped YAML with a valid source unless the test overrides `sources`. */
function normalize(config: Record<string, unknown>, language: Language = "en") {
  return normalizeConfig(raw({ sources: IMPORT_ONLY, ...config }), language);
}

const node = (id: string, extra: Record<string, unknown> = {}) => ({ id, name: id, energy: `sensor.${id}`, ...extra });

describe("normalizeConfig: defaults", () => {
  it("fills every default for a minimal config (Romanian labels)", () => {
    expect(normalizeConfig(raw({ sources: IMPORT_ONLY }), "ro")).toStrictEqual({
      layout: "auto",
      narrow_width: 600,
      language: "ro",
      kwh_decimals: 1,
      cost_decimals: 2,
      sources: {
        grid_import: { energy: "sensor.import", name: "Import rețea", icon: "mdi:transmission-tower-import" },
      },
      home: { name: "Consum total", icon: "mdi:home-lightning-bolt" },
      nodes: [],
      rest: { show: true, name: "Rest {parent}", icon: "mdi:dots-horizontal-circle-outline" },
      untracked: { show: true, name: "Nemăsurat", icon: "mdi:help-circle-outline" },
    });
  });

  it("uses the Romanian default names: Solar, Import rețea, Export rețea, Consum total, Rest {parent}, Nemăsurat", () => {
    const config = normalize(
      { sources: { solar: { energy: "s.a" }, grid_import: { energy: "s.b" }, grid_export: { energy: "s.c" } } },
      "ro",
    );
    expect(config.sources.solar?.name).toBe("Solar");
    expect(config.sources.grid_import?.name).toBe("Import rețea");
    expect(config.sources.grid_export?.name).toBe("Export rețea");
    expect(config.home.name).toBe("Consum total");
    expect(config.rest.name).toBe("Rest {parent}");
    expect(config.untracked.name).toBe("Nemăsurat");
  });

  it("uses the English default names: Solar, Grid import, Grid export, Home, Other {parent}, Untracked", () => {
    const config = normalize(
      { sources: { solar: { energy: "s.a" }, grid_import: { energy: "s.b" }, grid_export: { energy: "s.c" } } },
      "en",
    );
    expect(config.language).toBe("en");
    expect(config.sources.solar?.name).toBe("Solar");
    expect(config.sources.grid_import?.name).toBe("Grid import");
    expect(config.sources.grid_export?.name).toBe("Grid export");
    expect(config.home.name).toBe("Home");
    expect(config.rest.name).toBe("Other {parent}");
    expect(config.untracked.name).toBe("Untracked");
  });

  it("uses the default icons for sources, Home, consumers, Rest and Untracked", () => {
    const config = normalize({
      sources: { solar: { energy: "s.a" }, grid_import: { energy: "s.b" }, grid_export: { energy: "s.c" } },
      nodes: [node("casa")],
    });
    expect(config.sources.solar?.icon).toBe("mdi:solar-power-variant");
    expect(config.sources.grid_import?.icon).toBe("mdi:transmission-tower-import");
    expect(config.sources.grid_export?.icon).toBe("mdi:transmission-tower-export");
    expect(config.home.icon).toBe("mdi:home-lightning-bolt");
    expect(config.nodes[0].icon).toBe("mdi:flash");
    expect(config.rest.icon).toBe("mdi:dots-horizontal-circle-outline");
    expect(config.untracked.icon).toBe("mdi:help-circle-outline");
  });

  it("keeps configured names, icons, colours and options over the defaults", () => {
    const config = normalize(
      {
        title: "Arbore energie",
        currency: "RON",
        collection_key: "energy_custom",
        layout: "bars",
        narrow_width: 480,
        kwh_decimals: 2,
        cost_decimals: 0,
        sources: { solar: { energy: "s.solar", name: "PV", icon: "mdi:sun", color: "#ffb300", power: "s.solar_power" } },
        home: { name: "Casă", icon: "mdi:home", color: "#123456", power: "s.home_power" },
        nodes: [node("casa", { name: "Casa", icon: "mdi:home-account", color: "#1e88e5", cost: "s.casa_cost" })],
        rest: { show: false, name: "{parent}: altele", icon: "mdi:dots-horizontal", color: "#999" },
        untracked: { show: false, name: "Altele", icon: "mdi:help", color: "#bbb" },
      },
      "ro",
    );
    expect(config).toStrictEqual({
      title: "Arbore energie",
      collection_key: "energy_custom",
      layout: "bars",
      narrow_width: 480,
      language: "ro",
      currency: "RON",
      kwh_decimals: 2,
      cost_decimals: 0,
      sources: {
        solar: { energy: "s.solar", power: "s.solar_power", name: "PV", icon: "mdi:sun", color: "#ffb300" },
      },
      home: { name: "Casă", icon: "mdi:home", color: "#123456", power: "s.home_power" },
      nodes: [
        { id: "casa", name: "Casa", icon: "mdi:home-account", color: "#1e88e5", energy: "sensor.casa", cost: "s.casa_cost" },
      ],
      rest: { show: false, name: "{parent}: altele", icon: "mdi:dots-horizontal", color: "#999" },
      untracked: { show: false, name: "Altele", icon: "mdi:help", color: "#bbb" },
    });
  });

  it("does not mutate the input config", () => {
    const input = raw({ ...ownerOptions(), nodes: [...(ownerOptions().nodes ?? []), node("x", { parent: "home" })] });
    const snapshot = JSON.parse(JSON.stringify(input)) as unknown;
    const config = normalizeConfig(input, "ro");
    expect(input).toStrictEqual(snapshot);
    expect(config.nodes).not.toBe(input.nodes);
    expect(config.sources).not.toBe(input.sources);
  });

  it("treats parent: home and an omitted parent as first level (no parent key)", () => {
    const config = normalize({ nodes: [node("a", { parent: "home" }), node("b")] });
    expect(config.nodes.map((consumer) => consumer.parent)).toEqual([undefined, undefined]);
    expect(config.nodes[0]).not.toHaveProperty("parent");
  });

  it("accepts a parent defined later in the list", () => {
    const config = normalize({ nodes: [node("ac", { parent: "casa" }), node("casa")] });
    expect(config.nodes.map((consumer) => [consumer.id, consumer.parent])).toEqual([
      ["ac", "casa"],
      ["casa", undefined],
    ]);
  });

  it("keeps consumers in config order", () => {
    expect(ownerConfig().nodes.map((consumer) => consumer.id)).toEqual(["casa", "ac", "server", "casuta", "masina"]);
  });
});

describe("normalizeConfig: errors", () => {
  it("prefixes every error with energy-tree-card:", () => {
    expect(() => normalize({ layout: "grid" })).toThrow(/^energy-tree-card: /);
  });

  it("requires at least one source", () => {
    const message = "energy-tree-card: at least one source (solar, grid_import or grid_export) is required";
    expect(() => normalizeConfig(raw({ nodes: [node("casa")] }), "en")).toThrow(message);
    expect(() => normalizeConfig(raw({ sources: {} }), "en")).toThrow(message);
  });

  it("requires energy on a source", () => {
    expect(() => normalize({ sources: { solar: { name: "PV" } } })).toThrow(
      "energy-tree-card: sources.solar.energy must be a non-empty string",
    );
    expect(() => normalize({ sources: { grid_export: { energy: "  " } } })).toThrow(
      "sources.grid_export.energy must be a non-empty string",
    );
  });

  it("rejects a source that is not an object", () => {
    expect(() => normalize({ sources: { grid_import: "sensor.import" } })).toThrow(
      "energy-tree-card: sources.grid_import must be an object",
    );
  });

  it("rejects a duplicate node id", () => {
    expect(() => normalize({ nodes: [node("casa"), node("ac"), node("casa")] })).toThrow(
      'energy-tree-card: duplicate node id "casa"',
    );
  });

  it.each(["home", "solar", "grid_import", "grid_export", "untracked", "rest:x", "rest:casa"])(
    'rejects the reserved node id "%s"',
    (id) => {
      expect(() => normalize({ nodes: [node(id)] })).toThrow(`energy-tree-card: node id "${id}" is reserved`);
    },
  );

  it("rejects an unknown parent", () => {
    expect(() => normalize({ nodes: [node("casa"), node("ac", { parent: "kasa" })] })).toThrow(
      'energy-tree-card: node "ac" has unknown parent "kasa"',
    );
  });

  it("rejects a node that is its own parent", () => {
    expect(() => normalize({ nodes: [node("casa", { parent: "casa" })] })).toThrow(
      'energy-tree-card: node "casa" cannot be its own parent',
    );
  });

  it("rejects a parent cycle and shows the path", () => {
    expect(() => normalize({ nodes: [node("a", { parent: "b" }), node("b", { parent: "a" })] })).toThrow(
      'energy-tree-card: node "a" has a parent cycle: a -> b -> a',
    );
    expect(() =>
      normalize({ nodes: [node("a", { parent: "b" }), node("b", { parent: "c" }), node("c", { parent: "a" })] }),
    ).toThrow('node "a" has a parent cycle: a -> b -> c -> a');
  });

  it("rejects a parent cycle reached from a node outside it", () => {
    expect(() =>
      normalize({ nodes: [node("x", { parent: "a" }), node("a", { parent: "b" }), node("b", { parent: "a" })] }),
    ).toThrow('node "a" has a parent cycle: a -> b -> a');
  });

  it("rejects an unknown layout", () => {
    expect(() => normalize({ layout: "grid" })).toThrow("energy-tree-card: layout must be one of auto, tree, bars");
  });

  it.each([["de"], ["romanian"], [1]])("rejects language %j (only ro or en)", (language) => {
    expect(() => normalize({ language })).toThrow('energy-tree-card: language must be "ro" or "en"');
  });

  it.each([["custom"], ["energy"], ["my_energy"], [42]])(
    "rejects collection_key %j (it must start with energy_)",
    (key) => {
      expect(() => normalize({ collection_key: key })).toThrow(
        'energy-tree-card: collection_key must be a string starting with "energy_"',
      );
    },
  );

  it("accepts a collection_key starting with energy_", () => {
    expect(normalize({ collection_key: "energy_dashboard_2" }).collection_key).toBe("energy_dashboard_2");
  });

  it("requires id, name and energy on a node", () => {
    expect(() => normalize({ nodes: [{ name: "Casa", energy: "s.casa" }] })).toThrow(
      "energy-tree-card: nodes[0].id must be a non-empty string",
    );
    expect(() => normalize({ nodes: [{ id: "casa", energy: "s.casa" }] })).toThrow(
      'energy-tree-card: node "casa".name must be a non-empty string',
    );
    expect(() => normalize({ nodes: [{ id: "casa", name: "Casa" }] })).toThrow(
      'energy-tree-card: node "casa".energy must be a non-empty string',
    );
  });

  it("rejects nodes that is not a list and a node that is not an object", () => {
    expect(() => normalize({ nodes: { casa: {} } })).toThrow("energy-tree-card: nodes must be a list");
    expect(() => normalize({ nodes: ["casa"] })).toThrow("energy-tree-card: nodes[0] must be an object");
  });

  it("rejects decimals outside 0..4 or not integers", () => {
    expect(() => normalize({ kwh_decimals: 5 })).toThrow("energy-tree-card: kwh_decimals must be an integer from 0 to 4");
    expect(() => normalize({ cost_decimals: -1 })).toThrow("cost_decimals must be an integer from 0 to 4");
    expect(() => normalize({ kwh_decimals: 1.5 })).toThrow("kwh_decimals must be an integer from 0 to 4");
  });

  it("rejects a narrow_width that is not a positive number", () => {
    for (const width of [0, -100, "600"]) {
      expect(() => normalize({ narrow_width: width })).toThrow("energy-tree-card: narrow_width must be a positive number");
    }
  });

  it("rejects a non-boolean rest.show or untracked.show", () => {
    expect(() => normalize({ rest: { show: "no" } })).toThrow("energy-tree-card: rest.show must be true or false");
    expect(() => normalize({ untracked: { show: 0 } })).toThrow("energy-tree-card: untracked.show must be true or false");
  });

  it("rejects a config that is not an object", () => {
    expect(() => normalizeConfig(null as unknown as EnergyTreeCardConfig, "en")).toThrow(
      "energy-tree-card: config must be an object",
    );
  });
});

describe("statisticIds", () => {
  it("lists energy and cost ids in config order: sources (solar, import, export), then nodes", () => {
    expect(statisticIds(ownerConfig())).toEqual([
      E.solar,
      E.gridImport,
      E.gridImportCost,
      E.gridExport,
      E.gridExportCompensation,
      E.casa,
      E.casaCost,
      E.ac,
      E.acCost,
      E.server,
      E.serverCost,
      E.casuta,
      E.casutaCost,
      E.masina,
      E.masinaCost,
    ]);
  });

  it("lists every id once, even when several nodes share it", () => {
    const config = makeConfig({
      sources: { grid_import: { energy: "sensor.import", cost: "sensor.cost" } },
      nodes: [
        { id: "a", name: "A", energy: "sensor.a", cost: "sensor.cost" },
        { id: "b", name: "B", energy: "sensor.a", cost: "sensor.b_cost" },
        { id: "c", name: "C", energy: "sensor.import" },
      ],
    });
    expect(statisticIds(config)).toEqual(["sensor.import", "sensor.cost", "sensor.a", "sensor.b_cost"]);
  });

  it("does not include power entities", () => {
    const config = makeConfig({
      sources: { solar: { energy: "sensor.solar", power: "sensor.solar_power" } },
      home: { power: "sensor.home_power" },
      nodes: [{ id: "casa", name: "Casa", energy: "sensor.casa", power: "sensor.casa_power" }],
    });
    expect(statisticIds(config)).toEqual(["sensor.solar", "sensor.casa"]);
    expect(statisticIds(ownerConfig())).not.toContain("sensor.casa_power");
  });
});
