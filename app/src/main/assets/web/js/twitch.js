// Accès à l’API officielle Twitch (Helix) avec votre compte : chaînes suivies, lives, rediffs, clips…
import { json } from "./net.js";
import { store } from "./store.js";
import { CONFIG } from "./config.js";
import { log } from "./log.js";
import { sleep } from "./util.js";

const HELIX = "https://api.twitch.tv/helix";
const SCOPES = "user:read:follows";
let auth = store.get("auth", null);   // { access, refresh, exp }
let me = store.get("me", null);

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
    if (r.status === 200) { saveAuth(r.data); await loadMe(); return true; }
    const m = String(r.data?.message || "");
    if (/slow_down/.test(m)) { dev.interval += 5; continue; }
    if (!/pending/.test(m)) throw new Error("Connexion refusée : " + (m || r.status));
  }
  throw new Error("Le code a expiré");
}
const oauth = params => json("POST", "https://id.twitch.tv/oauth2/token", { headers: FORM, body: form({ client_id: CONFIG.clientId, ...params }) });
function saveAuth(d) { auth = { access: d.access_token, refresh: d.refresh_token, exp: Date.now() + (d.expires_in || 3600) * 1000 }; store.set("auth", auth); }
export function logout() { auth = null; me = null; store.del("auth"); store.del("me"); cache.clear(); }
export const isLogged = () => !!(auth && me);
export const getMe = () => me;

let refreshing = null;
async function refresh() {
  if (!auth?.refresh) throw new Error("Session expirée");
  const r = await oauth({ grant_type: "refresh_token", refresh_token: auth.refresh });
  if (r.status !== 200) { logout(); location.reload(); throw new Error("Session expirée, reconnectez-vous"); }
  saveAuth(r.data);
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
async function loadMe() { const d = await helix("/users"); me = d.data[0]; store.set("me", me); }
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
    return d.data.map((g, i) => ({ id: g.id, name: g.name, art: img(g.box_art_url, 285, 380), rank: i + 1 }));
  });
}
export async function getCategoryStreams(cat, lang) {
  const d = await helix("/streams", { game_id: cat.id, first: 40, language: lang || undefined });
  await fetchUsers(d.data.map(s => s.user_id));
  return d.data.map(s => chFrom(users.get(s.user_id) || { id: s.user_id, login: s.user_login, display_name: s.user_name }, s));
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
