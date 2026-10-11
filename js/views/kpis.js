// Kennzahlen im Verlauf und Zusammenhänge zwischen ihnen.

import { binChart, pairBars, trendChart } from "../charts.js";
import { loadRange } from "../data.js";
import { addDays, dayKey, fmt, h, mount, segmented } from "../lib.js";
import { buildDays, clock, mean, pairsFor, relate, rolling } from "../stats.js";

/** Unterseiten der Auswertung. */
export function subnav(active) {
  const items = [
    ["auswertung", "Plan"],
    ["kennzahlen", "Kennzahlen"],
    ["zusammenhaenge", "Zusammenhänge"],
  ];
  return h(
    "nav",
    { class: "subnav", "aria-label": "Bereiche der Auswertung" },
    items.map(([key, label]) => h("a", { href: `#/${key}`, "aria-current": key === active ? "page" : null }, label)),
  );
}

const hours = (v) => `${fmt.n1(v)} h`;
const percent = (v) => `${fmt.n0(v)} %`;
const share = (v) => `${fmt.n0(v * 100)} % der Tage`;
const signed = (d, text) => `${d > 0 ? "+" : "−"}${text}`;

// goodUp: true = mehr ist besser, false = weniger ist besser, null = ohne Wertung.
// eps: Unterschiede darunter gelten als unverändert.
const KPIS = [
  { key: "sleep", label: "Schlaf pro Nacht", f: hours, fd: (d) => signed(d, hours(Math.abs(d))), goodUp: true, eps: 0.15 },
  { key: "recovery", label: "Erholung", f: percent, fd: (d) => signed(d, `${fmt.n0(Math.abs(d))} Punkte`), goodUp: true, eps: 2 },
  { key: "hrv", label: "Herzfrequenzvariabilität", f: (v) => `${fmt.n0(v)} ms`, fd: (d) => signed(d, `${fmt.n0(Math.abs(d))} ms`), goodUp: true, eps: 2 },
  { key: "rhr", label: "Ruhepuls", f: (v) => `${fmt.n0(v)} Schläge`, fd: (d) => signed(d, `${fmt.n1(Math.abs(d))} Schläge`), goodUp: false, eps: 1 },
  { key: "bedtime", label: "Einschlafzeit", f: clock, fd: (d) => `${Math.round(Math.abs(d) * 60)} min ${d > 0 ? "später" : "früher"}`, goodUp: false, eps: 0.17 },
  { key: "steps", label: "Schritte pro Tag", f: fmt.n0, fd: (d) => signed(d, fmt.n0(Math.abs(d))), goodUp: true, eps: 300 },
  { key: "burned", label: "Verbrauch pro Tag", f: (v) => `${fmt.n0(v)} kcal`, fd: (d) => signed(d, `${fmt.n0(Math.abs(d))} kcal`), goodUp: null, eps: 40 },
  { key: "strain", label: "Belastung", f: fmt.n1, fd: (d) => signed(d, fmt.n1(Math.abs(d))), goodUp: null, eps: 0.3 },
  { key: "strength", label: "Krafttraining pro Woche", scale: 7, f: fmt.n1, fd: (d) => signed(d, fmt.n1(Math.abs(d))), goodUp: true, eps: 0.3 },
  { key: "fasting", label: "Fastenziel erreicht", scale: 100, f: (v) => `${fmt.n0(v)} % der Tage`, fd: (d) => signed(d, `${fmt.n0(Math.abs(d))} Punkte`), goodUp: true, eps: 5, log: true },
  { key: "breakfast", label: "Gefrühstückt", scale: 100, f: (v) => `${fmt.n0(v)} % der Tage`, fd: (d) => signed(d, `${fmt.n0(Math.abs(d))} Punkte`), goodUp: null, eps: 5, log: true },
  { key: "fastHours", label: "Fastendauer über Nacht", f: hours, fd: (d) => signed(d, hours(Math.abs(d))), goodUp: null, eps: 0.3, log: true },
  { key: "kcalIn", label: "Gegessene Kalorien pro Tag", f: (v) => `${fmt.n0(v)} kcal`, fd: (d) => signed(d, `${fmt.n0(Math.abs(d))} kcal`), goodUp: null, eps: 50, log: true },
  { key: "protein", label: "Eiweiß pro Tag", f: (v) => `${fmt.n0(v)} g`, fd: (d) => signed(d, `${fmt.n0(Math.abs(d))} g`), goodUp: true, eps: 5, log: true },
];

function daysBetweenKeys(from, to) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

function kpiTile(kpi, rows, period, today) {
  const scale = kpi.scale || 1;
  const valueOf = (day) => {
    const v = rows.get(day)?.[kpi.key];
    return v == null ? null : v * scale;
  };
  const from = addDays(today, -period + 1);
  const current = daysBetweenKeys(from, today);
  const previous = daysBetweenKeys(addDays(from, -period), addDays(from, -1));
  const now = current.map(valueOf).filter((v) => v != null);
  const before = previous.map(valueOf).filter((v) => v != null);
  if (now.length < 3) return null;

  const value = mean(now);
  const prev = before.length >= Math.min(10, period / 3) ? mean(before) : null;
  const delta = prev == null ? null : value - prev;
  let pill = null;
  if (delta != null) {
    const flat = Math.abs(delta) < kpi.eps;
    const good = kpi.goodUp == null || flat ? null : delta > 0 === kpi.goodUp;
    pill = h("span", { class: `pill ${good == null ? "plain" : good ? "h-niedrig" : "h-hoch"}` }, flat ? "unverändert" : `${good == null ? "" : good ? "besser: " : "schlechter: "}${kpi.fd(delta)}`);
  }

  const window = period <= 90 ? 7 : 28;
  const lookback = daysBetweenKeys(addDays(from, -window + 1), today);
  const smooth = rolling(lookback, valueOf, window).slice(window - 1);

  return h(
    "section",
    { class: "panel tile" },
    h("div", { class: "tile-label" }, kpi.label),
    h("div", { class: "tile-value" }, kpi.f(value)),
    h("div", { class: "tile-delta" }, pill, prev == null ? h("span", { class: "small muted" }, "kein Vergleich davor") : h("span", { class: "small muted" }, `davor ${kpi.f(prev)}`)),
    trendChart(smooth, { fy: kpi.f, label: kpi.label }),
  );
}

export async function renderKpis(root, ctx, query) {
  const period = [30, 90, 365].includes(Number(query?.get("tage"))) ? Number(query.get("tage")) : 90;
  const today = dayKey();
  const window = period <= 90 ? 7 : 28;
  const data = await loadRange(addDays(today, -2 * period - window), addDays(today, 1));
  const rows = buildDays(data, ctx.settings);

  const whoopTiles = KPIS.filter((k) => !k.log).map((k) => kpiTile(k, rows, period, today)).filter(Boolean);
  const logTiles = KPIS.filter((k) => k.log).map((k) => kpiTile(k, rows, period, today)).filter(Boolean);

  mount(
    root,
    h("header", { class: "page-head" }, h("h1", {}, "Auswertung"), ctx.demo ? h("span", { class: "pill plain" }, "Vorschau mit Beispieldaten") : null),
    subnav("kennzahlen"),
    h(
      "div",
      { class: "filters" },
      segmented(
        [
          [30, "30 Tage"],
          [90, "90 Tage"],
          [365, "1 Jahr"],
        ],
        period,
        (v) => (location.hash = `#/kennzahlen?tage=${v}`),
      ),
      h("p", { class: "small muted" }, `Große Zahl: Schnitt der letzten ${period} Tage, verglichen mit den ${period} Tagen davor. Linie: gleitender Schnitt über ${window} Tage.`),
    ),
    whoopTiles.length
      ? h("div", { class: "tiles" }, whoopTiles, logTiles)
      : h("div", { class: "panel" }, h("p", { class: "empty" }, "Noch keine Whoop-Daten. Verbinde Whoop unter Mehr, Verbindungen.")),
    logTiles.length ? null : h("p", { class: "small muted" }, "Fastenziel, Frühstück, Fastendauer, gegessene Kalorien und Eiweiß erscheinen hier, sobald mindestens drei Tage eingetragen sind."),
  );
}

// ------------------------------------------------------------ Zusammenhänge
// x und y: [Feld, Versatz in Tagen]. Ein Versatz von -1 ist der Vortag.
const RELATIONS = [
  {
    title: "Schlafdauer und Erholung am Morgen",
    x: ["sleep", 0],
    y: ["recovery", 0],
    fx: hours,
    fy: percent,
    xLabel: "Schlaf in der Nacht",
    yLabel: "Erholung",
    more: "Je länger du schläfst, desto",
    up: "höher ist die Erholung am Morgen",
    down: "niedriger ist die Erholung am Morgen",
    low: "Kürzeste Nächte",
    high: "Längste Nächte",
    note: "Whoop rechnet den Schlaf selbst in die Erholung ein. Ein Teil dieses Zusammenhangs ist deshalb eingebaut.",
  },
  {
    title: "Einschlafzeit und Schlafdauer",
    x: ["bedtime", 0],
    y: ["sleep", 0],
    fx: clock,
    fy: hours,
    xLabel: "Einschlafzeit",
    yLabel: "Schlaf",
    more: "Je später du einschläfst, desto",
    up: "länger schläfst du",
    down: "kürzer schläfst du",
    low: "Früheste Einschlafzeiten",
    high: "Späteste Einschlafzeiten",
  },
  {
    title: "Einschlafzeit und Erholung",
    x: ["bedtime", 0],
    y: ["recovery", 0],
    fx: clock,
    fy: percent,
    xLabel: "Einschlafzeit",
    yLabel: "Erholung",
    more: "Je später du einschläfst, desto",
    up: "höher ist die Erholung am Morgen",
    down: "niedriger ist die Erholung am Morgen",
    low: "Früheste Einschlafzeiten",
    high: "Späteste Einschlafzeiten",
  },
  {
    title: "Belastung am Vortag und Erholung",
    x: ["strain", -1],
    y: ["recovery", 0],
    fx: fmt.n1,
    fy: percent,
    xLabel: "Belastung am Vortag",
    yLabel: "Erholung",
    more: "Je höher die Belastung am Vortag, desto",
    up: "höher ist die Erholung am Morgen",
    down: "niedriger ist die Erholung am Morgen",
    low: "Ruhigste Tage",
    high: "Anstrengendste Tage",
  },
  {
    title: "Krafttraining am Vortag und Erholung",
    binary: true,
    x: ["strength", -1],
    y: ["recovery", 0],
    fy: percent,
    yes: "Nach Tagen mit Krafttraining",
    no: "Nach Tagen ohne",
    up: "ist die Erholung höher",
    down: "ist die Erholung niedriger",
  },
  {
    title: "Belastung und Schlaf in der Nacht danach",
    x: ["strain", -1],
    y: ["sleep", 0],
    fx: fmt.n1,
    fy: hours,
    xLabel: "Belastung am Tag",
    yLabel: "Schlaf",
    more: "Je höher die Belastung am Tag, desto",
    up: "länger schläfst du danach",
    down: "kürzer schläfst du danach",
    low: "Ruhigste Tage",
    high: "Anstrengendste Tage",
  },
  {
    title: "Schritte und Schlaf in der Nacht danach",
    x: ["steps", -1],
    y: ["sleep", 0],
    fx: fmt.n0,
    fy: hours,
    xLabel: "Schritte am Tag",
    yLabel: "Schlaf",
    more: "Je mehr Schritte am Tag, desto",
    up: "länger schläfst du danach",
    down: "kürzer schläfst du danach",
    low: "Tage mit den wenigsten Schritten",
    high: "Tage mit den meisten Schritten",
  },
  {
    title: "Schlaf und Bewegung am selben Tag",
    x: ["sleep", 0],
    y: ["steps", 0],
    fx: hours,
    fy: fmt.n0,
    xLabel: "Schlaf in der Nacht davor",
    yLabel: "Schritte",
    more: "Je länger du schläfst, desto",
    up: "mehr Schritte gehst du am Tag danach",
    down: "weniger Schritte gehst du am Tag danach",
    low: "Kürzeste Nächte",
    high: "Längste Nächte",
  },
  // Ab hier braucht es eigene Einträge
  {
    title: "Schlaf und Lust auf Süßes am Abend",
    needs: "Lust auf Süßes eintragen oder abends den Tagescheck ausfüllen",
    x: ["sleep", 0],
    y: ["craving", 0],
    fx: hours,
    fy: share,
    xLabel: "Schlaf in der Nacht davor",
    yLabel: "Tage mit Lust auf Süßes",
    more: "Je länger du schläfst, desto",
    up: "häufiger kommt abends die Lust auf Süßes",
    down: "seltener kommt abends die Lust auf Süßes",
    low: "Kürzeste Nächte",
    high: "Längste Nächte",
  },
  {
    title: "Frühstück und Lust auf Süßes am Abend",
    needs: "im Tagescheck Frühstück und Süßlust beantworten oder Mahlzeiten fotografieren",
    binary: true,
    x: ["breakfast", 0],
    y: ["craving", 0],
    fy: share,
    yes: "An Tagen mit Frühstück",
    no: "An Tagen ohne",
    up: "kommt abends häufiger die Lust auf Süßes",
    down: "kommt abends seltener die Lust auf Süßes",
  },
  {
    title: "Frühstück und Erholung am nächsten Morgen",
    needs: "im Tagescheck Frühstück beantworten oder Mahlzeiten fotografieren",
    binary: true,
    x: ["breakfast", -1],
    y: ["recovery", 0],
    fy: percent,
    yes: "Nach Tagen mit Frühstück",
    no: "Nach Tagen ohne",
    up: "ist die Erholung höher",
    down: "ist die Erholung niedriger",
  },
  {
    title: "Fastenziel und Lust auf Süßes am Abend",
    needs: "den Fasten-Timer nutzen und Süßlust eintragen",
    binary: true,
    x: ["fasting", -1],
    y: ["craving", 0],
    fy: share,
    yes: "Nach Tagen mit erreichtem Fastenziel",
    no: "Nach Tagen ohne",
    up: "kommt am Folgetag häufiger die Lust auf Süßes",
    down: "kommt am Folgetag seltener die Lust auf Süßes",
  },
  {
    title: "Fastenziel und Schlaf in der Nacht danach",
    needs: "den Fasten-Timer nutzen",
    binary: true,
    x: ["fasting", -1],
    y: ["sleep", 0],
    fy: hours,
    yes: "Nach Tagen mit erreichtem Fastenziel",
    no: "Nach Tagen ohne",
    up: "schläfst du länger",
    down: "schläfst du kürzer",
  },
  {
    title: "Fastenziel und Erholung am nächsten Morgen",
    needs: "den Fasten-Timer nutzen",
    binary: true,
    x: ["fasting", -1],
    y: ["recovery", 0],
    fy: percent,
    yes: "Nach Tagen mit erreichtem Fastenziel",
    no: "Nach Tagen ohne",
    up: "ist die Erholung höher",
    down: "ist die Erholung niedriger",
  },
  {
    title: "Fastendauer über Nacht und Erholung",
    needs: "den Fasten-Timer nutzen",
    x: ["fastHours", 0],
    y: ["recovery", 0],
    fx: hours,
    fy: percent,
    xLabel: "Fastendauer über Nacht",
    yLabel: "Erholung",
    more: "Je länger du über Nacht fastest, desto",
    up: "höher ist die Erholung am Morgen",
    down: "niedriger ist die Erholung am Morgen",
    low: "Kürzeste Fastenzeiten",
    high: "Längste Fastenzeiten",
  },
  {
    title: "Eiweiß am Tag und Lust auf Süßes",
    needs: "Mahlzeiten fotografieren",
    x: ["protein", 0],
    y: ["craving", 0],
    fx: (v) => `${fmt.n0(v)} g`,
    fy: share,
    xLabel: "Eiweiß am Tag",
    yLabel: "Tage mit Lust auf Süßes",
    more: "Je mehr Eiweiß du isst, desto",
    up: "häufiger kommt abends die Lust auf Süßes",
    down: "seltener kommt abends die Lust auf Süßes",
    low: "Tage mit dem wenigsten Eiweiß",
    high: "Tage mit dem meisten Eiweiß",
  },
  {
    title: "Histaminreiches Essen und Juckreiz",
    needs: "Mahlzeiten fotografieren und Juckreiz eintragen",
    binary: true,
    x: ["histHigh", 0],
    y: ["itch2", 0],
    fy: share,
    yes: "An Tagen mit histaminreichem Essen",
    no: "An Tagen ohne",
    up: "juckt die Haut häufiger (am selben oder nächsten Tag)",
    down: "juckt die Haut seltener (am selben oder nächsten Tag)",
  },
  {
    title: "Milchprodukte und Juckreiz",
    needs: "Mahlzeiten fotografieren und Juckreiz eintragen",
    binary: true,
    x: ["dairy", 0],
    y: ["itch2", 0],
    fy: share,
    yes: "An Tagen mit Milchprodukten",
    no: "An Tagen ohne",
    up: "juckt die Haut häufiger (am selben oder nächsten Tag)",
    down: "juckt die Haut seltener (am selben oder nächsten Tag)",
  },
  {
    title: "Schlaf und Juckreiz",
    needs: "Juckreiz eintragen oder abends den Tagescheck ausfüllen",
    x: ["sleep", 0],
    y: ["itch", 0],
    fx: hours,
    fy: share,
    xLabel: "Schlaf in der Nacht davor",
    yLabel: "Tage mit Juckreiz",
    more: "Je länger du schläfst, desto",
    up: "häufiger juckt die Haut",
    down: "seltener juckt die Haut",
    low: "Kürzeste Nächte",
    high: "Längste Nächte",
  },
  {
    title: "Alkohol und Erholung am nächsten Morgen",
    needs: "Mahlzeiten und Getränke fotografieren",
    binary: true,
    x: ["alcohol", -1],
    y: ["recovery", 0],
    fy: percent,
    yes: "Nach Tagen mit Alkohol",
    no: "Nach Tagen ohne",
    up: "ist die Erholung höher",
    down: "ist die Erholung niedriger",
  },
  {
    title: "Letzte Mahlzeit und Schlaf",
    needs: "Mahlzeiten fotografieren",
    x: ["lastMeal", -1],
    y: ["sleep", 0],
    fx: (v) => clock(v - 12),
    fy: hours,
    xLabel: "Uhrzeit der letzten Mahlzeit",
    yLabel: "Schlaf",
    more: "Je später die letzte Mahlzeit, desto",
    up: "länger schläfst du danach",
    down: "kürzer schläfst du danach",
    low: "Früheste letzte Mahlzeiten",
    high: "Späteste letzte Mahlzeiten",
  },
];

const STRENGTH_LABEL = { deutlich: "deutlich", schwach: "schwach", keiner: "nicht erkennbar" };
const STRENGTH_ORDER = { deutlich: 0, schwach: 1, keiner: 2 };

function relationCard(rel, res) {
  const found = res.strength !== "keiner";
  let verdict;
  let detail;
  let chart = null;
  if (rel.binary) {
    verdict = found ? `${rel.yes} ${res.dir > 0 ? rel.up : rel.down}.` : "Kein Unterschied erkennbar.";
    detail = `${rel.yes}: ${rel.fy(res.with.y)} (${res.with.n} Tage). ${rel.no}: ${rel.fy(res.without.y)} (${res.without.n} Tage).`;
    if (found)
      chart = pairBars(
        [
          { label: rel.yes, y: res.with.y, n: res.with.n },
          { label: rel.no, y: res.without.y, n: res.without.n },
        ],
        { fy: rel.fy },
      );
  } else {
    verdict = found ? `${rel.more} ${res.dir > 0 ? rel.up : rel.down}.` : "Kein Zusammenhang erkennbar.";
    detail = `${rel.low} (im Schnitt ${rel.fx(res.low.x)}): ${rel.fy(res.low.y)}. ${rel.high} (${rel.fx(res.high.x)}): ${rel.fy(res.high.y)}. Grundlage: ${res.n} Tage.`;
    if (found) chart = binChart(res.bins, { fx: rel.fx, fy: rel.fy, xLabel: rel.xLabel, yLabel: rel.yLabel });
  }
  return h(
    "section",
    { class: `panel rel${found ? "" : " rel-none"}` },
    h("div", { class: "section-title" }, h("h2", {}, rel.title), h("span", { class: `pill ${found ? "" : "plain"}` }, STRENGTH_LABEL[res.strength])),
    h("p", { class: found ? "statement-s" : "muted" }, verdict),
    chart,
    h("p", { class: "small muted" }, detail),
    rel.note ? h("p", { class: "small muted" }, rel.note) : null,
  );
}

export async function renderRelations(root, ctx, query) {
  const period = [90, 365].includes(Number(query?.get("tage"))) ? Number(query.get("tage")) : 365;
  const today = dayKey();
  const from = addDays(today, -period + 1);
  const data = await loadRange(addDays(from, -1), addDays(today, 1));
  const rows = buildDays(data, ctx.settings);

  const results = RELATIONS.map((rel) => ({ rel, res: relate(pairsFor(rows, rel.x, rel.y, from, today), { binary: !!rel.binary }) }));
  const ready = results.filter((r) => r.res.enough).sort((a, b) => STRENGTH_ORDER[a.res.strength] - STRENGTH_ORDER[b.res.strength] || Math.abs(b.res.r || 0) - Math.abs(a.res.r || 0));
  const waiting = results.filter((r) => !r.res.enough);
  const foundCount = ready.filter((r) => r.res.strength !== "keiner").length;

  mount(
    root,
    h("header", { class: "page-head" }, h("h1", {}, "Auswertung"), ctx.demo ? h("span", { class: "pill plain" }, "Vorschau mit Beispieldaten") : null),
    subnav("zusammenhaenge"),
    h(
      "div",
      { class: "filters" },
      segmented(
        [
          [90, "90 Tage"],
          [365, "1 Jahr"],
        ],
        period,
        (v) => (location.hash = `#/zusammenhaenge?tage=${v}`),
      ),
      h(
        "p",
        { class: "small muted" },
        ready.length ? `${ready.length} Fragen geprüft, bei ${foundCount} zeigt sich ein Zusammenhang. ` : "",
        "Das sind Vergleiche über deine Tage, keine Beweise: Was zusammen auftritt, muss einander nicht verursachen.",
      ),
    ),
    ready.length ? h("div", { class: "rels" }, ready.map(({ rel, res }) => relationCard(rel, res))) : null,
    waiting.length
      ? h(
          "section",
          { class: "panel" },
          h("h2", {}, "Braucht noch Tage"),
          h("p", { class: "small muted" }, "Diese Fragen werden geprüft, sobald genug Tage zusammengekommen sind. Je Frage sind es mindestens 30 Tage, bei Ja-Nein-Vergleichen mindestens 8 Tage je Seite."),
          h(
            "div",
            { class: "table-wrap" },
            h(
              "table",
              {},
              h("thead", {}, h("tr", {}, h("th", {}, "Frage"), h("th", { class: "r" }, "Tage bisher"))),
              h(
                "tbody",
                {},
                waiting.map(({ rel, res }) =>
                  h("tr", {}, h("td", {}, rel.title, rel.needs ? h("div", { class: "small muted" }, `Dafür: ${rel.needs}`) : null), h("td", { class: "r" }, rel.binary ? `${res.with.n} mit, ${res.without.n} ohne` : `${res.n} von ${res.minN}`)),
                ),
              ),
            ),
          ),
        )
      : null,
    h(
      "section",
      { class: "note" },
      h("strong", {}, "So wird gerechnet"),
      h(
        "span",
        {},
        "Je Frage werden die Tage nach dem ersten Wert sortiert und in gleich große Gruppen geteilt; verglichen wird der Schnitt des zweiten Werts. Als Zusammenhang gilt nur, was über Zufall deutlich hinausgeht (Rangkorrelation, strenge Schwelle). „Deutlich“ heißt ab einer Korrelation von 0,3, darunter „schwach“. Bestätigt ist ein Muster erst, wenn es sich in einem gezielten Test wiederholt.",
      ),
    ),
  );
}
