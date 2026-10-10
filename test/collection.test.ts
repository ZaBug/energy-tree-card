import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collectionKey, EnergyPeriodSubscription, findEnergyCollection } from "../src/data/collection";
import type { PeriodSource } from "../src/data/collection";
import type { EnergyCollectionData, EnergyCollectionLike, EnergyPeriod, HomeAssistant } from "../src/types";

type Callback = (data: EnergyCollectionData) => void;

/** Stand-in for the frontend's energy collection (hass.connection._energy*). */
class FakeCollection implements EnergyCollectionLike {
  state?: EnergyCollectionData;
  /** Every callback ever passed to subscribe(), kept after unsubscribe to simulate late deliveries. */
  readonly callbacks: Callback[] = [];
  private readonly active = new Set<Callback>();
  subscribeCalls = 0;
  unsubscribeCalls = 0;
  throwOnSubscribe = false;
  throwOnUnsubscribe = false;

  constructor(state?: EnergyCollectionData) {
    this.state = state;
  }

  subscribe(callback: Callback): () => void {
    this.subscribeCalls += 1;
    if (this.throwOnSubscribe) throw new Error("collection not ready");
    this.callbacks.push(callback);
    this.active.add(callback);
    // Like a collection that already has data: call back right away with the current state.
    if (this.state) callback(this.state);
    return () => {
      this.unsubscribeCalls += 1;
      this.active.delete(callback);
      if (this.throwOnUnsubscribe) throw new Error("connection closed");
    };
  }

  /** New selection or hourly refresh: notifies the current subscribers. */
  emit(data: EnergyCollectionData): void {
    this.state = data;
    for (const callback of [...this.active]) callback(data);
  }

  /** A late delivery that also reaches callbacks that were already unsubscribed. */
  emitToAll(data: EnergyCollectionData): void {
    for (const callback of [...this.callbacks]) callback(data);
  }
}

function fakeHass(connection: Record<string, unknown>, panelUrl?: string): HomeAssistant {
  const hass: Record<string, unknown> = {
    states: {},
    connection,
    config: {},
    callWS: async () => {
      throw new Error("not used");
    },
  };
  if (panelUrl !== undefined) hass.panelUrl = panelUrl;
  return hass as unknown as HomeAssistant;
}

const AUGUST: EnergyPeriod = { start: new Date(2026, 7, 1), end: new Date(2026, 7, 31, 23, 59, 59, 999) };
const SEPTEMBER: EnergyPeriod = { start: new Date(2026, 8, 1), end: new Date(2026, 8, 30, 23, 59, 59, 999) };
const WEEK: EnergyPeriod = { start: new Date(2026, 9, 5), end: new Date(2026, 9, 11, 23, 59, 59, 999) };
const NOW = new Date(2026, 9, 11, 15, 30);
const TODAY: EnergyPeriod = { start: new Date(2026, 9, 11), end: new Date(2026, 9, 11, 23, 59, 59, 999) };

function listener() {
  return vi.fn<(period: EnergyPeriod, source: PeriodSource) => void>();
}

describe("collectionKey", () => {
  it("uses _<collection_key> when a collection_key is configured", () => {
    expect(collectionKey(fakeHass({}), "energy_custom")).toBe("_energy_custom");
  });

  it("uses _energy_<panelUrl> without a collection_key", () => {
    expect(collectionKey(fakeHass({}, "energie"))).toBe("_energy_energie");
  });

  it("uses _energy without a collection_key or panelUrl", () => {
    expect(collectionKey(fakeHass({}))).toBe("_energy");
  });

  it("prefers the configured collection_key over the panelUrl", () => {
    expect(collectionKey(fakeHass({}, "energie"), "energy_custom")).toBe("_energy_custom");
  });
});

describe("findEnergyCollection", () => {
  it("finds the collection stored under _<collection_key>", () => {
    const custom = new FakeCollection();
    const hass = fakeHass({ _energy_custom: custom, _energy: new FakeCollection() });
    expect(findEnergyCollection(hass, "energy_custom")).toBe(custom);
  });

  it("finds the dashboard's collection under _energy_<panelUrl>, before _energy", () => {
    const panel = new FakeCollection();
    const hass = fakeHass({ _energy_energie: panel, _energy: new FakeCollection() }, "energie");
    expect(findEnergyCollection(hass)).toBe(panel);
  });

  it("falls back to _energy without a collection_key when the dashboard has no collection", () => {
    const fallback = new FakeCollection();
    expect(findEnergyCollection(fakeHass({ _energy: fallback }, "energie"))).toBe(fallback);
    expect(findEnergyCollection(fakeHass({ _energy_energie: {}, _energy: fallback }, "energie"))).toBe(fallback);
  });

  it("does not fall back to _energy when a collection_key is configured", () => {
    const hass = fakeHass({ _energy: new FakeCollection() }, "energie");
    expect(findEnergyCollection(hass, "energy_custom")).toBeUndefined();
  });

  it("ignores values without a subscribe function", () => {
    expect(findEnergyCollection(fakeHass({ _energy: {} }))).toBeUndefined();
    expect(findEnergyCollection(fakeHass({ _energy: "collection" }))).toBeUndefined();
    expect(findEnergyCollection(fakeHass({ _energy: { subscribe: true } }))).toBeUndefined();
  });

  it("returns undefined when hass has no connection", () => {
    const hass = { states: {}, config: {} } as unknown as HomeAssistant;
    expect(findEnergyCollection(hass)).toBeUndefined();
  });
});

describe("EnergyPeriodSubscription", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits today's period once as fallback while there is no collection", () => {
    const onPeriod = listener();
    const subscription = new EnergyPeriodSubscription(onPeriod);
    const hass = fakeHass({});
    subscription.update(hass);
    subscription.update(hass);
    subscription.update(fakeHass({}));
    expect(onPeriod).toHaveBeenCalledTimes(1);
    expect(onPeriod).toHaveBeenCalledWith(TODAY, "fallback");
  });

  it("subscribes when the collection appears later and forwards its periods", () => {
    const onPeriod = listener();
    const subscription = new EnergyPeriodSubscription(onPeriod);
    const connection: Record<string, unknown> = {};
    subscription.update(fakeHass(connection));

    const collection = new FakeCollection(AUGUST);
    connection._energy = collection;
    subscription.update(fakeHass(connection));
    collection.emit(SEPTEMBER);

    expect(collection.subscribeCalls).toBe(1);
    expect(onPeriod.mock.calls).toEqual([
      [TODAY, "fallback"],
      [AUGUST, "collection"],
      [SEPTEMBER, "collection"],
    ]);
  });

  it("forwards the state a collection delivers synchronously inside subscribe()", () => {
    const onPeriod = listener();
    new EnergyPeriodSubscription(onPeriod).update(fakeHass({ _energy: new FakeCollection(WEEK) }));
    expect(onPeriod.mock.calls).toEqual([[WEEK, "collection"]]);
  });

  it("forwards every callback without de-duplication: a refresh with the same period fires again", () => {
    const onPeriod = listener();
    const collection = new FakeCollection(AUGUST);
    new EnergyPeriodSubscription(onPeriod).update(fakeHass({ _energy: collection }));
    collection.emit(AUGUST);
    collection.emit({ start: new Date(AUGUST.start), end: AUGUST.end });
    expect(onPeriod).toHaveBeenCalledTimes(3);
    for (const call of onPeriod.mock.calls) expect(call).toEqual([AUGUST, "collection"]);
  });

  it("forwards a period without end (until now) and ignores data without a start", () => {
    const onPeriod = listener();
    const collection = new FakeCollection();
    new EnergyPeriodSubscription(onPeriod).update(fakeHass({ _energy: collection }));
    collection.emit({ start: SEPTEMBER.start });
    collection.emit({} as EnergyCollectionData);
    expect(onPeriod).toHaveBeenCalledTimes(1);
    expect(onPeriod.mock.calls[0][0]).toEqual({ start: SEPTEMBER.start, end: undefined });
  });

  it("does not resubscribe on updates with the same key and the same collection", () => {
    const collection = new FakeCollection(AUGUST);
    const connection = { _energy_energie: collection };
    const subscription = new EnergyPeriodSubscription(listener());
    subscription.update(fakeHass(connection, "energie"));
    subscription.update(fakeHass(connection, "energie"));
    subscription.update(fakeHass(connection, "energie"));
    expect(collection.subscribeCalls).toBe(1);
    expect(collection.unsubscribeCalls).toBe(0);
  });

  it("resubscribes when collection_key changes and ignores the old collection afterwards", () => {
    const onPeriod = listener();
    const dashboard = new FakeCollection(AUGUST);
    const custom = new FakeCollection(WEEK);
    const hass = fakeHass({ _energy: dashboard, _energy_custom: custom });
    const subscription = new EnergyPeriodSubscription(onPeriod);

    subscription.update(hass);
    subscription.update(hass, "energy_custom");
    dashboard.emitToAll(SEPTEMBER);
    custom.emit(SEPTEMBER);

    expect(dashboard.unsubscribeCalls).toBe(1);
    expect(custom.subscribeCalls).toBe(1);
    expect(onPeriod.mock.calls).toEqual([
      [AUGUST, "collection"],
      [WEEK, "collection"],
      [SEPTEMBER, "collection"],
    ]);
  });

  it("resubscribes when the collection object is replaced and ignores the old one", () => {
    const onPeriod = listener();
    const before = new FakeCollection(AUGUST);
    const connection: Record<string, unknown> = { _energy: before };
    const subscription = new EnergyPeriodSubscription(onPeriod);
    subscription.update(fakeHass(connection));

    const after = new FakeCollection(WEEK);
    connection._energy = after;
    subscription.update(fakeHass(connection));
    before.emitToAll(SEPTEMBER);

    expect(before.unsubscribeCalls).toBe(1);
    expect(after.subscribeCalls).toBe(1);
    expect(onPeriod.mock.calls).toEqual([
      [AUGUST, "collection"],
      [WEEK, "collection"],
    ]);
  });

  it("dispose() unsubscribes once and later callbacks are ignored", () => {
    const onPeriod = listener();
    const collection = new FakeCollection(AUGUST);
    const subscription = new EnergyPeriodSubscription(onPeriod);
    subscription.update(fakeHass({ _energy: collection }));

    subscription.dispose();
    subscription.dispose();
    collection.emitToAll(SEPTEMBER);

    expect(collection.unsubscribeCalls).toBe(1);
    expect(onPeriod.mock.calls).toEqual([[AUGUST, "collection"]]);
  });

  it("subscribes again after dispose() when updated (card reconnected)", () => {
    const onPeriod = listener();
    const collection = new FakeCollection(AUGUST);
    const hass = fakeHass({ _energy: collection });
    const subscription = new EnergyPeriodSubscription(onPeriod);
    subscription.update(hass);
    subscription.dispose();
    subscription.update(hass);
    expect(collection.subscribeCalls).toBe(2);
    expect(onPeriod).toHaveBeenCalledTimes(2);
  });

  it("emits the fallback again after dispose() when there is still no collection", () => {
    const onPeriod = listener();
    const subscription = new EnergyPeriodSubscription(onPeriod);
    subscription.update(fakeHass({}));
    subscription.dispose();
    subscription.update(fakeHass({}));
    expect(onPeriod.mock.calls).toEqual([
      [TODAY, "fallback"],
      [TODAY, "fallback"],
    ]);
  });

  it("treats a collection whose subscribe() throws as missing and retries on the next update", () => {
    const onPeriod = listener();
    const collection = new FakeCollection(AUGUST);
    collection.throwOnSubscribe = true;
    const hass = fakeHass({ _energy: collection });
    const subscription = new EnergyPeriodSubscription(onPeriod);

    expect(() => subscription.update(hass)).not.toThrow();
    collection.throwOnSubscribe = false;
    subscription.update(hass);

    expect(collection.subscribeCalls).toBe(2);
    expect(onPeriod.mock.calls).toEqual([[AUGUST, "collection"]]);
  });

  it("swallows an error thrown by the unsubscribe function", () => {
    const collection = new FakeCollection(AUGUST);
    collection.throwOnUnsubscribe = true;
    const subscription = new EnergyPeriodSubscription(listener());
    subscription.update(fakeHass({ _energy: collection }));
    expect(() => subscription.dispose()).not.toThrow();
    expect(collection.unsubscribeCalls).toBe(1);
  });
});
