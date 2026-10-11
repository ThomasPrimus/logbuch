// Heute: Tagesband, Essen fotografieren, schnelle Knöpfe, Einträge, Check-in.

import { analyzeMeal, dayBand, eventRow, eventSheet, mealDetailSheet, mealRow, newMealSheet, photoButton } from "../components.js";
import { api, loadRange } from "../data.js";
import { addDays, dayKey, field, fmt, h, icon, openSheet, segmented, toast, mount } from "../lib.js";
import { dayTotals, kcalTarget, targetWeight, weightSeries, windowStatus } from "../plan.js";

const CRAVING_KEY = "suesslust-timer";
const TIMER_MIN = 10;

function readTimer() {
  try {
    const t = JSON.parse(localStorage.getItem(CRAVING_KEY) || "null");
    if (t && Date.now() - t.start < 45 * 60000) return t;
  } catch {
    /* kein Speicher verfügbar */
  }
  return null;
}

function writeTimer(t) {
  try {
    if (t) localStorage.setItem(CRAVING_KEY, JSON.stringify(t));
    else localStorage.removeItem(CRAVING_KEY);
  } catch {
    /* kein Speicher verfügbar */
  }
}

export async function renderToday(root, ctx) {
  const today = dayKey();
  const s = ctx.settings;
  const [range, recent, dishes, supplements, supLogs] = await Promise.all([
    loadRange(today, addDays(today, 1)),
    loadRange(addDays(today, -14), addDays(today, 1)),
    api.select("dishes", { gte: { cooked_on: addDays(today, -3) }, order: "cooked_on" }),
    api.select("supplements", { eq: { active: true }, order: "name", asc: true }),
    api.select("supplement_logs", { eq: { day: today } }),
  ]);
  const rerender = () => ctx.refresh();
  const { meals, events } = range;
  const checkin = range.checkins[0] || {};
  const weights = weightSeries(recent.weights);
  const lastWeight = weights[weights.length - 1];

  // ---------------------------------------------------------- Tagesband
  const statusEl = h("div", { class: "band-status" });
  const bandHost = h("div", {});
  const paintBand = () => {
    const win = windowStatus(s, new Date());
    let headline;
    let rest;
    if (win.open) {
      headline = "Fenster offen";
      rest = `Noch ${fmt.duration(win.minutes)}, bis ${String(s.window_end).slice(0, 5)} Uhr.`;
    } else if (win.nowMin < win.startMin) {
      headline = "Noch nüchtern";
      rest = `Erste Mahlzeit ab ${String(s.window_start).slice(0, 5)} Uhr, in ${fmt.duration(win.minutes)}.`;
    } else {
      headline = "Küche geschlossen";
      rest = `Seit ${fmt.duration(win.closedFor)}. Weiter morgen um ${String(s.window_start).slice(0, 5)} Uhr.`;
    }
    statusEl.replaceChildren(headline, h("span", { class: "rest num" }, rest));
    bandHost.replaceChildren(dayBand(win, meals, events, true));
  };
  paintBand();
  const tick = setInterval(() => (document.body.contains(statusEl) ? paintBand() : clearInterval(tick)), 30000);

  // ------------------------------------------------------- Süßlust-Timer
  const timerHost = h("div", {});
  const paintTimer = () => {
    const t = readTimer();
    if (!t) {
      timerHost.replaceChildren();
      return;
    }
    const left = TIMER_MIN * 60 - Math.floor((Date.now() - t.start) / 1000);
    const done = left <= 0;
    const finish = async (outcome) => {
      try {
        await api.update("events", t.id, { outcome });
      } catch (err) {
        toast(err.message);
      }
      writeTimer(null);
      toast(outcome === "nichts" ? "Als überstanden eingetragen" : "Eingetragen");
      rerender();
    };
    timerHost.replaceChildren(
      h(
        "div",
        { class: "panel" },
        h("h2", {}, done ? "Zehn Minuten sind um" : "Mach dir einen Tee und warte zehn Minuten"),
        done ? null : h("div", { class: "timer", "aria-live": "off" }, `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`),
        h("p", { class: "muted" }, done ? "Wie ist es ausgegangen?" : "Die Lust flaut meist von selbst ab. Der Moment ist schon gespeichert."),
        h(
          "div",
          { class: "row" },
          h("button", { class: "btn primary grow", type: "button", onclick: () => finish("nichts") }, "Nichts gegessen"),
          h("button", { class: "btn grow", type: "button", onclick: () => finish("notfall-snack") }, "Notfall-Snack"),
          h("button", { class: "btn grow", type: "button", onclick: () => finish("gegessen") }, "Doch gegessen"),
        ),
      ),
    );
  };
  paintTimer();
  const timerTick = setInterval(() => (document.body.contains(timerHost) ? paintTimer() : clearInterval(timerTick)), 1000);

  const startCraving = async () => {
    try {
      const ev = await api.insert("events", { type: "suesslust", occurred_at: new Date().toISOString(), intensity: 2 });
      writeTimer({ id: ev.id, start: Date.now() });
      toast("Moment gespeichert");
      rerender();
    } catch (err) {
      toast(`Speichern fehlgeschlagen: ${err.message}`);
    }
  };

  // --------------------------------------------------------------- Essen
  const onMealSaved = (meal) => {
    rerender();
    analyzeMeal(meal, rerender);
  };
  const doneDishes = dishes.filter((d) => d.status === "done");
  const capture = photoButton("Essen fotografieren", (file) => newMealSheet({ file, dishes: doneDishes, onSaved: onMealSaved }));

  const weightSheet = () =>
    openSheet("Gewicht eintragen", (close) => {
      const input = h("input", { id: "weight-kg", type: "number", inputmode: "decimal", step: "0.1", min: "40", max: "250", value: lastWeight ? lastWeight.kg : s.start_weight_kg });
      const save = h("button", { class: "btn primary big", type: "button" }, "Gewicht speichern");
      save.addEventListener("click", async () => {
        const kg = Number(String(input.value).replace(",", "."));
        if (!(kg >= 40 && kg <= 250)) {
          toast("Bitte ein Gewicht zwischen 40 und 250 kg eingeben.");
          return;
        }
        const session = await api.session();
        try {
          await api.upsert("weights", { user_id: session.user.id, day: today, source: "manuell", kg }, "user_id,day,source");
          close();
          toast("Gewicht gespeichert");
          rerender();
        } catch (err) {
          toast(`Speichern fehlgeschlagen: ${err.message}`);
        }
      });
      return [field("Gewicht heute in kg", input, "am besten morgens, nüchtern"), save];
    });

  // ------------------------------------------------------------ Einträge
  const timeline = [...meals.map((m) => ({ t: m.eaten_at, kind: "meal", row: m })), ...events.map((e) => ({ t: e.occurred_at, kind: "event", row: e }))].sort((a, b) => (a.t < b.t ? 1 : -1));
  const list = timeline.length
    ? h(
        "ul",
        { class: "entries" },
        timeline.map((x) => (x.kind === "meal" ? mealRow(x.row, (m) => mealDetailSheet(m, rerender)) : eventRow(x.row, (e) => eventSheet(e, e.type, rerender)))),
      )
    : h("p", { class: "empty" }, "Noch nichts eingetragen. Alles mit Kalorien bekommt ein Foto, auch Getränke und Snacks.");

  // -------------------------------------------------------------- Summen
  const totals = dayTotals(meals);
  const target = kcalTarget(s, recent.whoop);
  const meter = (label, value, goal, unit) => {
    const ratio = goal ? Math.min(1, value / goal) : 0;
    return h(
      "div",
      { class: "meter" },
      h("span", {}, label),
      h("span", { class: "num" }, goal ? `${fmt.n0(value)} von ${fmt.n0(goal)} ${unit}` : `${fmt.n0(value)} ${unit}`),
      goal ? h("div", { class: "track" }, h("div", { class: `fill${value > goal * 1.05 && unit === "kcal" ? " over" : ""}`, style: `width:${ratio * 100}%` })) : null,
    );
  };
  const totalsPanel = h(
    "div",
    { class: "panel" },
    h("div", { class: "section-title" }, h("h2", {}, "Heute gegessen"), totals.pending ? h("span", { class: "small muted" }, `${totals.pending} in Auswertung`) : null),
    meter("Kalorien", totals.kcal, target?.value, "kcal"),
    meter("Eiweiß", totals.protein_g, s.protein_target_g, "g"),
    h(
      "p",
      { class: "small muted" },
      target
        ? target.basis === "whoop"
          ? `Richtwert geschätzt: Verbrauch laut Whoop im Schnitt ${fmt.n0(target.burned)} kcal${target.deficit ? `, minus ${fmt.n0(target.deficit)} kcal Defizit` : ", noch ohne Defizit"}. Kalorien aus Fotos sind Schätzungen, maßgeblich ist der Gewichtstrend.`
          : "Richtwert aus deinen Einstellungen. Kalorien aus Fotos sind Schätzungen, maßgeblich ist der Gewichtstrend."
        : "Ein Kalorien-Richtwert erscheint, sobald Whoop verbunden ist oder du einen Wert festlegst.",
    ),
  );

  // ------------------------------------------------------------ Check-in
  const saveCheckin = async (patch) => {
    const session = await api.session();
    Object.assign(checkin, patch);
    try {
      await api.upsert("checkins", { user_id: session.user.id, day: today, ...patch, updated_at: new Date().toISOString() }, "user_id,day");
    } catch (err) {
      toast(`Speichern fehlgeschlagen: ${err.message}`);
    }
  };
  const scale = (label, key, none) =>
    h(
      "div",
      { class: "check-row" },
      h("span", {}, label),
      segmented(
        [
          [0, none],
          [1, "leicht"],
          [2, "mittel"],
          [3, "stark"],
        ],
        checkin[key] ?? null,
        (v) => saveCheckin({ [key]: v }),
        "scale",
      ),
    );
  const checkPanel = h(
    "div",
    { class: "panel" },
    h("div", { class: "section-title" }, h("h2", {}, "Wie war der Tag?"), h("span", { class: "small muted" }, "einmal täglich, am besten abends")),
    scale("Heißhunger abends auf Süßes", "craving", "keiner"),
    scale("Juckende Hautstellen im Gesicht", "itch", "keine"),
    scale("Trockene Haut", "dry_skin", "nein"),
  );

  // --------------------------------------------------------- Supplements
  const skipped = new Set(supLogs.filter((l) => l.status === "ausgelassen").map((l) => l.supplement_id));
  const supPanel = h(
    "div",
    { class: "panel" },
    h("div", { class: "section-title" }, h("h2", {}, "Supplements"), h("a", { href: "#/supplements", class: "small" }, "Liste öffnen")),
    supplements.length
      ? [
          h("p", { class: "muted small" }, "Deine Routine gilt als genommen. Tippe an, was du heute ausgelassen hast."),
          h(
            "div",
            { class: "row" },
            supplements.map((sup) => {
              const btn = h("button", { class: "btn", type: "button", "aria-pressed": String(skipped.has(sup.id)) }, skipped.has(sup.id) ? `${sup.name}: ausgelassen` : sup.name || "Präparat");
              btn.addEventListener("click", async () => {
                const session = await api.session();
                try {
                  if (skipped.has(sup.id)) {
                    const log = supLogs.find((l) => l.supplement_id === sup.id);
                    if (log) await api.remove("supplement_logs", log.id);
                  } else {
                    await api.upsert("supplement_logs", { user_id: session.user.id, supplement_id: sup.id, day: today, status: "ausgelassen" }, "supplement_id,day");
                  }
                  rerender();
                } catch (err) {
                  toast(`Speichern fehlgeschlagen: ${err.message}`);
                }
              });
              return btn;
            }),
          ),
        ]
      : h("p", { class: "empty" }, "Noch keine Präparate hinterlegt. Fotografiere jede Packung einmal und sag dazu, wie viel du nimmst."),
  );

  // --------------------------------------------------------------- Kopf
  const targetToday = targetWeight(s, today);
  const weightLine = lastWeight
    ? `${fmt.kg(lastWeight.kg)}${s.plan_start ? `, Kurs heute ${fmt.kg(targetToday)}` : ""}`
    : `Start ${fmt.kg(Number(s.start_weight_kg))}`;

  mount(root,
    h(
      "header",
      { class: "page-head" },
      h("div", {}, h("h1", {}, fmt.dayLong(new Date())), h("div", { class: "sub num" }, weightLine)),
      ctx.demo ? h("span", { class: "pill plain" }, "Vorschau mit Beispieldaten") : null,
    ),
    !s.plan_start
      ? h(
          "div",
          { class: "note" },
          h("span", {}, "Das Defizit ist noch nicht gestartet. Bis du wieder gesund bist, wird nur geloggt."),
          h(
            "div",
            {},
            h(
              "button",
              {
                class: "btn",
                type: "button",
                onclick: async () => {
                  await ctx.saveSettings({ plan_start: today });
                  toast("Der Plan läuft ab heute");
                },
              },
              "Plan heute starten",
            ),
          ),
        )
      : null,
    h(
      "div",
      { class: "cols" },
      h(
        "div",
        { class: "stack" },
        h("section", { class: "band-wrap", "aria-label": "Essensfenster" }, statusEl, bandHost),
        timerHost,
        capture,
        h(
          "div",
          { class: "quick" },
          h("button", { class: "btn", type: "button", onclick: () => eventSheet(null, "juckreiz", rerender) }, icon("itch"), "Juckreiz jetzt"),
          h("button", { class: "btn", type: "button", onclick: startCraving }, icon("sweet"), "Lust auf Süßes"),
          h("button", { class: "btn", type: "button", onclick: weightSheet }, icon("scale"), "Gewicht"),
        ),
        h("button", { class: "btn quiet", type: "button", onclick: () => newMealSheet({ file: null, dishes: doneDishes, onSaved: onMealSaved }) }, "Ohne Kamera eintragen (Galerie oder Text)"),
        h("section", { class: "panel" }, h("h2", {}, "Einträge heute"), list),
      ),
      h("div", { class: "stack" }, totalsPanel, checkPanel, supPanel),
    ),
  );
}
