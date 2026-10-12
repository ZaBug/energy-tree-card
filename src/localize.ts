import type { Language } from "./types";

// Built-in labels. Node names from the config always win.
const STRINGS = {
  ro: {
    solar: "Solar",
    grid_import: "Import rețea",
    grid_export: "Export rețea",
    home: "Consum total",
    rest: "Rest {parent}",
    untracked: "Nemăsurat",
    unavailable: "indisponibil",
    loading: "Se încarcă…",
    no_collection: "Fără selector de dată Energie: se afișează ziua de azi",
    layout_tree: "Arbore",
    layout_bars: "Bare",
    sources: "Surse",
    consumers: "Consumatori",
    layout: "Aspect",
    error: "Statisticile nu au putut fi citite",
    explain_missing: "{entity} nu există și nu are statistici",
    explain_unavailable: "{what}: indisponibil",
    explain_below_zero: "sub 0, afișat 0",
    explain_exceeds: "Consumatorii măsurați depășesc {parent} cu {value} kWh, afișat 0",
    explain_average_cost: "Cost la prețul mediu {parent}: {price}/kWh × {energy} kWh = {cost}",
    explain_no_parent_cost: "Cost: costul {parent} nu este disponibil",
    explain_from_statistics: "{value} din statisticile {entity}",
    explain_close: "Închide explicația",
  },
  en: {
    solar: "Solar",
    grid_import: "Grid import",
    grid_export: "Grid export",
    home: "Home",
    rest: "Other {parent}",
    untracked: "Untracked",
    unavailable: "unavailable",
    loading: "Loading…",
    no_collection: "No Energy date picker: showing today",
    layout_tree: "Tree",
    layout_bars: "Bars",
    sources: "Sources",
    consumers: "Consumers",
    layout: "Layout",
    error: "Could not load statistics",
    explain_missing: "{entity} does not exist and has no statistics",
    explain_unavailable: "{what}: unavailable",
    explain_below_zero: "below 0, shown as 0",
    explain_exceeds: "The measured consumers exceed {parent} by {value} kWh, shown as 0",
    explain_average_cost: "Cost at the average price of {parent}: {price}/kWh × {energy} kWh = {cost}",
    explain_no_parent_cost: "Cost: the cost of {parent} is not available",
    explain_from_statistics: "{value} from the statistics of {entity}",
    explain_close: "Close explanation",
  },
} as const;

export type StringKey = keyof (typeof STRINGS)["en"];

export function resolveLanguage(configured: string | undefined, hassLanguage: string | undefined): Language {
  const lang = (configured ?? hassLanguage ?? "en").toLowerCase();
  return lang.startsWith("ro") ? "ro" : "en";
}

/** Built-in label; `{name}` placeholders are replaced by `vars.name`. */
export function localize(language: Language, key: StringKey, vars?: Record<string, string>): string {
  let text: string = STRINGS[language][key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) text = text.split(`{${name}}`).join(value);
  }
  return text;
}
