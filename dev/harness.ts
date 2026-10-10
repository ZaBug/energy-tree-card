// Local visual harness (not bundled): `npm run dev`, then open /dev/index.html.
// Query parameters: ?width=1200 (wide card frame), ?narrow=400 (phone frame), ?picker=0 (no Energy date picker).
import "../src/energy-tree-card";
import type {
  EnergyCollectionData,
  EnergyCollectionLike,
  EnergyTreeCardConfig,
  HassEntityState,
  HomeAssistant,
  StatisticsResult,
} from "../src/types";

// ---------------------------------------------------------------------------
// Stand-ins for the Home Assistant frontend elements (only when missing)
// ---------------------------------------------------------------------------

if (!customElements.get("ha-card")) {
  customElements.define(
    "ha-card",
    class extends HTMLElement {
      constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `<style>
          :host {
            display: block;
            box-sizing: border-box;
            background: var(--ha-card-background, var(--card-background-color, #fff));
            border: 1px solid var(--divider-color, #e0e0e0);
            border-radius: var(--ha-card-border-radius, 12px);
            color: var(--primary-text-color);
          }
        </style><slot></slot>`;
      }
    },
  );
}

if (!customElements.get("ha-icon")) {
  // A coloured ring with two letters of the icon name; the full name is the tooltip.
  customElements.define(
    "ha-icon",
    class extends HTMLElement {
      static observedAttributes = ["icon"];
      private _icon = "";
      private readonly _label: HTMLSpanElement;

      constructor() {
        super();
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `<style>
          :host {
            display: inline-flex;
            width: var(--mdc-icon-size, 24px);
            height: var(--mdc-icon-size, 24px);
            vertical-align: middle;
          }
          span {
            box-sizing: border-box;
            width: 100%;
            height: 100%;
            display: flex;
            align-items: center;
            justify-content: center;
            border: 2px solid currentColor;
            border-radius: 50%;
            font: 700 calc(var(--mdc-icon-size, 24px) * 0.36) / 1 system-ui, sans-serif;
            text-transform: uppercase;
          }
        </style><span></span>`;
        this._label = root.querySelector("span") as HTMLSpanElement;
      }

      get icon(): string {
        return this._icon;
      }

      set icon(value: string) {
        this._icon = value ?? "";
        const words = this._icon.replace(/^mdi:/, "").split("-").filter(Boolean);
        this._label.textContent = words
          .slice(0, 2)
          .map((word) => word[0])
          .join("");
        this._label.title = this._icon;
      }

      attributeChangedCallback(_name: string, _old: string | null, value: string | null): void {
        this.icon = value ?? "";
      }
    },
  );
}

// ---------------------------------------------------------------------------
// Fixture data (real values from the owner's instance)
// ---------------------------------------------------------------------------

const ENERGY_IDS = [
  "sensor.shellyem3_485519db8f59_channel_a_energy_returned",
  "sensor.principal_energy",
  "sensor.principal_energy_returned",
  "sensor.casa_energy",
  "sensor.18691697773822_total_energy_consumption",
  "sensor.ups_energy_spent",
  "sensor.casuta_energy",
  "sensor.wallbox_energie_totala",
];

const COST_IDS = [
  "sensor.principal_energy_cost",
  "sensor.principal_energy_returned_compensation",
  "sensor.cost_lunar_casa",
  "sensor.cost_lunar_ac",
  "sensor.cost_server_lunar",
  "sensor.cost_lunar_casuta",
  "sensor.ev_cost_factura_neta",
];

type PeriodKey = "azi" | "luna" | "aug" | "an";

interface Fixture {
  label: string;
  range: () => EnergyCollectionData;
  energy: number[];
  cost: number[];
}

const startOfDay = (year: number, month: number, day: number): Date => new Date(year, month, day, 0, 0, 0, 0);
const endOfDay = (year: number, month: number, day: number): Date => new Date(year, month, day, 23, 59, 59, 999);

const FIXTURES: Record<PeriodKey, Fixture> = {
  azi: {
    label: "Azi",
    range: () => {
      const now = new Date();
      return {
        start: startOfDay(now.getFullYear(), now.getMonth(), now.getDate()),
        end: endOfDay(now.getFullYear(), now.getMonth(), now.getDate()),
      };
    },
    energy: [0, 2.72, 0, 0.59, 0, 0.09, 0.02, 1.97],
    cost: [2.9, 0, -0.72, 0, 0.04, -0.02, 2.93],
  },
  luna: {
    label: "Luna aceasta",
    range: () => {
      const now = new Date();
      return {
        start: startOfDay(now.getFullYear(), now.getMonth(), 1),
        end: endOfDay(now.getFullYear(), now.getMonth() + 1, 0),
      };
    },
    energy: [272.79, 119.81, 179.11, 102.65, 0.52, 0.09, 3.24, 107.53],
    cost: [132.87, 80.6, -0.72, 0.0, 0.04, -0.02, 25.91],
  },
  aug: {
    label: "August 2026",
    range: () => ({ start: startOfDay(2026, 7, 1), end: endOfDay(2026, 7, 31) }),
    energy: [1079.59, 315.69, 605.43, 478.08, 124.49, 0.0, 28.08, 286.97],
    cost: [350.42, 272.44, 47.0, 12.24, 0.0, 2.76, 28.21],
  },
  an: {
    label: "2026",
    range: () => ({ start: startOfDay(2026, 0, 1), end: endOfDay(2026, 11, 31) }),
    energy: [7580.62, 4050.62, 4872.15, 3322.56, 392.2, 0.09, 436.06, 3015.2],
    cost: [4496.08, 2192.47, 964.11, 74.33, 0.04, 277.08, 1036.25],
  },
};

const POWER: Record<string, number> = {
  "sensor.casa_power": 388.5,
  "sensor.casuta_power": 11.59,
  "sensor.duosida_mode3_32a_power": 2694.94,
  "sensor.18691697773822_realtime_power": 0,
  "sensor.ups_power_sensor": 36,
};

const CONFIG: EnergyTreeCardConfig = {
  type: "custom:energy-tree-card",
  title: "Arbore energie",
  language: "ro",
  sources: {
    solar: { energy: "sensor.shellyem3_485519db8f59_channel_a_energy_returned", name: "Solar" },
    grid_import: { energy: "sensor.principal_energy", cost: "sensor.principal_energy_cost", name: "Import rețea" },
    grid_export: {
      energy: "sensor.principal_energy_returned",
      cost: "sensor.principal_energy_returned_compensation",
      name: "Export rețea",
    },
  },
  home: { name: "Consum total" },
  nodes: [
    {
      id: "casa",
      name: "Casa",
      energy: "sensor.casa_energy",
      cost: "sensor.cost_lunar_casa",
      power: "sensor.casa_power",
      icon: "mdi:home-account",
      color: "#1e88e5",
    },
    {
      id: "ac",
      parent: "casa",
      name: "AC",
      energy: "sensor.18691697773822_total_energy_consumption",
      cost: "sensor.cost_lunar_ac",
      power: "sensor.18691697773822_realtime_power",
      icon: "mdi:air-conditioner",
      color: "#00acc1",
    },
    {
      id: "server",
      parent: "casa",
      name: "Server",
      energy: "sensor.ups_energy_spent",
      cost: "sensor.cost_server_lunar",
      power: "sensor.ups_power_sensor",
      icon: "mdi:server",
      color: "#757575",
    },
    {
      id: "casuta",
      name: "Căsuță",
      energy: "sensor.casuta_energy",
      cost: "sensor.cost_lunar_casuta",
      power: "sensor.casuta_power",
      icon: "mdi:shovel",
      color: "#43a047",
    },
    {
      id: "masina",
      name: "Mașină",
      energy: "sensor.wallbox_energie_totala",
      cost: "sensor.ev_cost_factura_neta",
      power: "sensor.duosida_mode3_32a_power",
      icon: "mdi:car-electric-outline",
      color: "#8e24aa",
    },
  ],
};

// ---------------------------------------------------------------------------
// Harness state and mock hass
// ---------------------------------------------------------------------------

const params = new URLSearchParams(location.search);
const withPicker = params.get("picker") !== "0";

let selected: PeriodKey = "aug";
/** Removes sensor.casuta_energy and makes sensor.casa_power unavailable. */
let placeholders = false;
/** Makes callWS reject. */
let failing = false;
let live = false;
let liveTimer: number | undefined;
const power = { ...POWER };

const REMOVED_ENTITY = "sensor.casuta_energy";
const UNAVAILABLE_POWER = "sensor.casa_power";

function fixtureValue(id: string, fixture: Fixture): number | undefined {
  if (placeholders && id === REMOVED_ENTITY) return undefined;
  const energyIndex = ENERGY_IDS.indexOf(id);
  if (energyIndex >= 0) return fixture.energy[energyIndex];
  const costIndex = COST_IDS.indexOf(id);
  return costIndex >= 0 ? fixture.cost[costIndex] : undefined;
}

let previousStates: Record<string, HassEntityState> = {};

/** New states object; like Home Assistant, an entity keeps its state object while its state is unchanged. */
function buildStates(): Record<string, HassEntityState> {
  const states: Record<string, HassEntityState> = {};
  for (const id of ENERGY_IDS) {
    if (placeholders && id === REMOVED_ENTITY) continue;
    states[id] = { entity_id: id, state: "0", attributes: { unit_of_measurement: "kWh", state_class: "total_increasing" } };
  }
  for (const id of COST_IDS) {
    states[id] = { entity_id: id, state: "0", attributes: { unit_of_measurement: "RON", state_class: "total" } };
  }
  for (const [id, watts] of Object.entries(power)) {
    const unavailable = placeholders && id === UNAVAILABLE_POWER;
    states[id] = {
      entity_id: id,
      state: unavailable ? "unavailable" : String(watts),
      attributes: { unit_of_measurement: "W", device_class: "power" },
    };
  }
  states["sensor.unrelated"] = { entity_id: "sensor.unrelated", state: String(Date.now()), attributes: {} };
  for (const [id, state] of Object.entries(states)) {
    const previous = previousStates[id];
    if (previous && previous.state === state.state && JSON.stringify(previous.attributes) === JSON.stringify(state.attributes)) {
      states[id] = previous;
    }
  }
  previousStates = states;
  return states;
}

/** Fixture whose range starts at start_time (falls back to the selected one). */
function fixtureFor(startTime: unknown): Fixture {
  for (const fixture of Object.values(FIXTURES)) {
    if (fixture.range().start.toISOString() === startTime) return fixture;
  }
  return FIXTURES[selected];
}

async function callWS<T>(message: Record<string, unknown>): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 150));
  if (failing) throw { code: "unknown_error", message: "Simulated WebSocket failure" };
  if (message.type !== "recorder/statistics_during_period") {
    throw { code: "unknown_command", message: `Unknown command ${String(message.type)}` };
  }
  console.debug("[harness] callWS", message);
  const fixture = fixtureFor(message.start_time);
  const start = Date.parse(String(message.start_time));
  const end = typeof message.end_time === "string" ? Date.parse(message.end_time) : Date.now();
  const result: StatisticsResult = {};
  for (const id of (message.statistic_ids as string[]) ?? []) {
    const change = fixtureValue(id, fixture);
    if (change !== undefined) result[id] = [{ start, end, change }];
  }
  return result as T;
}

const subscribers = new Set<(data: EnergyCollectionData) => void>();
const collection: EnergyCollectionLike = {
  subscribe(callback) {
    subscribers.add(callback);
    if (collection.state) callback(collection.state);
    return () => {
      subscribers.delete(callback);
    };
  },
};

function emitPeriod(): void {
  const range = FIXTURES[selected].range();
  collection.state = range;
  collection.start = range.start;
  collection.end = range.end;
  for (const callback of [...subscribers]) callback(range);
}

const connection: Record<string, unknown> = withPicker ? { _energy_dev: collection } : {};

function makeHass(): HomeAssistant {
  return {
    states: buildStates(),
    connection,
    callWS,
    locale: { language: "ro" },
    language: "ro",
    config: { currency: "RON", time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone },
    panelUrl: "dev",
    themes: { darkMode: true },
  };
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type CardElement = HTMLElement & { setConfig(config: EnergyTreeCardConfig): void; hass?: HomeAssistant };

// Count renders per card, to check that unrelated state changes do not re-render.
const cardClass = customElements.get("energy-tree-card") as CustomElementConstructor;
const proto = cardClass.prototype as { updated?: (...args: unknown[]) => void };
const originalUpdated = proto.updated;
proto.updated = function (this: { __renders?: number }, ...args: unknown[]) {
  this.__renders = (this.__renders ?? 0) + 1;
  originalUpdated?.apply(this, args);
  queueMicrotask(updateInfo);
};

emitPeriod();
let hass = makeHass();
const cards: CardElement[] = [];
const cardsEl = document.getElementById("cards") as HTMLElement;
const narrowWidth = Number(params.get("narrow")) || 400;
const wideWidth = Number(params.get("width")) || 1200;

for (const width of [narrowWidth, wideWidth]) {
  const frame = document.createElement("div");
  frame.className = "frame";
  frame.style.width = `${width}px`;
  const label = document.createElement("p");
  label.className = "label";
  label.textContent = `${width} px`;
  const card = document.createElement("energy-tree-card") as CardElement;
  card.setConfig(CONFIG);
  card.hass = hass;
  frame.append(label, card);
  cardsEl.append(frame);
  cards.push(card);
}

function pushHass(): void {
  hass = makeHass();
  for (const card of cards) card.hass = hass;
}

function updateInfo(): void {
  const renders = cards.map((card) => (card as unknown as { __renders?: number }).__renders ?? 0).join(" / ");
  const info = document.getElementById("info") as HTMLElement;
  info.textContent = `renders: ${renders}${withPicker ? "" : " · no date picker"}`;
}

function button(label: string, onClick: (el: HTMLButtonElement) => void, pressed?: () => boolean): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = "button";
  el.textContent = label;
  const sync = (): void => {
    if (pressed) el.setAttribute("aria-pressed", String(pressed()));
  };
  el.addEventListener("click", () => {
    onClick(el);
    syncAll();
  });
  syncers.push(sync);
  return el;
}

const syncers: (() => void)[] = [];
function syncAll(): void {
  for (const sync of syncers) sync();
}

const periodsEl = document.getElementById("periods") as HTMLElement;
for (const key of Object.keys(FIXTURES) as PeriodKey[]) {
  periodsEl.append(
    button(
      FIXTURES[key].label,
      () => {
        selected = key;
        emitPeriod();
      },
      () => selected === key,
    ),
  );
}

const togglesEl = document.getElementById("toggles") as HTMLElement;
togglesEl.append(
  button(
    "Placeholdere",
    () => {
      placeholders = !placeholders;
      pushHass();
      emitPeriod(); // refetch, like a collection refresh
    },
    () => placeholders,
  ),
  button(
    "Eroare WS",
    () => {
      failing = !failing;
      emitPeriod();
    },
    () => failing,
  ),
  button(
    "Live",
    () => {
      live = !live;
      window.clearInterval(liveTimer);
      if (live) {
        liveTimer = window.setInterval(() => {
          power["sensor.casa_power"] = Math.round(300 + Math.random() * 400);
          power["sensor.duosida_mode3_32a_power"] = Math.round(1500 + Math.random() * 6000);
          pushHass();
        }, 2000);
      }
    },
    () => live,
  ),
  button("Stare fără legătură", () => {
    // Only sensor.unrelated changes: the cards must not re-render.
    pushHass();
  }),
);

syncAll();
updateInfo();
