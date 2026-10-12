import type { EnergyTree, NodeKind, NormalizedConfig, NormalizedConsumer, PeriodValues, TreeNode } from "../types";

type SourceKey = "solar" | "grid_import" | "grid_export";

const SOURCE_KEYS: readonly SourceKey[] = ["solar", "grid_import", "grid_export"];

/** values[id] when it is a finite number, else null. */
export function periodValue(values: PeriodValues, id: string | undefined): number | null {
  if (id === undefined || !Object.prototype.hasOwnProperty.call(values, id)) return null;
  const value = values[id];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Sum of the values, or null when any of them is null. */
export function sumOrNull(values: readonly (number | null)[]): number | null {
  let sum = 0;
  for (const value of values) {
    if (value === null) return null;
    sum += value;
  }
  return sum;
}

/** Home consumption max(0, solar + import − export); undefined = source not configured (0), null = unknown. */
export function homeEnergy(
  solar: number | null | undefined,
  gridImport: number | null | undefined,
  gridExport: number | null | undefined,
): number | null {
  if (solar === null || gridImport === null || gridExport === null) return null;
  return Math.max(0, (solar ?? 0) + (gridImport ?? 0) - (gridExport ?? 0));
}

/** Energy not covered by the parts: max(0, total − Σ parts), or null when any value is null. */
export function remainderEnergy(total: number | null, parts: readonly (number | null)[]): number | null {
  const sum = sumOrNull(parts);
  return total === null || sum === null ? null : Math.max(0, total - sum);
}

/**
 * Cost of a derived node at the parent's average price: energy × parent cost / parent energy.
 * 0 when the energy is 0; null when a value is unknown or the parent energy is not positive.
 * Independent of the siblings' costs, so a gap in a sibling's cost statistics does not move into it.
 */
export function averagePriceCost(energy: number | null, parentEnergy: number | null, parentCost: number | null): number | null {
  if (energy === null || parentEnergy === null || parentCost === null) return null;
  if (energy === 0) return 0;
  return parentEnergy > 0 ? (parentCost * energy) / parentEnergy : null;
}

/** energy / parent energy clamped to 0..1; null when either is unknown or the parent energy is not positive. */
export function energyShare(energy: number | null, parentEnergy: number | null): number | null {
  if (energy === null || parentEnergy === null || !(parentEnergy > 0)) return null;
  return Math.min(1, Math.max(0, energy / parentEnergy));
}

interface NodeInit {
  id: string;
  kind: NodeKind;
  name: string;
  icon: string;
  color?: string;
  energy: number | null;
  cost: number | null;
  hasCost: boolean;
  power?: string;
  energyEntity?: string;
  depth: number;
  share: number | null;
}

/** TreeNode without children; optional fields are left out when undefined. */
function makeNode(init: NodeInit): TreeNode {
  const node: TreeNode = {
    id: init.id,
    kind: init.kind,
    name: init.name,
    icon: init.icon,
    energy: init.energy,
    cost: init.cost,
    hasCost: init.hasCost,
    depth: init.depth,
    share: init.share,
    children: [],
  };
  if (init.color !== undefined) node.color = init.color;
  if (init.power !== undefined) node.power = init.power;
  if (init.energyEntity !== undefined) node.energyEntity = init.energyEntity;
  return node;
}

/** Build the source / home / consumer tree for one period from summed statistics. */
export function buildEnergyTree(config: NormalizedConfig, values: PeriodValues): EnergyTree {
  const v = (id: string | undefined): number | null => periodValue(values, id);

  const sources: TreeNode[] = [];
  const sourceNodes: Partial<Record<SourceKey, TreeNode>> = {};
  for (const key of SOURCE_KEYS) {
    const source = config.sources[key];
    if (!source) continue;
    let cost: number | null = null;
    if (source.cost) {
      const raw = v(source.cost);
      // Export compensation is a credit on the bill.
      cost = raw === null ? null : key === "grid_export" ? 0 - raw : raw;
    }
    const node = makeNode({
      id: key,
      kind: key,
      name: source.name,
      icon: source.icon,
      color: source.color,
      energy: v(source.energy),
      cost,
      hasCost: !!source.cost,
      power: source.power,
      energyEntity: source.energy,
      depth: 0,
      share: null,
    });
    sources.push(node);
    sourceNodes[key] = node;
  }

  const { solar, grid_import: gridImport, grid_export: gridExport } = sourceNodes;
  const homeHasCost = !!gridImport?.hasCost && (!gridExport || gridExport.hasCost);
  const home = makeNode({
    id: "home",
    kind: "home",
    name: config.home.name,
    icon: config.home.icon,
    color: config.home.color,
    energy: homeEnergy(solar?.energy, gridImport?.energy, gridExport?.energy),
    cost: homeHasCost ? sumOrNull([gridImport?.cost ?? null, gridExport ? gridExport.cost : 0]) : null,
    hasCost: homeHasCost,
    power: config.home.power,
    depth: 0,
    share: null,
  });

  const childrenOf = new Map<string | undefined, NormalizedConsumer[]>();
  for (const consumer of config.nodes) {
    const list = childrenOf.get(consumer.parent);
    if (list) list.push(consumer);
    else childrenOf.set(consumer.parent, [consumer]);
  }

  /** "Rest of <parent>": parent minus its measured children. */
  const remainderNode = (parent: TreeNode, children: readonly TreeNode[]): TreeNode => {
    const energy = remainderEnergy(parent.energy, children.map((child) => child.energy));
    return makeNode({
      id: `rest:${parent.id}`,
      kind: "rest",
      name: config.rest.name.replace("{parent}", parent.name),
      icon: config.rest.icon,
      color: config.rest.color,
      energy,
      cost: parent.hasCost ? averagePriceCost(energy, parent.energy, parent.cost) : null,
      hasCost: parent.hasCost,
      depth: parent.depth + 1,
      share: energyShare(energy, parent.energy),
    });
  };

  // Guards against a cycle in a config that did not go through normalizeConfig.
  const visited = new Set<string>();
  const buildChildren = (parent: TreeNode, parentId: string | undefined): TreeNode[] => {
    const children: TreeNode[] = [];
    for (const consumer of childrenOf.get(parentId) ?? []) {
      if (visited.has(consumer.id)) continue;
      visited.add(consumer.id);
      const energy = v(consumer.energy);
      const node = makeNode({
        id: consumer.id,
        kind: "consumer",
        name: consumer.name,
        icon: consumer.icon,
        color: consumer.color,
        energy,
        cost: consumer.cost ? v(consumer.cost) : null,
        hasCost: !!consumer.cost,
        power: consumer.power,
        energyEntity: consumer.energy,
        depth: parent.depth + 1,
        share: energyShare(energy, parent.energy),
      });
      node.children = buildChildren(node, consumer.id);
      if (node.children.length > 0 && config.rest.show) node.children.push(remainderNode(node, node.children));
      children.push(node);
    }
    return children;
  };

  const firstLevel = buildChildren(home, undefined);
  home.children = firstLevel;
  if (config.untracked.show && firstLevel.length > 0) {
    const energy = remainderEnergy(home.energy, firstLevel.map((child) => child.energy));
    home.children = [
      ...firstLevel,
      makeNode({
        id: "untracked",
        kind: "untracked",
        name: config.untracked.name,
        icon: config.untracked.icon,
        color: config.untracked.color,
        energy,
        cost: home.hasCost ? averagePriceCost(energy, home.energy, home.cost) : null,
        hasCost: home.hasCost,
        depth: 1,
        share: energyShare(energy, home.energy),
      }),
    ];
  }

  return { sources, home };
}
