// Obtention des flux vidéo (live, rediff, clip) et blocage des coupures pub.
import { json, request } from "./net.js";
import { store, settings, getUserToken } from "./store.js";
import { log } from "./log.js";

const GQL = "https://gql.twitch.tv/gql";
const WEB_CID = "kimne78kx3ncx6brgo4mv6wki5h1ko"; // identifiant public du lecteur web Twitch
const deviceId = store.get("deviceId") || (() => { const d = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join(""); store.set("deviceId", d); return d; })();

const TOKEN_Q = `query PlaybackAccessToken_Template($login: String!, $isLive: Boolean!, $vodID: ID!, $isVod: Boolean!, $playerType: String!) { streamPlaybackAccessToken(channelName: $login, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isLive) { value signature } videoPlaybackAccessToken(id: $vodID, params: {platform: "web", playerBackend: "mediaplayer", playerType: $playerType}) @include(if: $isVod) { value signature } }`;
const CLIP_Q = `query VideoAccessToken_Clip($slug: ID!) { clip(slug: $slug) { playbackAccessToken(params: {platform: "web", playerBackend: "mediaplayer", playerType: "site"}) { signature value } videoQualities { frameRate quality sourceURL } } }`;

export async function gql(body) {
  const headers = { "Client-ID": WEB_CID, "Device-ID": deviceId, "Content-Type": "text/plain;charset=UTF-8" };
  const tok = getUserToken();                       // votre session, si vous l’avez renseignée
  if (tok) headers["Authorization"] = "OAuth " + tok;
  const r = await json("POST", GQL, { headers, body: JSON.stringify(body) });
  if (r.status !== 200 || !r.data) throw new Error("Twitch refuse la lecture (" + r.status + ")");
  return r.data;
}
async function token({ login, vodId, playerType }) {
  const d = await gql({ operationName: "PlaybackAccessToken_Template", query: TOKEN_Q,
    variables: { isLive: !!login, login: login || "", isVod: !!vodId, vodID: vodId || "", playerType } });
  const t = login ? d.data?.streamPlaybackAccessToken : d.data?.videoPlaybackAccessToken;
  if (!t) {
    const err = d.errors && d.errors[0] && d.errors[0].message;
    if (!getUserToken() && vodId) throw new Error("ABO_REQUIS");
    throw new Error(err ? "Twitch refuse la lecture : " + err : "Jeton de lecture refusé");
  }
  return t;
}
const rnd = () => String(Math.floor(Math.random() * 1e7));

export async function liveMasterUrl(login, playerType = "site") {
  const t = await token({ login, playerType });
  const p = new URLSearchParams({ client_id: WEB_CID, token: t.value, sig: t.signature, allow_source: "true", allow_audio_only: "true",
    fast_bread: "true", p: rnd(), player_backend: "mediaplayer", playlist_include_framerate: "true", reassignments_supported: "true", supported_codecs: "avc1" });
  return `https://usher.ttvnw.net/api/channel/hls/${encodeURIComponent(login.toLowerCase())}.m3u8?${p}`;
}
export async function vodMasterUrl(id) {
  const t = await token({ vodId: id, playerType: "site" });
  const p = new URLSearchParams({ client_id: WEB_CID, nauth: t.value, nauthsig: t.signature, allow_source: "true", allow_audio_only: "true",
    p: rnd(), player_backend: "mediaplayer", playlist_include_framerate: "true", supported_codecs: "avc1" });
  return `https://usher.ttvnw.net/vod/${id}.m3u8?${p}`;
}
export async function clipUrl(slug) {
  const d = await gql({ operationName: "VideoAccessToken_Clip", query: CLIP_Q, variables: { slug } });
  const c = d.data?.clip;
  if (!c?.videoQualities?.length) throw new Error("Clip indisponible");
  const q = [...c.videoQualities].sort((a, b) => (+b.quality) - (+a.quality) || b.frameRate - a.frameRate)[0];
  return `${q.sourceURL}?sig=${encodeURIComponent(c.playbackAccessToken.signature)}&token=${encodeURIComponent(c.playbackAccessToken.value)}`;
}

/* ---------- blocage des pubs ----------
 * Twitch insère les pubs directement dans la playlist vidéo. Les segments de live sont titrés « live »,
 * les segments de pub ont un autre titre. Pendant une coupure :
 *   1. on demande le même live via un autre type de lecteur (souvent sans pub) et on l’utilise à la place ;
 *   2. sinon on retire les segments de pub : l’image se fige quelques secondes puis le live reprend.
 * Si Twitch change sa méthode, c’est ce fichier qu’il faudra mettre à jour.
 */
const BACKUP_TYPES = ["embed", "popout", "autoplay"];
const isAdLine = l => l.startsWith("#EXTINF") && !l.includes(",live");
export function hasAds(txt) {
  return txt.includes("stitched-ad") || txt.includes("X-TV-TWITCH-AD") || txt.split("\n").some(isAdLine);
}
export function stripAds(txt) {
  const L = txt.split("\n"), out = [];
  for (let i = 0; i < L.length; i++) {
    const l = L[i];
    if (isAdLine(l)) { while (i + 1 < L.length && L[i + 1].startsWith("#")) i++; i++; continue; }
    if (l.startsWith("#EXT-X-TWITCH-PREFETCH")) continue;
    out.push(l);
  }
  return out.join("\n");
}
function absolutize(txt, base) {
  return txt.split("\n").map(l => l && !l.startsWith("#") && !/^https?:/.test(l) ? new URL(l, base).href : l).join("\n");
}
function pickVariant(master, base, want) {
  const L = master.split("\n"), vars = [];
  for (let i = 0; i < L.length; i++) {
    if (!L[i].startsWith("#EXT-X-STREAM-INF")) continue;
    const r = L[i].match(/RESOLUTION=\d+x(\d+)/), f = L[i].match(/FRAME-RATE=([\d.]+)/);
    if (r && L[i + 1]) vars.push({ h: +r[1], fr: f ? +f[1] : 30, url: new URL(L[i + 1], base).href });
  }
  if (!vars.length) return null;
  vars.sort((a, b) => Math.abs(a.h - want.height) - Math.abs(b.h - want.height) || Math.abs(a.fr - want.fr) - Math.abs(b.fr - want.fr));
  return vars[0].url;
}

export class AdGuard {
  constructor(login, { onStart, onEnd } = {}) {
    this.login = login; this.onStart = onStart; this.onEnd = onEnd;
    this.inAd = false; this.skipped = 0; this.backup = null; this.mode = "";
  }
  async process(txt, want) {
    if (settings.adblock !== 0) return txt;
    if (!hasAds(txt)) {
      if (this.inAd) { this.inAd = false; this.backup = null; this.onEnd && this.onEnd(); }
      return txt;
    }
    if (!this.inAd) { this.inAd = true; this.skipped++; log("INFO", "coupure pub détectée"); }
    const order = this.backup ? [this.backup.type, ...BACKUP_TYPES.filter(t => t !== this.backup.type)] : BACKUP_TYPES;
    for (const type of order) {
      try {
        if (!this.backup || this.backup.type !== type) {
          const m = await liveMasterUrl(this.login, type);
          const r = await request("GET", m);
          const v = r.status === 200 && pickVariant(r.body, m, want);
          if (!v) continue;
          this.backup = { type, url: v };
        }
        const r2 = await request("GET", this.backup.url);
        if (r2.status === 200 && r2.body.includes("#EXTINF") && !hasAds(r2.body)) {
          this.mode = "backup"; this.onStart && this.onStart(this.mode);
          return absolutize(r2.body, this.backup.url);
        }
        this.backup = null;
      } catch (e) { log("WARN", "flux de secours " + type, e.message); this.backup = null; }
    }
    this.mode = "strip"; this.onStart && this.onStart(this.mode);
    return stripAds(txt);
  }
}

/** Chargeur de playlists pour hls.js qui fait passer chaque playlist par l’AdGuard. */
export function makeLoader(guard, getHls) {
  const Base = window.Hls.DefaultConfig.loader;
  return class AdFilterLoader extends Base {
    load(context, config, callbacks) {
      if (context.type === "level" || context.type === "manifest") {
        const ok = callbacks.onSuccess;
        callbacks = Object.assign({}, callbacks, {
          onSuccess: (response, stats, ctx, net) => {
            if (typeof response.data !== "string" || !response.data.includes("#EXTINF")) return ok(response, stats, ctx, net);
            const lv = getHls()?.levels?.[ctx.level] || {};
            guard.process(response.data, { height: lv.height || 1080, fr: lv.frameRate || 60 })
              .then(txt => { response.data = txt; ok(response, stats, ctx, net); })
              .catch(() => ok(response, stats, ctx, net));
          },
        });
      }
      super.load(context, config, callbacks);
    }
  };
}
