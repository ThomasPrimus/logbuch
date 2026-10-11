// Bausteine, die mehrere Ansichten teilen: Tagesband, Eintragszeilen, Blätter.

import { api, photoUrl } from "./data.js";
import { FLAG_LABEL, HISTAMINE_LABEL, field, fmt, h, icon, localInputValue, openSheet, segmented, toast } from "./lib.js";

// ------------------------------------------------------------- Tagesband
export function dayBand(win, meals, events, showNow) {
  const pct = (min) => `${(Math.max(0, Math.min(1440, min)) / 1440) * 100}%`;
  const minutesOf = (iso) => {
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  };
  const band = h(
    "div",
    { class: "band", role: "img", "aria-label": `Tagesverlauf, Essensfenster ${fmt.duration(win.endMin - win.startMin)} lang` },
    h("div", { class: "window", style: `left:${pct(win.startMin)};width:${pct(win.endMin - win.startMin)}` }),
    [6, 12, 18].map((hh) => h("div", { class: "tick", style: `left:${pct(hh * 60)}` })),
    meals.map((m) => h("div", { class: `mark h-${m.histamine || "offen"}`, style: `left:${pct(minutesOf(m.eaten_at))}`, title: `${fmt.time(m.eaten_at)} ${m.title || "Essen"}` })),
    events.map((e) => h("div", { class: "mark ev", style: `left:${pct(minutesOf(e.occurred_at))}`, title: `${fmt.time(e.occurred_at)} ${e.type === "juckreiz" ? "Juckreiz" : "Lust auf Süßes"}` })),
    showNow ? h("div", { class: "now", style: `left:${pct(win.nowMin)}` }) : null,
  );
  const hours = h("div", { class: "band-hours", "aria-hidden": "true" }, [0, 6, 12, 18, 24].map((hh) => h("span", { style: `left:${pct(hh * 60)}` }, `${hh}`)));
  return h("div", {}, band, hours);
}

// ---------------------------------------------------------------- Zeilen
export function mealMeta(m) {
  if (m.status === "pending") return "wird ausgewertet …";
  if (m.status === "error" && m.kcal == null) return "noch nicht ausgewertet";
  const parts = [];
  if (m.kcal != null) parts.push(`${fmt.n0(m.kcal)} kcal`);
  if (m.protein_g != null) parts.push(`${fmt.n0(m.protein_g)} g Eiweiß`);
  return parts.join(", ");
}

export function mealRow(m, onOpen) {
  const thumb = h("div", { class: "thumb" }, m.kind === "getraenk" ? "Glas" : m.source === "koch" ? "Koch" : "Essen");
  if (m.photo_path) {
    photoUrl(m.photo_path)
      .then((url) => url && thumb.replaceWith(h("img", { class: "thumb", src: url, alt: "", loading: "lazy" })))
      .catch(() => {});
  }
  return h(
    "li",
    {},
    h(
      "button",
      { class: "entry", type: "button", onclick: () => onOpen(m) },
      thumb,
      h(
        "div",
        {},
        h("div", { class: "title" }, m.title || (m.status === "pending" ? "Neuer Eintrag" : "Ohne Titel")),
        h("div", { class: "meta num" }, `${fmt.time(m.eaten_at)} Uhr`, mealMeta(m) ? `, ${mealMeta(m)}` : ""),
      ),
      m.histamine ? h("span", { class: `pill h-${m.histamine}` }, m.histamine) : h("span", {}),
    ),
  );
}

export function eventRow(e, onOpen) {
  const label = e.type === "juckreiz" ? "Juckreiz" : "Lust auf Süßes";
  const strength = ["", "leicht", "mittel", "stark"][e.intensity || 0];
  const outcome = { nichts: "nichts gegessen", "notfall-snack": "Notfall-Snack", gegessen: "gegessen" }[e.outcome] || "";
  return h(
    "li",
    {},
    h(
      "button",
      { class: "entry", type: "button", onclick: () => onOpen(e) },
      h("div", { class: "thumb" }, e.type === "juckreiz" ? "Haut" : "Süß"),
      h("div", {}, h("div", { class: "title" }, label), h("div", { class: "meta num" }, [`${fmt.time(e.occurred_at)} Uhr`, strength, outcome].filter(Boolean).join(", "))),
      h("span", {}),
    ),
  );
}

// --------------------------------------------------- Blatt: neues Essen
export function newMealSheet({ file, dishes = [], onSaved }) {
  const state = { file, source: "selbst", stored: "", dish_id: "", note: "", at: localInputValue() };
  const previewUrl = file ? URL.createObjectURL(file) : null;

  openSheet("Essen eintragen", (close) => {
    const note = h("textarea", { id: "meal-note", placeholder: "Zum Beispiel: halbe Portion Reis, ohne Sauce", oninput: (e) => (state.note = e.target.value) });
    const time = h("input", { id: "meal-time", type: "datetime-local", value: state.at, oninput: (e) => (state.at = e.target.value) });
    const filePick = h("input", {
      id: "meal-file",
      type: "file",
      accept: "image/*",
      onchange: (e) => {
        state.file = e.target.files[0] || null;
      },
    });
    const dishField = h("div", { hidden: true });
    const renderDish = () => {
      dishField.hidden = state.source !== "koch";
      if (dishField.hidden) return;
      dishField.replaceChildren(
        dishes.length
          ? field(
              "Gericht vom Koch",
              h(
                "select",
                { id: "meal-dish", onchange: (e) => (state.dish_id = e.target.value) },
                h("option", { value: "" }, "nicht hinterlegt"),
                dishes.map((d) => h("option", { value: d.id }, `${d.name || "Gericht"} (${fmt.dayShort(d.cooked_on)})`)),
              ),
              "Mit hinterlegtem Gericht wird genauer gerechnet.",
            )
          : h("p", { class: "small muted" }, "Noch kein Gericht vom Koch hinterlegt. Unter Mehr, Gerichte vom Koch kannst du seine Angaben eintragen."),
      );
    };
    const save = h("button", { class: "btn primary big", type: "button" }, "Eintrag speichern");
    save.addEventListener("click", async () => {
      if (!state.file && !state.note.trim()) {
        toast("Bitte ein Foto oder eine kurze Beschreibung angeben.");
        return;
      }
      save.disabled = true;
      save.textContent = "Wird gespeichert …";
      try {
        const photo_path = state.file ? await api.upload(state.file, "meals") : null;
        const meal = await api.insert("meals", {
          eaten_at: new Date(state.at).toISOString(),
          source: state.source,
          dish_id: state.dish_id || null,
          photo_path,
          user_note: state.note.trim() || null,
          stored_hours: state.stored ? Number(state.stored) : null,
          status: "pending",
        });
        close();
        toast("Eintrag gespeichert");
        onSaved(meal);
      } catch (err) {
        save.disabled = false;
        save.textContent = "Eintrag speichern";
        toast(`Speichern fehlgeschlagen: ${err.message}`);
      }
    });

    renderDish();
    return [
      previewUrl ? h("img", { class: "preview", src: previewUrl, alt: "Dein Foto" }) : field("Foto", filePick, "optional"),
      field("Anmerkung", note, "optional"),
      h(
        "div",
        { class: "field" },
        h("span", {}, "Woher kommt das Essen?"),
        segmented(
          [
            ["selbst", "Selbst gemacht"],
            ["koch", "Vom Koch"],
            ["auswaerts", "Auswärts"],
          ],
          state.source,
          (v) => {
            state.source = v;
            renderDish();
          },
        ),
      ),
      dishField,
      h(
        "div",
        { class: "fields-2" },
        field("Zeitpunkt", time),
        field(
          "Frisch oder Reste?",
          h(
            "select",
            { id: "meal-stored", onchange: (e) => (state.stored = e.target.value) },
            h("option", { value: "" }, "frisch"),
            h("option", { value: "12" }, "Reste, etwa 12 h"),
            h("option", { value: "24" }, "Reste, 1 Tag"),
            h("option", { value: "48" }, "Reste, 2 Tage"),
            h("option", { value: "72" }, "Reste, 3 Tage oder mehr"),
          ),
        ),
      ),
      save,
    ];
  });
}

/** Stößt die Auswertung an und meldet das Ergebnis. */
export async function analyzeMeal(meal, onDone) {
  try {
    await api.hub("analyze-meal", { id: meal.id });
  } catch (err) {
    toast(err.message);
  }
  onDone();
}

// ------------------------------------------------- Blatt: Essen im Detail
export function mealDetailSheet(m, onChanged) {
  openSheet(m.title || "Eintrag", (close) => {
    const draft = { title: m.title || "", kcal: m.kcal ?? "", protein_g: m.protein_g ?? "", histamine: m.histamine || "", eaten_at: localInputValue(m.eaten_at) };
    const photo = h("div", {});
    if (m.photo_path) photoUrl(m.photo_path).then((url) => url && photo.replaceChildren(h("img", { class: "preview", src: url, alt: "Foto des Essens" })));

    const items = (m.items || []).length
      ? h(
          "div",
          { class: "table-wrap" },
          h(
            "table",
            {},
            h("thead", {}, h("tr", {}, h("th", {}, "Bestandteil"), h("th", { class: "r" }, "Menge"), h("th", { class: "r" }, "kcal"), h("th", { class: "r" }, "Eiweiß"), h("th", {}, "Histamin"))),
            h(
              "tbody",
              {},
              m.items.map((it) =>
                h("tr", {}, h("td", {}, it.name), h("td", { class: "r" }, `${fmt.n0(it.grams)} g`), h("td", { class: "r" }, fmt.n0(it.kcal)), h("td", { class: "r" }, `${fmt.n0(it.protein_g)} g`), h("td", {}, it.histamine || "")),
              ),
            ),
          ),
        )
      : null;

    const save = h("button", { class: "btn primary", type: "button" }, "Änderungen speichern");
    save.addEventListener("click", async () => {
      save.disabled = true;
      try {
        await api.update("meals", m.id, {
          title: draft.title.trim() || null,
          kcal: draft.kcal === "" ? null : Math.round(Number(draft.kcal)),
          protein_g: draft.protein_g === "" ? null : Number(draft.protein_g),
          histamine: draft.histamine || null,
          eaten_at: new Date(draft.eaten_at).toISOString(),
          edited: true,
        });
        close();
        toast("Änderungen gespeichert");
        onChanged();
      } catch (err) {
        save.disabled = false;
        toast(`Speichern fehlgeschlagen: ${err.message}`);
      }
    });

    const again = h("button", { class: "btn", type: "button" }, m.kcal == null ? "Jetzt auswerten" : "Erneut auswerten");
    again.addEventListener("click", async () => {
      again.disabled = true;
      again.textContent = "Wird ausgewertet …";
      try {
        await api.hub("analyze-meal", { id: m.id });
        close();
        toast("Ausgewertet");
      } catch (err) {
        again.disabled = false;
        again.textContent = "Erneut auswerten";
        toast(err.message);
      }
      onChanged();
    });

    let armed = false;
    const del = h("button", { class: "btn quiet danger", type: "button" }, "Eintrag löschen");
    del.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        del.textContent = "Wirklich löschen?";
        return;
      }
      await api.remove("meals", m.id);
      if (m.photo_path) api.removePhoto(m.photo_path);
      close();
      toast("Eintrag gelöscht");
      onChanged();
    });

    return [
      photo,
      m.status === "error" && m.error ? h("div", { class: "note warn" }, m.error) : null,
      m.comment ? h("p", {}, m.comment) : null,
      h(
        "div",
        { class: "row" },
        m.histamine ? h("span", { class: `pill h-${m.histamine}` }, HISTAMINE_LABEL[m.histamine]) : null,
        (m.flags || []).map((f) => h("span", { class: "pill plain" }, FLAG_LABEL[f] || f)),
        m.confidence ? h("span", { class: "pill plain" }, `Schätzung mit ${{ hoch: "hoher", mittel: "mittlerer", niedrig: "niedriger" }[m.confidence]} Sicherheit`) : null,
      ),
      items,
      m.user_note ? h("p", { class: "small muted" }, `Deine Anmerkung: ${m.user_note}`) : null,
      field("Titel", h("input", { id: "md-title", type: "text", value: draft.title, oninput: (e) => (draft.title = e.target.value) })),
      h(
        "div",
        { class: "fields-2" },
        field("Kalorien", h("input", { id: "md-kcal", type: "number", inputmode: "numeric", min: "0", value: draft.kcal, oninput: (e) => (draft.kcal = e.target.value) })),
        field("Eiweiß in g", h("input", { id: "md-protein", type: "number", inputmode: "decimal", min: "0", value: draft.protein_g, oninput: (e) => (draft.protein_g = e.target.value) })),
      ),
      h(
        "div",
        { class: "field" },
        h("span", {}, "Histamin"),
        segmented(
          [
            ["niedrig", "niedrig"],
            ["mittel", "mittel"],
            ["hoch", "hoch"],
          ],
          draft.histamine,
          (v) => (draft.histamine = v),
        ),
      ),
      field("Zeitpunkt", h("input", { id: "md-time", type: "datetime-local", value: draft.eaten_at, oninput: (e) => (draft.eaten_at = e.target.value) })),
      h("div", { class: "row" }, save, again),
      del,
    ];
  });
}

// ---------------------------------------------- Blatt: Juckreiz und Süßlust
export function eventSheet(existing, type, onChanged) {
  const isItch = type === "juckreiz";
  const state = {
    intensity: existing?.intensity || 2,
    at: localInputValue(existing?.occurred_at || new Date()),
    context: existing?.context || "",
    outcome: existing?.outcome || "",
  };
  openSheet(isItch ? "Juckreiz" : "Lust auf Süßes", (close) => {
    const save = h("button", { class: "btn primary big", type: "button" }, existing ? "Änderungen speichern" : "Speichern");
    save.addEventListener("click", async () => {
      save.disabled = true;
      const row = {
        type,
        intensity: state.intensity,
        occurred_at: new Date(state.at).toISOString(),
        context: state.context.trim() || null,
        outcome: isItch ? null : state.outcome || null,
      };
      try {
        if (existing) await api.update("events", existing.id, row);
        else await api.insert("events", row);
        close();
        toast("Gespeichert");
        onChanged();
      } catch (err) {
        save.disabled = false;
        toast(`Speichern fehlgeschlagen: ${err.message}`);
      }
    });
    let armed = false;
    const del = existing ? h("button", { class: "btn quiet danger", type: "button" }, "Eintrag löschen") : null;
    del?.addEventListener("click", async () => {
      if (!armed) {
        armed = true;
        del.textContent = "Wirklich löschen?";
        return;
      }
      await api.remove("events", existing.id);
      close();
      toast("Eintrag gelöscht");
      onChanged();
    });
    return [
      h(
        "div",
        { class: "field" },
        h("span", {}, "Wie stark?"),
        segmented(
          [
            [1, "leicht"],
            [2, "mittel"],
            [3, "stark"],
          ],
          state.intensity,
          (v) => (state.intensity = v),
        ),
      ),
      isItch
        ? null
        : h(
            "div",
            { class: "field" },
            h("span", {}, "Was ist daraus geworden?"),
            segmented(
              [
                ["nichts", "Nichts gegessen"],
                ["notfall-snack", "Notfall-Snack"],
                ["gegessen", "Gegessen"],
              ],
              state.outcome,
              (v) => (state.outcome = v),
            ),
          ),
      field("Zeitpunkt", h("input", { id: "ev-time", type: "datetime-local", value: state.at, oninput: (e) => (state.at = e.target.value) })),
      field(
        isItch ? "Wo genau?" : "Wobei?",
        h("input", { id: "ev-context", type: "text", value: state.context, placeholder: isItch ? "zum Beispiel Stirn, Wangen" : "zum Beispiel vor dem Fernseher", oninput: (e) => (state.context = e.target.value) }),
        "optional",
      ),
      save,
      del,
    ];
  });
}

/** Geräte mit Fingerbedienung öffnen über das Dateifeld direkt die Kamera. */
const touchDevice = () => window.matchMedia("(pointer: coarse)").matches;

function fileInput(onFile, accept, capture) {
  return h("input", {
    type: "file",
    accept,
    capture: capture ? "environment" : null,
    hidden: true,
    onchange: (e) => {
      const file = e.target.files[0];
      e.target.value = "";
      if (file) onFile(file);
    },
  });
}

/**
 * Knopf zum Aufnehmen oder Auswählen eines Fotos. Am Handy öffnet er die
 * Kamera. Am Computer öffnet er die Webcam und bietet daneben die Dateiauswahl
 * an, weil das Dateifeld dort keine Kamera kennt.
 */
export function photoButton(label, onFile, { capture = true, big = true, accept = "image/*" } = {}) {
  const cls = `btn primary${big ? " big" : ""}`;
  if (!capture || touchDevice() || !navigator.mediaDevices?.getUserMedia) {
    return h("label", { class: cls }, icon("camera"), label, fileInput(onFile, accept, capture));
  }
  return h("button", { class: cls, type: "button", onclick: () => cameraSheet(onFile, accept) }, icon("camera"), label);
}

function cameraSheet(onFile, accept) {
  let stream = null;
  const stop = () => stream?.getTracks().forEach((t) => t.stop());
  openSheet(
    "Foto aufnehmen",
    (close) => {
      const video = h("video", { class: "preview", autoplay: true, playsinline: true, muted: true });
      const status = h("p", { class: "muted" }, "Die Kamera wird gestartet …");
      const shoot = h("button", { class: "btn primary big", type: "button", disabled: true }, icon("camera"), "Auslösen");
      const pick = h("label", { class: "btn" }, "Stattdessen ein Bild vom Computer wählen", fileInput((file) => (close(), onFile(file)), accept, false));

      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
        .then((s) => {
          stream = s;
          if (!document.body.contains(video)) return stop();
          video.srcObject = s;
          status.textContent = "Halte das Essen oder die Packung vor die Kamera.";
          shoot.disabled = false;
        })
        .catch((err) => {
          video.hidden = true;
          shoot.hidden = true;
          status.textContent =
            err?.name === "NotAllowedError"
              ? "Der Browser hat keinen Zugriff auf die Kamera. Erlaube ihn in der Adresszeile oder wähle ein Bild vom Computer."
              : "Hier wurde keine Kamera gefunden. Wähle ein Bild vom Computer oder nimm das Foto mit dem Handy auf.";
        });

      shoot.addEventListener("click", () => {
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (!blob) return toast("Das Foto konnte nicht aufgenommen werden.");
            close();
            onFile(new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.9,
        );
      });
      return [video, status, shoot, pick];
    },
    { onClose: stop },
  );
}
