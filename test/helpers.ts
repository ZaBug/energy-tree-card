// Shared fixtures for the data layer tests.
import { normalizeConfig } from "../src/data/config";
import type {
  EnergyTree,
  EnergyTreeCardConfig,
  Language,
  NormalizedConfig,
  PeriodValues,
  TreeNode,
} from "../src/types";

export const CARD_TYPE = "custom:energy-tree-card";

/** Normalized config from YAML options (the card `type` is filled in). */
export function makeConfig(options: Omit<EnergyTreeCardConfig, "type">, language: Language = "en"): NormalizedConfig {
  return normalizeConfig({ type: CARD_TYPE, ...options }, language);
}

/** Every node of the tree: the sources, then Home and its descendants depth-first. */
export function allNodes(tree: EnergyTree): TreeNode[] {
  const nodes: TreeNode[] = [];
  const visit = (node: TreeNode): void => {
    nodes.push(node);
    node.children.forEach(visit);
  };
  tree.sources.forEach(visit);
  visit(tree.home);
  return nodes;
}

/** The node with this id; throws when it is not in the tree. */
export function findNode(tree: EnergyTree, id: string): TreeNode {
  const node = allNodes(tree).find((candidate) => candidate.id === id);
  if (!node) throw new Error(`node "${id}" is not in the tree`);
  return node;
}

/** True when the tree has a node with this id. */
export function hasNode(tree: EnergyTree, id: string): boolean {
  return allNodes(tree).some((node) => node.id === id);
}

export function childIds(node: TreeNode): string[] {
  return node.children.map((child) => child.id);
}

export function lastChild(node: TreeNode): TreeNode | undefined {
  return node.children[node.children.length - 1];
}

/** "<id>.<field>" for every energy, cost or share in the tree that is NaN (expected to be empty). */
export function nanFields(tree: EnergyTree): string[] {
  const found: string[] = [];
  for (const node of allNodes(tree)) {
    for (const field of ["energy", "cost", "share"] as const) {
      if (Number.isNaN(node[field])) found.push(`${node.id}.${field}`);
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// The owner's setup (README "Full example") with the real August 2026 totals
// ---------------------------------------------------------------------------

export const E = {
  solar: "sensor.shellyem3_485519db8f59_channel_a_energy_returned",
  gridImport: "sensor.principal_energy",
  gridImportCost: "sensor.principal_energy_cost",
  gridExport: "sensor.principal_energy_returned",
  gridExportCompensation: "sensor.principal_energy_returned_compensation",
  casa: "sensor.casa_energy",
  casaCost: "sensor.cost_lunar_casa",
  ac: "sensor.18691697773822_total_energy_consumption",
  acCost: "sensor.cost_lunar_ac",
  server: "sensor.ups_energy_spent",
  serverCost: "sensor.cost_server_lunar",
  casuta: "sensor.casuta_energy",
  casutaCost: "sensor.cost_lunar_casuta",
  masina: "sensor.wallbox_energie_totala",
  masinaCost: "sensor.ev_cost_factura_neta",
} as const;

/** YAML options of the owner's card: Casa -> AC, Server; Căsuță; Mașină. */
export function ownerOptions(): Omit<EnergyTreeCardConfig, "type"> {
  return {
    title: "Arbore energie",
    language: "ro",
    sources: {
      solar: { energy: E.solar, name: "Solar" },
      grid_import: { energy: E.gridImport, cost: E.gridImportCost, name: "Import rețea" },
      grid_export: { energy: E.gridExport, cost: E.gridExportCompensation, name: "Export rețea" },
    },
    home: { name: "Consum total" },
    nodes: [
      { id: "casa", name: "Casa", energy: E.casa, cost: E.casaCost, power: "sensor.casa_power" },
      { id: "ac", parent: "casa", name: "AC", energy: E.ac, cost: E.acCost },
      { id: "server", parent: "casa", name: "Server", energy: E.server, cost: E.serverCost },
      { id: "casuta", name: "Căsuță", energy: E.casuta, cost: E.casutaCost },
      { id: "masina", name: "Mașină", energy: E.masina, cost: E.masinaCost },
    ],
  };
}

export function ownerConfig(): NormalizedConfig {
  return makeConfig(ownerOptions(), "ro");
}

/** August 2026: kWh and RON summed from the statistics. */
export function august2026Values(): PeriodValues {
  return {
    [E.solar]: 1079.59,
    [E.gridImport]: 315.69,
    [E.gridImportCost]: 350.42,
    [E.gridExport]: 605.43,
    [E.gridExportCompensation]: 272.44,
    [E.casa]: 478.08,
    [E.casaCost]: 47.0,
    [E.ac]: 124.49,
    [E.acCost]: 12.24,
    [E.server]: 0.0,
    [E.serverCost]: 0.0,
    [E.casuta]: 28.08,
    [E.casutaCost]: 2.76,
    [E.masina]: 286.97,
    [E.masinaCost]: 28.21,
  };
}
