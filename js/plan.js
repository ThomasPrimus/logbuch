// Rechenregeln ohne Seiteneffekte: Zielkurve, Essensfenster, Muster.
// Bewusst frei von DOM und Datenbank, damit sie sich einzeln prüfen lassen.

import { addDays, dayKey, daysBetween } from "./lib.js";

/**
 * Zielgewicht an einem Tag. Drei Abschnitte: abnehmen bis zur Pause, in der
 * Pause halten, danach weiter bis zum Ziel. Vor dem Start gilt das Startgewicht.
 */
export function targetWeight(s, day) {
  const start = Number(s.start_weight_kg);
  const goal = Number(s.goal_weight_kg);
  if (!s.plan_start) return start;
  const perDay = Number(s.rate_kg_per_week) / 7;
  if (day <= s.plan_start) return start;

  let lossDays = daysBetween(s.plan_start, day);
  if (s.pause_from && s.pause_from > s.plan_start) {
    const pauseEnd = addDays(s.pause_from, Number(s.pause_weeks) * 7);
    const before = daysBetween(s.plan_start, s.pause_from);
    if (day <= s.pause_from) lossDays = daysBetween(s.plan_start, day);
    else if (day <= pauseEnd) lossDays = before;
    else lossDays = before + daysBetween(pauseEnd, day);
  }
  return Math.max(goal, Math.round((start - lossDays * perDay) * 100) / 100);
}

/** Der Tag, an dem die Zielkurve das Ziel erreicht (oder null vor dem Start). */
export function goalDay(s) {
  if (!s.plan_start) return null;
  let day = s.plan_start;
  for (let i = 0; i < 1500; i++) {
    if (targetWeight(s, day) <= Number(s.goal_weight_kg)) return day;
    day = addDays(day, 1);
  }
  return null;
}

const toMin = (t) => {
  const [hh, mm] = String(t).split(":").map(Number);
  return hh * 60 + (mm || 0);
};

/** Zustand des Essensfensters zu einem Zeitpunkt. */
export function windowStatus(s, now = new Date()) {
  const startMin = toMin(s.window_start);
  const endMin = toMin(s.window_end);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const open = nowMin >= startMin && nowMin < endMin;
  let minutes;
  if (open) minutes = endMin - nowMin;
  else if (nowMin < startMin) minutes = startMin - nowMin;
  else minutes = 24 * 60 - nowMin + startMin;
  const closedFor = open ? 0 : nowMin >= endMin ? nowMin - endMin : nowMin + 24 * 60 - endMin;
  return { open, minutes, closedFor, startMin, endMin, nowMin };
}

export function inWindow(s, date) {
  const d = new Date(date);
  const m = d.getHours() * 60 + d.getMinutes();
  return m >= toMin(s.window_start) && m < toMin(s.window_end) + 1;
}

/** Wählt je Tag das maßgebliche Gewicht: von Hand eingetragen geht vor Whoop. */
export function weightSeries(rows) {
  const byDay = new Map();
  for (const r of rows) {
    const cur = byDay.get(r.day);
    if (!cur || (r.source === "manuell" && cur.source !== "manuell")) byDay.set(r.day, r);
  }
  return [...byDay.values()].sort((a, b) => (a.day < b.day ? -1 : 1)).map((r) => ({ day: r.day, kg: Number(r.kg), source: r.source }));
}

/** Summen eines Tages aus den ausgewerteten Mahlzeiten. */
export function dayTotals(meals) {
  const t = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, count: 0, pending: 0 };
  for (const m of meals) {
    if (m.status === "pending") t.pending++;
    if (m.kcal == null) continue;
    t.kcal += Number(m.kcal) || 0;
    t.protein_g += Number(m.protein_g) || 0;
    t.carbs_g += Number(m.carbs_g) || 0;
    t.fat_g += Number(m.fat_g) || 0;
    t.count++;
  }
  return t;
}

/** Richtwert für Kalorien: fester Wert oder Whoop-Verbrauch minus Defizit. */
export function kcalTarget(s, whoopDays) {
  if (s.kcal_target) return { value: Number(s.kcal_target), basis: "fest" };
  const burned = (whoopDays || []).map((d) => Number(d.kcal_burned)).filter((v) => v > 1200);
  if (burned.length < 5) return null;
  const avg = burned.reduce((a, b) => a + b, 0) / burned.length;
  const deficit = s.plan_start ? (Number(s.rate_kg_per_week) * 7700) / 7 : 0;
  return { value: Math.round((avg - deficit) / 50) * 50, basis: "whoop", burned: Math.round(avg), deficit: Math.round(deficit) };
}

export const EXPOSURES = [
  ["hoch", "Histamin hoch", (m) => m.histamine === "hoch"],
  ["freisetzer", "Freisetzer", (m) => (m.flags || []).includes("freisetzer")],
  ["milch", "Milchprodukte", (m) => (m.flags || []).includes("milch")],
  ["alkohol", "Alkohol", (m) => (m.flags || []).includes("alkohol")],
  ["reste", "Reste", (m) => (m.flags || []).includes("reste")],
];

/**
 * Vergleicht Tage mit und ohne eine Belastung: An wie vielen folgte Juckreiz am
 * selben oder am nächsten Tag? Das ist ein Zählvergleich, kein Beweis. Gewertet
 * werden nur Tage, an denen überhaupt Essen eingetragen wurde.
 */
export function skinPatterns(meals, events, checkins, minDays = 5) {
  const mealsByDay = groupBy(meals, (m) => dayKey(m.eaten_at));
  const itchDays = new Set();
  for (const e of events) if (e.type === "juckreiz") itchDays.add(dayKey(e.occurred_at));
  for (const c of checkins) if (Number(c.itch) >= 1) itchDays.add(c.day);
  const days = [...mealsByDay.keys()].sort();
  const reacted = (day) => itchDays.has(day) || itchDays.has(addDays(day, 1));

  return EXPOSURES.map(([key, label, test]) => {
    let withN = 0;
    let withItch = 0;
    let withoutN = 0;
    let withoutItch = 0;
    for (const day of days) {
      const exposed = mealsByDay.get(day).some(test);
      if (exposed) {
        withN++;
        if (reacted(day)) withItch++;
      } else {
        withoutN++;
        if (reacted(day)) withoutItch++;
      }
    }
    const enough = withN >= minDays && withoutN >= minDays;
    return {
      key,
      label,
      withN,
      withItch,
      withoutN,
      withoutItch,
      enough,
      rateWith: withN ? withItch / withN : null,
      rateWithout: withoutN ? withoutItch / withoutN : null,
    };
  });
}

export function groupBy(list, keyFn) {
  const map = new Map();
  for (const item of list) {
    const k = keyFn(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(item);
  }
  return map;
}

export const avg = (values) => {
  const v = values.filter((x) => x != null && !isNaN(x)).map(Number);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

const STRENGTH = /weight|strength|functional|powerlifting|kraft/i;
export const isStrength = (w) => STRENGTH.test(w.sport_name || "");

/**
 * Stand eines Fastens zu einem Zeitpunkt. Läuft es noch, zählt `now`, sonst das
 * Ende. Alle Zeiten in Minuten.
 */
export function fastStatus(fast, now = new Date()) {
  const start = new Date(fast.started_at).getTime();
  const end = fast.ended_at ? new Date(fast.ended_at).getTime() : new Date(now).getTime();
  const targetMin = Math.round(Number(fast.target_hours) * 60);
  const elapsedMin = Math.max(0, Math.floor((end - start) / 60000));
  return {
    running: !fast.ended_at,
    elapsedMin,
    targetMin,
    remainingMin: Math.max(0, targetMin - elapsedMin),
    overMin: Math.max(0, elapsedMin - targetMin),
    reached: elapsedMin >= targetMin,
    share: targetMin ? Math.min(1, elapsedMin / targetMin) : 0,
    goalAt: new Date(start + targetMin * 60000),
  };
}
