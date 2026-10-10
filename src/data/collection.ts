import type { EnergyCollectionLike, EnergyPeriod, HomeAssistant } from "../types";

/** Property name of the energy collection on hass.connection, e.g. "_energy_lovelace". */
export function collectionKey(hass: HomeAssistant, configKey?: string): string {
  void hass;
  void configKey;
  throw new Error("collectionKey: not implemented");
}

/** The energy collection for this dashboard, or undefined if no date picker created it yet. */
export function findEnergyCollection(hass: HomeAssistant, configKey?: string): EnergyCollectionLike | undefined {
  void hass;
  void configKey;
  throw new Error("findEnergyCollection: not implemented");
}

export type PeriodSource = "collection" | "fallback";

/**
 * Follows the Energy date picker. Call update() on every hass change and dispose()
 * on disconnect; onPeriod fires for each new selection (and on collection refresh).
 */
export class EnergyPeriodSubscription {
  constructor(private readonly onPeriod: (period: EnergyPeriod, source: PeriodSource) => void) {}

  update(hass: HomeAssistant, configKey?: string): void {
    void hass;
    void configKey;
    void this.onPeriod;
    throw new Error("EnergyPeriodSubscription.update: not implemented");
  }

  dispose(): void {
    throw new Error("EnergyPeriodSubscription.dispose: not implemented");
  }
}
