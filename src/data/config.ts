import { localize } from "../localize";
import type {
  EnergyTreeCardConfig,
  Language,
  LayoutMode,
  NormalizedConfig,
  NormalizedConsumer,
  NormalizedSource,
} from "../types";

type SourceKey = "solar" | "grid_import" | "grid_export";

const SOURCE_KEYS: readonly SourceKey[] = ["solar", "grid_import", "grid_export"];
const RESERVED_IDS: ReadonlySet<string> = new Set(["home", "solar", "grid_import", "grid_export", "untracked"]);
const LAYOUTS: readonly LayoutMode[] = ["auto", "tree", "bars"];

const ICONS = {
  solar: "mdi:solar-power-variant",
  grid_import: "mdi:transmission-tower-import",
  grid_export: "mdi:transmission-tower-export",
  home: "mdi:home-lightning-bolt",
  consumer: "mdi:flash",
  rest: "mdi:dots-horizontal-circle-outline",
  untracked: "mdi:help-circle-outline",
} as const;

type RawObject = Record<string, unknown>;

/** Throw a config error with the card prefix. */
function fail(message: string): never {
  throw new Error(`energy-tree-card: ${message}`);
}

function isObject(value: unknown): value is RawObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Required non-empty string field. */
function requiredString(obj: RawObject, key: string, where: string): string {
  const value = obj[key];
  if (typeof value !== "string" || value.trim() === "") fail(`${where}.${key} must be a non-empty string`);
  return value;
}

/** Optional string field: undefined, null and "" count as absent; anything else must be a string. */
function optionalString(obj: RawObject, key: string, where: string): string | undefined {
  const value = obj[key];
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string") fail(`${where}.${key} must be a string`);
  return value;
}

/** Optional nested block: undefined or null means {}, anything else must be an object. */
function optionalBlock(value: unknown, where: string): RawObject {
  if (value === undefined || value === null) return {};
  if (!isObject(value)) fail(`${where} must be an object`);
  return value;
}

function optionalBoolean(obj: RawObject, key: string, where: string, fallback: boolean): boolean {
  const value = obj[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") fail(`${where}.${key} must be true or false`);
  return value;
}

function optionalDecimals(obj: RawObject, key: string, fallback: number): number {
  const value = obj[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 4) {
    fail(`${key} must be an integer from 0 to 4`);
  }
  return value;
}

/** Copy of obj without the keys whose value is undefined. */
function compact<T extends object>(obj: T): T {
  const out: RawObject = {};
  for (const [key, value] of Object.entries(obj)) if (value !== undefined) out[key] = value;
  return out as T;
}

function normalizeSource(key: SourceKey, raw: unknown, language: Language): NormalizedSource {
  const where = `sources.${key}`;
  if (!isObject(raw)) fail(`${where} must be an object`);
  return compact<NormalizedSource>({
    energy: requiredString(raw, "energy", where),
    cost: optionalString(raw, "cost", where),
    power: optionalString(raw, "power", where),
    name: optionalString(raw, "name", where) ?? localize(language, key),
    icon: optionalString(raw, "icon", where) ?? ICONS[key],
    color: optionalString(raw, "color", where),
  });
}

function normalizeNodes(rawNodes: unknown): NormalizedConsumer[] {
  if (rawNodes === undefined || rawNodes === null) return [];
  if (!Array.isArray(rawNodes)) fail("nodes must be a list");

  const nodes: NormalizedConsumer[] = [];
  const rawParents: unknown[] = [];
  const ids = new Set<string>();

  rawNodes.forEach((raw: unknown, index) => {
    if (!isObject(raw)) fail(`nodes[${index}] must be an object`);
    const id = requiredString(raw, "id", `nodes[${index}]`);
    if (RESERVED_IDS.has(id) || id.startsWith("rest:")) fail(`node id "${id}" is reserved`);
    if (ids.has(id)) fail(`duplicate node id "${id}"`);
    ids.add(id);

    const where = `node "${id}"`;
    const node = compact<NormalizedConsumer>({
      id,
      name: requiredString(raw, "name", where),
      icon: optionalString(raw, "icon", where) ?? ICONS.consumer,
      color: optionalString(raw, "color", where),
      energy: requiredString(raw, "energy", where),
      cost: optionalString(raw, "cost", where),
      power: optionalString(raw, "power", where),
    });
    nodes.push(node);
    rawParents.push(raw.parent);
  });

  // Parents may reference nodes defined later in the list, so resolve them after the first pass.
  nodes.forEach((node, index) => {
    const parent = rawParents[index];
    if (parent === undefined || parent === null || parent === "home") return;
    if (typeof parent !== "string") fail(`node "${node.id}" parent must be a string`);
    if (parent === node.id) fail(`node "${node.id}" cannot be its own parent`);
    if (!ids.has(parent)) fail(`node "${node.id}" has unknown parent "${parent}"`);
    node.parent = parent;
  });

  const parentOf = new Map(nodes.map((node) => [node.id, node.parent]));
  for (const node of nodes) {
    const path = [node.id];
    let current = node.parent;
    while (current !== undefined) {
      if (current === node.id) fail(`node "${node.id}" has a parent cycle: ${[...path, current].join(" -> ")}`);
      // A loop that does not pass through this node is reported when its own members are checked.
      if (path.includes(current)) break;
      path.push(current);
      current = parentOf.get(current);
    }
  }
  return nodes;
}

/**
 * Validate the YAML config and fill defaults (names from localize(), default icons).
 * Throws Error with a readable message on invalid config (HA shows it as an error card).
 */
export function normalizeConfig(config: EnergyTreeCardConfig, language: Language): NormalizedConfig {
  if (!isObject(config)) fail("config must be an object");
  const raw: RawObject = config as unknown as RawObject;

  const layout = raw.layout ?? "auto";
  if (typeof layout !== "string" || !LAYOUTS.includes(layout as LayoutMode)) {
    fail(`layout must be one of ${LAYOUTS.join(", ")}`);
  }

  const narrowWidth = raw.narrow_width ?? 600;
  if (typeof narrowWidth !== "number" || !Number.isFinite(narrowWidth) || narrowWidth <= 0) {
    fail("narrow_width must be a positive number");
  }

  const collectionKey = raw.collection_key ?? undefined;
  if (collectionKey !== undefined && (typeof collectionKey !== "string" || !collectionKey.startsWith("energy_"))) {
    fail('collection_key must be a string starting with "energy_"');
  }

  const rawSources = optionalBlock(raw.sources, "sources");
  const sources: NormalizedConfig["sources"] = {};
  for (const key of SOURCE_KEYS) {
    if (rawSources[key] !== undefined) sources[key] = normalizeSource(key, rawSources[key], language);
  }
  if (Object.keys(sources).length === 0) fail("at least one source (solar, grid_import or grid_export) is required");

  const nodes = normalizeNodes(raw.nodes);

  const home = optionalBlock(raw.home, "home");
  const rest = optionalBlock(raw.rest, "rest");
  const untracked = optionalBlock(raw.untracked, "untracked");

  return compact<NormalizedConfig>({
    title: typeof raw.title === "string" ? raw.title : undefined,
    collection_key: collectionKey,
    layout: layout as LayoutMode,
    narrow_width: narrowWidth,
    language,
    currency: typeof raw.currency === "string" ? raw.currency : undefined,
    kwh_decimals: optionalDecimals(raw, "kwh_decimals", 1),
    cost_decimals: optionalDecimals(raw, "cost_decimals", 2),
    sources,
    home: compact({
      name: optionalString(home, "name", "home") ?? localize(language, "home"),
      icon: optionalString(home, "icon", "home") ?? ICONS.home,
      color: optionalString(home, "color", "home"),
      power: optionalString(home, "power", "home"),
    }),
    nodes,
    rest: compact({
      show: optionalBoolean(rest, "show", "rest", true),
      name: optionalString(rest, "name", "rest") ?? localize(language, "rest"),
      icon: optionalString(rest, "icon", "rest") ?? ICONS.rest,
      color: optionalString(rest, "color", "rest"),
    }),
    untracked: compact({
      show: optionalBoolean(untracked, "show", "untracked", true),
      name: optionalString(untracked, "name", "untracked") ?? localize(language, "untracked"),
      icon: optionalString(untracked, "icon", "untracked") ?? ICONS.untracked,
      color: optionalString(untracked, "color", "untracked"),
    }),
  });
}

/** Unique statistic ids (energy and cost) referenced by the config, in config order. */
export function statisticIds(config: NormalizedConfig): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  const add = (id: string | undefined): void => {
    if (id && !seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  };
  for (const key of SOURCE_KEYS) {
    const source = config.sources[key];
    if (source) {
      add(source.energy);
      add(source.cost);
    }
  }
  for (const node of config.nodes) {
    add(node.energy);
    add(node.cost);
  }
  return ids;
}
