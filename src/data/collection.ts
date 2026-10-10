import type { EnergyCollectionData, EnergyCollectionLike, EnergyPeriod, HomeAssistant } from "../types";
import { todayPeriod } from "./period";

/** Property name of the energy collection on hass.connection, e.g. "_energy_lovelace". */
export function collectionKey(hass: HomeAssistant, configKey?: string): string {
  return configKey ? `_${configKey}` : hass.panelUrl ? `_energy_${hass.panelUrl}` : "_energy";
}

/** The collection stored under key, if it looks like an energy collection. */
function collectionAt(connection: Record<string, unknown>, key: string): EnergyCollectionLike | undefined {
  const candidate = connection[key];
  if (typeof candidate !== "object" || candidate === null) return undefined;
  return typeof (candidate as { subscribe?: unknown }).subscribe === "function"
    ? (candidate as EnergyCollectionLike)
    : undefined;
}

/** The energy collection for this dashboard, or undefined if no date picker created it yet. */
export function findEnergyCollection(hass: HomeAssistant, configKey?: string): EnergyCollectionLike | undefined {
  const connection = hass?.connection as Record<string, unknown> | undefined;
  if (typeof connection !== "object" || connection === null) return undefined;
  const found = collectionAt(connection, collectionKey(hass, configKey));
  // Without an explicit key, fall back to the frontend's default collection (as energy-flow-card-plus does).
  return found ?? (configKey ? undefined : collectionAt(connection, "_energy"));
}

export type PeriodSource = "collection" | "fallback";

/**
 * Follows the Energy date picker. Call update() on every hass change and dispose()
 * on disconnect; onPeriod fires for each new selection (and on collection refresh).
 */
export class EnergyPeriodSubscription {
  private collection?: EnergyCollectionLike;
  private configKey?: string;
  private unsubscribe?: () => void;
  private fallbackEmitted = false;
  /** Incremented on every (un)subscribe so that stale callbacks are ignored. */
  private generation = 0;

  constructor(private readonly onPeriod: (period: EnergyPeriod, source: PeriodSource) => void) {}

  update(hass: HomeAssistant, configKey?: string): void {
    if (this.collection) {
      if (configKey === this.configKey && findEnergyCollection(hass, configKey) === this.collection) return;
      // Key changed, or the collection was replaced or removed (reconnect, dashboard change).
      this.unsubscribeCollection();
    }

    const collection = findEnergyCollection(hass, configKey);
    if (!collection) {
      if (!this.fallbackEmitted) {
        this.fallbackEmitted = true;
        this.onPeriod(todayPeriod(), "fallback");
      }
      return;
    }

    const generation = ++this.generation;
    // Set before subscribe(): the collection may call back synchronously with its current state.
    this.collection = collection;
    this.configKey = configKey;
    try {
      this.unsubscribe = collection.subscribe((data: EnergyCollectionData) => {
        if (generation !== this.generation || !data?.start) return;
        this.onPeriod({ start: data.start, end: data.end }, "collection");
      });
    } catch {
      // A broken collection counts as missing; retried on the next update.
      this.unsubscribeCollection();
    }
  }

  dispose(): void {
    this.unsubscribeCollection();
    this.fallbackEmitted = false;
  }

  private unsubscribeCollection(): void {
    this.generation += 1;
    const unsubscribe = this.unsubscribe;
    this.unsubscribe = undefined;
    this.collection = undefined;
    this.configKey = undefined;
    if (unsubscribe) {
      try {
        unsubscribe();
      } catch {
        // The connection may already be closed; nothing left to clean up.
      }
    }
  }
}
