// Anmeldung. Drei Wege: Google (ein Tipp), Anmeldelink per E-Mail, Passwort.
// Zugang hat nur die freigegebene Adresse.

import { api } from "../data.js";
import { field, h, mount } from "../lib.js";

export function renderAuth(root) {
  const st = { email: "", password: "", pasted: "" };
  const message = h("div", { class: "note", hidden: true, role: "status" });
  const say = (text, bad = false) => {
    message.hidden = false;
    message.className = `note${bad ? " bad" : ""}`;
    message.textContent = text;
  };
  const guard = async (button, run) => {
    button.disabled = true;
    try {
      await run();
    } catch (err) {
      say(translate(err.message), true);
    }
    button.disabled = false;
  };
  const translate = (msg) => {
    if (/invalid login credentials/i.test(msg)) return "E-Mail oder Passwort stimmen nicht.";
    if (/signups not allowed|not found|freigegeben|database error/i.test(msg)) return "Für diese Adresse gibt es kein Konto.";
    if (/expired|invalid/i.test(msg)) return "Der Link ist abgelaufen oder wurde schon benutzt. Bitte einen neuen schicken lassen.";
    if (/rate limit|security purposes/i.test(msg)) return "Zu viele Versuche. Bitte ein paar Minuten warten.";
    return msg;
  };

  const google = h("button", { class: "btn primary big", type: "button" }, "Mit Google anmelden");
  google.addEventListener("click", () => guard(google, () => api.signInGoogle()));

  const email = h("input", { id: "auth-email", type: "email", autocomplete: "username", oninput: (e) => (st.email = e.target.value.trim()) });
  const needEmail = () => {
    if (st.email.includes("@")) return true;
    say("Bitte zuerst die E-Mail-Adresse eingeben.", true);
    return false;
  };

  // Anmeldelink
  const pasteBox = h("div", { class: "stack", hidden: true });
  const send = h("button", { class: "btn", type: "button" }, "Anmeldelink per E-Mail schicken");
  send.addEventListener("click", () =>
    guard(send, async () => {
      if (!needEmail()) return;
      await api.sendLink(st.email);
      pasteBox.hidden = false;
      say("Die E-Mail ist unterwegs. Kopiere den Link daraus und füge ihn unten ein, statt ihn anzutippen.");
    }),
  );
  const useLink = h("button", { class: "btn primary", type: "button" }, "Mit dem Link anmelden");
  useLink.addEventListener("click", () =>
    guard(useLink, async () => {
      if (!st.pasted.trim()) return say("Bitte den Link aus der E-Mail einfügen.", true);
      await api.signInWithPasted(st.pasted, st.email);
    }),
  );
  pasteBox.append(
    field("Link aus der E-Mail", h("textarea", { id: "auth-link", placeholder: "https://…", oninput: (e) => (st.pasted = e.target.value) }), "lange drücken, kopieren, hier einfügen"),
    useLink,
  );

  // Passwort
  const signIn = h("button", { class: "btn", type: "submit" }, "Mit Passwort anmelden");
  const form = h(
    "form",
    {
      class: "stack",
      onsubmit: (e) => {
        e.preventDefault();
        guard(signIn, async () => {
          if (!needEmail()) return;
          if (st.password.length < 8) return say("Das Passwort hat mindestens acht Zeichen.", true);
          await api.signIn(st.email, st.password);
        });
      },
    },
    field("E-Mail", email),
    field("Passwort", h("input", { id: "auth-password", type: "password", autocomplete: "current-password", oninput: (e) => (st.password = e.target.value) }), "falls du schon eines festgelegt hast"),
    signIn,
    send,
    pasteBox,
  );

  mount(
    root,
    h(
      "div",
      { class: "auth" },
      h(
        "div",
        { class: "panel" },
        h("h1", {}, "Logbuch"),
        h("p", { class: "muted" }, "Essen, Schlaf, Training und Befinden an einem Ort."),
        google,
        message,
        h("details", {}, h("summary", {}, "Ohne Google anmelden"), h("div", { style: "margin-top:16px" }, form)),
      ),
    ),
  );
}
