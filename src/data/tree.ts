import type { EnergyTree, NormalizedConfig, PeriodValues } from "../types";

/** Build the source / home / consumer tree for one period from summed statistics. */
export function buildEnergyTree(config: NormalizedConfig, values: PeriodValues): EnergyTree {
  void config;
  void values;
  throw new Error("buildEnergyTree: not implemented");
}
