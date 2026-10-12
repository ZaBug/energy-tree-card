import type { TapActionConfig, TreeNode } from "../types";

/** Standard Home Assistant action object (`tap_action`), passed to the frontend as is. */
export type HassActionConfig = TapActionConfig;

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
 * A configured `tap_action` wins: `explain` toggles the explanation, `none` does nothing, anything
 * else goes to the frontend (`more-info` without `entity` uses the node's power, else energy sensor).
 * Default: a measured node (source or consumer) with a value opens more-info; Home, Rest,
 * Untracked and nodes whose energy is unavailable explain how their value is computed.
 */
export function resolveTap(node: TreeNode): TapResult {
  const entity = tapEntity(node);
  const configured = node.tapAction;
  if (configured) {
    if (configured.action === "explain") return { type: "explain" };
    if (configured.action === "none") return { type: "none" };
    if (configured.action === "more-info" && !configured.entity && entity !== undefined) {
      return actionResult({ ...configured, entity }, entity);
    }
    return actionResult(configured, entity);
  }
  const measured = node.kind !== "home" && node.kind !== "rest" && node.kind !== "untracked";
  if (measured && node.energyEntity !== undefined && node.energy !== null && entity !== undefined) {
    return actionResult({ action: "more-info", entity }, entity);
  }
  return { type: "explain" };
}
