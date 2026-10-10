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
    error: "Statisticile nu au putut fi citite",
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
    error: "Could not load statistics",
  },
} as const;

export type StringKey = keyof (typeof STRINGS)["en"];

export function resolveLanguage(configured: string | undefined, hassLanguage: string | undefined): Language {
  const lang = (configured ?? hassLanguage ?? "en").toLowerCase();
  return lang.startsWith("ro") ? "ro" : "en";
}

export function localize(language: Language, key: StringKey): string {
  return STRINGS[language][key];
}
