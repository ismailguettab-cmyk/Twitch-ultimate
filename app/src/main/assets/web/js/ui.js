// Écrans de l’app : accueil, aujourd’hui, suivis, catégories, recherche, réglages, connexion.
import { $, $$, h, esc, hm, durTxt, agoTxt, clk, kf, thumbStyle, ava, gradBg, hueOf } from "./util.js";
import { settings, saveSettings, favs, reminders, toggleReminder, continueList, progressOf, HOME_ROWS, homeLayout, saveHomeLayout, getUserToken, setUserToken } from "./store.js";
import { CONFIG, DEMO } from "./config.js";
import { log } from "./log.js";
import { restoreFocus } from "./nav.js";
import { previewFocus, previewBlur } from "./preview.js";

let A; // l’objet app (voir app.js)
export function bindUI(app) { A = app; }

export const ICON = {
  search: "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-4.5-4.5\"/>",
  home: "<path d=\"M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z\"/>",
  homeOff: "<rect x=\"3\" y=\"4\" width=\"18\" height=\"16\" rx=\"4\"/><path d=\"M10 9.5v5l4.5-2.5z\" fill=\"currentColor\" stroke=\"none\"/>",
  today: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3.5 2\"/>",
  vod: "<rect x=\"2.5\" y=\"5\" width=\"19\" height=\"14\" rx=\"3\"/><path d=\"M10 9.5v5l4.5-2.5z\" fill=\"currentColor\" stroke=\"none\"/><path d=\"M2.5 9h19\"/><path d=\"M6 5 7.5 9M11 5l1.5 4M16 5l1.5 4\"/>",
  heart: "<path d=\"M12 20s-7-4.4-9.2-8.6C1.2 8.2 3.2 4.5 6.8 4.5c2 0 3.4 1 5.2 3 1.8-2 3.2-3 5.2-3 3.6 0 5.6 3.7 4 6.9C19 15.6 12 20 12 20z\"/>",
  grid: "<rect x=\"3\" y=\"3\" width=\"7.5\" height=\"7.5\" rx=\"2\"/><rect x=\"13.5\" y=\"3\" width=\"7.5\" height=\"7.5\" rx=\"2\"/><rect x=\"3\" y=\"13.5\" width=\"7.5\" height=\"7.5\" rx=\"2\"/><rect x=\"13.5\" y=\"13.5\" width=\"7.5\" height=\"7.5\" rx=\"2\"/>",
  set: "<path d=\"M4 7h10M18 7h2M4 17h2M10 17h10\"/><circle cx=\"16\" cy=\"7\" r=\"2.5\"/><circle cx=\"8\" cy=\"17\" r=\"2.5\"/>",
  github: "<path d=\"M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21\"/>",
};
export const PLAY = "<svg viewBox=\"0 0 24 24\"><path d=\"M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z\"/></svg>";
export const PAUSE = "<svg viewBox=\"0 0 24 24\"><rect x=\"5\" y=\"4\" width=\"5\" height=\"16\" rx=\"1.5\"/><rect x=\"14\" y=\"4\" width=\"5\" height=\"16\" rx=\"1.5\"/></svg>";
export const CHATI = "<svg viewBox=\"0 0 24 24\"><path d=\"M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z\"/></svg>";

/* ---------- menu latéral ---------- */
function vodBadge(c) {
  // Micro-vignette indiquant si les rediffs de la chaîne sont accessibles (publiques / abonné) ou verrouillées.
  const hasVod = A.D.vods && A.D.vods.some(v => v.ch.login === c.login);
  const locked = c.subOnlyVods;   // marqué si Twitch a refusé une rediff réservée
  if (locked) return `<span class="vbadge locked" title="Rediffusions réservées aux abonnés">🔒 VOD</span>`;
  if (hasVod) return `<span class="vbadge ok" title="Rediffusions disponibles">● VOD</span>`;
  return "";
}
function liveBadge() { return `<span class="ph-live"><span class="lp-eq"><i></i><i></i><i></i></span>En live</span>`; }
const NAVS = [["search", "Recherche", "search"], ["home", "Lives suivis", "home"], ["today", "VOD", "vod"], ["following", "Suivis", "heart"], ["cats", "Catégories", "grid"], ["github", "GitHub", "github"], ["settings", "Réglages", "set"]];
export function renderSide(view) {
  const side = $("#side");
  if (!side.children.length) {
    for (const [id, label, ic] of NAVS) {
      const iconHtml = id === "home"
        ? `<span class="navic" id="navic-home"><svg class="ic-off" viewBox="0 0 24 24">${ICON.homeOff}</svg><span class="ic-on"><i></i><i></i><i></i></span></span>`
        : `<svg viewBox="0 0 24 24">${ICON[ic]}</svg>`;
      const e = h("div", "nav focusable", `${iconHtml}<span>${label}</span>`);
      e.dataset.nav = id; e.dataset.key = "nav:" + id;
      e._enter = () => A.show(id, { fromSide: true });
      side.appendChild(e);
    }
  }
  const anyLive = A.lives().length > 0;
  const nic = $("#navic-home");
  if (nic) nic.classList.toggle("live", anyLive);
  const n = A.D.vods.length;
  for (const e of $$(".nav", side)) {
    const id = e.dataset.nav;
    e.classList.toggle("active", view === id || (id === "cats" && view === "cat") || (id === "following" && view === "prof") || (id === "settings" && (view === "homecfg" || view === "subs")));
    let b = $(".bubble", e);
    if (id === "today") { if (n) { if (!b) { b = h("em", "bubble"); e.appendChild(b); } b.textContent = n; } else if (b) b.remove(); }
  }
}

/* ---------- cartes ---------- */
const star = c => favs.has(c.login) ? " <span class=\"star\">★</span>" : "";
export function liveCard(c) {
  const s = c.stream || {};
  const e = h("div", "card focusable", `<div class="thumb" style="${thumbStyle(s.thumb, c.login)}"><span class="b-live">En direct</span>${vodBadge(c)}${s.viewers != null ? `<span class="t-meta">${kf(s.viewers)} spectateurs</span>` : ""}</div>
    <div class="card-info">${ava(c, 56, false)}<div class="ci"><div class="c-name">${esc(c.name)}${star(c)}</div><div class="c-title">${esc(s.title)}</div><div class="c-sub">${esc(s.cat || "")}</div></div></div>`);
  e.dataset.key = "live:" + c.login;
  e._enter = () => A.openPlayer({ ch: c, mode: "live" });
  e._focus = () => previewFocus(e.querySelector(".thumb"), c);
  e._blur = previewBlur;
  return e;
}
export function vodCard(v) {
  const w = v.watched ?? (v.sec ? progressOf(v.id) / v.sec : 0);
  const e = h("div", "card focusable", `<div class="thumb" style="${thumbStyle(v.thumb, v.ch.login + v.id)}"><span class="b-vod">Rediffusion</span><span class="t-meta">${durTxt(v.sec)}, fini ${agoTxt(v.end)}</span>${w > 0 ? `<div class="prog"><i style="width:${Math.min(100, w * 100)}%"></i></div>` : ""}</div>
    <div class="card-info">${ava(v.ch, 56, false)}<div class="ci"><div class="c-name">${esc(v.ch.name)}</div><div class="c-title">${esc(v.title)}</div><div class="c-sub">${w > 0 ? "Reprendre, live" : "Live"} de ${hm(v.start)} à ${hm(v.end)}</div></div></div>`);
  e.dataset.key = "vod:" + v.id;
  e._enter = () => A.openPlayer({ ch: v.ch, mode: "vod", vod: v });
  return e;
}
export function clipCard(x) {
  const e = h("div", "card clip focusable", `<div class="thumb" style="${thumbStyle(x.thumb, x.id)}"><span class="b-vod">Clip</span><span class="b-q">0:${String(x.sec).padStart(2, "0")}</span><span class="t-meta">${kf(x.views)} vues</span></div>
    <div class="card-info">${ava(x.ch, 48, false)}<div class="ci"><div class="c-name">${esc(x.ch.name)}</div><div class="c-title">${esc(x.title)}</div></div></div>`);
  e.dataset.key = "clip:" + x.id;
  e._enter = () => A.openPlayer({ ch: x.ch, mode: "clip", clip: x });
  return e;
}
export function catCard(c) {
  const inner = c.art
    ? `<div class="art" style="background-image:url(\x27${esc(c.art)}\x27),${gradBg(hueOf(c.name), 3)}"></div>`
    : `<div class="art" style="background:${gradBg(hueOf(c.name), c.name.length)}"><em>${c.glyph || ""}</em></div>`;
  const rank = c.rank ? `<span class="cat-rank">${c.rank}</span>` : "";
  const viewers = c.viewers != null ? `<div class="cv"><span class="dot sm"></span>${kf(c.viewers)} spectateurs</div>` : "";
  const e = h("div", "cat focusable", `<div class="cat-art">${inner}${rank}</div><div class="cm"><span class="cn">${esc(c.name)}</span>${viewers}</div>`);
  e.dataset.key = "cat:" + c.id;
  e._enter = () => A.openCategory(c);
  return e;
}
function chStatus(c) {
  if (c.live) return { t: `En direct, ${kf(c.stream?.viewers)}`, cls: "l", short: "En direct" };
  const v = A.D.vods.find(x => x.ch.login === c.login);
  if (v) return { t: `Rediff dispo, ${agoTxt(v.end)}`, cls: "v", short: "Rediff dispo" };
  return { t: "Hors ligne", cls: "", short: "Hors ligne" };
}
function avCard(c) {
  const st = chStatus(c);
  const e = h("div", "avc focusable", `${ava(c, 140)}<div class="n">${esc(c.name)}</div><div class="s ${st.cls}">${st.short}</div>`);
  e.dataset.key = "av:" + c.login;
  e._enter = () => A.openChannel(c);
  return e;
}
function schedCard(x) {
  const e = h("div", "sch focusable");
  const today = new Date(x.at).toDateString() === new Date().toDateString();
  const draw = () => {
    const on = reminders.has(x.id);
    e.classList.toggle("on", on);
    e.innerHTML = `<div class="when"><b>${hm(x.at)}</b><span>${today ? "Aujourd’hui" : "Demain"}</span></div><div class="w"><div class="c-name">${esc(x.ch.name)}</div><div class="c-title">${esc(x.title)}</div><div class="rem">${on ? "✓ Rappel activé" : "OK pour me rappeler"}</div></div>`;
  };
  draw();
  e.dataset.key = "sch:" + x.id;
  e._enter = () => {
    const on = toggleReminder(x.id);
    draw();
    A.toast(`${ava(x.ch, 64, false)}<div><b>${on ? "Rappel activé" : "Rappel retiré"}</b><small>${on ? `On vous prévient quand ${esc(x.ch.name)} lance son live (prévu à ${hm(x.at)}).` : "Vous ne serez pas prévenu pour ce live."}</small></div>`, 3500);
  };
  return e;
}
function row(title, items, extra = "", id = "") {
  const r = h("section", "row");
  r.dataset.unit = "row";
  if (id) r.id = id;
  r.innerHTML = `<h2>${title}${extra}</h2>`;
  const t = h("div", "track");
  t.dataset.scroll = "x";
  items.forEach(i => t.appendChild(i));
  r.appendChild(t);
  return r;
}
function btn(label, cls, fn, key, icon = "") {
  const b = h("div", "btn focusable " + cls, icon + esc(label));
  b._enter = fn; b.dataset.key = key;
  return b;
}

/* ---------- Lives suivis (page d’accueil) ---------- */
// Grande carte de live avec aperçu vidéo + son au survol prolongé. Utilisée sur la page Lives suivis.
function bigLiveCard(c, suggested = false) {
  const s = c.stream || {};
  const since = s.startedAt ? durTxt((Date.now() - s.startedAt) / 1000) : "";
  // Miniature 640 × 360 : la carte fait ~550 px de large, la version 1280 × 720 quadruplait la mémoire pour rien.
  const e = h("div", "lcard focusable", `<div class="thumb" style="${thumbStyle(s.thumb || s.thumbBig, c.login)}">
      <span class="b-live">En direct</span>${vodBadge(c)}${s.viewers != null ? `<span class="t-meta"><span class="dot sm"></span>${kf(s.viewers)}</span>` : ""}${since ? `<span class="b-since">${since}</span>` : ""}</div>
    <div class="card-info">${ava(c, 64, false)}<div class="ci"><div class="c-name">${esc(c.name)}${favs.has(c.login) ? " <span class=\"star\">★</span>" : ""}</div>
      <div class="c-title">${esc(s.title || "")}</div><div class="c-sub">${esc(s.cat || "")}${suggested && s.viewers != null ? " · " + kf(s.viewers) + " spectateurs" : ""}</div></div></div>`);
  e.dataset.key = "live:" + c.login;
  e._enter = () => A.openPlayer({ ch: c, mode: "live" });
  e._focus = () => previewFocus(e.querySelector(".thumb"), c);
  e._blur = previewBlur;
  return e;
}
export function renderHome() {
  const sc = $("#home-scroll"), D = A.D, lives = A.lives();
  sc.innerHTML = "";
  if (lives.length) {
    sc.appendChild(h("div", "lh-head", `<h1 class="page-h">Lives suivis</h1><p class="page-sub">${lives.length} ${lives.length > 1 ? "chaînes que vous suivez sont en direct" : "chaîne que vous suivez est en direct"}.</p>`));
    const grid = h("div", "lgrid");
    lives.forEach(c => grid.appendChild(bigLiveCard(c)));
    sc.appendChild(grid);
  } else {
    sc.appendChild(h("div", "lh-head", `<h1 class="page-h">Personne en direct</h1><p class="page-sub">Aucune de vos chaînes suivies n’est en live. En attendant, voici ce qui buzze en France en ce moment.</p>`));
    const grid = h("div", "lgrid");
    if (D.topFr && D.topFr.length) D.topFr.forEach(c => grid.appendChild(bigLiveCard(c, true)));
    else grid.appendChild(h("p", "loading-row", "<span class=\"spin\"></span>Chargement des lives du moment…"));
    sc.appendChild(grid);
  }
  sc.appendChild(h("div", "spacer"));
}

/* ---------- personnaliser l’accueil ---------- */
export function renderHomeCfg() {
  const pg = $("#hc-page"), L = homeLayout();
  pg.innerHTML = `<h1 class="page-h">Personnaliser l’accueil</h1><p class="page-sub">OK sur une rangée pour l’afficher ou la masquer. Les flèches ▲ ▼ à droite changent son ordre.</p><div class="hc" id="hc"></div>`;
  const box = $("#hc");
  const redraw = key => { saveHomeLayout(L); A.S.homeDirty = true; renderHomeCfg(); restoreFocus($("#v-homecfg"), key); };
  L.forEach((it, i) => {
    const label = HOME_ROWS.find(r => r[0] === it.id)[1];
    const r = h("div", "hc-row" + (it.on ? " on" : ""));
    const t = h("div", "hc-t focusable", `<span class="sw"><i></i></span><span class="hc-l">${label}</span><span class="hc-s">${it.on ? "Affichée" : "Masquée"}</span>`);
    t.dataset.key = "hc:" + it.id;
    t._enter = () => { it.on = !it.on; redraw("hc:" + it.id); };
    const up = h("div", "hc-m focusable" + (i === 0 ? " off" : ""), "▲");
    up.dataset.key = "hcu:" + it.id;
    up._enter = () => { if (i === 0) return; [L[i - 1], L[i]] = [L[i], L[i - 1]]; redraw("hcu:" + it.id); };
    const dn = h("div", "hc-m focusable" + (i === L.length - 1 ? " off" : ""), "▼");
    dn.dataset.key = "hcd:" + it.id;
    dn._enter = () => { if (i === L.length - 1) return; [L[i + 1], L[i]] = [L[i], L[i + 1]]; redraw("hcd:" + it.id); };
    r.append(t, up, dn);
    box.appendChild(r);
  });
}

/* ---------- aujourd’hui ---------- */
// Liste des lives des dernières 24 h, regroupés (en direct / aujourd’hui / hier), avec un grand aperçu à droite.
export function renderToday() {
  const pg = $("#today-page"), D = A.D;
  const lives = A.lives().map(c => ({ ch: c, title: c.stream.title, start: c.stream.startedAt, end: Date.now(), sec: (Date.now() - c.stream.startedAt) / 1000, thumb: c.stream.thumb, live: true, viewers: c.stream.viewers, cat: c.stream.cat }));
  const todayStr = new Date().toDateString();
  const groups = [
    ["Ratés aujourd’hui", D.vods.filter(v => new Date(v.end).toDateString() === todayStr)],
    ["Ratés hier", D.vods.filter(v => new Date(v.end).toDateString() !== todayStr)],
    ["Encore en direct", lives],
  ].filter(g => g[1].length);
  const off = D.followed.filter(c => !c.live && !D.vods.some(v => v.ch.login === c.login));
  pg.innerHTML = `<div class="td-head"><h1 class="page-h">VOD</h1><p class="page-sub">${D.vods.length ? `Vous avez raté ${D.vods.length} live${D.vods.length > 1 ? "s" : ""} ces dernières 24 heures. Choisissez-en un pour lancer la rediffusion.` : "Aucun live raté ces dernières 24 heures."}${D.loadingExtra ? " Recherche en cours…" : ""}</p></div>
    <div class="td"><div class="td-list" id="td-list" data-scroll="y" data-mode="near"></div><div class="td-panel" id="td-panel"></div></div>`;
  const list = $("#td-list");
  if (!groups.length) { $("#td-panel").innerHTML = "<p class=\"empty\">Rien à rattraper pour le moment.</p>"; return; }
  const W0 = Date.now() - 24 * 3600e3, span = 24 * 3600e3, pct = t => Math.max(0, Math.min(100, (t - W0) / span * 100));
  for (const [title, items] of groups) {
    list.appendChild(h("div", "td-g", esc(title)));
    for (const s of items) {
      const pos = s.live ? 0 : progressOf(s.id);
      const left = pct(s.start), width = Math.max(1.5, pct(s.end) - left);
      const it = h("div", "td-item focusable" + (s.live ? " is-live" : ""), `${ava(s.ch, 64, false)}
        <div class="td-main"><div class="td-name">${esc(s.ch.name)}${s.live ? "<span class=\"td-tag live\">En direct</span>" : pos ? "<span class=\"td-tag\">Commencé</span>" : "<span class=\"td-tag new\">Nouveau</span>"}</div>
        <div class="td-title">${esc(s.title)}</div>
        <div class="td-meta">${s.live ? `depuis ${hm(s.start)}, ${kf(s.viewers)} spectateurs` : `${hm(s.start)} à ${hm(s.end)}, ${durTxt(s.sec)}`}</div>
        <div class="td-strip"><i style="left:${left}%;width:${width}%"></i>${pos ? `<b style="left:${left}%;width:${width * pos / s.sec}%"></b>` : ""}</div></div>
        <div class="td-when">${s.live ? "" : agoTxt(s.end).replace("il y a ", "")}</div>`);
      it.dataset.key = "td:" + (s.live ? "live:" + s.ch.login : s.id);
      it._focus = () => panel(s);
      it._enter = () => s.live ? A.openPlayer({ ch: s.ch, mode: "live" }) : A.openPlayer({ ch: s.ch, mode: "vod", vod: s });
      list.appendChild(it);
    }
  }
  if (off.length) list.appendChild(h("p", "off-note", `Pas de live aujourd’hui : ${off.slice(0, 20).map(c => esc(c.name)).join(", ")}${off.length > 20 ? ` et ${off.length - 20} autres` : ""}.`));
}
function panel(s) {
  const d = $("#td-panel");
  if (!d) return;
  const pos = s.live ? 0 : progressOf(s.id);
  d.innerHTML = `<div class="tp-thumb" style="${thumbStyle(s.thumb, s.ch.login + (s.id || ""))}"><span class="${s.live ? "b-live" : "b-vod"}">${s.live ? "En direct" : "Rediffusion"}</span><span class="t-meta">${durTxt(s.sec)}</span>${pos ? `<div class="prog"><i style="width:${pos / s.sec * 100}%"></i></div>` : ""}</div>
    <div class="tp-name">${ava(s.ch, 52, false)}${esc(s.ch.name)}</div>
    <h2 class="tp-title">${esc(s.title)}</h2>
    <div class="tp-meta">${s.live ? `En direct depuis ${hm(s.start)}${s.cat ? `, ${esc(s.cat)}` : ""}` : `Diffusé de ${hm(s.start)} à ${hm(s.end)}, terminé ${agoTxt(s.end)}`}</div>
    <div class="tp-cta">${PLAY}${s.live ? "OK pour rejoindre le direct" : pos ? `OK pour reprendre à ${clk(pos)}` : "OK pour regarder la rediffusion"}</div>`;
}

/* ---------- suivis ---------- */
function tile(c) {
  const status = c.live
    ? `<div class="s live"><span class="live-pill"><span class="lp-eq"><i></i><i></i><i></i></span>En live</span></div><div class="s2">${esc(c.stream.cat || "")}</div>`
    : `<div class="s">Accéder au profil</div>`;
  const e = h("div", "tile focusable" + (c.live ? " is-live" : ""), `${ava(c, 120)}<div class="n">${esc(c.name)}${star(c)}</div>${status}`);
  e.dataset.key = "tile:" + c.login;
  e._enter = () => c.live ? A.channelChoice(c, e) : A.openProfile(c);
  return e;
}
export function renderFollowing() {
  const pg = $("#fol-page"), D = A.D, live = A.lives();
  const off = D.followed.filter(c => !c.live).sort((a, b) => (favs.has(b.login) - favs.has(a.login)) || (D.vods.some(v => v.ch.login === b.login) - D.vods.some(v => v.ch.login === a.login)) || a.name.localeCompare(b.name));
  pg.innerHTML = `<h1 class="page-h">Vos chaînes suivies</h1><p class="page-sub">${live.length} en direct sur ${D.followed.length}. Les favoris (★) passent en premier.</p>
    ${live.length ? "<div class=\"sect\">En direct</div><div class=\"grid g5\" id=\"g-live\"></div>" : ""}${off.length ? "<div class=\"sect\">Toutes vos chaînes</div><div class=\"grid g5\" id=\"g-off\"></div>" : ""}`;
  if (live.length) live.forEach(c => $("#g-live").appendChild(tile(c)));
  if (off.length) off.slice(0, 120).forEach(c => $("#g-off").appendChild(tile(c)));
}

/* ---------- profil d’un streamer ---------- */
export async function renderProfile(ch) {
  const pg = $("#prof-page");
  pg.innerHTML = `<div class="prof-head" id="prof-head"><span class="spin big"></span></div><div class="prof-body" id="prof-body"></div>`;
  let info = ch;
  try { info = await A.P.getChannelProfile(ch); } catch (e) { log("WARN", e.message); }
  if (!pg.isConnected || A.S.prof !== ch) return;
  const since = info.createdAt ? new Date(info.createdAt).getFullYear() : null;
  $("#prof-head").innerHTML = `<div class="ph-bg" style="background:${gradBg(hueOf(info.login), 5)}"></div>
    <div class="ph-main">${ava({ ...info, live: ch.live }, 180, true)}
      <div class="ph-info"><h1 class="ph-name">${esc(info.name)}${ch.live ? liveBadge() : ""}</h1>
        <div class="ph-stats">${info.followers != null ? `<span><b>${kf(info.followers)}</b> abonnés</span>` : ""}${since ? `<span>Sur Twitch depuis <b>${since}</b></span>` : ""}</div>
        ${info.bio ? `<p class="ph-bio">${esc(info.bio)}</p>` : ""}
        <div class="btns" id="ph-btns"></div></div></div>`;
  const b = $("#ph-btns");
  if (ch.live) b.appendChild(btn("Regarder le live", "primary", () => A.openPlayer({ ch, mode: "live" }), "ph:live", PLAY));
  $("#prof-body").innerHTML = `<div class="sect">Rediffusions</div><div class="grid g4" id="prof-vods"><p class="loading-row"><span class="spin"></span>Chargement des rediffusions…</p></div>`;
  let vods = [];
  try { vods = await A.P.getChannelVods(ch); } catch (e) { log("WARN", e.message); }
  if (!pg.isConnected || A.S.prof !== ch) return;
  const g = $("#prof-vods");
  g.innerHTML = vods.length ? "" : "<p class=\"empty\">Cette chaîne n’a aucune rediffusion disponible.</p>";
  vods.forEach(v => g.appendChild(vodCard(v)));
  restoreFocus($("#v-prof"), ch.live ? "ph:live" : null);
}

/* ---------- catégories ---------- */
export function renderCats() {
  const pg = $("#cats-page");
  pg.innerHTML = `<h1 class="page-h">Catégories populaires</h1><p class="page-sub">Classées par nombre de spectateurs en ce moment sur Twitch.</p><div class="grid g6" id="g-cats"></div>`;
  A.D.cats.forEach(c => $("#g-cats").appendChild(catCard(c)));
}
let catFilter = "";   // "" = international, "fr" = français
export async function renderCat(cat) {
  const pg = $("#cat-page");
  if (A.S.catNew) { catFilter = settings.lang === 1 ? "fr" : ""; A.S.catNew = false; }
  pg.innerHTML = `<h1 class="page-h">${esc(cat.name)}</h1>
    <div class="cat-head"><p class="page-sub">${cat.viewers != null ? `${kf(cat.viewers)} spectateurs en ce moment. ` : ""}Classés par nombre de spectateurs.</p>
    <div class="cat-filter"><div class="cf-opt focusable${catFilter === "" ? " on" : ""}" data-key="cf:all">International</div><div class="cf-opt focusable${catFilter === "fr" ? " on" : ""}" data-key="cf:fr">Français</div></div></div>
    <div class="grid g4" id="g-cat"><p class="loading-row"><span class="spin"></span>Chargement…</p></div>`;
  $(".cf-opt[data-key=cf\\:all]", pg)._enter = () => { if (catFilter !== "") { catFilter = ""; renderCat(cat); A.focusKey("cf:all"); } };
  $(".cf-opt[data-key=cf\\:fr]", pg)._enter = () => { if (catFilter !== "fr") { catFilter = "fr"; renderCat(cat); A.focusKey("cf:fr"); } };
  try {
    const list = await A.P.getCategoryStreams(cat, catFilter);
    if (!pg.isConnected || A.S.cat !== cat) return;
    const g = $("#g-cat");
    g.innerHTML = list.length ? "" : `<p class="empty">Personne ${catFilter === "fr" ? "en français " : ""}n’est en direct dans cette catégorie pour le moment.</p>`;
    list.forEach(c => g.appendChild(liveCard(c)));
  } catch (e) {
    log("ERR", e);
    $("#g-cat").innerHTML = `<p class="empty">Impossible de charger cette catégorie. ${esc(e.message)}</p>`;
  }
}

/* ---------- recherche ---------- */
let Q = "", qTimer = null, qSeq = 0;
export function renderSearch() {
  const pg = $("#search-page");
  pg.innerHTML = `<h1 class="page-h">Recherche</h1><p class="page-sub">Tapez le nom d’une chaîne. Les résultats s’affichent au fur et à mesure.</p>
    <div class="srch"><div class="kb"><div class="sbox" id="sbox"></div><div class="kgrid" id="kgrid"></div></div><div class="sres" id="sres" data-scroll="y" data-mode="near"></div></div>`;
  const g = $("#kgrid");
  // Clavier en lignes régulières (7 colonnes). dataset.row borne la navigation verticale au clavier.
  [..."abcdefghijklmnopqrstuvwxyz0123456789"].forEach(ch => {
    const k = h("div", "key focusable", ch);
    k.dataset.key = "k:" + ch; k.dataset.kb = "1";
    k._enter = () => typeQ(ch);
    g.appendChild(k);
  });
  const sp = h("div", "key wide focusable", "Espace"); sp.dataset.key = "k:sp"; sp.dataset.kb = "1"; sp._enter = () => typeQ(" "); g.appendChild(sp);
  const del = h("div", "key wide focusable", "Effacer"); del.dataset.key = "k:del"; del.dataset.kb = "1"; del._enter = () => backQ(); g.appendChild(del);
  updSearch();
}
export function typeQ(ch) { if (Q.length < 30) Q += ch; updSearch(); }
export function backQ() { if (!Q) return false; Q = Q.slice(0, -1); updSearch(); return true; }
function updSearch() {
  const b = $("#sbox");
  if (!b) return;
  b.innerHTML = Q ? `<span>${esc(Q).replace(/ /g, "&nbsp;")}</span><span class="cur"></span>` : "<span class=\"cur\"></span><span class=\"ph\">Nom d’une chaîne</span>";
  clearTimeout(qTimer);
  const q = Q.trim().toLowerCase();
  const r = $("#sres");
  if (q.length < 2) { r.innerHTML = "<div class=\"sres-hint\">Commencez à taper pour voir des chaînes.</div>"; return; }
  r.classList.add("searching");
  qTimer = setTimeout(async () => {
    const my = ++qSeq;
    try {
      const res = await A.P.search(q);
      if (my !== qSeq) return;
      r.classList.remove("searching");
      showResults(res.channels);
    } catch (e) { log("ERR", e); if (my === qSeq) r.classList.remove("searching"); }
  }, 350);
}
function showResults(chans) {
  const r = $("#sres");
  if (!r) return;
  r.innerHTML = "";
  if (!chans.length) { r.innerHTML = `<p class="empty">Aucune chaîne pour « ${esc(Q.trim())} ».</p>`; return; }
  chans.forEach((c, i) => {
    const s = c.stream || {};
    const live = c.live;
    const sub = live
      ? `<span class="rd-game">${esc(s.cat || "Sans catégorie")}</span><span class="rd-sep">·</span><span class="rd-since">${s.startedAt ? "en live depuis " + durTxt((Date.now() - s.startedAt) / 1000) : "en direct"}</span>`
      : "<span class=\"rd-off\">Hors ligne</span>";
    const vw = live && s.viewers != null ? `<div class="rd-vw"><span class="dot sm"></span>${kf(s.viewers)}<small>spectateurs</small></div>` : "";
    const e = h("div", "ritem focusable" + (live ? " is-live" : ""), `${ava(c, 72)}
      <div class="rd-main"><div class="rd-name">${esc(c.name)}${live ? "<span class=\"rd-badge\">EN DIRECT</span>" : ""}</div><div class="rd-meta">${sub}</div></div>${vw}`);
    e.dataset.key = "r:" + c.login;
    e.dataset.zone = "res";
    e.style.setProperty("--d", (i * 0.03) + "s"); // petite cascade d’apparition
    e._enter = () => A.openChannel(c);
    r.appendChild(e);
  });
}

/* ---------- GitHub du projet ---------- */
const GITHUB_URL = "https://github.com/ismailguettab-cmyk/Twitch-ultimate/";
export function renderGithub() {
  const pg = $("#gh-page");
  pg.innerHTML = `<div class="gh"><div class="gh-ic"><svg viewBox="0 0 24 24">${ICON.github}</svg></div>
    <h1 class="page-h">Voici mon GitHub</h1>
    <p class="page-sub">${esc(GITHUB_URL.replace("https://", ""))}</p><div class="btns" id="gh-btns"></div></div>`;
  $("#gh-btns").appendChild(btn("Oui, ouvrir mon GitHub", "primary", openGithub, "gh:open"));
}
function openGithub() {
  if (window.Android && window.Android.openUrl) { if (!window.Android.openUrl(GITHUB_URL)) A.toast("<div><b>Ouverture impossible</b></div>", 3000); }
  else window.open(GITHUB_URL, "_blank");   // navigateur (mode démo)
}

/* ---------- réglages ---------- */
export const SROWS = [
  ["adblock", "Blocage des pubs", "Les coupures pub sont détectées et ignorées : le live continue.", ["Activé", "Désactivé"]],
  ["quality", "Qualité par défaut", "Source : la meilleure qualité proposée par la chaîne, souvent 1080p60.", ["Source", "Auto"]],
  ["lowLat", "Mode faible latence", "Réduit le retard du direct pour réagir avec le chat.", ["Désactivé", "Activé"]],
  ["chatPos", "Position du chat", "Le chat s’affiche par-dessus l’image, la vidéo reste en plein écran.", ["À droite", "À gauche"]],
  ["chatStyle", "Fond du chat", "Transparent pour voir le jeu à travers, sombre pour mieux lire.", ["Transparent", "Sombre"]],
  ["chatSize", "Taille du texte du chat", "Pensé pour être lu depuis le canapé.", ["Normale", "Grande", "Très grande"]],
  ["alerts", "Alertes de live", "Une notification quand une chaîne suivie démarre.", ["Toutes les chaînes", "Favoris seulement", "Désactivées"]],
  ["resume", "Reprise des rediffusions", "Reprend une rediff là où vous l’aviez laissée.", ["Activée", "Désactivée"]],
  ["lang", "Langue dans les catégories", "Filtre les streams affichés dans une catégorie.", ["Toutes", "Français"]],
  ["sleep", "Minuterie de mise en veille", "Arrête la lecture si aucune touche n’est pressée pendant ce délai.", ["Désactivée", "30 min", "60 min", "90 min", "120 min"]],
  ["stats", "Statistiques du flux", "Résolution, images par seconde et débit pendant la lecture.", ["Masquées", "Affichées"]],
];
export function renderSettings() {
  const pg = $("#set-page");
  const me = A.P.getMe();
  pg.innerHTML = `<h1 class="page-h">Réglages</h1><p class="page-sub">OK pour changer une valeur.</p><div class="set" id="set"></div>`;
  const box = $("#set");
  for (const [k, l, d, opts] of SROWS) {
    const e = h("div", "set-row focusable", `<div><div class="l">${l}</div><div class="d">${d}</div></div><div class="v">${opts[settings[k] % opts.length]}</div>`);
    e.dataset.key = "set:" + k;
    e._enter = () => { settings[k] = (settings[k] + 1) % opts.length; saveSettings(); $(".v", e).textContent = opts[settings[k]]; A.onSetting(k); };
    box.appendChild(e);
  }
  const extra = [
    ["home", "Personnaliser l’accueil", "Choisissez les rangées affichées sur l’accueil et leur ordre.", "Ouvrir", () => A.show("homecfg")],
    ["subs", "Rediffusions des abonnés", getUserToken() ? "Votre session est connectée : les rediffs réservées de vos chaînes abonnées sont accessibles." : "Connectez votre session pour lire les rediffs réservées des chaînes auxquelles vous êtes abonné.", getUserToken() ? "Gérer" : "Connecter", () => A.show("subs")],
    ["upd", "Mises à jour", `Version installée : ${esc(CONFIG.version)}. OK pour vérifier s’il y a plus récent.`, "Vérifier", () => A.checkUpdate(true)],
    ["bug", "Signaler un problème", "Affiche le journal de l’app et un QR code pour ouvrir un rapport sur GitHub.", "Ouvrir", () => A.showBugReport()],
    ["acc", "Changer de compte", `Connecté en tant que ${esc(me?.display_name || "?")}.${DEMO ? " (mode démo)" : ""}`, "Changer", () => A.switchProfile()],
    ["add", "Ajouter un compte", "Connectez un autre compte Twitch. Vous choisirez lequel utiliser au lancement.", "Ajouter", () => A.addAccount()],
    ["out", "Se déconnecter", "Retire ce compte de l’appareil.", "Se déconnecter", () => A.logout()],
  ];
  for (const [k, l, d, v, fn] of extra) {
    const e = h("div", "set-row focusable", `<div><div class="l">${l}</div><div class="d">${d}</div></div><div class="v">${v}</div>`);
    e.dataset.key = "set:" + k; e._enter = fn; box.appendChild(e);
  }
}

/* ---------- connexion ---------- */
export function renderLogin(st) {
  const L = $("#login");
  const logo = $(".topbar .logo").innerHTML.replace(/id="lg"/, "id=\"lg2\"").replace(/url\(#lg\)/, "url(#lg2)");
  const code = st.code ? st.code.replace(/[^A-Z0-9]/gi, "").toUpperCase() : "";
  const boxes = code ? [...code].map((c, i) => (i === Math.floor(code.length / 2) ? "<i></i>" : "") + `<span>${esc(c)}</span>`).join("") : "";
  L.innerHTML = `<div class="lg-l"><div class="logo">${logo}</div><h1>Connectez votre compte en 10 secondes</h1>
    <p>Aucun mot de passe à taper avec la télécommande. Une seule fois : l’app reste connectée ensuite.</p>
    ${st.phase === "error" ? `<p class="lg-err">${esc(st.error)}</p><div class="btns"><div class="btn primary focusable" id="lg-retry">Recommencer</div></div>` : `
    <ol class="steps"><li><div>Scannez le QR code avec votre téléphone, déjà connecté à Twitch.</div></li>
    <li><div>Ou ouvrez <b>twitch.tv/activate</b> et saisissez ce code\u00a0:<div class="code">${boxes || "<span class=\"spin\"></span>"}</div></div></li></ol>
    <div class="wait"><div class="spin"></div>En attente de validation sur votre téléphone…</div>
    <div class="ok-big"><div class="check"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7"/></svg></div>Connecté. Bon visionnage !</div>
    ${DEMO ? "<div class=\"lg-hint\">Mode démo : appuyez sur OK pour simuler la validation sur le téléphone.</div>" : ""}`}</div>
    ${st.uri ? `<div><div class="qr"><canvas id="qr"></canvas></div><div class="qr-cap">Scannez avec l’appareil photo</div></div>` : ""}`;
  L.classList.toggle("done", st.phase === "done");
  if (st.uri) qrInto($("#qr"), st.uri);
  const r = $("#lg-retry");
  if (r) r._enter = () => A.startLogin();
}

/** Dessine un QR code (bibliothèque qrcode-generator) dans un canvas. */
export function qrInto(cv, text) {
  try {
    const q = window.qrcode(0, "M");
    q.addData(text); q.make();
    const n = q.getModuleCount();
    cv.width = n; cv.height = n;
    const x = cv.getContext("2d");
    x.fillStyle = "#fff"; x.fillRect(0, 0, n, n);
    x.fillStyle = "#1d1230";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) x.fillRect(c, r, 1, 1);
  } catch (e) { log("ERR", "QR", e); }
}
