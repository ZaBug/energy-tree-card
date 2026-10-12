import type { TreeNode } from "../types";

/** Standard Home Assistant action object (`tap_action`), passed to the frontend as is. */
export interface HassActionConfig {
  action: string;
  entity?: string;
  [key: string]: unknown;
}

/**
 * Detail of the `hass-action` event the Home Assistant frontend handles for custom cards
 * (src/state/action-mixin.ts → handleAction in src/panels/lovelace/common/handle-action.ts).
 */
export interface HassActionDetail {
  config: { entity?: string; tap_action: HassActionConfig };
  action: "tap";
}

/** What a tap on a node does: a standard action, the card's own explanation, or nothing. */
export type TapResult = { type: "action"; detail: HassActionDetail } | { type: "explain" } | { type: "none" };

/** Entity for more-info: the live power sensor if configured, else the energy sensor. */
export function tapEntity(node: TreeNode): string | undefined {
  return node.power ?? node.energyEntity;
}

function actionResult(tapAction: HassActionConfig, entity: string | undefined): TapResult {
  const config: HassActionDetail["config"] = { tap_action: tapAction };
  if (entity !== undefined) config.entity = entity;
  return { type: "action", detail: { config, action: "tap" } };
}

/**
 * Default tap: a measured node (source or consumer) with a value opens more-info; Home, Rest,
 * Untracked and nodes whose energy is unavailable explain how their value is computed.
 */
export function resolveTap(node: TreeNode): TapResult {
  const entity = tapEntity(node);
  const measured = node.kind !== "home" && node.kind !== "rest" && node.kind !== "untracked";
  if (measured && node.energyEntity !== undefined && node.energy !== null && entity !== undefined) {
    return actionResult({ action: "more-info", entity }, entity);
  }
  return { type: "explain" };
}
