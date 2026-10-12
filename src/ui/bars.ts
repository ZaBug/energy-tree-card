import { css, html, nothing, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { styleMap } from "lit/directives/style-map.js";
import { localize } from "../localize";
import type { EnergyTree, TreeNode } from "../types";
import {
  ariaExpanded,
  costValue,
  energyValue,
  fraction,
  isExplained,
  isMuted,
  nodeColorStyle,
  onNodeClick,
  onNodeKey,
  placeholder,
  powerValue,
  shown,
  type RenderContext,
} from "./node";

/**
 * Bars layout (phone): sources, then Home and the consumers as an indented tree.
 * Source bars are relative to the largest source. Home's bar is full: it is the 100 % that the
 * consumer bars below it (share of the parent) refer to.
 * Line 2 is bar, live power, cost: the cost sits in the right column under the kWh.
 * Every row is a button; an open explanation sits under its row.
 */
export function renderBars(tree: EnergyTree, ctx: RenderContext): TemplateResult {
  const energies = tree.sources.map((node) =>
    typeof node.energy === "number" && Number.isFinite(node.energy) ? node.energy : 0,
  );
  const max = Math.max(0, ...energies);
  const relative = (node: TreeNode): number => (max > 0 && node.energy !== null ? fraction(node.energy / max) : 0);
  const homeWidth = tree.home.energy !== null && tree.home.energy > 0 ? 1 : 0;

  return html`
    <div class="bars">
      ${tree.sources.length > 0
        ? html`
            <div class="section-label">${localize(ctx.language, "sources")}</div>
            ${tree.sources.map((source) => html`${barRow(source, relative(source), ctx)} ${explanation(source, ctx)}`)}
            <div class="section-label consumers">${localize(ctx.language, "consumers")}</div>
          `
        : nothing}
      <div class="branch">
        ${barRow(tree.home, homeWidth, ctx)} ${explanation(tree.home, ctx)} ${childList(tree.home, ctx)}
      </div>
    </div>
  `;
}

function childList(node: TreeNode, ctx: RenderContext): TemplateResult | typeof nothing {
  if (node.children.length === 0) return nothing;
  return html`
    <ul class="kids">
      ${node.children.map(
        (child) =>
          html`<li>${barRow(child, fraction(child.share), ctx)} ${explanation(child, ctx)} ${childList(child, ctx)}</li>`,
      )}
    </ul>
  `;
}

function barRow(node: TreeNode, width: number, ctx: RenderContext): TemplateResult {
  const energy = energyValue(node, ctx);
  const cost = costValue(node, ctx);
  const power = powerValue(node, ctx);
  const classes = {
    row: true,
    home: node.kind === "home",
    muted: isMuted(node),
    parent: node.children.length > 0,
    explained: isExplained(node, ctx),
  };
  const onKey = onNodeKey(node, ctx);
  return html`
    <div
      class=${classMap(classes)}
      style=${nodeColorStyle(node)}
      role="button"
      tabindex="0"
      data-node=${node.id}
      aria-expanded=${ifDefined(ariaExpanded(node, ctx))}
      @click=${onNodeClick(node, ctx)}
      @keydown=${onKey}
      @keyup=${onKey}
    >
      <div class="icon-cell"><ha-icon .icon=${node.icon}></ha-icon></div>
      <div class="line1">
        <span class="name" title=${node.name}>${node.name}</span>
        <span class="kwh">${energy === null ? placeholder(ctx) : html`${energy}<span class="unit">kWh</span>`}</span>
      </div>
      <div class="line2">
        <div class="track">
          <div
            class=${classMap({ fill: true, nonzero: width > 0 })}
            style=${styleMap({ width: `${(width * 100).toFixed(2)}%` })}
          ></div>
        </div>
        ${ctx.anyPower ? html`<span class="power">${power === undefined ? nothing : shown(power, ctx)}</span>` : nothing}
        ${ctx.anyCost ? html`<span class="cost">${cost === undefined ? nothing : shown(cost, ctx)}</span>` : nothing}
      </div>
    </div>
  `;
}

/** Explanation lines under the row of the node, when its explanation is open. */
function explanation(node: TreeNode, ctx: RenderContext): TemplateResult | typeof nothing {
  const open = ctx.interaction?.explained;
  if (!open || open.node.id !== node.id) return nothing;
  return html`
    <div class=${classMap({ explain: true, guide: node.children.length > 0 })} aria-live="polite">
      ${open.lines.map((line) => html`<div>${line}</div>`)}
    </div>
  `;
}

/** Bars layout: indented list with guide lines. */
export const barsStyles = css`
  .bars {
    --indent: 22px;
    /* x of the vertical guide inside a branch = centre of the parent's 24 px icon */
    --guide-x: 11px;
    --row-pad: 6px;
    --guide-color: var(--divider-color, rgba(0, 0, 0, 0.12));
  }
  .section-label {
    font-size: 11px;
    font-weight: 500;
    line-height: 16px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--secondary-text-color, #727272);
    margin: 4px 0 2px;
  }
  .section-label.consumers {
    margin-top: 10px;
    padding-top: 12px;
    border-top: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
  }
  .row {
    position: relative;
    isolation: isolate;
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    column-gap: 12px;
    row-gap: 3px;
    padding: var(--row-pad) 0;
    cursor: pointer;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  /* Hover / pressed / explained tint behind the row, slightly wider than the content. */
  .row::before {
    content: "";
    position: absolute;
    z-index: -1;
    inset: 0 -8px;
    border-radius: 8px;
    background: currentColor;
    opacity: 0;
    transition: opacity 120ms ease;
    pointer-events: none;
  }
  @media (hover: hover) {
    .row:hover::before {
      opacity: 0.05;
    }
  }
  .row.explained::before {
    opacity: 0.07;
  }
  .row:active::before {
    opacity: 0.11;
  }
  .row:focus-visible::after {
    content: "";
    position: absolute;
    inset: 0 -8px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 2px var(--primary-color, #03a9f4);
    pointer-events: none;
  }
  /* Explanation under its row, aligned with the name. */
  .explain {
    position: relative;
    margin-left: 36px;
    padding: 0 0 8px;
    font-size: 12px;
    line-height: 16px;
    color: var(--secondary-text-color, #727272);
    overflow-wrap: anywhere;
  }
  .explain > div + div {
    margin-top: 3px;
  }
  /* Under a parent row the guide continues past the explanation to the children. */
  .explain.guide::before {
    content: "";
    position: absolute;
    left: calc(var(--guide-x) - 36px);
    top: 0;
    bottom: 0;
    border-left: 1px solid var(--guide-color);
  }
  .icon-cell {
    grid-row: 1 / span 2;
    position: relative;
    color: var(--node-color);
    --mdc-icon-size: 24px;
  }
  .icon-cell ha-icon {
    display: block;
    width: 24px;
    height: 24px;
  }
  /* Guide out of a parent's icon, down to the bottom of its row; the children continue it. */
  .row.parent .icon-cell::after {
    content: "";
    position: absolute;
    left: var(--guide-x);
    top: 27px;
    bottom: calc(-1 * var(--row-pad));
    border-left: 1px solid var(--guide-color);
  }
  .line1 {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 24px;
  }
  .name {
    flex: 1 1 auto;
    min-width: 0;
    font-size: 14px;
    line-height: 20px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .kwh {
    flex: none;
    font-size: 14px;
    line-height: 20px;
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .unit {
    margin-left: 3px;
    font-size: 11px;
    font-weight: 400;
    color: var(--secondary-text-color, #727272);
  }
  .line2 {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font-size: 12px;
    line-height: 16px;
    color: var(--secondary-text-color, #727272);
    font-variant-numeric: tabular-nums;
  }
  .track {
    flex: 1 1 auto;
    min-width: 24px;
    height: 4px;
    border-radius: 2px;
    background: var(--divider-color, rgba(0, 0, 0, 0.12));
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: inherit;
    background: var(--node-color);
  }
  .fill.nonzero {
    min-width: 2px;
  }
  .cost {
    flex: none;
    min-width: 6.6em;
    text-align: right;
    white-space: nowrap;
  }
  .power {
    flex: none;
    min-width: 4.4em;
    text-align: right;
    white-space: nowrap;
  }
  .row.home {
    --row-pad: 8px;
  }
  .row.home .name {
    font-size: 16px;
    font-weight: 500;
  }
  .row.home .kwh {
    font-size: 16px;
    font-weight: 600;
  }
  .row.home .track {
    height: 6px;
    border-radius: 3px;
  }
  .row.muted .name,
  .row.muted .kwh {
    color: var(--secondary-text-color, #727272);
  }
  .row.muted .fill {
    background: repeating-linear-gradient(90deg, var(--node-color) 0 4px, transparent 4px 7px);
  }
  .kids {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  .kids > li {
    position: relative;
    padding-left: var(--indent);
  }
  /* Vertical guide under the parent's icon, through all siblings... */
  .kids > li::before {
    content: "";
    position: absolute;
    left: var(--guide-x);
    top: 0;
    bottom: 0;
    border-left: 1px solid var(--guide-color);
  }
  /* ...ending at the last child. */
  .kids > li:last-child::before {
    bottom: auto;
    height: calc(var(--row-pad) + 12px);
  }
  /* Horizontal stub into the child's icon. */
  .kids > li::after {
    content: "";
    position: absolute;
    left: var(--guide-x);
    top: calc(var(--row-pad) + 12px);
    width: calc(var(--indent) - var(--guide-x) - 2px);
    border-top: 1px solid var(--guide-color);
  }
`;
