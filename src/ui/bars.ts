import { css, html, nothing, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { styleMap } from "lit/directives/style-map.js";
import { localize } from "../localize";
import type { EnergyTree, TreeNode } from "../types";
import {
  costValue,
  energyValue,
  fraction,
  isMuted,
  nodeColorStyle,
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
            ${tree.sources.map((source) => barRow(source, relative(source), ctx))}
            <div class="section-label consumers">${localize(ctx.language, "consumers")}</div>
          `
        : nothing}
      <div class="branch">${barRow(tree.home, homeWidth, ctx)} ${childList(tree.home, ctx)}</div>
    </div>
  `;
}

function childList(node: TreeNode, ctx: RenderContext): TemplateResult | typeof nothing {
  if (node.children.length === 0) return nothing;
  return html`
    <ul class="kids">
      ${node.children.map((child) => html`<li>${barRow(child, fraction(child.share), ctx)} ${childList(child, ctx)}</li>`)}
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
  };
  return html`
    <div class=${classMap(classes)} style=${nodeColorStyle(node)}>
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
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    column-gap: 12px;
    row-gap: 3px;
    padding: var(--row-pad) 0;
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
