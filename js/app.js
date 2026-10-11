// Einstieg: Anmeldung prüfen, Ansicht nach Adresse wählen, Reiter zeichnen.

import { DEMO, api, loadSettings, saveSettings } from "./data.js";
import { h, icon, toast } from "./lib.js";
import { renderAuth } from "./views/auth.js";
import { renderHistory } from "./views/history.js";
import { renderInsights } from "./views/insights.js";
import { renderConnections, renderDishes, renderLabs, renderMore, renderPlan, renderSupplements } from "./views/more.js";
import { renderToday } from "./views/today.js";

const ROUTES = {
  heute: [renderToday, "heute"],
  verlauf: [renderHistory, "verlauf"],
  auswertung: [renderInsights, "auswertung"],
  mehr: [renderMore, "mehr"],
  supplements: [renderSupplements, "mehr"],
  gerichte: [renderDishes, "mehr"],
  labor: [renderLabs, "mehr"],
  plan: [renderPlan, "mehr"],
  verbindungen: [renderConnections, "mehr"],
};

const TABS = [
  ["heute", "Heute", "today"],
  ["verlauf", "Verlauf", "history"],
  ["auswertung", "Auswertung", "chart"],
  ["mehr", "Mehr", "more"],
];

const main = document.getElementById("app");
const tabs = document.getElementById("tabs");
const ctx = { settings: null, demo: DEMO, email: "", refresh: () => route(), saveSettings: null };
let renderToken = 0;

ctx.saveSettings = async (patch) => {
  ctx.settings = await saveSettings(patch);
  route();
};

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, "");
  const [path, qs] = raw.split("?");
  return { name: path.split("/")[0] || "heute", query: new URLSearchParams(qs || "") };
}

async function route() {
  const token = ++renderToken;
  const { name, query } = parseHash();
  const [render, tab] = ROUTES[name] || ROUTES.heute;
  tabs.replaceChildren(...TABS.map(([key, label, ic]) => h("a", { href: `#/${key}`, "aria-current": key === tab ? "page" : null }, icon(ic), label)));
  tabs.hidden = false;
  const holder = document.createElement("div");
  holder.className = "app";
  try {
    await render(holder, ctx, query);
  } catch (err) {
    console.error(err);
    holder.replaceChildren(h("div", { class: "note bad" }, `Die Ansicht konnte nicht geladen werden: ${err.message}`), h("button", { class: "btn", type: "button", onclick: route }, "Erneut versuchen"));
  }
  if (token !== renderToken) return; // eine neuere Ansicht ist schon unterwegs
  const y = window.scrollY;
  main.replaceChildren(...holder.childNodes);
  if (main.dataset.route === name) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
  main.dataset.route = name;
}

async function start(session) {
  if (!session) {
    tabs.hidden = true;
    main.dataset.route = "";
    renderAuth(main);
    return;
  }
  ctx.email = session.user.email || "";
  try {
    ctx.settings = await loadSettings();
  } catch (err) {
    main.replaceChildren(h("div", { class: "note bad" }, `Die Einstellungen konnten nicht geladen werden: ${err.message}`));
    return;
  }
  route();
}

let signedIn = null;
window.addEventListener("hashchange", () => signedIn && route());
api.onAuth((session) => {
  const now = !!session;
  if (now === signedIn) return;
  signedIn = now;
  start(session);
});
api.session().then((session) => {
  if (signedIn !== null) return;
  signedIn = !!session;
  start(session);
});

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  toast("Etwas ist schiefgegangen. Bitte noch einmal versuchen.");
});
