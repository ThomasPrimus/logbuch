// Kennzahlen und Zusammenhänge: Rechenregeln ohne Seiteneffekte.
// Ein Zusammenhang ist hier immer ein Vergleich über Tage, kein Beweis. Die
// Schwellen sind bewusst streng, weil Tageswerte voneinander abhängen und
// mehrere Fragen gleichzeitig geprüft werden.

import { addDays, dayKey } from "./lib.js";
import { dayTotals, groupBy, inWindow, isStrength } from "./plan.js";

/** Frühstück heißt hier: etwas mit Kalorien vor dieser Uhrzeit. */
export const BREAKFAST_BEFORE = 10;

const num = (v) => (v == null || v === "" || isNaN(Number(v)) ? null : Number(v));

export const mean = (values) => {
  const v = values.filter((x) => x != null && !isNaN(x));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/** Ränge mit gemittelten Bindungen. */
export function ranks(values) {
  const order = values.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const out = new Array(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++;
    const r = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k][1]] = r;
    i = j + 1;
  }
  return out;
}

export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3) return null;
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
    syy += (ys[i] - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Rangkorrelation nach Spearman: unempfindlich gegen Ausreißer. */
export const spearman = (xs, ys) => pearson(ranks(xs), ranks(ys));

const slice = (sorted, a, b) => {
  const part = sorted.slice(a, b);
  return { n: part.length, x: mean(part.map((p) => p.x)), y: mean(part.map((p) => p.y)) };
};

/**
 * Bewertet einen Zusammenhang aus Wertepaaren {x, y}.
 * - Stetiges x: Rangkorrelation, Vergleich unteres gegen oberes Drittel, Stufen.
 * - binary: x ist wahr oder falsch, verglichen werden die beiden Gruppen.
 * Stärke: "zuwenig" (zu wenige Tage), "keiner", "schwach", "deutlich".
 */
export function relate(pairs, { binary = false, minN = 30, minGroup = 8 } = {}) {
  const clean = pairs.filter((p) => p.x != null && p.y != null).map((p) => ({ x: Number(p.x), y: Number(p.y) }));
  const n = clean.length;
  const out = { n, minN, binary, strength: "zuwenig", r: null, dir: 0 };

  if (binary) {
    const yes = clean.filter((p) => p.x > 0);
    const no = clean.filter((p) => !(p.x > 0));
    out.with = { n: yes.length, y: mean(yes.map((p) => p.y)) };
    out.without = { n: no.length, y: mean(no.map((p) => p.y)) };
    out.enough = n >= minN && yes.length >= minGroup && no.length >= minGroup;
    out.missing = Math.max(0, minN - n, minGroup - yes.length, minGroup - no.length);
  } else {
    const sorted = [...clean].sort((a, b) => a.x - b.x);
    const third = Math.floor(n / 3);
    out.low = slice(sorted, 0, third);
    out.high = slice(sorted, n - third, n);
    const k = n >= 100 ? 5 : 3;
    out.bins = [];
    for (let i = 0; i < k; i++) out.bins.push(slice(sorted, Math.round((i * n) / k), Math.round(((i + 1) * n) / k)));
    out.enough = n >= minN;
    out.missing = Math.max(0, minN - n);
  }
  if (!out.enough) return out;

  const r = binary ? pearson(clean.map((p) => (p.x > 0 ? 1 : 0)), ranks(clean.map((p) => p.y))) : spearman(clean.map((p) => p.x), clean.map((p) => p.y));
  if (r == null) {
    out.strength = "keiner";
    return out;
  }
  out.r = r;
  out.dir = r > 0 ? 1 : -1;
  // Prüfgröße der Korrelation; 2,6 entspricht etwa einer Irrtumswahrscheinlichkeit von 1 %
  const t = Math.abs(r) * Math.sqrt((n - 2) / Math.max(1e-9, 1 - r * r));
  out.strength = t < 2.6 ? "keiner" : Math.abs(r) >= 0.3 ? "deutlich" : "schwach";
  return out;
}

/** Gleitender Mittelwert über `window` Tage; Tage ohne Wert zählen nicht mit. */
export function rolling(days, valueOf, window, minCount = Math.ceil(window / 3)) {
  const vals = days.map(valueOf);
  return days.map((day, i) => {
    const part = vals.slice(Math.max(0, i - window + 1), i + 1).filter((v) => v != null);
    return { day, value: part.length >= minCount ? mean(part) : null };
  });
}

/** Einschlafzeit als Stunden nach 12 Uhr mittags (22:30 wird 10,5; 01:00 wird 13). */
export function bedtimeHours(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const b = (d.getHours() + d.getMinutes() / 60 + 12) % 24;
  return b < 6 || b > 18 ? null : b; // vor 18 Uhr oder nach 6 Uhr: kein Nachtschlaf
}

export function clock(hoursAfterNoon) {
  if (hoursAfterNoon == null) return "–";
  const total = Math.round(((hoursAfterNoon + 12) % 24) * 60);
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * Baut aus den geladenen Daten eine Zeile pro Tag. Whoop-Werte eines Tages:
 * Schlaf und Erholung gehören zur Nacht davor, Belastung und Schritte zum Tag.
 */
export function buildDays(data, settings) {
  const rows = new Map();
  const get = (day) => {
    if (!rows.has(day)) rows.set(day, { day });
    return rows.get(day);
  };

  for (const d of data.whoop || []) {
    const r = get(d.day);
    if (r.whoop && r.recovery != null && d.recovery_score == null) continue; // doppelter Tag: die Zeile mit Erholung gilt
    Object.assign(r, {
      whoop: true,
      sleep: num(d.sleep_hours),
      recovery: num(d.recovery_score),
      hrv: num(d.hrv_ms),
      rhr: num(d.rhr),
      steps: num(d.steps),
      burned: num(d.kcal_burned) > 800 ? num(d.kcal_burned) : null, // angebrochene Tage nicht werten
      strain: num(d.strain),
      bedtime: bedtimeHours(d.sleep_start),
    });
    if (r.strength == null) r.strength = 0;
  }
  for (const w of data.workouts || []) {
    if (!isStrength(w)) continue;
    const r = rows.get(dayKey(w.start_at));
    if (r) r.strength = (r.strength || 0) + 1;
  }
  for (const w of data.weights || []) {
    const r = get(w.day);
    if (r.weight == null || w.source === "manuell") r.weight = num(w.kg);
  }

  const mealsByDay = groupBy(data.meals || [], (m) => dayKey(m.eaten_at));
  for (const [day, meals] of mealsByDay) {
    const r = get(day);
    const t = dayTotals(meals);
    const has = (flag) => (meals.some((m) => (m.flags || []).includes(flag)) ? 1 : 0);
    const hours = meals.map((m) => new Date(m.eaten_at)).map((d) => d.getHours() + d.getMinutes() / 60);
    Object.assign(r, {
      logged: true,
      kcalIn: t.count ? t.kcal : null,
      protein: t.count ? t.protein_g : null,
      firstMeal: Math.min(...hours),
      lastMeal: Math.max(...hours),
      eatWindow: Math.max(...hours) - Math.min(...hours),
      breakfast: Math.min(...hours) < BREAKFAST_BEFORE ? 1 : 0,
      fasting: settings ? (meals.every((m) => inWindow(settings, m.eaten_at)) ? 1 : 0) : null,
      histHigh: meals.some((m) => m.histamine === "hoch") ? 1 : 0,
      dairy: has("milch"),
      alcohol: has("alkohol"),
      releaser: has("freisetzer"),
      leftovers: has("reste"),
    });
  }
  // Fastendauer über Nacht: von der letzten Mahlzeit des Vortags bis zur ersten des Tages
  for (const [day, r] of rows) {
    const before = rows.get(addDays(day, -1));
    if (r.firstMeal != null && before?.lastMeal != null) r.fastHours = 24 - before.lastMeal + r.firstMeal;
  }

  // Fasten-Timer: zählt für den Tag, an dem das Fasten endet, und geht den Fotos vor
  for (const f of data.fasts || []) {
    if (!f.ended_at) continue;
    const hoursFasted = (new Date(f.ended_at) - new Date(f.started_at)) / 3600000;
    const r = get(dayKey(f.ended_at));
    if (r.fastTimer != null && r.fastTimer >= hoursFasted) continue; // das längste Fasten des Tages gilt
    r.fastTimer = hoursFasted;
    r.fastHours = hoursFasted;
    r.fasting = hoursFasted >= Number(f.target_hours) ? 1 : 0;
  }

  const cravingDays = new Set();
  const itchDays = new Set();
  for (const e of data.events || []) {
    if (e.type === "suesslust") cravingDays.add(dayKey(e.occurred_at));
    if (e.type === "juckreiz") itchDays.add(dayKey(e.occurred_at));
  }
  const checkins = new Map((data.checkins || []).map((c) => [c.day, c]));
  for (const c of checkins.values()) {
    if (Number(c.craving) >= 1) cravingDays.add(c.day);
    if (Number(c.itch) >= 1) itchDays.add(c.day);
    // Die eigene Antwort im Tagescheck geht vor dem, was aus den Fotos abgeleitet ist
    const r = get(c.day);
    if (c.breakfast != null) r.breakfast = c.breakfast ? 1 : 0;
    if (c.fasting != null) r.fasting = c.fasting ? 1 : 0;
  }
  // Süßlust und Juckreiz gelten nur an Tagen als "nein", an denen danach gefragt oder Essen eingetragen wurde
  for (const day of new Set([...checkins.keys(), ...mealsByDay.keys(), ...cravingDays, ...itchDays])) {
    const r = get(day);
    const c = checkins.get(day);
    const logged = mealsByDay.has(day);
    if (logged || c?.craving != null || cravingDays.has(day)) r.craving = cravingDays.has(day) ? 1 : 0;
    if (logged || c?.itch != null || itchDays.has(day)) {
      r.itch = itchDays.has(day) ? 1 : 0;
      r.itch2 = itchDays.has(day) || itchDays.has(addDays(day, 1)) ? 1 : 0; // am selben oder am nächsten Tag
    }
  }
  return rows;
}

/**
 * Wertepaare für eine Frage. x und y sind [Feld, Versatz in Tagen]; ein Versatz
 * von -1 heißt: der Wert vom Vortag.
 */
export function pairsFor(rows, x, y, fromDay, toDay) {
  const out = [];
  for (let day = fromDay; day <= toDay; day = addDays(day, 1)) {
    const rx = rows.get(addDays(day, x[1] || 0));
    const ry = rows.get(addDays(day, y[1] || 0));
    if (!rx || !ry) continue;
    const vx = rx[x[0]];
    const vy = ry[y[0]];
    if (vx == null || vy == null) continue;
    out.push({ day, x: Number(vx), y: Number(vy) });
  }
  return out;
}
