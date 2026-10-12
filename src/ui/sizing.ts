import type { EnergyTree, TreeNode } from "../types";

// Tree layout sizes in px. Normal and wide match the stylesheet (tree-view.ts); compact is computed.
export const NORMAL = { nodeWidth: 92, gapX: 4, circle: 72, homeCircle: 88 } as const;
export const WIDE = { nodeWidth: 108, gapX: 10, circle: 76, homeCircle: 96 } as const;
export const MIN_NODE_WIDTH = 56;
export const MIN_CIRCLE = 46;
/** Horizontal padding of the tree area: normal and wide trees, compact trees. */
export const TREE_PADDING = 16;
export const COMPACT_PADDING = 2;

export interface TreeShape {
  /** Columns the tree needs: leaves of the consumer tree (with Rest / Untracked) or sources, whichever is more. */
  columns: number;
  /** Consumers with children: each adds the gap on both sides of its group (normal and wide sizes). */
  groups: number;
  sources: number;
}

export interface TreeSizing {
  /** Stylesheet sizes of a card of 900 px or more. */
  wide: boolean;
  /** Computed sizes and smaller fonts, so that the tree fits a phone. */
  compact: boolean;
  /** Even the minimum node width does not fit: the tree scrolls sideways. */
  scroll: boolean;
  /** Width of a leaf column. */
  nodeWidth: number;
  circle: number;
  homeCircle: number;
  /** Width of a source node and of Home: alone in their rows, they may be wider than a column. */
  rowNodeWidth: number;
  /** Horizontal space on each side of a node. */
  gapX: number;
  /** Horizontal padding of the tree area. */
  padding: number;
}

/** Leaf columns under a node (1 for a leaf). */
export function leafCount(node: TreeNode): number {
  return node.children.length === 0 ? 1 : node.children.reduce((sum, child) => sum + leafCount(child), 0);
}

function groups(node: TreeNode): number {
  return node.children.reduce((sum, child) => sum + (child.children.length > 0 ? 1 : 0) + groups(child), 0);
}

export function treeShape(tree: EnergyTree): TreeShape {
  return { columns: Math.max(leafCount(tree.home), tree.sources.length), groups: groups(tree.home), sources: tree.sources.length };
}

function preset(size: typeof NORMAL | typeof WIDE, wide: boolean): TreeSizing {
  return {
    wide,
    compact: false,
    scroll: false,
    nodeWidth: size.nodeWidth,
    circle: size.circle,
    homeCircle: size.homeCircle,
    rowNodeWidth: size.nodeWidth,
    gapX: size.gapX,
    padding: TREE_PADDING,
  };
}

/**
 * Sizes of the tree for the width available to it (tree area with the compact padding).
 * Wide (if asked for) or normal sizes when they fit with the normal padding; else compact: column
 * width = available / columns, at most the normal 92 px and at least 56 px, circle 10 px smaller
 * (46 to 72 px). Below 56 px per column the tree keeps 56 px and scrolls.
 * An unknown width (0, not measured yet) gives the normal sizes.
 */
export function treeSizing(
  availableWidth: number,
  columns: number,
  options: { wide?: boolean; groups?: number; sources?: number } = {},
): TreeSizing {
  const cols = Math.max(1, Math.floor(columns));
  const groupCount = Math.max(0, options.groups ?? 0);
  if (!(availableWidth > 0)) return preset(options.wide ? WIDE : NORMAL, !!options.wide);

  // Width the tree has with the normal padding instead of the compact one.
  const normalRoom = availableWidth - 2 * (TREE_PADDING - COMPACT_PADDING);
  const needed = (size: typeof NORMAL | typeof WIDE): number =>
    cols * (size.nodeWidth + 2 * size.gapX) + groupCount * 2 * size.gapX;
  if (options.wide && needed(WIDE) <= normalRoom) return preset(WIDE, true);
  if (needed(NORMAL) <= normalRoom) return preset(NORMAL, false);

  const perColumn = Math.floor(availableWidth / cols);
  const nodeWidth = Math.min(NORMAL.nodeWidth, Math.max(MIN_NODE_WIDTH, perColumn));
  const circle = Math.min(NORMAL.circle, Math.max(MIN_CIRCLE, nodeWidth - 10));
  const sources = Math.max(1, options.sources ?? 1);
  const rowNodeWidth = Math.max(nodeWidth, Math.min(NORMAL.nodeWidth, Math.floor(availableWidth / sources)));
  return {
    wide: false,
    compact: true,
    scroll: perColumn < MIN_NODE_WIDTH,
    nodeWidth,
    circle,
    homeCircle: Math.round((circle * NORMAL.homeCircle) / NORMAL.circle),
    rowNodeWidth,
    gapX: 0,
    padding: COMPACT_PADDING,
  };
}
