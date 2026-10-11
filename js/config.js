// Verbindung zur Datenbank. Beide Werte sind öffentlich (der Schlüssel ist der
// veröffentlichbare Schlüssel, der Zugriff wird über Login und Zeilenregeln
// geschützt). Leer bedeutet: Die App läuft als Vorschau mit Beispieldaten.
export const SUPABASE_URL = "https://csgvhxtwihpzhekofyzb.supabase.co";
export const SUPABASE_KEY = "sb_publishable_UaYUjY8aMHRlg2MscBkK4g_JmaDBVff";

// Kennung der bei Whoop registrierten App. Sie ist nicht geheim (sie steht in
// jeder Anmeldeadresse); das zugehörige Secret liegt nur auf dem Server.
export const WHOOP_CLIENT_ID = "f7a47a5b-0587-4b43-bd8f-971a5a8472cd";
