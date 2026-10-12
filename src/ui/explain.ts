import { localize } from "../localize";
import type { EnergyTree, HomeAssistant, Language, TreeNode } from "../types";
import { formatCost, formatNumber, formatPower } from "./format";

/** What the explanation needs to format numbers like the card does. */
export interface ExplainContext {
  language: Language;
  locale: string;
  currency: string;
  kwhDecimals: number;
  costDecimals: number;
  states: HomeAssistant["states"];
}

const MINUS = "−";

/** The node with this id (sources, Home and its descendants), if the tree has one. */
export function findTreeNode(tree: EnergyTree, id: string): TreeNode | undefined {
  const visit = (node: TreeNode): TreeNode | undefined => {
    if (node.id === id) return node;
    for (const child of node.children) {
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  for (const source of tree.sources) if (source.id === id) return source;
  return visit(tree.home);
}

/** Parent of the node with this id below Home; undefined for sources, Home and unknown ids. */
export function findParent(tree: EnergyTree, id: string): TreeNode | undefined {
  const visit = (node: TreeNode): TreeNode | undefined => {
    for (const child of node.children) {
      if (child.id === id) return node;
      const found = visit(child);
      if (found) return found;
    }
    return undefined;
  };
  return visit(tree.home);
}

/** Text lines that explain how the card got the values of a node, using the numbers of the current tree. */
export function explainNode(node: TreeNode, tree: EnergyTree, ctx: ExplainContext): string[] {
  const lines =
    node.kind === "home"
      ? explainHome(node, tree, ctx)
      : node.kind === "rest" || node.kind === "untracked"
        ? explainRemainder(node, tree, ctx)
        : explainMeasured(node, ctx);
  const power = powerLine(node, ctx);
  if (power) lines.push(power);
  return lines;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** A real minus sign instead of the hyphen Intl uses. */
function minus(text: string): string {
  return text.replace("-", MINUS);
}

function kwh(value: number, ctx: ExplainContext): string {
  return minus(formatNumber(value, ctx.kwhDecimals, ctx.locale) ?? "");
}

function money(value: number, ctx: ExplainContext): string {
  return minus(formatNumber(value, ctx.costDecimals, ctx.locale) ?? "");
}

function moneyWithCurrency(value: number, ctx: ExplainContext, decimals = ctx.costDecimals): string {
  return minus(formatCost(value, decimals, ctx.locale, ctx.currency) ?? "");
}

/** "a + b − c" from signed terms; a leading negative term starts with "−". */
function signedSum(terms: readonly { negative: boolean; text: string }[]): string {
  return terms
    .map((term, index) => {
      if (index === 0) return term.negative ? `${MINUS}${term.text}` : term.text;
      return `${term.negative ? MINUS : "+"} ${term.text}`;
    })
    .join(" ");
}

function missingLine(entity: string | undefined, ctx: ExplainContext): string {
  return entity
    ? localize(ctx.language, "explain_missing", { entity })
    : localize(ctx.language, "explain_unavailable", { what: "?" });
}

/** "<name>: <why it is unavailable>" for an input of a derived value. */
function unavailableInput(node: TreeNode, ctx: ExplainContext): string {
  if (node.energyEntity) return `${node.name}: ${missingLine(node.energyEntity, ctx)}`;
  return localize(ctx.language, "explain_unavailable", { what: node.name });
}

function powerLine(node: TreeNode, ctx: ExplainContext): string | undefined {
  if (node.power === undefined) return undefined;
  if (formatPower(ctx.states[node.power], ctx.locale) !== null) return undefined;
  return localize(ctx.language, "explain_unavailable", { what: node.power });
}

// ---------------------------------------------------------------------------
// Node kinds
// ---------------------------------------------------------------------------

/** Source or consumer: the statistics its values come from. */
function explainMeasured(node: TreeNode, ctx: ExplainContext): string[] {
  const lines: string[] = [];
  if (node.energy === null) {
    lines.push(missingLine(node.energyEntity, ctx));
  } else if (node.energyEntity) {
    const value = `${kwh(node.energy, ctx)} kWh`;
    lines.push(localize(ctx.language, "explain_from_statistics", { value, entity: node.energyEntity }));
  }
  if (node.hasCost && node.costEntity) {
    if (node.cost === null) lines.push(missingLine(node.costEntity, ctx));
    else {
      const value = moneyWithCurrency(node.cost, ctx);
      lines.push(localize(ctx.language, "explain_from_statistics", { value, entity: node.costEntity }));
    }
  }
  return lines;
}

/** Home = solar + grid import − grid export (configured sources only), and its cost. */
function explainHome(home: TreeNode, tree: EnergyTree, ctx: ExplainContext): string[] {
  const sources = tree.sources;
  const terms = sources.map((source) => ({ negative: source.kind === "grid_export", text: source.name }));
  const formula = `${home.name} = ${signedSum(terms)}`;
  const lines: string[] = [];

  const unknown = sources.filter((source) => source.energy === null);
  if (sources.length === 0) {
    lines.push(`${home.name} = 0 kWh`);
  } else if (unknown.length > 0) {
    lines.push(formula, ...unknown.map((source) => unavailableInput(source, ctx)));
  } else {
    let raw = 0;
    const numbers = sources.map((source) => {
      const value = source.energy ?? 0;
      const negative = source.kind === "grid_export";
      raw += negative ? -value : value;
      return { negative, text: kwh(value, ctx) };
    });
    const clamp = raw < 0 ? ` (${localize(ctx.language, "explain_below_zero")})` : "";
    lines.push(`${formula} = ${signedSum(numbers)} = ${kwh(raw, ctx)} kWh${clamp}`);
  }

  if (home.hasCost) {
    // Home has a cost only when grid import has one and grid export has one or is not configured.
    const costSources = sources.filter((source) => source.kind === "grid_import" || source.kind === "grid_export");
    const missing = costSources.filter((source) => source.cost === null);
    if (missing.length > 0) {
      lines.push(...missing.map((source) => `Cost: ${source.name}: ${missingLine(source.costEntity, ctx)}`));
    } else if (home.cost !== null) {
      // Grid export cost is already negative (a credit): show it as a subtraction of the compensation.
      const names = costSources.map((source) => ({ negative: source.kind === "grid_export", text: source.name }));
      const numbers = costSources.map((source) => ({
        negative: source.kind === "grid_export",
        text: money(source.kind === "grid_export" ? 0 - (source.cost ?? 0) : (source.cost ?? 0), ctx),
      }));
      lines.push(`Cost = ${signedSum(names)} = ${signedSum(numbers)} = ${moneyWithCurrency(home.cost, ctx)}`);
    }
  }
  return lines;
}

/** Rest (parent − its children) and Untracked (Home − first-level consumers), with the average-price cost. */
function explainRemainder(node: TreeNode, tree: EnergyTree, ctx: ExplainContext): string[] {
  const parent = node.kind === "untracked" ? tree.home : findParent(tree, node.id);
  if (!parent) return [];
  const parts = parent.children.filter((child) => child.kind !== "rest" && child.kind !== "untracked");
  const grouped = node.kind === "untracked" && parts.length > 1;
  const joinParts = (texts: string[]): string => {
    if (grouped) return `${MINUS} (${texts.join(" + ")})`;
    return texts.map((text) => `${MINUS} ${text}`).join(" ");
  };
  const formula = [`${node.name} = ${parent.name}`, joinParts(parts.map((part) => part.name))].filter(Boolean).join(" ");
  const lines: string[] = [];

  const unknown = [parent, ...parts].filter((candidate) => candidate.energy === null);
  if (parent.energy === null || unknown.length > 0) {
    lines.push(formula, ...unknown.map((candidate) => unavailableInput(candidate, ctx)));
    return lines;
  }

  const partsSum = parts.reduce((sum, part) => sum + (part.energy ?? 0), 0);
  const raw = parent.energy - partsSum;
  const numbers = [kwh(parent.energy, ctx), joinParts(parts.map((part) => kwh(part.energy ?? 0, ctx)))];
  lines.push(`${formula} = ${numbers.filter(Boolean).join(" ")} = ${kwh(raw, ctx)} kWh`);
  if (raw < 0) {
    lines.push(localize(ctx.language, "explain_exceeds", { parent: parent.name, value: kwh(-raw, ctx) }));
  }

  if (node.hasCost && node.energy !== null) {
    if (node.cost !== null && parent.cost !== null && parent.energy > 0) {
      lines.push(
        localize(ctx.language, "explain_average_cost", {
          parent: parent.name,
          price: moneyWithCurrency(parent.cost / parent.energy, ctx, 3),
          energy: kwh(node.energy, ctx),
          cost: moneyWithCurrency(node.cost, ctx),
        }),
      );
    } else if (node.cost === null) {
      lines.push(localize(ctx.language, "explain_no_parent_cost", { parent: parent.name }));
    }
  }
  return lines;
}
