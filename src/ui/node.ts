import { html, type TemplateResult } from "lit";
import { styleMap } from "lit/directives/style-map.js";
import { localize } from "../localize";
import type { EnergyTree, HomeAssistant, Language, NodeKind, NormalizedConfig, TreeNode } from "../types";
import { PLACEHOLDER, formatCost, formatNumber, formatPower } from "./format";
import { resolveTap } from "./tap";

/** Theme colour per node kind when the config sets none. */
const DEFAULT_COLORS: Record<NodeKind, string> = {
  solar: "var(--energy-solar-color, #ff9800)",
  grid_import: "var(--energy-grid-consumption-color, #488fc2)",
  grid_export: "var(--energy-grid-return-color, #8353d1)",
  home: "var(--primary-color, #03a9f4)",
  consumer: "var(--primary-color, #03a9f4)",
  rest: "var(--secondary-text-color, #9b9b9b)",
  untracked: "var(--secondary-text-color, #9b9b9b)",
};

/** Everything the layouts need to turn tree nodes into text. Built once per render. */
export interface RenderContext {
  language: Language;
  /** BCP 47 tag for Intl formatting. */
  locale: string;
  currency: string;
  kwhDecimals: number;
  costDecimals: number;
  states: HomeAssistant["states"];
  /** Some node shows a cost / a live power: bar rows reserve the column so values line up. */
  anyCost: boolean;
  anyPower: boolean;
  /** Tap handling and the open explanation; set by the card. */
  interaction?: Interaction;
}

/** The node whose explanation is open, with the lines to show. */
export interface OpenExplanation {
  node: TreeNode;
  lines: string[];
}

export interface Interaction {
  explained?: OpenExplanation;
  /** A node was tapped, clicked, or activated with Enter / Space. */
  activate(node: TreeNode): void;
  closeExplanation(): void;
}

function someNode(node: TreeNode, test: (node: TreeNode) => boolean): boolean {
  return test(node) || node.children.some((child) => someNode(child, test));
}

export function createContext(hass: HomeAssistant | undefined, config: NormalizedConfig, tree?: EnergyTree): RenderContext {
  const nodes = tree ? [...tree.sources, tree.home] : [];
  return {
    language: config.language,
    locale: hass?.locale?.language || hass?.language || config.language,
    currency: config.currency ?? hass?.config?.currency ?? "",
    kwhDecimals: config.kwh_decimals,
    costDecimals: config.cost_decimals,
    states: hass?.states ?? {},
    anyCost: nodes.some((node) => someNode(node, (n) => n.hasCost)),
    anyPower: nodes.some((node) => someNode(node, (n) => n.power !== undefined)),
  };
}

/** CSS colour of a node: the configured colour, else the theme default for its kind. */
export function nodeColor(node: TreeNode): string {
  const configured = typeof node.color === "string" ? node.color.trim() : "";
  return configured !== "" ? configured : (DEFAULT_COLORS[node.kind] ?? DEFAULT_COLORS.consumer);
}

/** `style` binding that exposes the node colour as --node-color (set through CSSOM, never as CSS text). */
export function nodeColorStyle(node: TreeNode) {
  return styleMap({ "--node-color": nodeColor(node) });
}

/** Automatic nodes (Rest, Untracked) are drawn muted. */
export function isMuted(node: TreeNode): boolean {
  return node.kind === "rest" || node.kind === "untracked";
}

/** Formatted kWh number without the unit; null when unavailable. */
export function energyValue(node: TreeNode, ctx: RenderContext): string | null {
  return formatNumber(node.energy, ctx.kwhDecimals, ctx.locale);
}

/** Formatted cost; undefined when the node has no cost, null when it should have one but it is unavailable. */
export function costValue(node: TreeNode, ctx: RenderContext): string | null | undefined {
  if (!node.hasCost) return undefined;
  return formatCost(node.cost, ctx.costDecimals, ctx.locale, ctx.currency);
}

/** Formatted live power; undefined when no power entity is configured, null when it has no numeric state. */
export function powerValue(node: TreeNode, ctx: RenderContext): string | null | undefined {
  if (node.power === undefined) return undefined;
  return formatPower(ctx.states[node.power], ctx.locale);
}

/** The "—" placeholder, with a tooltip saying the value is unavailable. */
export function placeholder(ctx: RenderContext): TemplateResult {
  return html`<span class="na" title=${localize(ctx.language, "unavailable")}>${PLACEHOLDER}</span>`;
}

/** A formatted value, or the placeholder when it is null. */
export function shown(value: string | null, ctx: RenderContext): TemplateResult | string {
  return value === null ? placeholder(ctx) : value;
}

/** True when the explanation of this node is open. */
export function isExplained(node: TreeNode, ctx: RenderContext): boolean {
  return ctx.interaction?.explained?.node.id === node.id;
}

/** `aria-expanded` for nodes whose tap toggles the explanation; absent for nodes that run an action. */
export function ariaExpanded(node: TreeNode, ctx: RenderContext): "true" | "false" | undefined {
  return resolveTap(node).type === "explain" ? (isExplained(node, ctx) ? "true" : "false") : undefined;
}

/** Click handler of a node. */
export function onNodeClick(node: TreeNode, ctx: RenderContext): () => void {
  return () => ctx.interaction?.activate(node);
}

/** Keyboard activation like a native button: Enter on keydown, Space on keyup (keydown only stops the scroll). */
export function onNodeKey(node: TreeNode, ctx: RenderContext): (event: KeyboardEvent) => void {
  return (event: KeyboardEvent) => {
    if (event.target !== event.currentTarget) return;
    if (event.type === "keydown" && event.key === "Enter" && !event.repeat) {
      event.preventDefault();
      ctx.interaction?.activate(node);
    } else if (event.key === " " || event.key === "Spacebar") {
      event.preventDefault();
      if (event.type === "keyup") ctx.interaction?.activate(node);
    }
  };
}

/** Fraction clamped to 0..1; 0 for anything that is not a finite number. */
export function fraction(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
}

/** Number of nodes below `node` (all depths). */
export function countDescendants(node: TreeNode): number {
  return node.children.reduce((sum, child) => sum + 1 + countDescendants(child), 0);
}

/** Depth of the deepest node below `node`, relative to it (0 without children). */
export function subtreeDepth(node: TreeNode): number {
  return node.children.reduce((max, child) => Math.max(max, 1 + subtreeDepth(child)), 0);
}
