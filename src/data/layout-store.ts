import type { NormalizedConfig } from "../types";

/** Layout picked with the header toggle. */
export type ShownLayout = "tree" | "bars";

/** The part of Web Storage the card uses (window.localStorage in the browser). */
export interface LayoutStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** One choice per dashboard view and device: cards on the same view share it. */
export function layoutStorageKey(pathname: string): string {
  return `energy-tree-card:layout:${pathname}`;
}

/** The config options a choice was made for; when they change, the stored choice no longer applies. */
export function layoutSignature(config: Pick<NormalizedConfig, "layout" | "narrow_width">): string {
  return `${config.layout}|${config.narrow_width}`;
}

/** Stored choice for this config, or undefined (none, another config, unreadable or no storage). */
export function readLayoutChoice(storage: LayoutStorage | undefined, key: string, signature: string): ShownLayout | undefined {
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(key);
    if (!raw) return undefined;
    const stored = JSON.parse(raw) as { layout?: unknown; config?: unknown } | null;
    if (typeof stored !== "object" || stored === null || stored.config !== signature) return undefined;
    return stored.layout === "tree" || stored.layout === "bars" ? stored.layout : undefined;
  } catch {
    return undefined;
  }
}

/** Store the choice; storage errors (quota, privacy mode) only mean that it is not remembered. */
export function writeLayoutChoice(
  storage: LayoutStorage | undefined,
  key: string,
  signature: string,
  layout: ShownLayout,
): void {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify({ layout, config: signature }));
  } catch {
    // Not remembered; the toggle still works for this page.
  }
}

/** Forget the stored choice if it was made for this config (other cards on the view may have their own). */
export function clearLayoutChoice(storage: LayoutStorage | undefined, key: string, signature: string): void {
  if (!storage || readLayoutChoice(storage, key, signature) === undefined) return;
  try {
    storage.removeItem(key);
  } catch {
    // Nothing else to do; the choice no longer matches the config anyway.
  }
}

/** window.localStorage, or undefined where it is missing or blocked (accessing it can throw). */
export function browserStorage(): LayoutStorage | undefined {
  try {
    const storage = (globalThis as { localStorage?: LayoutStorage }).localStorage;
    return storage && typeof storage.getItem === "function" ? storage : undefined;
  } catch {
    return undefined;
  }
}
