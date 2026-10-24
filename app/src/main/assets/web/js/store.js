// Tout ce qui est mémorisé sur le Fire Stick : réglages, session, favoris, progression des rediffs.
const P = "tu.";
// Comptes et sessions : gardés par Android (écriture immédiate), pour survivre à un plantage de l’app.
const isAccountKey = k => k === "profiles" || k === "activeProfile" || k.startsWith("prof:");
const nat = k => isAccountKey(k) && window.Android && window.Android.prefGet ? window.Android : null;
export const store = {
  get(k, d) {
    try {
      const n = nat(k);
      let v = n ? n.prefGet(P + k) : null;
      if (v == null) { v = localStorage.getItem(P + k); if (n && v != null) n.prefSet(P + k, v); }   // reprise des anciennes données
      return v == null ? d : JSON.parse(v);
    } catch { return d; }
  },
  set(k, v) {
    const s = JSON.stringify(v), n = nat(k);
    try { if (n) n.prefSet(P + k, s); } catch { /* pont indisponible */ }
    try { localStorage.setItem(P + k, s); } catch { /* stockage plein */ }
  },
  del(k) {
    const n = nat(k);
    try { if (n) n.prefSet(P + k, null); } catch { /* pont indisponible */ }
    try { localStorage.removeItem(P + k); } catch { /* rien */ }
  },
};

export const DEFAULTS = { adblock: 0, quality: 0, lowLat: 1, chatPos: 0, chatStyle: 0, chatSize: 0, alerts: 0, resume: 0, sleep: 0, stats: 0, lang: 0 };
export const settings = Object.assign({}, DEFAULTS, store.get("settings", {}));

/** Jeton de session Twitch (OAuth du site). Permet de lire les rediffs réservées aux abonnés
 *  des chaînes auxquelles VOUS êtes abonné, et retire les pubs sur ces chaînes (ou partout avec Turbo).
 *  Fourni volontairement par l’utilisateur ; jamais récupéré automatiquement. */
function pk(name){ const id = store.get("activeProfile", "_"); return "prof:" + id + ":" + name; }
export function getUserToken() { return store.get(pk("userToken"), "") || store.get("userToken", "") || ""; }
export function setUserToken(t) { t ? store.set(pk("userToken"), t) : store.del(pk("userToken")); }
export const saveSettings = () => store.set("settings", settings);

export const favs = new Set(store.get("favs", []));
export function toggleFav(login) { favs.has(login) ? favs.delete(login) : favs.add(login); store.set("favs", [...favs]); return favs.has(login); }

export const reminders = new Set(store.get("reminders", []));
export function toggleReminder(id) { reminders.has(id) ? reminders.delete(id) : reminders.add(id); store.set("reminders", [...reminders]); return reminders.has(id); }

/** Progression des rediffusions : { id: { pos, sec, title, login, name, avatar, thumb, start, at } } */
export function progressOf(id) { return store.get("progress", {})[id]?.pos || 0; }
export function saveProgress(vod, pos) {
  const p = store.get("progress", {});
  if (!vod || !vod.sec) return;
  if (pos < 30 || pos > vod.sec - 90) delete p[vod.id];
  else p[vod.id] = { pos: Math.floor(pos), sec: vod.sec, title: vod.title, login: vod.ch.login, name: vod.ch.name, avatar: vod.ch.avatar || "", id2: vod.ch.id, thumb: vod.thumb || "", start: vod.start, at: Date.now() };
  const keys = Object.keys(p).sort((a, b) => p[a].at - p[b].at);
  while (keys.length > 40) delete p[keys.shift()];
  store.set("progress", p);
}
export function continueList() {
  const p = store.get("progress", {});
  return Object.entries(p).sort((a, b) => b[1].at - a[1].at).slice(0, 15).map(([id, v]) => ({
    id, title: v.title, sec: v.sec, start: v.start, end: v.start + v.sec * 1000, thumb: v.thumb,
    ch: { id: v.id2, login: v.login, name: v.name, avatar: v.avatar, live: false }, watched: v.pos / v.sec,
  }));
}

/** Rangées de l’accueil : ordre et visibilité choisis dans « Personnaliser l’accueil ». */
export const HOME_ROWS = [
  ["hero", "Grand bandeau du live du moment"],
  ["live", "En direct sur vos chaînes"],
  ["continue", "Continuer à regarder"],
  ["today", "Passés en live aujourd’hui"],
  ["sched", "Prochains lives prévus"],
  ["clips", "Meilleurs clips du jour"],
  ["cats", "Catégories populaires"],
  ["followed", "Vos chaînes suivies"],
  ["popular", "Populaire dans la catégorie du moment"],
];
const HOME_DEFAULT_ON = new Set(["hero", "live", "continue", "today"]);
export function homeLayout() {
  const saved = store.get("homeRows", null);
  const list = (saved || []).filter(x => HOME_ROWS.some(r => r[0] === x.id));
  for (const [id] of HOME_ROWS) if (!list.some(x => x.id === id)) list.push({ id, on: saved ? false : HOME_DEFAULT_ON.has(id) });
  return list;
}
export const saveHomeLayout = list => store.set("homeRows", list);
