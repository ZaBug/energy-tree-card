import { css, html, nothing, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { ifDefined } from "lit/directives/if-defined.js";
import { localize } from "../localize";
import type { EnergyTree, TreeNode } from "../types";
import {
  costValue,
  energyValue,
  isExplained,
  isMuted,
  nodeColorStyle,
  onNodeClick,
  onNodeKey,
  placeholder,
  powerValue,
  shown,
  tapAttributes,
  type RenderContext,
} from "./node";

/**
 * Tree layout (desktop): source circles in a row joined to Home, then the consumers as an
 * org chart under Home. Connectors are CSS borders on the list items, so any depth and any
 * number of children work without measuring the DOM. Wider than the card: scrolls horizontally.
 * `wide` (card of 900 px or more) spreads the nodes a little.
 * Every node (circle and labels) is a button; an open explanation shows in a strip under the tree.
 */
export function renderTree(tree: EnergyTree, ctx: RenderContext, wide = false): TemplateResult {
  const sourceLines = reservedLines(tree.sources);
  return html`
    <div class="tree-scroll" @scroll=${onTreeScroll}>
      <div class=${classMap({ tree: true, wide })}>
        ${tree.sources.length > 0
          ? html`
              <div class="sources">
                ${tree.sources.map(
                  (source) => html`
                    <div
                      class=${classMap({ src: true, outgoing: source.kind === "grid_export" })}
                      style=${nodeColorStyle(source)}
                    >
                      ${circleNode(source, ctx, sourceLines)}
                      <div class="src-line"></div>
                    </div>
                  `,
                )}
              </div>
              <div class="home-line"></div>
            `
          : nothing}
        <div class="org-root">${circleNode(tree.home, ctx, reservedLines([tree.home]))} ${orgChildren(tree.home, ctx)}</div>
      </div>
    </div>
    ${explanationStrip(ctx)}
  `;
}

/** Info strip with the open explanation; the live region stays in the DOM so that changes are announced. */
function explanationStrip(ctx: RenderContext): TemplateResult {
  const open = ctx.interaction?.explained;
  const close = localize(ctx.language, "explain_close");
  return html`
    <div class="explain-region" aria-live="polite">
      ${open
        ? html`
            <div class="explain-strip" style=${nodeColorStyle(open.node)}>
              <div class="explain-text">
                <div class="explain-name">${open.node.name}</div>
                ${open.lines.map((line) => html`<div>${line}</div>`)}
              </div>
              <button
                type="button"
                class="explain-close"
                aria-label=${close}
                title=${close}
                @click=${() => ctx.interaction?.closeExplanation()}
              >
                <ha-icon .icon=${"mdi:close"}></ha-icon>
              </button>
            </div>
          `
        : nothing}
    </div>
  `;
}

function orgChildren(node: TreeNode, ctx: RenderContext): TemplateResult | typeof nothing {
  if (node.children.length === 0) return nothing;
  const lines = reservedLines(node.children);
  return html`
    <ul class="org">
      ${node.children.map((child) => html`<li>${circleNode(child, ctx, lines)} ${orgChildren(child, ctx)}</li>`)}
    </ul>
  `;
}

/**
 * Marks the sides of a horizontally scrolled tree that hide nodes (data-more="left right"),
 * so the CSS can fade those edges: without a hint, cut-off nodes look like missing data.
 */
export function updateScrollHints(scroller: HTMLElement): void {
  const hidden: string[] = [];
  if (scroller.scrollLeft > 1) hidden.push("left");
  if (scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1) hidden.push("right");
  const value = hidden.join(" ");
  if (value) scroller.setAttribute("data-more", value);
  else scroller.removeAttribute("data-more");
}

function onTreeScroll(event: Event): void {
  updateScrollHints(event.currentTarget as HTMLElement);
}

/** Meta lines a row of sibling nodes reserves, so their names, costs and powers line up. */
interface ReservedLines {
  cost: boolean;
  power: boolean;
}

function reservedLines(siblings: readonly TreeNode[]): ReservedLines {
  return {
    cost: siblings.some((node) => node.hasCost),
    power: siblings.some((node) => node.power !== undefined),
  };
}

function circleNode(node: TreeNode, ctx: RenderContext, lines: ReservedLines): TemplateResult {
  const energy = energyValue(node, ctx);
  const cost = costValue(node, ctx);
  const power = powerValue(node, ctx);
  const tap = tapAttributes(node, ctx);
  const classes = {
    tnode: true,
    home: node.kind === "home",
    muted: isMuted(node),
    explained: isExplained(node, ctx),
    inert: tap.inert,
  };
  const onKey = onNodeKey(node, ctx);
  return html`
    <div
      class=${classMap(classes)}
      style=${nodeColorStyle(node)}
      role=${ifDefined(tap.role)}
      tabindex=${ifDefined(tap.tabindex)}
      data-node=${node.id}
      aria-expanded=${ifDefined(tap.expanded)}
      @click=${onNodeClick(node, ctx)}
      @keydown=${onKey}
      @keyup=${onKey}
    >
      <div class="circle">
        <ha-icon .icon=${node.icon}></ha-icon>
        ${energy === null
          ? html`<span class="kwh">${placeholder(ctx)}</span>`
          : html`
              <span class=${classMap({ kwh: true, long: energy.length > 7, xlong: energy.length > 9 })}>${energy}</span>
              <span class="unit">kWh</span>
            `}
      </div>
      <div class="tname" title=${node.name}>${node.name}</div>
      ${lines.cost ? html`<div class="tmeta">${cost === undefined ? nothing : shown(cost, ctx)}</div>` : nothing}
      ${lines.power ? html`<div class="tmeta">${power === undefined ? nothing : shown(power, ctx)}</div>` : nothing}
    </div>
  `;
}

/** Tree layout: circles on levels with org-chart connectors. */
export const treeStyles = css`
  .tree-scroll {
    overflow-x: auto;
    overflow-y: hidden;
    margin: 0 -16px;
    padding: 4px 16px 4px;
    scrollbar-width: thin;
  }
  .tree-scroll[data-more="left"] {
    -webkit-mask-image: linear-gradient(to right, transparent, #000 40px);
    mask-image: linear-gradient(to right, transparent, #000 40px);
  }
  .tree-scroll[data-more="right"] {
    -webkit-mask-image: linear-gradient(to left, transparent, #000 40px);
    mask-image: linear-gradient(to left, transparent, #000 40px);
  }
  .tree-scroll[data-more="left right"] {
    -webkit-mask-image: linear-gradient(to right, transparent, #000 40px, #000 calc(100% - 40px), transparent);
    mask-image: linear-gradient(to right, transparent, #000 40px, #000 calc(100% - 40px), transparent);
  }
  .tree {
    --node-w: 92px;
    --gap-x: 4px;
    --circle: 72px;
    --level-gap: 14px;
    --line-w: 1px;
    --line-color: var(--divider-color, rgba(0, 0, 0, 0.12));
    display: flex;
    flex-direction: column;
    align-items: center;
    width: max-content;
    min-width: 100%;
  }
  .tree.wide {
    --node-w: 108px;
    --gap-x: 10px;
    --circle: 76px;
    --level-gap: 18px;
  }
  .tnode {
    position: relative;
    box-sizing: border-box;
    width: var(--node-w);
    padding-bottom: 4px;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    border-radius: 12px;
    cursor: pointer;
    outline: none;
    -webkit-tap-highlight-color: transparent;
  }
  .tnode:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: 1px;
  }
  .circle {
    position: relative;
    box-sizing: border-box;
    width: var(--circle);
    height: var(--circle);
    border: 2px solid var(--node-color);
    border-radius: 50%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }
  .circle::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: var(--node-color);
    opacity: 0.1;
    transition: opacity 120ms ease;
    pointer-events: none;
  }
  .circle ha-icon {
    color: var(--node-color);
    --mdc-icon-size: 22px;
    margin-bottom: 1px;
  }
  .circle .kwh {
    font-size: 14px;
    line-height: 16px;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
  .circle .kwh.long {
    font-size: 12px;
  }
  .circle .kwh.xlong {
    font-size: 10.5px;
  }
  .circle .unit {
    font-size: 10px;
    line-height: 12px;
    color: var(--secondary-text-color, #727272);
  }
  .tname {
    max-width: 100%;
    margin-top: 6px;
    font-size: 13px;
    line-height: 18px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tmeta {
    max-width: 100%;
    min-height: 16px;
    font-size: 12px;
    line-height: 16px;
    color: var(--secondary-text-color, #727272);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .tnode.home {
    --circle: 88px;
  }
  .tree.wide .tnode.home {
    --circle: 96px;
  }
  .tnode.home .circle {
    border-width: 3px;
  }
  .tnode.home .circle .kwh {
    font-size: 16px;
    line-height: 20px;
  }
  .tnode.home .tname {
    font-size: 14px;
    font-weight: 500;
  }
  .tnode.muted .circle {
    border-style: dashed;
  }
  .tnode.muted .circle::before {
    opacity: 0.05;
  }
  .tnode.muted .tname,
  .tnode.muted .circle .kwh {
    color: var(--secondary-text-color, #727272);
  }
  /* Hover / pressed / explained: a stronger fill of the circle (after the muted rule, same specificity). */
  @media (hover: hover) {
    .tnode:hover .circle::before {
      opacity: 0.2;
    }
  }
  .tnode.explained .circle::before {
    opacity: 0.24;
  }
  .tnode:active .circle::before {
    opacity: 0.3;
  }
  .tnode.inert {
    cursor: default;
  }
  .tnode.inert .circle::before {
    opacity: 0.1;
  }
  .tnode.inert.muted .circle::before {
    opacity: 0.05;
  }

  /* Explanation strip under the tree. */
  .explain-strip {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 4px;
    margin-top: 8px;
    padding: 8px 0 8px 12px;
    border-left: 3px solid var(--node-color);
    border-radius: 8px;
    font-size: 12.5px;
    line-height: 18px;
    color: var(--secondary-text-color, #727272);
    overflow-wrap: anywhere;
  }
  .explain-strip::before {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: var(--node-color);
    opacity: 0.08;
    pointer-events: none;
  }
  .explain-text {
    flex: 1 1 auto;
    min-width: 0;
  }
  .explain-name {
    font-weight: 600;
    color: var(--primary-text-color, #212121);
  }
  .explain-close {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    margin: -8px 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--secondary-text-color, #727272);
    cursor: pointer;
    font: inherit;
    --mdc-icon-size: 20px;
  }
  .explain-close:focus-visible {
    outline: 2px solid var(--primary-color, #03a9f4);
    outline-offset: -4px;
  }

  /* Sources: each source has a line down to a shared bus; one line from the bus into Home. */
  .sources {
    display: flex;
    justify-content: center;
  }
  .src {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 0 var(--gap-x);
  }
  .src::before,
  .src::after,
  .org > li::before,
  .org > li::after {
    content: "";
    position: absolute;
    width: 50%;
    height: var(--line-w);
    background: var(--line-color);
  }
  .src::before,
  .src::after {
    bottom: 0;
  }
  .src::before,
  .org > li::before {
    left: 0;
  }
  .src::after,
  .org > li::after {
    right: 0;
  }
  .src:first-child::before,
  .src:last-child::after,
  .org > li:first-child::before,
  .org > li:last-child::after {
    display: none;
  }
  .src-line {
    position: relative;
    flex: 1 0 calc(var(--level-gap) + 6px);
    width: 2px;
    background: var(--node-color);
  }
  /* Export flows away from Home: dashed line with an arrow pointing at the export node. */
  .src.outgoing .src-line {
    background: repeating-linear-gradient(to bottom, var(--node-color) 0 4px, transparent 4px 7px);
  }
  .src.outgoing .src-line::before {
    content: "";
    position: absolute;
    top: -2px;
    left: 50%;
    transform: translateX(-50%);
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-bottom: 7px solid var(--node-color);
  }
  .home-line {
    position: relative;
    width: var(--line-w);
    height: calc(var(--level-gap) + 6px);
    background: var(--line-color);
  }
  /* Arrow into Home. */
  .home-line::after {
    content: "";
    position: absolute;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 7px solid var(--secondary-text-color, #727272);
  }

  /* Consumers: org chart (stub from the parent, bar across the children, stub into each child). */
  .org-root {
    display: flex;
    flex-direction: column;
    align-items: center;
  }
  .org {
    position: relative;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    list-style: none;
    margin: 0;
    padding: var(--level-gap) 0 0;
  }
  .org::before,
  .org > li > .tnode::before {
    content: "";
    position: absolute;
    left: calc(50% - var(--line-w) / 2);
    width: var(--line-w);
    height: var(--level-gap);
    background: var(--line-color);
  }
  .org::before {
    top: 0;
  }
  .org > li > .tnode::before {
    top: calc(-1 * var(--level-gap));
  }
  .org > li {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--level-gap) var(--gap-x) 0;
  }
  .org > li::before,
  .org > li::after {
    top: 0;
  }
`;
