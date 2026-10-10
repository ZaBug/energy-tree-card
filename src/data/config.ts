import type { EnergyTreeCardConfig, Language, NormalizedConfig } from "../types";

/**
 * Validate the YAML config and fill defaults (names from localize(), default icons).
 * Throws Error with a readable message on invalid config (HA shows it as an error card).
 */
export function normalizeConfig(config: EnergyTreeCardConfig, language: Language): NormalizedConfig {
  void config;
  void language;
  throw new Error("normalizeConfig: not implemented");
}

/** Unique statistic ids (energy and cost) referenced by the config, in config order. */
export function statisticIds(config: NormalizedConfig): string[] {
  void config;
  throw new Error("statisticIds: not implemented");
}
