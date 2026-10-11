// Auswertung: Gewicht gegen Kurs, Wochenvergleich, Haut und Histamin, Süßlust.

import { loadRange } from "../data.js";
import { addDays, dayKey, dayStart, daysBetween, fmt, h, mount } from "../lib.js";
import { subnav } from "./kpis.js";
import { avg, dayTotals, goalDay, groupBy, inWindow, isStrength, skinPatterns, targetWeight, weightSeries } from "../plan.js";

/** Liniendiagramm mit zwei Reihen, Fadenkreuz und Tooltip. Eine gemeinsame Achse. */
function weightChart(actual, target, days) {
  // Am Handy ein schmaleres Zeichenfeld, damit die Beschriftung lesbar bleibt
  const narrow = window.innerWidth < 720;
  const W = narrow ? 360 : 640;
  const H = narrow ? 250 : 280;
  const pad = { l: 34, r: 70, t: 14, b: 28 };
  const all = [...actual.map((p) => p.kg), ...target.map((p) => p.kg)];
  const lo = Math.floor(Math.min(...all) - 0.5);
  const hi = Math.ceil(Math.max(...all) + 0.5);
  const x = (day) => pad.l + (daysBetween(days[0], day) / Math.max(1, days.length - 1)) * (W - pad.l - pad.r);
  const y = (kg) => pad.t + ((hi - kg) / (hi - lo)) * (H - pad.t - pad.b);
  const path = (pts) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.day).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");

  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": "Gewicht und Zielkurve im Zeitverlauf" });
  const step = hi - lo > 8 ? 2 : 1;
  for (let v = lo; v <= hi; v += step) {
    svg.append(h("line", { class: "grid", x1: pad.l, x2: W - pad.r, y1: y(v), y2: y(v) }));
    svg.append(h("text", { class: "axis-label", x: pad.l - 8, y: y(v) + 4, "text-anchor": "end" }, `${v}`));
  }
  const labelEvery = Math.ceil(days.length / (narrow ? 4 : 5));
  days.forEach((d, i) => {
    if (i % labelEvery === 0) svg.append(h("text", { class: "axis-label", x: x(d), y: H - 8, "text-anchor": i === 0 ? "start" : "middle" }, dayStart(d).toLocaleDateString("de-DE", { day: "numeric", month: "numeric" })));
  });

  svg.append(h("path", { d: path(target), fill: "none", stroke: "var(--c2)", "stroke-width": 2, "stroke-dasharray": "6 5", "stroke-linecap": "round" }));
  if (actual.length > 1) svg.append(h("path", { d: path(actual), fill: "none", stroke: "var(--c1)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  // Bei vielen Messpunkten trägt die Linie, nur der letzte Punkt wird betont
  const dense = actual.length > 10;
  actual.forEach((p, i) => {
    const lastPoint = i === actual.length - 1;
    if (dense && !lastPoint) return;
    svg.append(h("circle", { cx: x(p.day), cy: y(p.kg), r: 4, fill: "var(--c1)", stroke: "var(--surface)", "stroke-width": 2 }));
  });

  // Direktbeschriftung am Ende der Linien, bei Bedarf auseinandergeschoben
  const lastT = target[target.length - 1];
  const lastA = actual[actual.length - 1];
  let ty = y(lastT.kg) + 4;
  if (lastA) {
    const ay = y(lastA.kg) + 4;
    if (Math.abs(ay - ty) < 14 && x(lastA.day) > W - pad.r - 80) ty = ay + (ty >= ay ? 14 : -14);
    svg.append(h("text", { class: "end-label", x: x(lastA.day) + 8, y: ay }, fmt.n1(lastA.kg)));
  }
  svg.append(h("text", { class: "end-label", x: x(lastT.day) + 8, y: ty }, `Kurs ${fmt.n1(lastT.kg)}`));

  const cross = h("line", { class: "cross", y1: pad.t, y2: H - pad.b, x1: 0, x2: 0, visibility: "hidden" });
  svg.append(cross);
  const tip = h("div", { class: "tip", hidden: true });
  const wrap = h("div", { class: "chart" }, svg, tip);
  const targetByDay = new Map(target.map((p) => [p.day, p.kg]));
  const actualByDay = new Map(actual.map((p) => [p.day, p.kg]));
  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    const idx = Math.max(0, Math.min(days.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (days.length - 1))));
    const day = days[idx];
    cross.setAttribute("x1", x(day));
    cross.setAttribute("x2", x(day));
    cross.setAttribute("visibility", "visible");
    tip.hidden = false;
    tip.style.left = `${(x(day) / W) * 100}%`;
    const a = actualByDay.get(day);
    tip.textContent = `${fmt.dayShort(dayStart(day))}: ${a != null ? `${fmt.n1(a)} kg, ` : ""}Kurs ${fmt.n1(targetByDay.get(day))} kg`;
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerdown", move);
  svg.addEventListener("pointerleave", () => {
    cross.setAttribute("visibility", "hidden");
    tip.hidden = true;
  });
  return wrap;
}

export async function renderInsights(root, ctx) {
  const s = ctx.settings;
  const today = dayKey();
  const from = addDays(today, -60);
  const data = await loadRange(from, addDays(today, 1));

  // ------------------------------------------------------------ Gewicht
  const weights = weightSeries(data.weights);
  const chartFrom = weights.length ? (weights[0].day > addDays(today, -42) ? weights[0].day : addDays(today, -42)) : s.plan_start || today;
  const chartStart = s.plan_start && s.plan_start < chartFrom && s.plan_start > addDays(today, -56) ? s.plan_start : chartFrom;
  const days = [];
  for (let d = chartStart; d <= addDays(today, 21); d = addDays(d, 1)) days.push(d);
  const target = days.map((d) => ({ day: d, kg: targetWeight(s, d) }));
  const actual = weights.filter((w) => w.day >= chartStart);
  const last = weights[weights.length - 1];
  const last7 = avg(weights.filter((w) => w.day > addDays(today, -7)).map((w) => w.kg));
  const goal = goalDay(s);

  let statement;
  if (!last) statement = "Noch kein Gewicht eingetragen.";
  else if (!s.plan_start) statement = `Aktuell ${fmt.kg(last.kg)}. Der Plan ist noch nicht gestartet.`;
  else {
    const diff = Math.round((last7 - targetWeight(s, today)) * 10) / 10;
    statement =
      Math.abs(diff) < 0.3
        ? `Du liegst auf Kurs: ${fmt.kg(last7)} im Schnitt der letzten sieben Tage.`
        : diff > 0
          ? `Du liegst ${fmt.n1(diff)} kg über dem Kurs: ${fmt.kg(last7)} im Schnitt der letzten sieben Tage.`
          : `Du liegst ${fmt.n1(-diff)} kg vor dem Kurs: ${fmt.kg(last7)} im Schnitt der letzten sieben Tage.`;
  }

  const weightPanel = h(
    "section",
    { class: "panel" },
    h("h2", {}, "Gewicht"),
    h("p", { class: "statement" }, statement),
    h("div", { class: "legend" }, h("span", {}, h("i", {}), "Gewicht in kg"), h("span", {}, h("i", { class: "dashed" }), "Zielkurve")),
    weightChart(actual, target, days),
    h(
      "p",
      { class: "small muted" },
      goal ? `Nach Kurs erreichst du dein Ziel von ${fmt.kg(Number(s.goal_weight_kg))} am ${fmt.date(dayStart(goal))}. ` : "",
      `Tempo ${fmt.n1(Number(s.rate_kg_per_week))} kg pro Woche`,
      s.pause_from ? `, ab ${fmt.date(dayStart(s.pause_from))} für ${s.pause_weeks} Wochen nur halten.` : ".",
      " Einzelne Tage schwanken um bis zu ein Kilo, deshalb zählt der Sieben-Tage-Schnitt.",
    ),
  );

  // ------------------------------------------------------ Wochenvergleich
  const week = (offset) => {
    const a = addDays(today, -7 * (offset + 1) + 1);
    const b = addDays(today, -7 * offset + 1);
    const inRange = (day) => day >= a && day < b;
    const mealsByDay = groupBy(
      data.meals.filter((m) => inRange(dayKey(m.eaten_at))),
      (m) => dayKey(m.eaten_at),
    );
    const totals = [...mealsByDay.values()].map(dayTotals).filter((t) => t.count);
    const windowDays = [...mealsByDay.values()].filter((list) => list.every((m) => inWindow(s, m.eaten_at))).length;
    const whoop = data.whoop.filter((d) => inRange(d.day));
    return {
      logged: mealsByDay.size,
      kcal: avg(totals.map((t) => t.kcal)),
      protein: avg(totals.map((t) => t.protein_g)),
      windowDays,
      strength: data.workouts.filter((w) => inRange(dayKey(w.start_at)) && isStrength(w)).length,
      steps: avg(whoop.map((d) => d.steps)),
      sleep: avg(whoop.map((d) => d.sleep_hours)),
      recovery: avg(whoop.map((d) => d.recovery_score)),
    };
  };
  const w0 = week(0);
  const w1 = week(1);
  const rows = [
    ["Tage mit Einträgen", `${w0.logged} von 7`, `${w1.logged} von 7`],
    ["Kalorien pro Tag", fmt.n0(w0.kcal), fmt.n0(w1.kcal)],
    ["Eiweiß pro Tag", w0.protein == null ? "–" : `${fmt.n0(w0.protein)} g`, w1.protein == null ? "–" : `${fmt.n0(w1.protein)} g`],
    ["Tage ganz im Essensfenster", w0.logged ? `${w0.windowDays} von ${w0.logged}` : "–", w1.logged ? `${w1.windowDays} von ${w1.logged}` : "–"],
    ["Krafttraining", `${w0.strength}`, `${w1.strength}`],
    ["Schritte pro Tag", fmt.n0(w0.steps), fmt.n0(w1.steps)],
    ["Schlaf pro Nacht", w0.sleep == null ? "–" : `${fmt.n1(w0.sleep)} h`, w1.sleep == null ? "–" : `${fmt.n1(w1.sleep)} h`],
    ["Erholung", w0.recovery == null ? "–" : `${fmt.n0(w0.recovery)} %`, w1.recovery == null ? "–" : `${fmt.n0(w1.recovery)} %`],
  ];
  const weekPanel = h(
    "section",
    { class: "panel" },
    h("h2", {}, "Diese Woche gegen die Woche davor"),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        {},
        h("thead", {}, h("tr", {}, h("th", {}, ""), h("th", { class: "r" }, "letzte 7 Tage"), h("th", { class: "r" }, "7 Tage davor"))),
        h(
          "tbody",
          {},
          rows.map(([label, a, b]) => h("tr", {}, h("td", {}, label), h("td", { class: "r" }, a), h("td", { class: "r" }, b))),
        ),
      ),
    ),
    h("p", { class: "small muted" }, "Schritte, Schlaf, Erholung und Training kommen aus Whoop. Kalorien und Eiweiß sind Durchschnitte der Tage mit ausgewerteten Einträgen."),
  );

  // --------------------------------------------------- Haut und Histamin
  const patterns = skinPatterns(data.meals, data.events, data.checkins);
  const pct = (r) => (r == null ? "–" : `${Math.round(r * 100)} %`);
  const anyEnough = patterns.some((p) => p.enough);
  const skinPanel = h(
    "section",
    { class: "panel" },
    h("h2", {}, "Haut und Histamin"),
    h(
      "p",
      {},
      anyEnough
        ? "Der Vergleich zeigt, an wie vielen Tagen auf eine Belastung Juckreiz folgte, am selben oder am nächsten Tag."
        : "Für einen Vergleich fehlen noch Tage. Gebraucht werden je Zeile mindestens fünf Tage mit und fünf ohne die Belastung.",
    ),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { style: "min-width:470px" },
        h("thead", {}, h("tr", {}, h("th", {}, "Belastung"), h("th", { class: "r" }, "Tage mit"), h("th", { class: "r" }, "davon Juckreiz"), h("th", { class: "r" }, "Tage ohne"), h("th", { class: "r" }, "davon Juckreiz"))),
        h(
          "tbody",
          {},
          patterns.map((p) =>
            h(
              "tr",
              {},
              h("td", {}, p.label, p.enough ? "" : h("span", { class: "muted small" }, " (zu wenig Tage)")),
              h("td", { class: "r" }, `${p.withN}`),
              h("td", { class: "r" }, p.withN ? `${p.withItch} (${pct(p.rateWith)})` : "–"),
              h("td", { class: "r" }, `${p.withoutN}`),
              h("td", { class: "r" }, p.withoutN ? `${p.withoutItch} (${pct(p.rateWithout)})` : "–"),
            ),
          ),
        ),
      ),
    ),
    h("p", { class: "small muted" }, "Das ist ein Zählvergleich über die letzten 60 Tage und kein Beweis. Ein Auslöser gilt erst als wahrscheinlich, wenn sich der Unterschied in einem gezielten Test wiederholt."),
  );

  // ------------------------------------------------------------ Süßlust
  const since = addDays(today, -14);
  const cravings = data.events.filter((e) => e.type === "suesslust" && dayKey(e.occurred_at) >= since);
  const resisted = cravings.filter((e) => e.outcome === "nichts").length;
  const cravingDays = new Set(cravings.map((e) => dayKey(e.occurred_at)));
  const sleepOn = avg(data.whoop.filter((d) => d.day >= since && cravingDays.has(d.day)).map((d) => d.sleep_hours));
  const sleepOff = avg(data.whoop.filter((d) => d.day >= since && !cravingDays.has(d.day)).map((d) => d.sleep_hours));
  const cravingPanel = h(
    "section",
    { class: "panel" },
    h("h2", {}, "Lust auf Süßes am Abend"),
    h(
      "p",
      { class: "statement" },
      cravings.length ? `${cravings.length} Momente in 14 Tagen, ${resisted} davon ohne Essen überstanden.` : "In den letzten 14 Tagen ist kein Moment eingetragen.",
    ),
    sleepOn != null && sleepOff != null
      ? h("p", {}, `Schlaf in der Nacht davor: ${fmt.n1(sleepOn)} h an Tagen mit Süßlust, ${fmt.n1(sleepOff)} h an Tagen ohne. Bei so wenigen Tagen ist das ein Hinweis, kein Befund.`)
      : h("p", { class: "muted" }, "Ob kurze Nächte eine Rolle spielen, zeigt sich hier, sobald Whoop-Daten und ein paar Einträge da sind."),
  );

  mount(root,
    h("header", { class: "page-head" }, h("h1", {}, "Auswertung"), ctx.demo ? h("span", { class: "pill plain" }, "Vorschau mit Beispieldaten") : null),
    subnav("auswertung"),
    h("div", { class: "cols" }, h("div", { class: "stack" }, weightPanel, skinPanel), h("div", { class: "stack" }, weekPanel, cravingPanel)),
  );
}
