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

describe("resolveTap: configured tap_action", () => {
  function configuredTree(): EnergyTree {
    const options = ownerOptions();
    const config = makeConfig(
      {
        ...options,
        sources: {
          ...options.sources,
          grid_import: { energy: E.gridImport, tap_action: { action: "more-info" } },
          grid_export: { energy: E.gridExport, tap_action: { action: "more-info", entity: "sensor.meter" } },
        },
        home: { tap_action: { action: "more-info" } },
        nodes: (options.nodes ?? []).map((node) => {
          if (node.id === "masina") return { ...node, tap_action: { action: "navigate", navigation_path: "/lovelace/cost-masina" } };
          if (node.id === "casa") return { ...node, tap_action: { action: "explain" } };
          if (node.id === "casuta") return { ...node, tap_action: { action: "none" } };
          if (node.id === "ac") return { ...node, tap_action: { action: "more-info" } };
          return node;
        }),
        rest: { tap_action: { action: "perform-action", perform_action: "script.rest", confirmation: true } },
        untracked: { tap_action: { action: "more-info", entity: "sensor.untracked" } },
      },
      "ro",
    );
    return buildEnergyTree(config, august2026Values());
  }

  it("passes navigate to the frontend with the node's entity", () => {
    expect(resolveTap(findNode(configuredTree(), "masina"))).toStrictEqual({
      type: "action",
      detail: {
        config: { entity: E.masina, tap_action: { action: "navigate", navigation_path: "/lovelace/cost-masina" } },
        action: "tap",
      },
    });
  });

  it("fills the entity of more-info: power sensor, else energy sensor; keeps a configured one", () => {
    const t = configuredTree();
    expect(resolveTap(findNode(t, "ac"))).toStrictEqual(moreInfo(E.ac));
    expect(resolveTap(findNode(t, "grid_import"))).toStrictEqual(moreInfo(E.gridImport));
    expect(resolveTap(findNode(t, "grid_export"))).toStrictEqual({
      type: "action",
      detail: { config: { entity: E.gridExport, tap_action: { action: "more-info", entity: "sensor.meter" } }, action: "tap" },
    });
    expect(resolveTap(findNode(t, "untracked"))).toStrictEqual({
      type: "action",
      detail: { config: { tap_action: { action: "more-info", entity: "sensor.untracked" } }, action: "tap" },
    });
  });

  it("leaves more-info without an entity to the frontend when the node has no sensor (Home without power)", () => {
    expect(resolveTap(findNode(configuredTree(), "home"))).toStrictEqual({
      type: "action",
      detail: { config: { tap_action: { action: "more-info" } }, action: "tap" },
    });
  });

  it("explain on a measured node explains instead of opening more-info", () => {
    expect(resolveTap(findNode(configuredTree(), "casa"))).toStrictEqual({ type: "explain" });
  });

  it("none does nothing", () => {
    expect(resolveTap(findNode(configuredTree(), "casuta"))).toStrictEqual({ type: "none" });
  });

  it("passes perform-action with its options (confirmation, ...) on every Rest node", () => {
    expect(resolveTap(findNode(configuredTree(), "rest:casa"))).toStrictEqual({
      type: "action",
      detail: {
        config: { tap_action: { action: "perform-action", perform_action: "script.rest", confirmation: true } },
        action: "tap",
      },
    });
  });

  it("applies to nodes whose energy is unavailable too", () => {
    const options = ownerOptions();
    const config = makeConfig({
      ...options,
      nodes: (options.nodes ?? []).map((node) =>
        node.id === "masina" ? { ...node, tap_action: { action: "navigate", navigation_path: "/x" } } : node,
      ),
    });
    const values = august2026Values();
    delete values[E.masina];
    expect(resolveTap(findNode(buildEnergyTree(config, values), "masina")).type).toBe("action");
  });
});
