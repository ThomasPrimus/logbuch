// Kleine Diagramme für Kennzahlen und Zusammenhänge. Eine Reihe, eine Achse,
// Fadenkreuz oder Punkt-Tooltip. Farben kommen aus den geprüften Diagrammtönen.

import { dayStart, fmt, h } from "./lib.js";

const shortDate = (day) => dayStart(day).toLocaleDateString("de-DE", { day: "numeric", month: "numeric" });

function niceRange(values, { zero = false, padShare = 0.12 } = {}) {
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  }
  const pad = (hi - lo) * padShare;
  return [zero ? 0 : lo - pad, hi + pad];
}

function tooltip(wrap) {
  const tip = h("div", { class: "tip", hidden: true });
  wrap.append(tip);
  return {
    show(xShare, text) {
      tip.hidden = false;
      tip.textContent = text;
      // am Rand nicht aus dem Diagramm laufen
      tip.style.left = `${Math.min(82, Math.max(18, xShare * 100))}%`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

/**
 * Verlauf einer Kennzahl: geglättete Linie über den Zeitraum.
 * series: [{day, value}] (value darf null sein), fy: Formatierung.
 */
export function trendChart(series, { fy, label }) {
  const pts = series.filter((p) => p.value != null);
  const wrap = h("div", { class: "chart" });
  if (pts.length < 2) {
    wrap.append(h("p", { class: "small muted" }, "Für einen Verlauf fehlen noch Tage."));
    return wrap;
  }
  const W = 320;
  const H = 132;
  const pad = { l: 8, r: 8, t: 18, b: 34 };
  const [lo, hi] = niceRange(pts.map((p) => p.value));
  const x = (i) => pad.l + (i / Math.max(1, series.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);

  const svg = h("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${label}: Verlauf von ${fy(pts[0].value)} auf ${fy(pts[pts.length - 1].value)}` });
  svg.append(h("line", { class: "grid", x1: pad.l, x2: W - pad.r, y1: H - pad.b, y2: H - pad.b }));

  // Lücken unterbrechen die Linie, statt sie zu überbrücken
  let d = "";
  let open = false;
  series.forEach((p, i) => {
    if (p.value == null) {
      open = false;
      return;
    }
    d += `${open ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)} `;
    open = true;
  });
  svg.append(h("path", { d, fill: "none", stroke: "var(--c1)", "stroke-width": 2, "stroke-linejoin": "round", "stroke-linecap": "round" }));
  const lastIdx = series.findLastIndex((p) => p.value != null);
  svg.append(h("circle", { cx: x(lastIdx), cy: y(series[lastIdx].value), r: 4, fill: "var(--c1)", stroke: "var(--surface)", "stroke-width": 2 }));

  // Höchster und niedrigster Wert der Linie als Maßstab
  const top = pts.reduce((a, b) => (b.value > a.value ? b : a));
  const bottom = pts.reduce((a, b) => (b.value < a.value ? b : a));
  for (const [p, dy] of [
    [top, -5],
    [bottom, 13],
  ]) {
    const i = series.indexOf(p);
    const anchor = x(i) < 40 ? "start" : x(i) > W - 40 ? "end" : "middle";
    svg.append(h("text", { class: "axis-label", x: x(i), y: y(p.value) + dy, "text-anchor": anchor }, fy(p.value)));
  }
  svg.append(h("text", { class: "axis-label", x: pad.l, y: H - 6, "text-anchor": "start" }, shortDate(series[0].day)));
  svg.append(h("text", { class: "axis-label", x: W - pad.r, y: H - 6, "text-anchor": "end" }, shortDate(series[series.length - 1].day)));

  const cross = h("line", { class: "cross", y1: pad.t, y2: H - pad.b, x1: 0, x2: 0, visibility: "hidden" });
  const dot = h("circle", { r: 4, fill: "var(--surface)", stroke: "var(--c1)", "stroke-width": 2, visibility: "hidden" });
  svg.append(cross, dot);
  wrap.append(svg);
  const tip = tooltip(wrap);
  const move = (ev) => {
    const rect = svg.getBoundingClientRect();
    const px = ((ev.clientX - rect.left) / rect.width) * W;
    let idx = Math.max(0, Math.min(series.length - 1, Math.round(((px - pad.l) / (W - pad.l - pad.r)) * (series.length - 1))));
    // zum nächsten Tag mit Wert springen
    for (let step = 0; step < series.length && series[idx].value == null; step++) idx = Math.max(0, idx - 1);
    const p = series[idx];
    if (p.value == null) return;
    cross.setAttribute("x1", x(idx));
    cross.setAttribute("x2", x(idx));
    cross.setAttribute("visibility", "visible");
    dot.setAttribute("cx", x(idx));
    dot.setAttribute("cy", y(p.value));
    dot.setAttribute("visibility", "visible");
    tip.show(x(idx) / W, `${fmt.dayShort(dayStart(p.day))}: ${fy(p.value)}`);
  };
  svg.addEventListener("pointermove", move);
  svg.addEventListener("pointerdown", move);
  svg.addEventListener("pointerleave", () => {
    cross.setAttribute("visibility", "hidden");
    dot.setAttribute("visibility", "hidden");
    tip.hide();
  });
  return wrap;
}

/**
 * Stufen eines Zusammenhangs: Tage nach x sortiert und in gleich große Gruppen
 * geteilt; je Gruppe der Mittelwert von y. bins: [{x, y, n}].
 */
export function binChart(bins, { fx, fy, xLabel, yLabel }) {
  const W = 320;
  const H = 150;
  const pad = { l: 26, r: 26, t: 26, b: 36 };
  const [lo, hi] = niceRange(bins.map((b) => b.y), { padShare: 0.25 });
  const x = (i) => pad.l + (i / Math.max(1, bins.length - 1)) * (W - pad.l - pad.r);
  const y = (v) => pad.t + ((hi - v) / (hi - lo)) * (H - pad.t - pad.b);
  const wrap = h("div", { class: "chart" });
  const svg = h("svg", {
    viewBox: `0 0 ${W} ${H}`,
    role: "img",
    "aria-label": `${yLabel} nach ${xLabel}: von ${fy(bins[0].y)} bei ${fx(bins[0].x)} bis ${fy(bins[bins.length - 1].y)} bei ${fx(bins[bins.length - 1].x)}`,
  });
  svg.append(h("line", { class: "grid", x1: pad.l - 14, x2: W - pad.r + 14, y1: H - pad.b, y2: H - pad.b }));
  svg.append(h("path", { d: bins.map((b, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(b.y).toFixed(1)}`).join(" "), fill: "none", stroke: "var(--c1)", "stroke-width": 2, "stroke-linejoin": "round" }));
  const tipHolder = { tip: null };
  bins.forEach((b, i) => {
    svg.append(h("circle", { cx: x(i), cy: y(b.y), r: 5, fill: "var(--c1)", stroke: "var(--surface)", "stroke-width": 2 }));
    // Wert nur am ersten und letzten Punkt, der Rest steht im Tooltip
    if (i === 0 || i === bins.length - 1) svg.append(h("text", { class: "end-label", x: x(i), y: y(b.y) - 11, "text-anchor": "middle" }, fy(b.y)));
    svg.append(h("text", { class: "axis-label", x: x(i), y: H - pad.b + 15, "text-anchor": "middle" }, fx(b.x)));
    const hit = h("rect", { x: x(i) - 22, y: pad.t - 14, width: 44, height: H - pad.t - pad.b + 14, fill: "transparent" });
    hit.addEventListener("pointerenter", () => tipHolder.tip.show(x(i) / W, `${fx(b.x)}: ${fy(b.y)} (${b.n} Tage)`));
    hit.addEventListener("pointerdown", () => tipHolder.tip.show(x(i) / W, `${fx(b.x)}: ${fy(b.y)} (${b.n} Tage)`));
    hit.addEventListener("pointerleave", () => tipHolder.tip.hide());
    svg.append(hit);
  });
  svg.append(h("text", { class: "axis-label", x: W / 2, y: H - 4, "text-anchor": "middle" }, xLabel));
  wrap.append(svg);
  tipHolder.tip = tooltip(wrap);
  return wrap;
}

/** Zwei Gruppen im Vergleich als waagrechte Balken ab null. groups: [{label, y, n}] */
export function pairBars(groups, { fy }) {
  const max = Math.max(...groups.map((g) => g.y || 0), 1e-9);
  return h(
    "div",
    { class: "pairbars" },
    groups.map((g) =>
      h(
        "div",
        { class: "pairbar", title: `${g.label}: ${fy(g.y)} (${g.n} Tage)` },
        h("div", { class: "pairbar-label" }, g.label, h("span", { class: "muted" }, ` ${g.n} Tage`)),
        h("div", { class: "pairbar-row" }, h("div", { class: "pairbar-track" }, h("div", { class: "pairbar-fill", style: `width:${Math.max(1.5, ((g.y || 0) / max) * 100)}%` })), h("div", { class: "pairbar-value" }, fy(g.y))),
      ),
    ),
  );
}
