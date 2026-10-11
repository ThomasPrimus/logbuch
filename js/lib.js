// Kleine Helfer: DOM bauen, Zahlen und Zeiten auf Deutsch formatieren.

export function h(tag, attrs, ...children) {
  const el = tag === "svg" || svgTags.has(tag) ? document.createElementNS("http://www.w3.org/2000/svg", tag) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "class") el.setAttribute("class", v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "value" && "value" in el) el.value = v;
    else if (k === "checked" || k === "disabled" || k === "hidden" || k === "selected") el[k] = !!v;
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  append(el, children);
  return el;
}

/** Ersetzt den Inhalt von `root`; leere Werte und verschachtelte Listen sind erlaubt. */
export function mount(root, ...children) {
  root.replaceChildren();
  append(root, children);
}

const svgTags = new Set(["path", "circle", "line", "polyline", "rect", "g", "text", "polygon"]);

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
}

export function icon(name) {
  const paths = {
    today: "M4 7h16M4 12h16M4 17h10",
    history: "M12 7v5l3 2M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4 4v4h4",
    chart: "M4 19V5M4 19h16M8 15l3.5-4 3 2.5L19 8",
    more: "M5 12h.01M12 12h.01M19 12h.01",
    camera: "M4 8h3l1.5-2h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
    itch: "M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18",
    sweet: "M8 4h8l-1 5a3 3 0 0 1-6 0zM12 12v8M9 20h6",
    scale: "M5 5h14v14H5zM9 9.5a4 4 0 0 1 6 0M12 9.5V12",
    close: "M6 6l12 12M18 6 6 18",
    chevron: "M9 6l6 6-6 6",
  };
  const svg = h("svg", { viewBox: "0 0 24 24", "aria-hidden": "true" });
  svg.append(h("path", { d: paths[name] || "" }));
  return svg;
}

const nf0 = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export const fmt = {
  n0: (v) => (v == null || isNaN(v) ? "–" : nf0.format(v)),
  n1: (v) => (v == null || isNaN(v) ? "–" : nf1.format(v)),
  kg: (v) => (v == null ? "–" : `${nf1.format(v)} kg`),
  time: (d) => new Date(d).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }),
  dayLong: (d) => new Date(d).toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }),
  dayShort: (d) => new Date(d).toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "numeric" }),
  date: (d) => new Date(d).toLocaleDateString("de-DE", { day: "numeric", month: "numeric", year: "numeric" }),
  duration(min) {
    const m = Math.max(0, Math.round(min));
    const hh = Math.floor(m / 60);
    const mm = m % 60;
    if (hh === 0) return `${mm} min`;
    return mm === 0 ? `${hh} h` : `${hh} h ${String(mm).padStart(2, "0")} min`;
  },
};

/** Lokales Datum als JJJJ-MM-TT (Zeitzone des Geräts). */
export function dayKey(d = new Date()) {
  const x = new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

export function dayStart(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = dayStart(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

export function daysBetween(a, b) {
  return Math.round((dayStart(b) - dayStart(a)) / 86400000);
}

/** Wert für <input type="datetime-local"> in Ortszeit. */
export function localInputValue(d = new Date()) {
  const x = new Date(d);
  return `${dayKey(x)}T${String(x.getHours()).padStart(2, "0")}:${String(x.getMinutes()).padStart(2, "0")}`;
}

let toastTimer;
export function toast(message) {
  document.querySelector(".toast")?.remove();
  clearTimeout(toastTimer);
  const el = h("div", { class: "toast", role: "status" }, message);
  document.body.append(el);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

/** Öffnet ein Blatt von unten. `build(close)` liefert den Inhalt. */
export function openSheet(title, build) {
  const prev = document.activeElement;
  const back = h("div", { class: "sheet-back" });
  const close = () => {
    back.remove();
    document.removeEventListener("keydown", onKey);
    prev?.focus?.();
  };
  const onKey = (e) => e.key === "Escape" && close();
  const sheet = h(
    "div",
    { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
    h(
      "div",
      { class: "sheet-head" },
      h("h2", {}, title),
      h("button", { class: "btn quiet", type: "button", "aria-label": "Schließen", onclick: close }, icon("close")),
    ),
  );
  append(sheet, [build(close)]);
  back.append(sheet);
  back.addEventListener("click", (e) => e.target === back && close());
  document.addEventListener("keydown", onKey);
  document.body.append(back);
  sheet.querySelector("input, textarea, select, button.primary")?.focus?.({ preventScroll: true });
  return close;
}

/** Segmentierte Auswahl. options: [[wert, text], ...] */
export function segmented(options, value, onChange, cls = "seg") {
  const wrap = h("div", { class: cls, role: "group" });
  const render = (current) => {
    wrap.replaceChildren(
      ...options.map(([val, label]) =>
        h(
          "button",
          {
            type: "button",
            "aria-pressed": String(val === current),
            onclick: () => {
              render(val);
              onChange(val);
            },
          },
          label,
        ),
      ),
    );
  };
  render(value);
  return wrap;
}

export function field(label, control, hint) {
  return h("label", { class: "field" }, h("span", {}, label, hint ? h("span", { class: "hint" }, ` ${hint}`) : null), control);
}

/** Verkleinert ein Bild auf höchstens `max` Pixel Kantenlänge und liefert JPEG. */
export async function shrinkImage(file, max = 1568, quality = 0.84) {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const hgt = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = hgt;
    canvas.getContext("2d").drawImage(bitmap, 0, 0, w, hgt);
    const blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob || file;
  } catch {
    return file;
  }
}

export const HISTAMINE_LABEL = { niedrig: "Histamin niedrig", mittel: "Histamin mittel", hoch: "Histamin hoch" };
export const FLAG_LABEL = {
  freisetzer: "Freisetzer",
  alkohol: "Alkohol",
  milch: "Milchprodukt",
  gereift: "gereift oder fermentiert",
  reste: "Reste",
};
