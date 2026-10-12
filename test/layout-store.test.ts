import { afterEach, describe, expect, it } from "vitest";
import {
  browserStorage,
  clearLayoutChoice,
  layoutSignature,
  layoutStorageKey,
  readLayoutChoice,
  writeLayoutChoice,
  type LayoutStorage,
} from "../src/data/layout-store";

class MemoryStorage implements LayoutStorage {
  readonly items = new Map<string, string>();
  getItem(key: string): string | null {
    return this.items.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.items.set(key, value);
  }
  removeItem(key: string): void {
    this.items.delete(key);
  }
}

const throwing: LayoutStorage = {
  getItem() {
    throw new Error("SecurityError");
  },
  setItem() {
    throw new Error("QuotaExceededError");
  },
  removeItem() {
    throw new Error("SecurityError");
  },
};

const KEY = layoutStorageKey("/lovelace/energie");
const AUTO = layoutSignature({ layout: "auto", narrow_width: 600 });

describe("layoutStorageKey / layoutSignature", () => {
  it("keys the choice by dashboard view path", () => {
    expect(KEY).toBe("energy-tree-card:layout:/lovelace/energie");
  });

  it("changes when layout or narrow_width changes", () => {
    expect(AUTO).toBe("auto|600");
    expect(layoutSignature({ layout: "tree", narrow_width: 600 })).not.toBe(AUTO);
    expect(layoutSignature({ layout: "auto", narrow_width: 480 })).not.toBe(AUTO);
  });
});

describe("readLayoutChoice / writeLayoutChoice", () => {
  it("remembers the choice for the same config", () => {
    const storage = new MemoryStorage();
    expect(readLayoutChoice(storage, KEY, AUTO)).toBeUndefined();
    writeLayoutChoice(storage, KEY, AUTO, "tree");
    expect(readLayoutChoice(storage, KEY, AUTO)).toBe("tree");
    writeLayoutChoice(storage, KEY, AUTO, "bars");
    expect(readLayoutChoice(storage, KEY, AUTO)).toBe("bars");
  });

  it("ignores a choice made for another layout config (a config change clears it)", () => {
    const storage = new MemoryStorage();
    writeLayoutChoice(storage, KEY, AUTO, "tree");
    expect(readLayoutChoice(storage, KEY, layoutSignature({ layout: "bars", narrow_width: 600 }))).toBeUndefined();
  });

  it("keeps views apart", () => {
    const storage = new MemoryStorage();
    writeLayoutChoice(storage, KEY, AUTO, "tree");
    expect(readLayoutChoice(storage, layoutStorageKey("/lovelace/0"), AUTO)).toBeUndefined();
  });

  it.each([["not json"], ["null"], ['"tree"'], ['{"layout":"grid","config":"auto|600"}'], ['{"layout":"tree"}']])(
    "ignores the unusable stored value %s",
    (raw) => {
      const storage = new MemoryStorage();
      storage.setItem(KEY, raw);
      expect(readLayoutChoice(storage, KEY, AUTO)).toBeUndefined();
    },
  );

  it("works without storage and when storage throws", () => {
    expect(readLayoutChoice(undefined, KEY, AUTO)).toBeUndefined();
    expect(() => writeLayoutChoice(undefined, KEY, AUTO, "tree")).not.toThrow();
    expect(readLayoutChoice(throwing, KEY, AUTO)).toBeUndefined();
    expect(() => writeLayoutChoice(throwing, KEY, AUTO, "tree")).not.toThrow();
  });
});

describe("clearLayoutChoice", () => {
  it("removes the choice made for the old config", () => {
    const storage = new MemoryStorage();
    writeLayoutChoice(storage, KEY, AUTO, "tree");
    clearLayoutChoice(storage, KEY, AUTO);
    expect(storage.items.has(KEY)).toBe(false);
  });

  it("keeps a choice made for another config (another card on the same view)", () => {
    const storage = new MemoryStorage();
    writeLayoutChoice(storage, KEY, "tree|600", "bars");
    clearLayoutChoice(storage, KEY, AUTO);
    expect(readLayoutChoice(storage, KEY, "tree|600")).toBe("bars");
  });

  it("works without storage and when storage throws", () => {
    expect(() => clearLayoutChoice(undefined, KEY, AUTO)).not.toThrow();
    expect(() => clearLayoutChoice(throwing, KEY, AUTO)).not.toThrow();
  });
});

describe("browserStorage", () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, "localStorage");

  afterEach(() => {
    if (original) Object.defineProperty(globalThis, "localStorage", original);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("returns localStorage when it is there", () => {
    const storage = new MemoryStorage();
    Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true });
    expect(browserStorage()).toBe(storage);
  });

  it("returns undefined when accessing localStorage throws (blocked storage)", () => {
    Object.defineProperty(globalThis, "localStorage", {
      get() {
        throw new Error("SecurityError");
      },
      configurable: true,
    });
    expect(browserStorage()).toBeUndefined();
  });
});
