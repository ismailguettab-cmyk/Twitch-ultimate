// Accès à l’API officielle Twitch (Helix) avec votre compte : chaînes suivies, lives, rediffs, clips…
import { json } from "./net.js";
import { store } from "./store.js";
import { CONFIG } from "./config.js";
import { log } from "./log.js";
import { sleep } from "./util.js";
import { gql } from "./playback.js";

const HELIX = "https://api.twitch.tv/helix";
const SCOPES = "user:read:follows";
// Multi-comptes : chaque profil a ses propres jetons, rangés sous "prof:<id>:*".
export function listProfiles() { return store.get("profiles", []); }
export function activeProfileId() { return store.get("activeProfile", null); }
export function setActiveProfile(id) {
  store.set("activeProfile", id);
  auth = loadAuth(id);
  me = store.get("prof:" + id + ":me", null);
  cache.clear();
  return !!(auth && me);   // false si le profil est incomplet (session à refaire)
}
function K(name) { const id = store.get("activeProfile", "_"); return "prof:" + id + ":" + name; }
// Chaque jeton porte l’id de son compte (pid) : il n’est jamais rangé sous un autre profil.
function loadAuth(id) { const a = id ? store.get("prof:" + id + ":auth", null) : null; return a ? { ...a, pid: id } : null; }
function upsertProfile(u) {
  const list = store.get("profiles", []);
  const p = { id: u.id, login: u.login, name: u.display_name || u.login, avatar: u.profile_image_url || "" };
  const i = list.findIndex(x => x.id === u.id);
  if (i >= 0) list[i] = p; else list.push(p);
  store.set("profiles", list);
  store.set("activeProfile", u.id);
}
export function removeProfile(id) {
  store.set("profiles", store.get("profiles", []).filter(p => p.id !== id));
  store.del("prof:" + id + ":auth"); store.del("prof:" + id + ":me"); store.del("prof:" + id + ":userToken");
  if (store.get("activeProfile", null) === id) store.del("activeProfile");
}
let auth = loadAuth(store.get("activeProfile", null));   // { access, refresh, exp, pid } du profil actif
let me = store.get(K("me"), null);

const form = o => Object.entries(o).map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
const FORM = { "Content-Type": "application/x-www-form-urlencoded" };
const img = (u, w, h) => u ? u.replace("%{width}", w).replace("%{height}", h).replace("{width}", w).replace("{height}", h) : "";

/* ---------- connexion par code d’appareil ---------- */
export async function startDeviceAuth() {
  const r = await json("POST", "https://id.twitch.tv/oauth2/device", { headers: FORM, body: form({ client_id: CONFIG.clientId, scopes: SCOPES }) });
  if (r.status !== 200) throw new Error(`Twitch refuse la connexion (${r.status}) ${r.data?.message || ""}`);
  const d = r.data;
  return { userCode: d.user_code, uri: d.verification_uri, deviceCode: d.device_code, interval: d.interval || 5, expiresAt: Date.now() + d.expires_in * 1000 };
}
export async function pollDeviceAuth(dev, cancelled) {
  while (Date.now() < dev.expiresAt) {
    await sleep(dev.interval * 1000);
    if (cancelled()) return false;
    const r = await oauth({ scopes: SCOPES, device_code: dev.deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" });
    if (r.status === 200) { await adoptLogin(r.data); return true; }
    const m = String(r.data?.message || "");
    if (/slow_down/.test(m)) { dev.interval += 5; continue; }
    if (!/pending/.test(m)) throw new Error("Connexion refusée : " + (m || r.status));
  }
  throw new Error("Le code a expiré");
}
const oauth = params => json("POST", "https://id.twitch.tv/oauth2/token", { headers: FORM, body: form({ client_id: CONFIG.clientId, ...params }) });
const authFrom = (d, pid) => ({ access: d.access_token, refresh: d.refresh_token, exp: Date.now() + (d.expires_in || 3600) * 1000, at: Date.now(), pid });
function persistAuth(a) { if (a && a.pid) { const { pid, ...rest } = a; store.set("prof:" + pid + ":auth", rest); } }
function saveAuth(d) { auth = authFrom(d, auth && auth.pid); persistAuth(auth); }
/** Nouveau compte validé : on l’identifie d’abord, puis on range ses jetons sous SON id. Les autres profils ne sont pas touchés. */
async function adoptLogin(d) {
  auth = authFrom(d, null);
  const u = await helix("/users");
  me = u.data[0];
  upsertProfile(me);
  auth.pid = me.id;
  persistAuth(auth);
  store.set("prof:" + me.id + ":me", me);
  cache.clear();
}
export function logout() { const id = store.get("activeProfile", null); if (id) removeProfile(id); auth = null; me = null; cache.clear(); }
export const isLogged = () => !!(auth && me);
export const getMe = () => me;

let refreshing = null;
async function refresh() {
  if (!auth?.refresh) throw new Error("Session expirée");
  const r = await oauth({ grant_type: "refresh_token", refresh_token: auth.refresh });
  if (r.status === 400 || r.status === 401) {
    // Jeton révoqué : on garde le profil dans « Qui regarde ? », seule sa session est à refaire.
    if (auth.pid) store.del("prof:" + auth.pid + ":auth");
    location.reload();
    throw new Error("Session expirée, reconnectez-vous");
  }
  if (r.status !== 200) throw new Error("Twitch ne répond pas (" + r.status + ")");   // panne passagère : on ne déconnecte pas
  saveAuth(r.data);
}
/** Garde les AUTRES profils connectés : Twitch invalide un jeton de rafraîchissement inutilisé pendant 30 jours. */
export async function keepProfilesAlive() {
  for (const p of listProfiles()) {
    if (auth && p.id === auth.pid) continue;
    const a = loadAuth(p.id);
    if (!a || !a.refresh || Date.now() - (a.at || 0) < 3 * 86400e3) continue;
    try {
      const r = await oauth({ grant_type: "refresh_token", refresh_token: a.refresh });
      if (r.status === 200) persistAuth(authFrom(r.data, p.id));
      else if (r.status === 400 || r.status === 401) { store.del("prof:" + p.id + ":auth"); log("WARN", "session expirée pour " + p.login); }
    } catch (e) { log("WARN", "maintien de session", e.message); }
  }
}
const ensureFresh = () => (refreshing = refreshing || refresh().finally(() => { refreshing = null; }));

/* ---------- appels Helix ---------- */
export async function helix(path, params = {}, { soft404 = false } = {}) {
  const qs = Object.entries(params)
    .flatMap(([k, v]) => Array.isArray(v) ? v.map(x => [k, x]) : [[k, v]])
    .filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
  const url = `${HELIX}${path}${qs ? "?" + qs : ""}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (auth && Date.now() > auth.exp - 60000) await ensureFresh();
    const r = await json("GET", url, { headers: { "Client-Id": CONFIG.clientId, Authorization: "Bearer " + auth.access } });
    if (r.status === 401 && attempt === 0) { await ensureFresh(); continue; }
    if (r.status === 429) { await sleep(1500 * (attempt + 1)); continue; }
    if (r.status === 404 && soft404) return null;
    if (r.status >= 400) throw new Error(`Twitch ${r.status} sur ${path}`);
    return r.data;
  }
  throw new Error("Twitch ne répond pas sur " + path);
}
async function paged(path, params, max) {
  let out = [], cursor;
  do {
    const d = await helix(path, { ...params, first: 100, after: cursor });
    out = out.concat(d.data);
    cursor = d.pagination?.cursor;
  } while (cursor && out.length < max);
  return out;
}
/** Exécute fn sur chaque élément avec au plus n requêtes en parallèle. */
async function pool(items, n, fn) {
  const res = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const k = i++;
      try { res[k] = await fn(items[k]); } catch (e) { log("WARN", e.message); res[k] = null; }
    }
  }));
  return res;
}
const cache = new Map();
async function cached(key, ttl, fn) {
  const c = cache.get(key);
  if (c && Date.now() - c.t < ttl) return c.v;
  const v = await fn();
  cache.set(key, { t: Date.now(), v });
  return v;
}
export function invalidate(prefix) { for (const k of [...cache.keys()]) if (k.startsWith(prefix)) cache.delete(k); }

/* ---------- normalisation ---------- */
const users = new Map();
async function fetchUsers(ids) {
  const need = [...new Set(ids)].filter(id => id && !users.has(id));
  for (let i = 0; i < need.length; i += 100) {
    const d = await helix("/users", { id: need.slice(i, i + 100) });
    d.data.forEach(u => users.set(u.id, u));
  }
}
function streamOf(s) {
  if (!s) return null;
  const bust = "?t=" + Math.floor(Date.now() / 120000);
  return { title: s.title, cat: s.game_name, catId: s.game_id, viewers: s.viewer_count, startedAt: Date.parse(s.started_at),
    thumb: img(s.thumbnail_url, 640, 360) + bust, thumbBig: img(s.thumbnail_url, 1280, 720) + bust };
}
function chFrom(u, s) {
  return { id: u.id, login: u.login, name: u.display_name || u.login, avatar: u.profile_image_url || "", live: !!s, stream: streamOf(s) };
}
const parseDur = s => { let t = 0; const H = s.match(/(\d+)h/), M = s.match(/(\d+)m/), S = s.match(/(\d+)s/); if (H) t += +H[1] * 3600; if (M) t += +M[1] * 60; if (S) t += +S[1]; return t; };
function vodFrom(v, ch) {
  const start = Date.parse(v.created_at), sec = parseDur(v.duration);
  return { id: v.id, ch, title: v.title || "Sans titre", start, end: start + sec * 1000, sec, thumb: img(v.thumbnail_url, 640, 360), views: v.view_count };
}

/* ---------- données utilisées par l’interface ---------- */
export async function getFollowed(force = false) {
  if (force) invalidate("followed");
  return cached("followed", 55000, async () => {
    const [fol, live] = await Promise.all([
      cached("folList", 10 * 60000, () => paged("/channels/followed", { user_id: me.id }, 600)),
      paged("/streams/followed", { user_id: me.id }, 300),
    ]);
    await fetchUsers(fol.map(f => f.broadcaster_id).concat(live.map(s => s.user_id)));
    const liveMap = new Map(live.map(s => [s.user_id, s]));
    const ids = new Set(fol.map(f => f.broadcaster_id));
    live.forEach(s => ids.add(s.user_id));
    return [...ids].map(id => users.get(id)).filter(Boolean).map(u => chFrom(u, liveMap.get(u.id)));
  });
}
export async function getRecentVods(channels, sinceMs) {
  return cached("vods", 5 * 60000, async () => {
    const res = await pool(channels.slice(0, 150), 8, async ch => {
      const d = await helix("/videos", { user_id: ch.id, type: "archive", first: 3 });
      return d.data.map(v => vodFrom(v, ch));
    });
    return res.flat().filter(Boolean)
      .filter(v => v.end > sinceMs)
      .filter(v => !(v.ch.live && Math.abs(v.start - v.ch.stream.startedAt) < 15 * 60000)) // la rediff du live en cours
      .sort((a, b) => b.end - a.end);
  });
}
export async function getLastVod(ch) {
  const d = await helix("/videos", { user_id: ch.id, type: "archive", first: 1 });
  return d.data[0] ? vodFrom(d.data[0], ch) : null;
}
export async function getClips(channels) {
  return cached("clips", 15 * 60000, async () => {
    const since = new Date(Date.now() - 24 * 3600e3).toISOString();
    const res = await pool(channels.slice(0, 25), 6, async ch => {
      const d = await helix("/clips", { broadcaster_id: ch.id, started_at: since, first: 3 });
      return d.data.map(c => ({ id: c.id, ch, title: c.title, sec: Math.round(c.duration), views: c.view_count, thumb: c.thumbnail_url }));
    });
    return res.flat().filter(Boolean).sort((a, b) => b.views - a.views).slice(0, 20);
  });
}
export async function getSchedule(channels) {
  return cached("sched", 30 * 60000, async () => {
    const now = Date.now(), lim = now + 36 * 3600e3;
    const res = await pool(channels.slice(0, 40), 6, async ch => {
      const d = await helix("/schedule", { broadcaster_id: ch.id, first: 3 }, { soft404: true });
      return (d?.data?.segments || []).filter(s => !s.canceled_until)
        .map(s => ({ id: s.id, ch, title: s.title || "Live prévu", at: Date.parse(s.start_time) }))
        .filter(s => s.at > now && s.at < lim);
    });
    return res.flat().filter(Boolean).sort((a, b) => a.at - b.at).slice(0, 15);
  });
}
export async function getTopCategories() {
  return cached("cats", 10 * 60000, async () => {
    const d = await helix("/games/top", { first: 40 });
    const cats = d.data.map((g, i) => ({ id: g.id, name: g.name, art: img(g.box_art_url, 285, 380), rank: i + 1, viewers: null }));
    await catViewers(cats);
    return cats;
  });
}
/** Nombre total de spectateurs par catégorie : chiffre exact de Twitch, sinon somme des 100 plus gros streams. */
async function catViewers(cats) {
  try {
    const q = "query { " + cats.map((c, i) => `g${i}: game(id: "${String(c.id).replace(/\D/g, "")}") { viewersCount }`).join(" ") + " }";
    const d = await gql({ query: q });
    cats.forEach((c, i) => { const v = d.data && d.data["g" + i] && d.data["g" + i].viewersCount; if (typeof v === "number") c.viewers = v; });
  } catch (e) { log("WARN", "spectateurs des catégories", e.message); }
  const miss = cats.filter(c => c.viewers == null).slice(0, 24);
  await pool(miss, 6, async c => {
    const d = await helix("/streams", { game_id: c.id, first: 100 });
    c.viewers = d.data.reduce((s, x) => s + x.viewer_count, 0);
    c.approx = true;
  });
}
export async function getCategoryStreams(cat, lang) {
  const d = await helix("/streams", { game_id: cat.id, first: 40, language: lang || undefined });
  await fetchUsers(d.data.map(s => s.user_id));
  return d.data.map(s => chFrom(users.get(s.user_id) || { id: s.user_id, login: s.user_login, display_name: s.user_name }, s));
}
export async function getTopFrenchStreams(n = 10) {
  return cached("topfr", 3 * 60000, async () => {
    const d = await helix("/streams", { language: "fr", first: 60, type: "live" });
    await fetchUsers(d.data.map(s => s.user_id));
    const list = d.data.map(s => chFrom(users.get(s.user_id) || { id: s.user_id, login: s.user_login, display_name: s.user_name }, s));
    // "buzz" : on mélange, puis on garde les n plus suivis en spectateurs — évite d'avoir toujours les mêmes géants.
    for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; }
    return list.sort((a, b) => (b.stream.viewers) - (a.stream.viewers)).slice(0, n);
  });
}
export async function getChannelProfile(ch) {
  const [u, fol] = await Promise.all([
    helix("/users", { id: ch.id }),
    helix("/channels/followers", { broadcaster_id: ch.id }).catch(() => null),
  ]);
  const info = u.data[0] || {};
  return {
    id: ch.id, login: info.login || ch.login, name: info.display_name || ch.name,
    avatar: info.profile_image_url || ch.avatar, bio: info.description || "",
    createdAt: info.created_at ? Date.parse(info.created_at) : null,
    followers: fol && fol.total != null ? fol.total : null,
    live: ch.live, stream: ch.stream,
  };
}
export async function getChannelVods(ch, max = 40) {
  const out = []; let cursor;
  do {
    const d = await helix("/videos", { user_id: ch.id, type: "archive", first: 100, after: cursor });
    out.push(...d.data.map(v => vodFrom(v, ch)));
    cursor = d.pagination?.cursor;
  } while (cursor && out.length < max);
  return out;
}
export async function getStream(ch) {
  const d = await helix("/streams", { user_id: ch.id });
  return streamOf(d.data[0]);
}
export async function search(q) {
  const [c, g] = await Promise.all([
    helix("/search/channels", { query: q, first: 12 }),
    helix("/search/categories", { query: q, first: 6 }),
  ]);
  return {
    channels: c.data.map(x => ({ id: x.id, login: x.broadcaster_login, name: x.display_name, avatar: x.thumbnail_url, live: x.is_live,
      stream: x.is_live ? { title: x.title, cat: x.game_name, viewers: null, startedAt: Date.parse(x.started_at) || Date.now(), thumb: "", thumbBig: "" } : null })),
    categories: g.data.map(x => ({ id: x.id, name: x.name, art: img(x.box_art_url, 285, 380) })),
  };
}
