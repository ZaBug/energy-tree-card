import { LitElement, html, nothing, type PropertyValues, type TemplateResult } from "lit";
import { classMap } from "lit/directives/class-map.js";
import { EnergyPeriodSubscription, type PeriodSource } from "./data/collection";
import { normalizeConfig, statisticIds } from "./data/config";
import { statisticsPeriod } from "./data/period";
import { fetchPeriodValues } from "./data/statistics";
import { buildEnergyTree } from "./data/tree";
import { localize, resolveLanguage } from "./localize";
import type {
  EnergyPeriod,
  EnergyTree,
  EnergyTreeCardConfig,
  HomeAssistant,
  Language,
  NormalizedConfig,
  PeriodValues,
} from "./types";
import { barsStyles, renderBars } from "./ui/bars";
import { formatPeriod } from "./ui/format";
import { countDescendants, createContext, subtreeDepth } from "./ui/node";
import { cardStyles } from "./ui/styles";
import { renderTree, treeStyles, updateScrollHints } from "./ui/tree-view";
import { VERSION } from "./version";

const CARD_TYPE = "energy-tree-card";

/** Card width (px) from which the tree layout spreads its nodes a little more. */
const WIDE_WIDTH = 900;

type ShownLayout = "tree" | "bars";

/** The configured language, ignoring values that are not strings (resolveLanguage expects one). */
function configLanguage(config: unknown): string | undefined {
  if (typeof config !== "object" || config === null) return undefined;
  const language = (config as { language?: unknown }).language;
  return typeof language === "string" ? language : undefined;
}

function hassLanguage(hass: HomeAssistant): string | undefined {
  return hass.locale?.language || hass.language || undefined;
}

/** Readable message from a rejected callWS (HA rejects with {code, message}, not Error). */
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return typeof error === "string" ? error : "";
}

export class EnergyTreeCard extends LitElement {
  static override properties = {
    hass: { attribute: false, noAccessor: true },
    _normalized: { state: true },
    _tree: { state: true },
    _period: { state: true },
    _source: { state: true },
    _error: { state: true },
    _loading: { state: true },
    _layoutOverride: { state: true },
    _narrow: { state: true },
    _wide: { state: true },
  };

  static override styles = [cardStyles, barsStyles, treeStyles];

  // Reactive state: `declare` so that no class field shadows the accessors Lit creates.
  private declare _normalized?: NormalizedConfig;
  private declare _tree?: EnergyTree;
  private declare _period?: EnergyPeriod;
  private declare _source?: PeriodSource;
  private declare _error?: string;
  private declare _loading: boolean;
  private declare _layoutOverride?: ShownLayout;
  private declare _narrow: boolean;
  private declare _wide: boolean;

  private _hass?: HomeAssistant;
  private _config?: EnergyTreeCardConfig;
  private _values?: PeriodValues;
  /** Power entities shown by the card: the only states whose changes need a re-render. */
  private _powerIds: string[] = [];
  /** Incremented for every fetch and every new config; stale results are dropped. */
  private _generation = 0;
  /** Incremented on every period callback. */
  private _periodCount = 0;
  private _connected = false;
  private _width = 0;
  private _resizeObserver?: ResizeObserver;
  /** Layout shown in the last render, to centre the tree when it first appears. */
  private _shownLayout?: ShownLayout;
  private readonly _subscription = new EnergyPeriodSubscription((period, source) => this._onPeriod(period, source));

  constructor() {
    super();
    this._loading = false;
    this._narrow = false;
    this._wide = false;
  }

  // ---------------------------------------------------------------------------
  // Home Assistant API
  // ---------------------------------------------------------------------------

  get hass(): HomeAssistant | undefined {
    return this._hass;
  }

  set hass(hass: HomeAssistant | undefined) {
    const old = this._hass;
    this._hass = hass;
    if (hass && this._config && this._normalized) {
      const language = resolveLanguage(configLanguage(this._config), hassLanguage(hass));
      if (language !== this._normalized.language) {
        // Only default names depend on the language; the statistics stay the same.
        this._setNormalized(normalizeConfig(this._config, language));
        if (this._values) this._tree = buildEnergyTree(this._normalized, this._values);
      }
      if (this._connected) this._subscription.update(hass, this._normalized.collection_key);
    }
    this.requestUpdate("hass", old);
  }

  setConfig(config: EnergyTreeCardConfig): void {
    // Throws on an invalid config; Home Assistant shows the message as an error card.
    let normalized = normalizeConfig(config, resolveLanguage(configLanguage(config), undefined));
    const previous = this._normalized;
    this._config = config;
    if (this._hass) {
      const language = resolveLanguage(configLanguage(config), hassLanguage(this._hass));
      if (language !== normalized.language) normalized = normalizeConfig(config, language);
    }
    if (previous && (previous.layout !== normalized.layout || previous.narrow_width !== normalized.narrow_width)) {
      this._layoutOverride = undefined;
    }
    this._setNormalized(normalized);
    this._generation += 1;
    this._tree = undefined;
    this._values = undefined;
    this._error = undefined;
    this._loading = false;
    this._updateWidthState();

    if (this._connected && this._hass) {
      const count = this._periodCount;
      this._subscription.update(this._hass, normalized.collection_key);
      // Same collection as before: no callback, so refetch the current period for the new config.
      if (this._periodCount === count) void this._load();
    }
  }

  getCardSize(): number {
    const config = this._normalized;
    if (!config) return 3;
    const tree = this._tree;
    if (this._layout(config) === "bars") {
      const rows = tree
        ? tree.sources.length + 1 + countDescendants(tree.home)
        : Object.keys(config.sources).length + 1 + config.nodes.length;
      return Math.max(2, Math.ceil(1.5 + rows * 1.05));
    }
    const levels = tree ? 2 + subtreeDepth(tree.home) : 3;
    return Math.max(3, 1 + levels * 3);
  }

  getGridOptions(): { columns: number; min_columns: number } {
    return { columns: 12, min_columns: 6 };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  override connectedCallback(): void {
    super.connectedCallback();
    this._connected = true;
    if (this._hass && this._normalized) this._subscription.update(this._hass, this._normalized.collection_key);
    if (typeof ResizeObserver !== "undefined") {
      this._resizeObserver ??= new ResizeObserver((entries) => {
        const width = entries[entries.length - 1]?.contentRect.width ?? 0;
        if (width > 0) {
          this._width = width;
          this._updateWidthState();
          const scroller = this.renderRoot.querySelector<HTMLElement>(".tree-scroll");
          if (scroller) updateScrollHints(scroller);
        }
      });
      this._resizeObserver.observe(this);
    }
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this._connected = false;
    this._subscription.dispose();
    this._resizeObserver?.disconnect();
  }

  /** hass changes on every state change in the house: re-render only when something shown changed. */
  protected override shouldUpdate(changed: PropertyValues): boolean {
    if (!this._normalized) return false;
    if (changed.size !== 1 || !changed.has("hass")) return true;
    const old = changed.get("hass") as HomeAssistant | undefined;
    const hass = this._hass;
    if (!old || !hass) return true;
    if (
      old.locale?.language !== hass.locale?.language ||
      old.language !== hass.language ||
      old.config?.currency !== hass.config?.currency
    ) {
      return true;
    }
    return this._powerIds.some((id) => old.states?.[id] !== hass.states?.[id]);
  }

  protected override updated(changed: PropertyValues): void {
    super.updated(changed);
    const config = this._normalized;
    if (!config) return;
    const layout = this._tree ? this._layout(config) : undefined;
    const scroller = layout === "tree" ? this.renderRoot.querySelector<HTMLElement>(".tree-scroll") : null;
    if (scroller) {
      // A tree wider than the card opens centred on Home instead of on its left edge.
      if (this._shownLayout !== "tree" && scroller.scrollWidth > scroller.clientWidth) {
        scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
      }
      updateScrollHints(scroller);
    }
    this._shownLayout = layout;
  }

  // ---------------------------------------------------------------------------
  // Data
  // ---------------------------------------------------------------------------

  private _setNormalized(normalized: NormalizedConfig): void {
    this._normalized = normalized;
    const ids = [
      normalized.sources.solar?.power,
      normalized.sources.grid_import?.power,
      normalized.sources.grid_export?.power,
      normalized.home.power,
      ...normalized.nodes.map((node) => node.power),
    ];
    this._powerIds = [...new Set(ids.filter((id): id is string => typeof id === "string"))];
  }

  private _onPeriod(period: EnergyPeriod, source: PeriodSource): void {
    this._periodCount += 1;
    this._period = period;
    this._source = source;
    void this._load();
  }

  private async _load(): Promise<void> {
    const hass = this._hass;
    const config = this._normalized;
    const period = this._period;
    if (!hass || !config || !period) return;
    const generation = ++this._generation;
    this._loading = true;
    try {
      const statPeriod = statisticsPeriod(period.start, period.end);
      const values = await fetchPeriodValues(hass, statisticIds(config), period, statPeriod);
      if (generation !== this._generation || !this._normalized) return;
      this._values = values;
      // The current config: the language may have changed while the request was running.
      this._tree = buildEnergyTree(this._normalized, values);
      this._error = undefined;
    } catch (error) {
      if (generation !== this._generation || !this._normalized) return;
      const message = errorMessage(error);
      const prefix = localize(this._normalized.language, "error");
      this._error = message ? `${prefix}: ${message}` : prefix;
    } finally {
      if (generation === this._generation) this._loading = false;
    }
  }

  // ---------------------------------------------------------------------------
  // Layout
  // ---------------------------------------------------------------------------

  private _updateWidthState(): void {
    const config = this._normalized;
    if (!config || this._width <= 0) return;
    const narrow = this._width < config.narrow_width;
    const wide = this._width >= WIDE_WIDTH;
    if (narrow !== this._narrow) this._narrow = narrow;
    if (wide !== this._wide) this._wide = wide;
  }

  private _layout(config: NormalizedConfig): ShownLayout {
    if (this._layoutOverride) return this._layoutOverride;
    if (config.layout === "auto") return this._narrow ? "bars" : "tree";
    return config.layout;
  }

  private _setLayout(layout: ShownLayout): void {
    this._layoutOverride = layout;
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  protected override render(): TemplateResult | typeof nothing {
    const config = this._normalized;
    if (!config) return nothing;
    const language = config.language;
    const layout = this._layout(config);
    const ctx = createContext(this._hass, config, this._tree);

    let body: TemplateResult | typeof nothing = nothing;
    if (this._tree) {
      body = layout === "bars" ? renderBars(this._tree, ctx) : renderTree(this._tree, ctx, this._wide);
    } else if (!this._error) {
      body = html`<div class="loading">${localize(language, "loading")}</div>`;
    }

    return html`
      <ha-card>
        ${this._renderHeader(config, layout, ctx.locale)}
        <div class=${classMap({ content: true, stale: this._loading && !!this._tree })}>
          ${this._source === "fallback" ? html`<div class="note">${localize(language, "no_collection")}</div>` : nothing}
          ${this._error ? html`<div class="error" role="alert">${this._error}</div>` : nothing} ${body}
        </div>
      </ha-card>
    `;
  }

  private _renderHeader(config: NormalizedConfig, layout: ShownLayout, locale: string): TemplateResult {
    const period = this._period ? formatPeriod(this._period, locale) : "";
    const title = config.title?.trim() ? config.title : undefined;
    return html`
      <div class=${classMap({ header: true, "no-title": !title })}>
        <div class="titles">
          ${title ? html`<div class="title">${title}</div>` : nothing}
          ${period ? html`<div class="period">${period}</div>` : nothing}
        </div>
        <div class="toggle" role="group" aria-label=${localize(config.language, "layout")}>
          ${this._toggleButton("tree", "mdi:file-tree-outline", layout, config.language)}
          ${this._toggleButton("bars", "mdi:format-list-bulleted", layout, config.language)}
        </div>
      </div>
    `;
  }

  private _toggleButton(value: ShownLayout, icon: string, current: ShownLayout, language: Language): TemplateResult {
    const label = localize(language, value === "tree" ? "layout_tree" : "layout_bars");
    const active = value === current;
    return html`
      <button
        type="button"
        class=${classMap({ active })}
        aria-label=${label}
        title=${label}
        aria-pressed=${active ? "true" : "false"}
        @click=${() => this._setLayout(value)}
      >
        <ha-icon .icon=${icon}></ha-icon>
      </button>
    `;
  }
}

if (!customElements.get(CARD_TYPE)) customElements.define(CARD_TYPE, EnergyTreeCard);

interface CustomCardEntry {
  type: string;
  name: string;
  description: string;
  documentationURL: string;
}

const registry = (typeof window !== "undefined" ? window : globalThis) as unknown as { customCards?: CustomCardEntry[] };
registry.customCards = registry.customCards || [];
if (!registry.customCards.some((card) => card?.type === CARD_TYPE)) {
  registry.customCards.push({
    type: CARD_TYPE,
    name: "Energy Tree Card",
    description: "Household energy as a hierarchy for the Energy date picker period",
    documentationURL: "https://github.com/ZaBug/energy-tree-card",
  });
}

console.info(
  `%c ENERGY-TREE-CARD %c ${VERSION} `,
  "color: #fff; background: #03a9f4; font-weight: 700;",
  "color: #03a9f4; background: #fff; font-weight: 700;",
);

declare global {
  interface HTMLElementTagNameMap {
    "energy-tree-card": EnergyTreeCard;
  }
}
