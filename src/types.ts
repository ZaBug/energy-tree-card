// Shared types: card configuration, Home Assistant subset and the energy tree model.
// This file is the contract between the data layer (src/data) and the UI.

/** Minimal subset of the Home Assistant frontend `hass` object used by the card. */
export interface HassEntityState {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
}

export interface HomeAssistant {
  states: Record<string, HassEntityState | undefined>;
  connection: object;
  callWS<T>(message: Record<string, unknown>): Promise<T>;
  locale?: { language: string };
  language?: string;
  config: { currency?: string; time_zone?: string };
  panelUrl?: string;
  themes?: { darkMode?: boolean };
}

/** Energy collection created by the frontend's Energy date picker (`hass.connection._energy_*`). */
export interface EnergyCollectionData {
  start: Date;
  end?: Date;
}

export interface EnergyCollectionLike {
  start?: Date;
  end?: Date;
  state?: EnergyCollectionData;
  subscribe(callback: (data: EnergyCollectionData) => void): () => void;
}

// ---------------------------------------------------------------------------
// Card configuration (YAML)
// ---------------------------------------------------------------------------

export type Language = "ro" | "en";
export type LayoutMode = "auto" | "tree" | "bars";

export interface NodeStyle {
  name?: string;
  icon?: string;
  color?: string;
}

export interface SourceConfig extends NodeStyle {
  /** Statistic id of a cumulative energy sensor (kWh). */
  energy: string;
  /** Statistic id of a cost (grid import) or compensation (grid export) sensor. */
  cost?: string;
  /** Entity id of a live power sensor (W). */
  power?: string;
}

export interface ConsumerConfig extends NodeStyle {
  id: string;
  name: string;
  energy: string;
  cost?: string;
  power?: string;
  /** Id of another consumer; omitted or "home" means first level under Home. */
  parent?: string;
}

export interface AutoNodeConfig {
  show?: boolean;
  /** For `rest`, "{parent}" is replaced by the parent's name. */
  name?: string;
  icon?: string;
  color?: string;
}

export interface EnergyTreeCardConfig {
  type: string;
  title?: string;
  /** Energy collection key; must start with "energy_". Default: the dashboard's own collection. */
  collection_key?: string;
  layout?: LayoutMode;
  /** Card width (px) below which layout "auto" shows bars. */
  narrow_width?: number;
  language?: Language;
  currency?: string;
  kwh_decimals?: number;
  cost_decimals?: number;
  sources?: {
    solar?: SourceConfig;
    grid_import?: SourceConfig;
    grid_export?: SourceConfig;
  };
  home?: NodeStyle & { power?: string };
  nodes?: ConsumerConfig[];
  rest?: AutoNodeConfig;
  untracked?: AutoNodeConfig;
}

/** Config after validation, with defaults filled in. Names and icons are always set. */
export interface NormalizedSource {
  energy: string;
  cost?: string;
  power?: string;
  name: string;
  icon: string;
  color?: string;
}

export interface NormalizedConsumer {
  id: string;
  name: string;
  icon: string;
  color?: string;
  energy: string;
  cost?: string;
  power?: string;
  /** Parent consumer id, or undefined for first level. */
  parent?: string;
}

export interface NormalizedConfig {
  title?: string;
  collection_key?: string;
  layout: LayoutMode;
  narrow_width: number;
  language: Language;
  currency?: string;
  kwh_decimals: number;
  cost_decimals: number;
  sources: {
    solar?: NormalizedSource;
    grid_import?: NormalizedSource;
    grid_export?: NormalizedSource;
  };
  home: { name: string; icon: string; color?: string; power?: string };
  /** Consumers in config order; parents are validated (exist, no cycles). */
  nodes: NormalizedConsumer[];
  rest: { show: boolean; name: string; icon: string; color?: string };
  untracked: { show: boolean; name: string; icon: string; color?: string };
}

// ---------------------------------------------------------------------------
// Period and statistics
// ---------------------------------------------------------------------------

export type StatPeriod = "hour" | "day" | "month";

export interface EnergyPeriod {
  start: Date;
  /** Inclusive end as set by the date picker (e.g. 23:59:59.999); undefined means "now". */
  end?: Date;
}

/** One row of `recorder/statistics_during_period` (start/end are epoch milliseconds). */
export interface StatisticsRow {
  start: number;
  end: number;
  change?: number | null;
}

export type StatisticsResult = Record<string, StatisticsRow[] | undefined>;

/**
 * Statistic id -> summed `change` for the period.
 * 0 when the entity exists but has no rows in the period; null when neither the
 * entity nor any statistics exist (shown as a placeholder).
 */
export type PeriodValues = Record<string, number | null>;

// ---------------------------------------------------------------------------
// Tree model
// ---------------------------------------------------------------------------

export type NodeKind = "solar" | "grid_import" | "grid_export" | "home" | "consumer" | "rest" | "untracked";

export interface TreeNode {
  /** Consumer id from config; "solar", "grid_import", "grid_export", "home", "rest:<parentId>" or "untracked". */
  id: string;
  kind: NodeKind;
  name: string;
  icon: string;
  color?: string;
  /** kWh for the period; null when unavailable. Never negative for home, rest and untracked. */
  energy: number | null;
  /**
   * Signed contribution to the bill for the period (currency). Grid export is negative
   * (compensation). null when unavailable or when the node has no cost.
   */
  cost: number | null;
  /** True when the node has a cost: configured, or derivable for home / rest / untracked. */
  hasCost: boolean;
  /** Entity id of the live power sensor, if configured. */
  power?: string;
  /** Statistic id of the energy sensor (undefined for derived nodes). */
  energyEntity?: string;
  /** Statistic id of the cost sensor (undefined for derived nodes and nodes without cost). */
  costEntity?: string;
  /** Home = 0, first-level consumers = 1, their children = 2, ... Sources = 0. */
  depth: number;
  /** energy / parent energy, clamped to 0..1; null for sources, home or unknown values. */
  share: number | null;
  children: TreeNode[];
}

export interface EnergyTree {
  /** Configured sources in the order solar, grid_import, grid_export. */
  sources: TreeNode[];
  /** Home node; children are the first-level consumers, then "untracked" (if shown). */
  home: TreeNode;
}
