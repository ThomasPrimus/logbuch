// Mehr: Supplements, Gerichte vom Koch, Laborwerte, Plan, Verbindungen.

import { photoButton } from "../components.js";
import { api, photoUrl } from "../data.js";
import { dayKey, dayStart, field, fmt, h, icon, openSheet, toast, mount } from "../lib.js";
import { goalDay } from "../plan.js";

const head = (title, ctx, back = true) =>
  h(
    "header",
    { class: "page-head" },
    h("div", {}, back ? h("a", { href: "#/mehr", class: "small" }, "Zurück zu Mehr") : null, h("h1", {}, title)),
    ctx.demo ? h("span", { class: "pill plain" }, "Vorschau mit Beispieldaten") : null,
  );

function confirmDelete(label, run) {
  let armed = false;
  const btn = h("button", { class: "btn quiet danger", type: "button" }, label);
  btn.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      btn.textContent = "Wirklich löschen?";
      return;
    }
    await run();
  });
  return btn;
}

const pendingNote = (row) =>
  row.status === "pending" ? h("span", { class: "pill plain" }, "wird ausgewertet …") : row.status === "error" ? h("span", { class: "pill h-mittel" }, "nicht ausgewertet") : null;

function passwordSheet() {
  openSheet("Passwort festlegen", (close) => {
    const st = { a: "", b: "" };
    const save = h("button", { class: "btn primary big", type: "button" }, "Passwort speichern");
    save.addEventListener("click", async () => {
      if (st.a.length < 10) return toast("Bitte mindestens zehn Zeichen wählen.");
      if (st.a !== st.b) return toast("Die beiden Eingaben stimmen nicht überein.");
      save.disabled = true;
      try {
        await api.setPassword(st.a);
        close();
        toast("Passwort gespeichert");
      } catch (err) {
        save.disabled = false;
        toast(`Speichern fehlgeschlagen: ${err.message}`);
      }
    });
    return [
      h("p", { class: "muted" }, "Mit einem Passwort kannst du dich auf jedem Gerät mit E-Mail und Passwort anmelden."),
      field("Neues Passwort", h("input", { id: "pw-a", type: "password", autocomplete: "new-password", oninput: (e) => (st.a = e.target.value) }), "mindestens zehn Zeichen"),
      field("Wiederholen", h("input", { id: "pw-b", type: "password", autocomplete: "new-password", oninput: (e) => (st.b = e.target.value) })),
      save,
    ];
  });
}

// --------------------------------------------------------------------- Mehr
export async function renderMore(root, ctx) {
  const link = (href, title, hint) => h("li", {}, h("a", { href }, h("span", {}, title, h("div", { class: "hint" }, hint)), icon("chevron")));
  mount(root,
    head("Mehr", ctx, false),
    h(
      "div",
      { class: "panel" },
      h(
        "ul",
        { class: "links" },
        link("#/supplements", "Supplements", "Packung einmal fotografieren, Menge dazusagen"),
        link("#/gerichte", "Gerichte vom Koch", "Zutaten und Mengen für genaue Werte"),
        link("#/labor", "Laborwerte", "Befunde als PDF oder Foto ablegen"),
        link("#/plan", "Plan und Essensfenster", "Ziel, Tempo, Fenster, Richtwerte"),
        link("#/verbindungen", "Verbindungen", "Whoop und Foto-Auswertung"),
        ctx.demo ? null : h("li", {}, h("button", { type: "button", onclick: passwordSheet }, h("span", {}, "Passwort festlegen", h("div", { class: "hint" }, "für die Anmeldung ohne Google")), icon("chevron"))),
        ctx.demo
          ? null
          : h(
              "li",
              {},
              h(
                "button",
                {
                  type: "button",
                  onclick: async () => {
                    await api.signOut();
                    location.reload();
                  },
                },
                h("span", {}, "Abmelden", h("div", { class: "hint" }, ctx.email || "")),
              ),
            ),
      ),
    ),
  );
}

// -------------------------------------------------------------- Supplements
export async function renderSupplements(root, ctx) {
  const list = await api.select("supplements", { order: "created_at" });
  const rerender = () => ctx.refresh();

  const add = (file) =>
    openSheet("Präparat hinzufügen", (close) => {
      const state = { dose: "" };
      const save = h("button", { class: "btn primary big", type: "button" }, "Präparat speichern");
      save.addEventListener("click", async () => {
        save.disabled = true;
        save.textContent = "Wird gespeichert …";
        try {
          const photo_path = await api.upload(file, "supplements");
          const row = await api.insert("supplements", { photo_path, dose_text: state.dose.trim() || null, status: "pending" });
          close();
          toast("Präparat gespeichert");
          rerender();
          api
            .hub("analyze-supplement", { id: row.id })
            .catch((err) => toast(err.message))
            .finally(rerender);
        } catch (err) {
          save.disabled = false;
          save.textContent = "Präparat speichern";
          toast(`Speichern fehlgeschlagen: ${err.message}`);
        }
      });
      return [
        h("img", { class: "preview", src: URL.createObjectURL(file), alt: "Foto der Packung" }),
        field("Wie viel nimmst du wann?", h("input", { id: "sup-dose", type: "text", placeholder: "zum Beispiel 2 Kapseln morgens", oninput: (e) => (state.dose = e.target.value) })),
        h("p", { class: "small muted" }, "Am besten die Seite mit den Inhaltsstoffen fotografieren. Den Rest liest die App vom Etikett."),
        save,
      ];
    });

  const detail = (sup) =>
    openSheet(sup.name || "Präparat", (close) => {
      const draft = { name: sup.name || "", dose_text: sup.dose_text || "" };
      const photo = h("div", {});
      if (sup.photo_path) photoUrl(sup.photo_path).then((url) => url && photo.replaceChildren(h("img", { class: "preview", src: url, alt: "Foto der Packung" })));
      const save = h("button", { class: "btn primary", type: "button" }, "Änderungen speichern");
      save.addEventListener("click", async () => {
        await api.update("supplements", sup.id, { name: draft.name.trim() || null, dose_text: draft.dose_text.trim() || null });
        close();
        toast("Änderungen gespeichert");
        rerender();
      });
      const toggle = h("button", { class: "btn", type: "button" }, sup.active ? "Als abgesetzt markieren" : "Wieder aufnehmen");
      toggle.addEventListener("click", async () => {
        await api.update("supplements", sup.id, sup.active ? { active: false, ended_on: dayKey() } : { active: true, ended_on: null });
        close();
        toast(sup.active ? "Als abgesetzt markiert" : "Wieder aufgenommen");
        rerender();
      });
      return [
        photo,
        sup.error ? h("div", { class: "note warn" }, sup.error) : null,
        (sup.ingredients || []).length
          ? h(
              "div",
              { class: "table-wrap" },
              h(
                "table",
                {},
                h("thead", {}, h("tr", {}, h("th", {}, `Pro ${sup.unit || "Einheit"}`), h("th", { class: "r" }, "Menge"))),
                h(
                  "tbody",
                  {},
                  sup.ingredients.map((i) => h("tr", {}, h("td", {}, i.name), h("td", { class: "r" }, `${fmt.n1(i.amount).replace(",0", "")} ${i.unit}`))),
                ),
              ),
            )
          : null,
        (sup.additives || []).length ? h("p", { class: "small muted" }, `Zusatzstoffe: ${sup.additives.join(", ")}`) : null,
        sup.histamine_note ? h("div", { class: "note" }, sup.histamine_note) : null,
        field("Name", h("input", { id: "sd-name", type: "text", value: draft.name, oninput: (e) => (draft.name = e.target.value) })),
        field("Einnahme", h("input", { id: "sd-dose", type: "text", value: draft.dose_text, oninput: (e) => (draft.dose_text = e.target.value) })),
        h("div", { class: "row" }, save, toggle),
        confirmDelete("Präparat löschen", async () => {
          await api.remove("supplements", sup.id);
          if (sup.photo_path) api.removePhoto(sup.photo_path);
          close();
          toast("Präparat gelöscht");
          rerender();
        }),
      ];
    });

  mount(root,
    head("Supplements", ctx),
    photoButton("Packung fotografieren", add),
    h(
      "div",
      { class: "panel" },
      list.length
        ? h(
            "ul",
            { class: "entries" },
            list.map((sup) =>
              h(
                "li",
                {},
                h(
                  "button",
                  { class: "entry", type: "button", onclick: () => detail(sup) },
                  h("div", { class: "thumb" }, sup.active === false ? "aus" : "tägl."),
                  h(
                    "div",
                    {},
                    h("div", { class: "title" }, sup.name || "Neues Präparat"),
                    h("div", { class: "meta" }, [sup.dose_text, sup.brand].filter(Boolean).join(", ") || "Einnahme noch nicht angegeben"),
                  ),
                  pendingNote(sup) || (sup.histamine_note ? h("span", { class: "pill h-mittel" }, "Hinweis") : h("span", {})),
                ),
              ),
            ),
          )
        : h("p", { class: "empty" }, "Noch keine Präparate. Fotografiere jede Packung einmal. Danach gilt deine Routine als Standard, und du meldest nur noch Abweichungen."),
    ),
  );
}

// ------------------------------------------------------------------ Gerichte
export async function renderDishes(root, ctx) {
  const list = await api.select("dishes", { order: "cooked_on", limit: 40 });
  const rerender = () => ctx.refresh();

  const add = () =>
    openSheet("Gericht vom Koch", (close) => {
      const state = { name: "", text: "", portions: "", day: dayKey(), file: null };
      const save = h("button", { class: "btn primary big", type: "button" }, "Gericht speichern");
      save.addEventListener("click", async () => {
        if (!state.text.trim() && !state.file) {
          toast("Bitte die Angaben des Kochs eintippen oder als Foto anhängen.");
          return;
        }
        save.disabled = true;
        save.textContent = "Wird gespeichert …";
        try {
          const photo_path = state.file ? await api.upload(state.file, "dishes") : null;
          const row = await api.insert("dishes", {
            name: state.name.trim() || null,
            source_text: state.text.trim() || null,
            photo_path,
            portions: state.portions ? Number(String(state.portions).replace(",", ".")) : null,
            cooked_on: state.day,
            status: "pending",
          });
          close();
          toast("Gericht gespeichert");
          rerender();
          api
            .hub("analyze-dish", { id: row.id })
            .catch((err) => toast(err.message))
            .finally(rerender);
        } catch (err) {
          save.disabled = false;
          save.textContent = "Gericht speichern";
          toast(`Speichern fehlgeschlagen: ${err.message}`);
        }
      });
      return [
        field("Name", h("input", { id: "dish-name", type: "text", placeholder: "zum Beispiel Hähnchen mit Ofengemüse", oninput: (e) => (state.name = e.target.value) }), "optional"),
        field(
          "Angaben des Kochs",
          h("textarea", { id: "dish-text", placeholder: "Zutaten mit Mengen, so wie er sie schickt:\n600 g Hähnchenbrust, 400 g Kartoffeln, 2 EL Olivenöl …", oninput: (e) => (state.text = e.target.value) }),
        ),
        field("Oder Foto vom Zettel", h("input", { id: "dish-file", type: "file", accept: "image/*", onchange: (e) => (state.file = e.target.files[0] || null) }), "optional"),
        h(
          "div",
          { class: "fields-2" },
          field("Portionen", h("input", { id: "dish-portions", type: "number", inputmode: "decimal", min: "1", step: "0.5", placeholder: "4", oninput: (e) => (state.portions = e.target.value) })),
          field("Gekocht am", h("input", { id: "dish-day", type: "date", value: state.day, oninput: (e) => (state.day = e.target.value) })),
        ),
        save,
      ];
    });

  const detail = (d) =>
    openSheet(d.name || "Gericht", (close) => [
      d.error ? h("div", { class: "note warn" }, d.error) : null,
      d.status === "done"
        ? h("p", {}, `Pro Portion ${fmt.n0(d.kcal_per_portion)} kcal, ${fmt.n0(d.protein_g_per_portion)} g Eiweiß, ${fmt.n0(d.carbs_g_per_portion)} g Kohlenhydrate, ${fmt.n0(d.fat_g_per_portion)} g Fett. Ergibt ${fmt.n1(Number(d.portions)).replace(",0", "")} Portionen.`)
        : null,
      (d.ingredients || []).length
        ? h(
            "div",
            { class: "table-wrap" },
            h(
              "table",
              {},
              h("thead", {}, h("tr", {}, h("th", {}, "Zutat"), h("th", { class: "r" }, "Menge"), h("th", { class: "r" }, "kcal"), h("th", {}, "Histamin"))),
              h(
                "tbody",
                {},
                d.ingredients.map((i) => h("tr", {}, h("td", {}, i.name), h("td", { class: "r" }, `${fmt.n0(i.grams)} g`), h("td", { class: "r" }, fmt.n0(i.kcal)), h("td", {}, i.histamine || ""))),
              ),
            ),
          )
        : null,
      d.ai?.input?.comment ? h("p", { class: "small muted" }, d.ai.input.comment) : null,
      d.source_text ? h("p", { class: "small muted" }, `Angaben des Kochs: ${d.source_text}`) : null,
      d.status !== "done"
        ? h(
            "button",
            {
              class: "btn",
              type: "button",
              onclick: async (e) => {
                e.target.disabled = true;
                try {
                  await api.hub("analyze-dish", { id: d.id });
                  toast("Ausgewertet");
                } catch (err) {
                  toast(err.message);
                }
                close();
                rerender();
              },
            },
            "Jetzt auswerten",
          )
        : null,
      confirmDelete("Gericht löschen", async () => {
        await api.remove("dishes", d.id);
        close();
        toast("Gericht gelöscht");
        rerender();
      }),
    ]);

  mount(root,
    head("Gerichte vom Koch", ctx),
    h("button", { class: "btn primary big", type: "button", onclick: add }, "Gericht hinzufügen"),
    h(
      "div",
      { class: "panel" },
      list.length
        ? h(
            "ul",
            { class: "entries" },
            list.map((d) =>
              h(
                "li",
                {},
                h(
                  "button",
                  { class: "entry", type: "button", onclick: () => detail(d) },
                  h("div", { class: "thumb" }, "Koch"),
                  h(
                    "div",
                    {},
                    h("div", { class: "title" }, d.name || "Neues Gericht"),
                    h("div", { class: "meta num" }, fmt.dayShort(dayStart(d.cooked_on)), d.status === "done" ? `, ${fmt.n0(d.kcal_per_portion)} kcal und ${fmt.n0(d.protein_g_per_portion)} g Eiweiß pro Portion` : ""),
                  ),
                  pendingNote(d) || (d.histamine ? h("span", { class: `pill h-${d.histamine}` }, d.histamine) : h("span", {})),
                ),
              ),
            ),
          )
        : h("p", { class: "empty" }, "Noch keine Gerichte. Wenn der Koch Zutaten und Mengen durchgibt, trägst du sie hier ein. Beim Foto deines Tellers wählst du dann das Gericht aus."),
    ),
  );
}

// ---------------------------------------------------------------- Laborwerte
export async function renderLabs(root, ctx) {
  const list = await api.select("labs", { order: "created_at" });
  const rerender = () => ctx.refresh();

  const upload = async (file) => {
    toast("Befund wird hochgeladen …");
    try {
      const file_path = await api.upload(file, "labs");
      const row = await api.insert("labs", { file_path, status: "pending" });
      rerender();
      api
        .hub("analyze-lab", { id: row.id })
        .catch((err) => toast(err.message))
        .finally(rerender);
    } catch (err) {
      toast(`Hochladen fehlgeschlagen: ${err.message}`);
    }
  };

  const flagPill = (flag) => (flag === "normal" ? h("span", { class: "pill h-niedrig" }, "im Bereich") : flag === "unklar" ? h("span", { class: "pill plain" }, "unklar") : h("span", { class: "pill h-hoch" }, flag === "hoch" ? "erhöht" : "erniedrigt"));

  mount(root,
    head("Laborwerte", ctx),
    photoButton("Befund hochladen (PDF oder Foto)", upload, { capture: false, accept: "image/*,application/pdf" }),
    list.length
      ? list.map((lab) =>
          h(
            "section",
            { class: "panel" },
            h("div", { class: "day-head" }, h("h2", {}, lab.taken_on ? `Befund vom ${fmt.date(dayStart(lab.taken_on))}` : "Befund"), pendingNote(lab) || h("span", { class: "small muted" }, lab.lab_name || "")),
            lab.error ? h("div", { class: "note warn" }, lab.error) : null,
            lab.summary ? h("p", {}, lab.summary) : null,
            (lab.markers || []).length
              ? h(
                  "div",
                  { class: "table-wrap" },
                  h(
                    "table",
                    {},
                    h("thead", {}, h("tr", {}, h("th", {}, "Wert"), h("th", { class: "r" }, "Ergebnis"), h("th", { class: "r" }, "Referenz"), h("th", {}, ""))),
                    h(
                      "tbody",
                      {},
                      lab.markers.map((m) =>
                        h(
                          "tr",
                          {},
                          h("td", {}, m.name),
                          h("td", { class: "r" }, `${m.value} ${m.unit || ""}`),
                          h("td", { class: "r" }, m.ref_low != null || m.ref_high != null ? `${m.ref_low ?? ""} bis ${m.ref_high ?? ""}` : "–"),
                          h("td", {}, flagPill(m.flag)),
                        ),
                      ),
                    ),
                  ),
                )
              : null,
            h(
              "div",
              { class: "row" },
              lab.status !== "done"
                ? h(
                    "button",
                    {
                      class: "btn",
                      type: "button",
                      onclick: async (e) => {
                        e.target.disabled = true;
                        try {
                          await api.hub("analyze-lab", { id: lab.id });
                        } catch (err) {
                          toast(err.message);
                        }
                        rerender();
                      },
                    },
                    "Jetzt auswerten",
                  )
                : null,
              confirmDelete("Befund löschen", async () => {
                await api.remove("labs", lab.id);
                api.removePhoto(lab.file_path);
                toast("Befund gelöscht");
                rerender();
              }),
            ),
          ),
        )
      : h("div", { class: "panel" }, h("p", { class: "empty" }, "Noch kein Befund. Lade das PDF vom Labor hoch oder Screenshots der Werte aus Whoop. Die App liest die Werte aus, eine Diagnose stellt sie nicht.")),
  );
}

// ---------------------------------------------------------------------- Plan
export async function renderPlan(root, ctx) {
  const s = { ...ctx.settings };
  const input = (key, attrs = {}) => h("input", { id: `plan-${key}`, ...attrs, value: s[key] == null ? "" : String(s[key]).slice(0, attrs.type === "time" ? 5 : 20), oninput: (e) => (s[key] = e.target.value) });
  const goal = goalDay(ctx.settings);
  const numOrNull = (v) => (v === "" || v == null ? null : Number(String(v).replace(",", ".")));
  const save = h("button", { class: "btn primary big", type: "button" }, "Plan speichern");
  save.addEventListener("click", async () => {
    const patch = {
      start_weight_kg: numOrNull(s.start_weight_kg),
      goal_weight_kg: numOrNull(s.goal_weight_kg),
      rate_kg_per_week: numOrNull(s.rate_kg_per_week),
      plan_start: s.plan_start || null,
      pause_from: s.pause_from || null,
      pause_weeks: Math.round(numOrNull(s.pause_weeks) ?? 0),
      window_start: s.window_start,
      window_end: s.window_end,
      protein_target_g: Math.round(numOrNull(s.protein_target_g) ?? 150),
      kcal_target: numOrNull(s.kcal_target) ? Math.round(numOrNull(s.kcal_target)) : null,
    };
    if (!(patch.start_weight_kg > 0 && patch.goal_weight_kg > 0 && patch.rate_kg_per_week > 0 && patch.rate_kg_per_week <= 1)) {
      toast("Bitte Gewichte und ein Tempo bis höchstens 1 kg pro Woche angeben.");
      return;
    }
    if (!(patch.window_start < patch.window_end)) {
      toast("Das Essensfenster muss vor seinem Ende beginnen.");
      return;
    }
    save.disabled = true;
    try {
      await ctx.saveSettings(patch);
      toast("Plan gespeichert");
    } catch (err) {
      save.disabled = false;
      toast(`Speichern fehlgeschlagen: ${err.message}`);
    }
  });

  mount(root,
    head("Plan und Essensfenster", ctx),
    h(
      "div",
      { class: "cols" },
      h(
        "div",
        { class: "panel" },
        h("h2", {}, "Gewicht"),
        goal ? h("p", { class: "muted" }, `Nach diesem Plan bist du am ${fmt.date(dayStart(goal))} am Ziel.`) : h("p", { class: "muted" }, "Der Plan läuft, sobald ein Startdatum eingetragen ist."),
        h("div", { class: "fields-2" }, field("Startgewicht in kg", input("start_weight_kg", { type: "number", step: "0.1", inputmode: "decimal" })), field("Zielgewicht in kg", input("goal_weight_kg", { type: "number", step: "0.1", inputmode: "decimal" }))),
        h("div", { class: "fields-2" }, field("Tempo in kg pro Woche", input("rate_kg_per_week", { type: "number", step: "0.05", inputmode: "decimal" })), field("Start des Defizits", input("plan_start", { type: "date" }), "leer: noch nicht gestartet")),
        h("div", { class: "fields-2" }, field("Halten ab", input("pause_from", { type: "date" }), "leer: ohne Pause"), field("Halten für Wochen", input("pause_weeks", { type: "number", min: "0", inputmode: "numeric" }))),
      ),
      h(
        "div",
        { class: "panel" },
        h("h2", {}, "Essen"),
        h("div", { class: "fields-2" }, field("Fenster öffnet", input("window_start", { type: "time" })), field("Fenster schließt", input("window_end", { type: "time" }))),
        h(
          "div",
          { class: "fields-2" },
          field("Eiweiß pro Tag in g", input("protein_target_g", { type: "number", inputmode: "numeric" })),
          field("Kalorien pro Tag", input("kcal_target", { type: "number", inputmode: "numeric", placeholder: "aus Whoop" }), "leer: aus Whoop geschätzt"),
        ),
      ),
    ),
    save,
  );
}

// -------------------------------------------------------------- Verbindungen
export async function renderConnections(root, ctx, query) {
  const rerender = () => ctx.refresh();
  if (query.get("whoop")) {
    const result = query.get("whoop");
    history.replaceState(null, "", "#/verbindungen");
    toast(result === "ok" ? "Whoop ist verbunden" : result === "abgelehnt" ? "Die Whoop-Anmeldung wurde abgebrochen" : "Die Whoop-Anmeldung ist fehlgeschlagen");
  }
  let status;
  try {
    status = await api.hub("status");
  } catch (err) {
    mount(root, head("Verbindungen", ctx), h("div", { class: "note bad" }, `Der Server ist nicht erreichbar: ${err.message}`));
    return;
  }
  const sync = status.sync;
  const saveSecret = async (pairs, okMessage) => {
    try {
      for (const [key, value] of pairs) await api.hub("secret-set", { key, value });
      toast(okMessage);
      rerender();
    } catch (err) {
      toast(`Speichern fehlgeschlagen: ${err.message}`);
    }
  };
  const copyLine = (text) =>
    h(
      "div",
      { class: "copy-line" },
      h("code", {}, text),
      h(
        "button",
        {
          class: "btn",
          type: "button",
          onclick: async () => {
            try {
              await navigator.clipboard.writeText(text);
              toast("Kopiert");
            } catch {
              toast("Bitte von Hand markieren und kopieren.");
            }
          },
        },
        "Kopieren",
      ),
    );

  // ------------------------------------------------------------------ Whoop
  let whoop;
  if (sync?.connected) {
    const counts = Object.entries(sync.backfill || {})
      .map(([k, v]) => `${{ cycle: "Tage", recovery: "Erholung", sleep: "Schlaf", workout: "Workouts" }[k] || k}: ${fmt.n0(v.count || 0)}`)
      .join(", ");
    const progress = h("p", { class: "muted small" }, sync.backfill_done ? `Die gesamte Historie ist geladen (${counts}).` : `Die Historie wird noch geladen (${counts || "Start"}).`);
    const run = h("button", { class: "btn primary", type: "button" }, sync.backfill_done ? "Jetzt abgleichen" : "Historie weiterladen");
    run.addEventListener("click", async () => {
      run.disabled = true;
      try {
        for (let i = 0; i < 12; i++) {
          run.textContent = "Abgleich läuft …";
          const r = await api.hub("whoop-sync");
          const c = Object.values(r.backfill || {}).reduce((sum, v) => sum + (v.count || 0), 0);
          progress.textContent = r.backfill_done ? "Die gesamte Historie ist geladen." : `Die Historie wird geladen, bisher ${fmt.n0(c)} Einträge.`;
          if (r.backfill_done || r.rate_limited) break;
        }
        toast("Abgleich fertig");
      } catch (err) {
        toast(err.message);
      }
      rerender();
    });
    whoop = [
      h("p", {}, sync.last_sync_at ? `Verbunden. Letzter Abgleich ${fmt.dayShort(sync.last_sync_at)} um ${fmt.time(sync.last_sync_at)} Uhr.` : "Verbunden. Der erste Abgleich steht noch aus."),
      sync.last_error ? h("div", { class: "note warn" }, sync.last_error) : null,
      progress,
      h(
        "div",
        { class: "row" },
        run,
        confirmDeleteLabel("Verbindung trennen", "Wirklich trennen?", async () => {
          await api.hub("whoop-disconnect");
          toast("Whoop ist getrennt");
          rerender();
        }),
      ),
    ];
  } else if (status.whoop_keys) {
    const go = h("button", { class: "btn primary big", type: "button" }, "Mit Whoop verbinden");
    go.addEventListener("click", async () => {
      go.disabled = true;
      try {
        const r = await api.hub("whoop-start", { redirect_to: location.origin + location.pathname });
        location.href = r.url;
      } catch (err) {
        go.disabled = false;
        toast(err.message);
      }
    });
    whoop = [
      h("p", {}, "Die Zugangsdaten sind hinterlegt. Als Nächstes meldest du dich einmal bei Whoop an und erlaubst den Zugriff."),
      go,
      h("button", { class: "btn quiet", type: "button", onclick: () => saveSecret([["WHOOP_CLIENT_ID", ""], ["WHOOP_CLIENT_SECRET", ""]], "Zugangsdaten entfernt") }, "Zugangsdaten neu eingeben"),
    ];
  } else {
    const st = { id: "", secret: "" };
    whoop = [
      h("p", {}, "Whoop gibt Daten nur an eine eigene, bei Whoop angemeldete App heraus. Das Anlegen dauert ein paar Minuten und ist einmalig."),
      h(
        "ol",
        { class: "stack small", style: "padding-left:1.2rem;margin:0" },
        h("li", {}, "Öffne ", h("a", { href: "https://developer.whoop.com", target: "_blank", rel: "noopener" }, "developer.whoop.com"), ", melde dich mit deinem Whoop-Konto an und lege im Developer Dashboard eine App an."),
        h("li", {}, "Trage dort als Redirect URI genau diese Adresse ein:", copyLine(status.whoop_redirect_uri)),
        h("li", {}, "Wähle alle Lese-Berechtigungen (read:…) und zusätzlich „offline“."),
        h("li", {}, "Kopiere Client ID und Client Secret in die beiden Felder."),
      ),
      field("Client ID", h("input", { id: "whoop-id", type: "text", autocomplete: "off", oninput: (e) => (st.id = e.target.value) })),
      field("Client Secret", h("input", { id: "whoop-secret", type: "password", autocomplete: "off", oninput: (e) => (st.secret = e.target.value) })),
      h(
        "button",
        {
          class: "btn primary",
          type: "button",
          onclick: () => {
            if (!st.id.trim() || !st.secret.trim()) return toast("Bitte beide Werte eintragen.");
            saveSecret([["WHOOP_CLIENT_ID", st.id], ["WHOOP_CLIENT_SECRET", st.secret]], "Zugangsdaten gespeichert");
          },
        },
        "Zugangsdaten speichern",
      ),
    ];
  }

  // -------------------------------------------------------- Foto-Auswertung
  const keyState = { value: "" };
  const keyForm = [
    field("Schlüssel", h("input", { id: "ai-key", type: "password", autocomplete: "off", placeholder: "sk-ant-…", oninput: (e) => (keyState.value = e.target.value) })),
    h(
      "button",
      {
        class: "btn primary",
        type: "button",
        onclick: () => {
          if (!keyState.value.trim()) return toast("Bitte den Schlüssel einfügen.");
          saveSecret([["ANTHROPIC_API_KEY", keyState.value]], "Schlüssel gespeichert");
        },
      },
      "Schlüssel speichern",
    ),
  ];
  const analysis = status.analysis_key
    ? [
        h("p", {}, `Eingerichtet. Fotos werden mit dem Modell ${status.model} ausgewertet.`),
        h("details", {}, h("summary", { class: "small" }, "Schlüssel ersetzen"), h("div", { class: "stack", style: "margin-top:12px" }, keyForm)),
      ]
    : [
        h(
          "p",
          {},
          "Die Auswertung von Essens-, Etiketten- und Befundfotos läuft über die Anthropic-Schnittstelle. Dafür brauchst du einen eigenen Schlüssel aus der ",
          h("a", { href: "https://console.anthropic.com", target: "_blank", rel: "noopener" }, "Claude Console"),
          ". Die Kosten liegen geschätzt bei 1 bis 2 Cent pro Foto.",
        ),
        h("p", { class: "small muted" }, "Der Schlüssel wird nur auf dem Server gespeichert und hier nie wieder angezeigt. Ohne Schlüssel kannst du schon loggen, die Einträge werden dann später ausgewertet."),
        keyForm,
      ];

  mount(root,
    head("Verbindungen", ctx),
    h("div", { class: "cols" }, h("section", { class: "panel" }, h("h2", {}, "Whoop"), whoop), h("section", { class: "panel" }, h("h2", {}, "Foto-Auswertung"), analysis)),
  );
}

function confirmDeleteLabel(label, askLabel, run) {
  let armed = false;
  const btn = h("button", { class: "btn quiet danger", type: "button" }, label);
  btn.addEventListener("click", async () => {
    if (!armed) {
      armed = true;
      btn.textContent = askLabel;
      return;
    }
    await run();
  });
  return btn;
}
