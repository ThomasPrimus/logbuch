// Datenzugriff. Zwei Ausführungen mit derselben Schnittstelle: Supabase für den
// echten Betrieb, ein Speicher im Arbeitsspeicher für die Vorschau.

import { SUPABASE_KEY, SUPABASE_URL } from "./config.js";
import { addDays, dayKey, shrinkImage } from "./lib.js";

export const DEMO = !SUPABASE_URL || !SUPABASE_KEY || new URLSearchParams(location.search).has("vorschau");

const sb = DEMO ? null : window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function check({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// ------------------------------------------------------------------ Supabase
const live = {
  async session() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  onAuth(fn) {
    sb.auth.onAuthStateChange((_event, session) => fn(session));
  },
  async signIn(email, password) {
    check(await sb.auth.signInWithPassword({ email, password }));
  },
  async signInGoogle() {
    check(await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } }));
  },
  /** Schickt einen Anmeldelink an eine bereits bekannte Adresse. */
  async sendLink(email) {
    check(await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname } }));
  },
  /**
   * Meldet mit dem an, was aus der E-Mail kopiert wurde: dem Link selbst, der
   * Adresse nach dem Anklicken oder dem sechsstelligen Code.
   */
  async signInWithPasted(text, email) {
    const raw = text.trim();
    const access = /[#&?]access_token=([^&\s]+)/.exec(raw);
    const refresh = /[#&?]refresh_token=([^&\s]+)/.exec(raw);
    if (access && refresh) {
      check(await sb.auth.setSession({ access_token: decodeURIComponent(access[1]), refresh_token: decodeURIComponent(refresh[1]) }));
      return;
    }
    if (/^\d{6}$/.test(raw)) {
      check(await sb.auth.verifyOtp({ email, token: raw, type: "email" }));
      return;
    }
    const token = /[?&]token(?:_hash)?=([^&\s]+)/.exec(raw);
    const type = /[?&]type=([a-z_]+)/.exec(raw);
    if (!token) throw new Error("Darin steckt kein Anmeldelink. Bitte den ganzen Link aus der E-Mail kopieren.");
    check(await sb.auth.verifyOtp({ token_hash: decodeURIComponent(token[1]), type: type ? type[1] : "email" }));
  },
  async setPassword(password) {
    check(await sb.auth.updateUser({ password }));
  },
  async signUp(email, password) {
    const data = check(await sb.auth.signUp({ email, password, options: { emailRedirectTo: location.origin + location.pathname } }));
    return { needsConfirm: !data.session };
  },
  async signOut() {
    await sb.auth.signOut();
  },

  async select(table, q = {}) {
    let r = sb.from(table).select("*");
    for (const [k, v] of Object.entries(q.eq || {})) r = r.eq(k, v);
    for (const [k, v] of Object.entries(q.gte || {})) r = r.gte(k, v);
    for (const [k, v] of Object.entries(q.lt || {})) r = r.lt(k, v);
    if (q.order) r = r.order(q.order, { ascending: !!q.asc });
    if (q.limit) r = r.limit(q.limit);
    return check(await r);
  },
  async insert(table, row) {
    return check(await sb.from(table).insert(row).select().single());
  },
  async upsert(table, row, onConflict) {
    return check(await sb.from(table).upsert(row, onConflict ? { onConflict } : undefined).select().single());
  },
  async update(table, id, patch) {
    return check(await sb.from(table).update(patch).eq("id", id).select().single());
  },
  async remove(table, id) {
    check(await sb.from(table).delete().eq("id", id));
  },

  async upload(file, folder) {
    const session = await this.session();
    const isPdf = file.type === "application/pdf";
    const body = isPdf ? file : await shrinkImage(file);
    const ext = isPdf ? "pdf" : body === file ? (file.name.split(".").pop() || "jpg").toLowerCase() : "jpg";
    const path = `${session.user.id}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    check(await sb.storage.from("health").upload(path, body, { contentType: isPdf ? "application/pdf" : body.type || "image/jpeg" }));
    return path;
  },
  async photoUrl(path) {
    const data = check(await sb.storage.from("health").createSignedUrl(path, 3600));
    return data.signedUrl;
  },
  async removePhoto(path) {
    await sb.storage.from("health").remove([path]);
  },

  async hub(action, payload = {}) {
    const { data, error } = await sb.functions.invoke("hub", { body: { action, ...payload } });
    if (error) {
      let message = error.message;
      try {
        const body = await error.context?.json?.();
        if (body?.error) message = body.error;
      } catch {
        /* Antwort ohne JSON */
      }
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  },
};

// ------------------------------------------------------------------ Vorschau
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2));
const at = (dayOffset, hh, mm = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
const today = dayKey();

function demoSeed() {
  const meal = (off, hh, mm, title, kcal, protein, histamine, flags = [], source = "selbst") => ({
    id: uid(),
    eaten_at: at(off, hh, mm),
    kind: "mahlzeit",
    source,
    title,
    kcal,
    protein_g: protein,
    carbs_g: Math.round(kcal * 0.09),
    fat_g: Math.round(kcal * 0.04),
    histamine,
    flags,
    confidence: source === "koch" ? "hoch" : "mittel",
    comment: "Beispiel-Eintrag.",
    items: [],
    status: "done",
  });
  const weights = [];
  for (let i = 13; i >= 0; i--) weights.push({ day: addDays(today, -i), source: "manuell", kg: Math.round((90.6 - (13 - i) * 0.06 + (i % 3) * 0.1) * 10) / 10 });
  const whoop = [];
  for (let i = 13; i >= 1; i--)
    whoop.push({
      day: addDays(today, -i),
      kcal_burned: 2850 + ((i * 37) % 300),
      steps: 7200 + ((i * 911) % 4000),
      recovery_score: 45 + ((i * 13) % 45),
      sleep_hours: 6.2 + ((i * 7) % 18) / 10,
      strain: 9 + ((i * 3) % 7),
      hrv_ms: 48 + ((i * 5) % 20),
      rhr: 56 + (i % 5),
    });
  return {
    settings: [{ user_id: "demo", start_weight_kg: 90, goal_weight_kg: 84, rate_kg_per_week: 0.5, plan_start: addDays(today, -13), pause_from: addDays(today, 60), pause_weeks: 4, window_start: "11:00", window_end: "19:00", protein_target_g: 150, kcal_target: null, timezone: "Europe/Berlin" }],
    meals: [
      meal(0, 11, 20, "Rührei mit Gemüse und Reis", 610, 41, "niedrig"),
      meal(0, 14, 45, "Hähnchen, Ofengemüse, Kartoffeln", 720, 58, "niedrig", [], "koch"),
      meal(-1, 11, 5, "Skyr mit Beeren", 310, 32, "mittel", ["milch"]),
      meal(-1, 14, 30, "Thunfisch-Salat aus der Dose", 480, 39, "hoch", ["gereift"]),
      meal(-1, 18, 40, "Lachs, Brokkoli, Reis", 690, 47, "niedrig", [], "koch"),
      meal(-1, 21, 35, "Schokolade", 270, 4, "mittel", ["freisetzer", "milch"]),
      meal(-2, 12, 0, "Linsen-Curry mit Reis", 640, 28, "mittel"),
      meal(-2, 18, 20, "Rindersteak mit Salat", 610, 52, "niedrig"),
    ],
    events: [
      { id: uid(), type: "juckreiz", occurred_at: at(-1, 17, 10), intensity: 2 },
      { id: uid(), type: "suesslust", occurred_at: at(-1, 21, 20), intensity: 2, outcome: "gegessen" },
      { id: uid(), type: "suesslust", occurred_at: at(-2, 21, 5), intensity: 1, outcome: "nichts" },
    ],
    checkins: [
      { day: addDays(today, -1), craving: 2, itch: 2, dry_skin: 1 },
      { day: addDays(today, -2), craving: 1, itch: 0, dry_skin: 1 },
    ],
    weights,
    whoop_daily: whoop,
    whoop_workouts: [
      { id: uid(), start_at: at(-1, 8, 0), sport_name: "weightlifting", strain: 9.4 },
      { id: uid(), start_at: at(-3, 8, 0), sport_name: "weightlifting", strain: 10.1 },
      { id: uid(), start_at: at(-6, 8, 0), sport_name: "weightlifting", strain: 8.8 },
    ],
    supplements: [
      { id: uid(), name: "Magnesiumbisglycinat", brand: "Beispiel", dose_text: "2 Kapseln abends", unit: "Kapsel", units_per_day: 2, ingredients: [{ name: "Magnesium", amount: 150, unit: "mg" }], additives: [], active: true, status: "done" },
      { id: uid(), name: "Vitamin D3 + K2", brand: "Beispiel", dose_text: "1 Tropfen morgens", unit: "Tropfen", units_per_day: 1, ingredients: [{ name: "Vitamin D3", amount: 25, unit: "µg" }], additives: [], active: true, status: "done" },
    ],
    supplement_logs: [],
    dishes: [],
    labs: [],
    sync_state: [],
  };
}

const mem = DEMO ? demoSeed() : null;
const blobs = new Map();

const demo = {
  async session() {
    return { user: { id: "demo", email: "vorschau" } };
  },
  onAuth() {},
  async signIn() {},
  async signUp() {
    return { needsConfirm: false };
  },
  async signInGoogle() {},
  async sendLink() {},
  async signInWithPasted() {},
  async setPassword() {},
  async signOut() {},

  async select(table, q = {}) {
    let rows = [...(mem[table] || [])];
    for (const [k, v] of Object.entries(q.eq || {})) rows = rows.filter((r) => r[k] === v);
    for (const [k, v] of Object.entries(q.gte || {})) rows = rows.filter((r) => r[k] >= v);
    for (const [k, v] of Object.entries(q.lt || {})) rows = rows.filter((r) => r[k] < v);
    if (q.order) rows.sort((a, b) => (a[q.order] < b[q.order] ? -1 : a[q.order] > b[q.order] ? 1 : 0) * (q.asc ? 1 : -1));
    if (q.limit) rows = rows.slice(0, q.limit);
    return rows;
  },
  async insert(table, row) {
    const full = { id: uid(), created_at: new Date().toISOString(), status: "pending", flags: [], ...row };
    (mem[table] ||= []).push(full);
    return full;
  },
  async upsert(table, row, onConflict) {
    const keys = (onConflict || "id").split(",").map((k) => k.trim()).filter((k) => k !== "user_id");
    const list = (mem[table] ||= []);
    const found = list.find((r) => keys.every((k) => r[k] === row[k]));
    if (found) return Object.assign(found, row);
    const full = { id: uid(), ...row };
    list.push(full);
    return full;
  },
  async update(table, id, patch) {
    const row = (mem[table] || []).find((r) => r.id === id);
    return Object.assign(row, patch);
  },
  async remove(table, id) {
    mem[table] = (mem[table] || []).filter((r) => r.id !== id);
  },

  async upload(file) {
    const path = `demo/${uid()}`;
    blobs.set(path, URL.createObjectURL(file));
    return path;
  },
  async photoUrl(path) {
    return blobs.get(path) || "";
  },
  async removePhoto() {},

  async hub(action, payload = {}) {
    await new Promise((r) => setTimeout(r, 900));
    if (action === "status") return { whoop_keys: false, analysis_key: false, whoop_redirect_uri: "https://beispiel.supabase.co/functions/v1/hub", sync: null };
    if (action === "analyze-meal") {
      return this.update("meals", payload.id, {
        title: "Beispiel-Auswertung",
        kcal: 540,
        protein_g: 36,
        carbs_g: 48,
        fat_g: 21,
        histamine: "niedrig",
        flags: [],
        confidence: "mittel",
        comment: "In der Vorschau wird nicht wirklich ausgewertet.",
        items: [{ name: "Beispiel", grams: 350, kcal: 540, protein_g: 36, carbs_g: 48, fat_g: 21, histamine: "niedrig" }],
        status: "done",
      });
    }
    if (action.startsWith("analyze-")) {
      const table = { "analyze-dish": "dishes", "analyze-supplement": "supplements", "analyze-lab": "labs" }[action];
      return this.update(table, payload.id, { status: "done", name: "Beispiel", ingredients: [], markers: [], summary: "In der Vorschau wird nicht wirklich ausgewertet." });
    }
    throw new Error("In der Vorschau nicht verfügbar.");
  },
};

export const api = DEMO ? demo : live;

// ------------------------------------------------------- gemeinsame Abfragen
const photoCache = new Map();
export async function photoUrl(path) {
  if (!path) return "";
  const hit = photoCache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const url = await api.photoUrl(path);
  photoCache.set(path, { url, until: Date.now() + 50 * 60000 });
  return url;
}

export async function loadSettings() {
  const session = await api.session();
  const rows = await api.select("settings", { limit: 1 });
  if (rows[0]) return rows[0];
  return api.upsert("settings", { user_id: session.user.id }, "user_id");
}

export async function saveSettings(patch) {
  const session = await api.session();
  return api.upsert("settings", { user_id: session.user.id, ...patch, updated_at: new Date().toISOString() }, "user_id");
}

/** Lädt alles, was für einen Zeitraum von Tagen gebraucht wird. */
export async function loadRange(fromDay, toDayExclusive) {
  const from = new Date(`${fromDay}T00:00:00`).toISOString();
  const to = new Date(`${toDayExclusive}T00:00:00`).toISOString();
  const [meals, events, checkins, weights, whoop, workouts] = await Promise.all([
    api.select("meals", { gte: { eaten_at: from }, lt: { eaten_at: to }, order: "eaten_at", asc: true }),
    api.select("events", { gte: { occurred_at: from }, lt: { occurred_at: to }, order: "occurred_at", asc: true }),
    api.select("checkins", { gte: { day: fromDay }, lt: { day: toDayExclusive }, order: "day", asc: true }),
    api.select("weights", { gte: { day: fromDay }, lt: { day: toDayExclusive }, order: "day", asc: true }),
    api.select("whoop_daily", { gte: { day: fromDay }, lt: { day: toDayExclusive }, order: "day", asc: true }),
    api.select("whoop_workouts", { gte: { start_at: from }, lt: { start_at: to }, order: "start_at", asc: true }),
  ]);
  return { meals, events, checkins, weights, whoop, workouts };
}
