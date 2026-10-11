// Verlauf: die letzten Tage mit Tagesband, Summen und Einträgen.

import { dayBand, eventRow, eventSheet, mealDetailSheet, mealRow } from "../components.js";
import { loadRange } from "../data.js";
import { addDays, dayKey, dayStart, fmt, h, mount } from "../lib.js";
import { dayTotals, groupBy, weightSeries, windowStatus } from "../plan.js";

let span = 7;

export async function renderHistory(root, ctx) {
  const s = ctx.settings;
  const today = dayKey();
  const from = addDays(today, -span + 1);
  const data = await loadRange(from, addDays(today, 1));
  const rerender = () => ctx.refresh();

  const mealsByDay = groupBy(data.meals, (m) => dayKey(m.eaten_at));
  const eventsByDay = groupBy(data.events, (e) => dayKey(e.occurred_at));
  const checkByDay = new Map(data.checkins.map((c) => [c.day, c]));
  const weightByDay = new Map(weightSeries(data.weights).map((w) => [w.day, w]));
  const whoopByDay = new Map(data.whoop.map((d) => [d.day, d]));
  const win = windowStatus(s, new Date());
  const word = ["", "leicht", "mittel", "stark"];

  const sections = [];
  for (let d = today; d >= from; d = addDays(d, -1)) {
    const meals = mealsByDay.get(d) || [];
    const events = eventsByDay.get(d) || [];
    const check = checkByDay.get(d);
    const weight = weightByDay.get(d);
    const whoop = whoopByDay.get(d);
    const totals = dayTotals(meals);
    const facts = [];
    if (totals.count) facts.push(`${fmt.n0(totals.kcal)} kcal`, `${fmt.n0(totals.protein_g)} g Eiweiß`);
    if (weight) facts.push(fmt.kg(weight.kg));
    if (whoop?.sleep_hours != null) facts.push(`${fmt.n1(Number(whoop.sleep_hours))} h Schlaf`);
    if (whoop?.recovery_score != null) facts.push(`Erholung ${whoop.recovery_score} %`);
    if (whoop?.steps != null) facts.push(`${fmt.n0(whoop.steps)} Schritte`);
    const feel = [];
    if (check?.craving) feel.push(`Heißhunger ${word[check.craving]}`);
    if (check?.itch) feel.push(`Juckreiz ${word[check.itch]}`);
    if (check?.dry_skin) feel.push(`trockene Haut ${word[check.dry_skin]}`);

    const timeline = [...meals.map((m) => ({ t: m.eaten_at, kind: "meal", row: m })), ...events.map((e) => ({ t: e.occurred_at, kind: "event", row: e }))].sort((a, b) => (a.t < b.t ? -1 : 1));
    sections.push(
      h(
        "section",
        { class: "panel" },
        h("div", { class: "day-head" }, h("h2", {}, d === today ? "Heute" : fmt.dayLong(dayStart(d))), h("span", { class: "small muted num" }, facts.join(", "))),
        dayBand(win, meals, events, false),
        feel.length ? h("p", { class: "small" }, feel.join(", ")) : null,
        timeline.length
          ? h(
              "ul",
              { class: "entries" },
              timeline.map((x) => (x.kind === "meal" ? mealRow(x.row, (m) => mealDetailSheet(m, rerender)) : eventRow(x.row, (e) => eventSheet(e, e.type, rerender)))),
            )
          : h("p", { class: "empty" }, "Keine Einträge."),
      ),
    );
  }

  mount(root,
    h("header", { class: "page-head" }, h("h1", {}, "Verlauf"), ctx.demo ? h("span", { class: "pill plain" }, "Vorschau mit Beispieldaten") : null),
    h("div", { class: "stack" }, sections),
    h(
      "button",
      {
        class: "btn",
        type: "button",
        onclick: () => {
          span += 14;
          rerender();
        },
      },
      "Ältere Tage laden",
    ),
  );
}
