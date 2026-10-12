import { describe, expect, it } from "vitest";
import { buildEnergyTree } from "../src/data/tree";
import { MIN_CIRCLE, MIN_NODE_WIDTH, NORMAL, treeShape, treeSizing, WIDE } from "../src/ui/sizing";
import { august2026Values, makeConfig, ownerConfig } from "./helpers";

/** Width the compact tree takes: columns × node width (no gaps in compact mode). */
function compactWidth(columns: number, nodeWidth: number): number {
  return columns * nodeWidth;
}

describe("treeShape", () => {
  it("counts the owner's leaves (AC, Server, Rest Casa, Căsuță, Mașină, Nemăsurat) and one group (Casa)", () => {
    expect(treeShape(buildEnergyTree(ownerConfig(), august2026Values()))).toStrictEqual({
      columns: 6,
      groups: 1,
      sources: 3,
    });
  });

  it("uses the number of sources when there are more sources than leaves", () => {
    const config = makeConfig({
      sources: { solar: { energy: "s.a" }, grid_import: { energy: "s.b" }, grid_export: { energy: "s.c" } },
      nodes: [{ id: "x", name: "X", energy: "s.x" }],
    });
    // X and Untracked: 2 leaves, 3 sources.
    expect(treeShape(buildEnergyTree(config, {}))).toStrictEqual({ columns: 3, groups: 0, sources: 3 });
  });

  it("counts Home as one column when it has no consumers", () => {
    const config = makeConfig({ sources: { grid_import: { energy: "s.b" } } });
    expect(treeShape(buildEnergyTree(config, {})).columns).toBe(1);
  });
});

describe("treeSizing", () => {
  it("6 columns at 376 px: compact 62 px columns that fit", () => {
    const sizing = treeSizing(376, 6, { groups: 1, sources: 3 });
    expect(sizing).toMatchObject({ compact: true, scroll: false, wide: false, nodeWidth: 62, circle: 52, gapX: 0 });
    expect(compactWidth(6, sizing.nodeWidth)).toBeLessThanOrEqual(376);
    expect(sizing.rowNodeWidth).toBe(NORMAL.nodeWidth);
    expect(sizing.homeCircle).toBe(64);
  });

  it("6 columns at 336 px: compact at the minimum, still no scroll", () => {
    const sizing = treeSizing(336, 6, { groups: 1, sources: 3 });
    expect(sizing).toMatchObject({ compact: true, scroll: false, nodeWidth: MIN_NODE_WIDTH, circle: MIN_CIRCLE });
    expect(compactWidth(6, sizing.nodeWidth)).toBeLessThanOrEqual(336);
    expect(sizing.homeCircle).toBe(56);
  });

  it("6 columns on the owner's phones (384 and 344 px cards: 378 and 338 px for the tree) fit", () => {
    for (const available of [384 - 2 - 4, 344 - 2 - 4]) {
      const sizing = treeSizing(available, 6, { groups: 1, sources: 3 });
      expect(sizing.scroll).toBe(false);
      expect(compactWidth(6, sizing.nodeWidth)).toBeLessThanOrEqual(available);
    }
  });

  it("10 columns at 336 px: minimum sizes and scroll", () => {
    expect(treeSizing(336, 10)).toMatchObject({
      compact: true,
      scroll: true,
      nodeWidth: MIN_NODE_WIDTH,
      circle: MIN_CIRCLE,
    });
  });

  it("3 columns at 900 px: normal stylesheet sizes", () => {
    expect(treeSizing(900, 3)).toStrictEqual({
      wide: false,
      compact: false,
      scroll: false,
      nodeWidth: NORMAL.nodeWidth,
      circle: NORMAL.circle,
      homeCircle: NORMAL.homeCircle,
      rowNodeWidth: NORMAL.nodeWidth,
      gapX: NORMAL.gapX,
      padding: 16,
    });
  });

  it("keeps the wide sizes of a 910 px desktop card with the owner's 6 columns", () => {
    // 910 px card: 908 px inside the 1 px border, minus 2 × 2 px compact padding.
    expect(treeSizing(904, 6, { wide: true, groups: 1, sources: 3 })).toMatchObject({
      wide: true,
      compact: false,
      nodeWidth: WIDE.nodeWidth,
      circle: WIDE.circle,
    });
  });

  it("falls back from wide to normal sizes before going compact", () => {
    // 8 columns: wide needs 8 × 128 = 1024 px, normal 8 × 100 = 800 px.
    expect(treeSizing(900, 8, { wide: true })).toMatchObject({ wide: false, compact: false });
  });

  it("counts the normal padding and the group gaps before keeping the normal sizes", () => {
    // Owner's tree: 6 × 100 + 1 group × 8 = 608 px plus 2 × 14 px more padding than compact.
    expect(treeSizing(636, 6, { groups: 1 }).compact).toBe(false);
    expect(treeSizing(635, 6, { groups: 1 }).compact).toBe(true);
  });

  it("never makes compact columns or circles bigger than the normal ones", () => {
    const sizing = treeSizing(590, 6, { groups: 1 });
    expect(sizing.compact).toBe(true);
    expect(sizing.nodeWidth).toBe(NORMAL.nodeWidth);
    expect(sizing.circle).toBe(NORMAL.circle);
  });

  it("gives the normal sizes while the width is unknown", () => {
    expect(treeSizing(0, 6)).toMatchObject({ compact: false, scroll: false, nodeWidth: NORMAL.nodeWidth });
    expect(treeSizing(0, 6, { wide: true })).toMatchObject({ wide: true, nodeWidth: WIDE.nodeWidth });
  });
});
