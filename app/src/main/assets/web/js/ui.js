// Écrans de l’app : accueil, aujourd’hui, suivis, catégories, recherche, réglages, connexion.
import { $, $$, h, esc, hm, durTxt, agoTxt, clk, kf, thumbStyle, ava, gradBg, hueOf } from "./util.js";
import { settings, saveSettings, favs, reminders, toggleReminder, continueList, progressOf } from "./store.js";
import { CONFIG, DEMO } from "./config.js";
import { log } from "./log.js";

let A; // l’objet app (voir app.js)
export function bindUI(app) { A = app; }

export const ICON = {
  search: "<circle cx=\"11\" cy=\"11\" r=\"7\"/><path d=\"m20 20-4.5-4.5\"/>",
  home: "<path d=\"M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z\"/>",
  today: "<circle cx=\"12\" cy=\"12\" r=\"9\"/><path d=\"M12 7v5l3.5 2\"/>",
  heart: "<path d=\"M12 20s-7-4.4-9.2-8.6C1.2 8.2 3.2 4.5 6.8 4.5c2 0 3.4 1 5.2 3 1.8-2 3.2-3 5.2-3 3.6 0 5.6 3.7 4 6.9C19 15.6 12 20 12 20z\"/>",
  grid: "<rect x=\"3\" y=\"3\" width=\"7.5\" height=\"7.5\" rx=\"2\"/><rect x=\"13.5\" y=\"3\" width=\"7.5\" height=\"7.5\" rx=\"2\"/><rect x=\"3\" y=\"13.5\" width=\"7.5\" height=\"7.5\" rx=\"2\"/><rect x=\"13.5\" y=\"13.5\" width=\"7.5\" height=\"7.5\" rx=\"2\"/>",
  set: "<path d=\"M4 7h10M18 7h2M4 17h2M10 17h10\"/><circle cx=\"16\" cy=\"7\" r=\"2.5\"/><circle cx=\"8\" cy=\"17\" r=\"2.5\"/>",
};
export const PLAY = "<svg viewBox=\"0 0 24 24\"><path d=\"M7 4.5v15a1 1 0 0 0 1.5.86l12-7.5a1 1 0 0 0 0-1.72l-12-7.5A1 1 0 0 0 7 4.5z\"/></svg>";
export const PAUSE = "<svg viewBox=\"0 0 24 24\"><rect x=\"5\" y=\"4\" width=\"5\" height=\"16\" rx=\"1.5\"/><rect x=\"14\" y=\"4\" width=\"5\" height=\"16\" rx=\"1.5\"/></svg>";
export const CHATI = "<svg viewBox=\"0 0 24 24\"><path d=\"M4 4h16a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H9l-5 4V5a1 1 0 0 1 1-1z\"/></svg>";

/* ---------- menu latéral ---------- */
const NAVS = [["search", "Recherche", "search"], ["home", "Accueil", "home"], ["today", "Aujourd’hui", "today"], ["following", "Suivis", "heart"], ["cats", "Catégories", "grid"], ["settings", "Réglages", "set"]];
export function renderSide(view) {
  const side = $("#side");
  if (!side.children.length) {
    for (const [id, label, ic] of NAVS) {
      const e = h("div", "nav focusable", `<svg viewBox="0 0 24 24">${ICON[ic]}</svg><span>${label}</span>`);
      e.dataset.nav = id; e.dataset.key = "nav:" + id;
      e._enter = () => A.show(id, { fromSide: true });
      side.appendChild(e);
    }
  }
  const n = A.D.vods.length;
  for (const e of $$(".nav", side)) {
    const id = e.dataset.nav;
    e.classList.toggle("active", view === id || (id === "cats" && view === "cat"));
    let b = $(".bubble", e);
    if (id === "today") { if (n) { if (!b) { b = h("em", "bubble"); e.appendChild(b); } b.textContent = n; } else if (b) b.remove(); }
  }
}

/* ---------- cartes ---------- */
const star = c => favs.has(c.login) ? " <span class=\"star\">★</span>" : "";
export function liveCard(c) {
  const s = c.stream || {};
  const e = h("div", "card focusable", `<div class="thumb" style="${thumbStyle(s.thumb, c.login)}"><span class="b-live">En direct</span>${s.viewers != null ? `<span class="t-meta">${kf(s.viewers)} spectateurs</span>` : ""}</div>
    <div class="card-info">${ava(c, 56, false)}<div class="ci"><div class="c-name">${esc(c.name)}${star(c)}</div><div class="c-title">${esc(s.title)}</div><div class="c-sub">${esc(s.cat || "")}</div></div></div>`);
  e.dataset.key = "live:" + c.login;
  e._enter = () => A.openPlayer({ ch: c, mode: "live" });
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
  const art = c.art
    ? `<div class="art" style="background-image:url(\x27${esc(c.art)}\x27),${gradBg(hueOf(c.name), 3)}"></div>`
    : `<div class="art" style="background:${gradBg(hueOf(c.name), c.name.length)}"><b>${esc(c.name)}</b><em>${c.glyph || ""}</em></div>`;
  const e = h("div", "cat focusable", `${art}<div class="cm"><span class="cn">${esc(c.name)}</span>${c.rank ? `<span class="rk">n° ${c.rank}</span>` : ""}</div>`);
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

/* ---------- accueil ---------- */
export function renderHome() {
  const sc = $("#home-scroll"), D = A.D, lives = A.lives();
  sc.innerHTML = "";
  const f = lives[0];
  const hero = h("section", "hero");
  hero.dataset.unit = "top";
  A.heroHue = f ? hueOf(f.login) : 270;
  if (f) {
    const s = f.stream;
    const bg = s.thumbBig ? `<img class="hero-img" src="${esc(s.thumbBig)}" alt="">` : `<canvas id="hero-cv" width="960" height="540"></canvas>`;
    hero.innerHTML = `${bg}<div class="hero-shade"></div><div class="hero-c"><div class="live-line"><span class="dot"></span>${favs.has(f.login) ? "En direct sur une de vos chaînes favorites" : "En direct sur vos chaînes"}</div>
      <h1>${esc(f.name)}</h1><p class="hero-title">${esc(s.title)}</p>
      <div class="meta"><span>${esc(s.cat)}</span><span>${kf(s.viewers)} spectateurs</span><span>depuis ${durTxt((Date.now() - s.startedAt) / 1000)}</span></div><div class="btns"></div></div>`;
    const b = $(".btns", hero);
    b.appendChild(btn("Regarder le live", "primary", () => A.openPlayer({ ch: f, mode: "live" }), "hero:watch", PLAY));
    b.appendChild(btn("Avec le chat", "", () => A.openPlayer({ ch: f, mode: "live", chat: true }), "hero:chat", CHATI));
    const last = D.vods.find(v => v.ch.login === f.login);
    if (last) b.appendChild(btn("Dernière rediff", "", () => A.openPlayer({ ch: f, mode: "vod", vod: last }), "hero:vod"));
  } else {
    const v = D.vods[0];
    hero.innerHTML = `<canvas id="hero-cv" width="960" height="540"></canvas><div class="hero-shade"></div><div class="hero-c"><h1 class="small">Aucune de vos chaînes n’est en direct</h1><p class="hero-title">${v ? `La dernière rediff de ${esc(v.ch.name)} est prête.` : "Explorez les catégories populaires en attendant."}</p><div class="btns"></div></div>`;
    const b = $(".btns", hero);
    if (v) b.appendChild(btn(`Regarder ${v.ch.name}`, "primary", () => A.openPlayer({ ch: v.ch, mode: "vod", vod: v }), "hero:vod", PLAY));
    b.appendChild(btn("Voir les catégories", v ? "" : "primary", () => A.show("cats"), "hero:cats"));
  }
  sc.appendChild(hero);

  if (lives.length) sc.appendChild(row("En direct sur vos chaînes", lives.map(liveCard), `<span class="count">${lives.length}</span>`, "row-live"));
  const cont = continueList();
  if (cont.length) sc.appendChild(row("Continuer à regarder", cont.map(vodCard)));
  if (D.vods.length) sc.appendChild(row("Passés en live aujourd’hui", D.vods.map(vodCard), `<span class="hint">les rediffusions des dernières 24 heures</span>`));
  else if (D.loadingExtra) sc.appendChild(h("p", "loading-row", "<span class=\"spin\"></span>Recherche des lives d’aujourd’hui…"));
  if (D.sched.length) sc.appendChild(row("Prochains lives prévus", D.sched.map(schedCard), `<span class="hint">OK pour être prévenu au début</span>`));
  if (D.clips.length) sc.appendChild(row("Meilleurs clips du jour", D.clips.map(clipCard), `<span class="hint">vos chaînes, dernières 24 heures</span>`));
  if (D.cats.length) sc.appendChild(row("Catégories populaires", D.cats.slice(0, 20).map(catCard), `<span class="hint">classées par nombre de spectateurs</span>`));
  const fol = [...D.followed].sort((a, b) => (b.live - a.live) || (favs.has(b.login) - favs.has(a.login)) || (D.vods.some(v => v.ch.login === b.login) - D.vods.some(v => v.ch.login === a.login))).slice(0, 40);
  if (fol.length) sc.appendChild(row("Vos chaînes suivies", fol.map(avCard), `<span class="hint">${D.followed.length} au total</span>`));
  if (D.catRow && D.catRow.list.length) sc.appendChild(row(`Populaire en ${esc(D.catRow.cat.name)}`, D.catRow.list.slice(0, 12).map(liveCard)));
  sc.appendChild(h("div", "spacer"));
}

/* ---------- aujourd’hui ---------- */
export function renderToday() {
  const pg = $("#today-page"), D = A.D, H = 3600e3;
  const sessions = [
    ...D.vods.map(v => ({ ...v, live: false })),
    ...A.lives().map(c => ({ ch: c, title: c.stream.title, start: c.stream.startedAt, end: Date.now(), sec: (Date.now() - c.stream.startedAt) / 1000, thumb: c.stream.thumb, live: true, viewers: c.stream.viewers, cat: c.stream.cat })),
  ];
  const ws = Date.now() - 24 * H, we = Date.now() + H, span = we - ws, pct = t => Math.max(0, (t - ws) / span * 100);
  const by = new Map();
  sessions.forEach(s => { if (!by.has(s.ch.login)) by.set(s.ch.login, []); by.get(s.ch.login).push(s); });
  const lastEnd = ss => Math.max(0, ...ss.filter(x => !x.live).map(x => x.end));
  const rows = [...by.values()].sort((a, b) => (a[0].ch.live - b[0].ch.live) || lastEnd(b) - lastEnd(a));
  const off = D.followed.filter(c => !by.has(c.login));
  pg.innerHTML = `<h1 class="page-h">Qui était en ligne aujourd’hui</h1><p class="page-sub">Les dernières 24 heures de vos chaînes suivies. Chaque barre est un live : choisissez-en une pour lancer la rediffusion, ou rejoindre le direct s’il est encore en cours.</p>
    <div class="detail" id="detail"></div><div class="tl"><div class="tl-axis" id="axis"></div><div id="tlrows"></div></div>
    ${D.loadingExtra ? "<p class=\"off-note\">Recherche des rediffusions en cours…</p>" : ""}
    ${off.length ? `<p class="off-note">Pas de live aujourd’hui : ${off.slice(0, 25).map(c => esc(c.name)).join(", ")}${off.length > 25 ? ` et ${off.length - 25} autres` : ""}.</p>` : ""}`;
  if (!rows.length) { $("#detail").innerHTML = "<p class=\"empty\">Aucune de vos chaînes n’a streamé ces dernières 24 heures.</p>"; return; }
  const ax = $("#axis"), d0 = new Date(ws); d0.setMinutes(0, 0, 0);
  for (let t = d0.getTime() + H; t < we; t += 3 * H) {
    if (Math.abs(t - Date.now()) < 1.6 * H) continue;
    ax.appendChild(h("span", "", hm(t).replace(":00", " h"))).style.left = pct(t) + "%";
  }
  const nl = h("span", "nowlab", "maintenant"); nl.style.left = pct(Date.now()) + "%"; ax.appendChild(nl);
  const box = $("#tlrows");
  for (const ss of rows) {
    const c = ss[0].ch;
    const r = h("div", "tl-row", `<div class="tl-label">${ava(c, 40, false)}<span>${esc(c.name)}</span>${c.live ? "<span class=\"dot sm\"></span>" : ""}</div>`);
    const tr = h("div", "tl-track");
    tr.style.setProperty("--hourw", (100 / 25) + "%");
    const nw = h("div", "tl-now"); nw.style.left = pct(Date.now()) + "%"; tr.appendChild(nw);
    for (const s of ss.sort((x, y) => (x.live - y.live) || y.end - x.end)) {
      const b = h("div", "bar focusable" + (s.live ? " live" : ""), s.live ? "En direct" : esc(s.title));
      const l = pct(s.start), w = Math.max(1.4, pct(s.end) - l);
      const hu = hueOf(c.login);
      b.style.left = l + "%"; b.style.width = w + "%";
      b.style.background = s.live ? `linear-gradient(90deg,hsl(${hu},70%,45%),#ff4d6d,hsl(${hu},70%,45%))` : `linear-gradient(90deg,hsl(${hu},65%,42%),hsl(${hu + 40},70%,52%))`;
      b.dataset.key = "bar:" + (s.live ? "live:" + c.login : s.id);
      b._focus = () => detail(s);
      b._enter = () => s.live ? A.openPlayer({ ch: c, mode: "live" }) : A.openPlayer({ ch: c, mode: "vod", vod: s });
      tr.appendChild(b);
    }
    r.appendChild(tr);
    box.appendChild(r);
  }
}
function detail(s) {
  const d = $("#detail");
  if (!d) return;
  const pos = s.live ? 0 : progressOf(s.id);
  d.innerHTML = `<div class="d-thumb" style="${thumbStyle(s.thumb, s.ch.login + (s.id || ""))}"><span class="${s.live ? "b-live" : "b-vod"}">${s.live ? "En direct" : "Rediffusion"}</span><span class="t-meta">${durTxt(s.sec)}</span>${pos ? `<div class="prog"><i style="width:${pos / s.sec * 100}%"></i></div>` : ""}</div>
    <div><div class="d-name">${ava(s.ch, 52, false)}${esc(s.ch.name)}</div><h2 class="d-title">${esc(s.title)}</h2>
    <div class="d-meta">${s.live ? `En direct depuis ${hm(s.start)}, ${kf(s.viewers)} spectateurs<br>${esc(s.cat || "")}` : `Diffusé de ${hm(s.start)} à ${hm(s.end)}, soit ${durTxt(s.sec)}`}</div>
    <div class="d-cta">${s.live ? "OK pour rejoindre le direct" : pos ? `OK pour reprendre à ${clk(pos)}` : "OK pour regarder la rediffusion"}</div></div>`;
}

/* ---------- suivis ---------- */
function tile(c) {
  const st = chStatus(c);
  const e = h("div", "tile focusable", `${ava(c, 120)}<div class="n">${esc(c.name)}${star(c)}</div><div class="s ${st.cls}">${esc(st.t)}</div>${c.live ? `<div class="s">${esc(c.stream.cat || "")}</div>` : ""}`);
  e.dataset.key = "tile:" + c.login;
  e._enter = () => A.openChannel(c);
  return e;
}
export function renderFollowing() {
  const pg = $("#fol-page"), D = A.D, live = A.lives();
  const off = D.followed.filter(c => !c.live).sort((a, b) => (favs.has(b.login) - favs.has(a.login)) || (D.vods.some(v => v.ch.login === b.login) - D.vods.some(v => v.ch.login === a.login)) || a.name.localeCompare(b.name));
  pg.innerHTML = `<h1 class="page-h">Vos chaînes suivies</h1><p class="page-sub">${live.length} en direct sur ${D.followed.length}. Les favoris (★) passent en premier ; ajoutez-en depuis le lecteur.</p>
    ${live.length ? "<div class=\"sect\">En direct</div><div class=\"grid g5\" id=\"g-live\"></div>" : ""}<div class="sect">Hors ligne</div><div class="grid g5" id="g-off"></div>`;
  live.forEach(c => $("#g-live").appendChild(tile(c)));
  off.slice(0, 100).forEach(c => $("#g-off").appendChild(tile(c)));
}

/* ---------- catégories ---------- */
export function renderCats() {
  const pg = $("#cats-page");
  pg.innerHTML = `<h1 class="page-h">Catégories populaires</h1><p class="page-sub">Classées par nombre de spectateurs en ce moment sur Twitch.</p><div class="grid g6" id="g-cats"></div>`;
  A.D.cats.forEach(c => $("#g-cats").appendChild(catCard(c)));
}
export async function renderCat(cat) {
  const pg = $("#cat-page");
  const lang = settings.lang === 1 ? "fr" : "";
  pg.innerHTML = `<h1 class="page-h">${esc(cat.name)}</h1><p class="page-sub">${lang ? "Streams en français, classés" : "Classés"} par nombre de spectateurs.</p><div class="grid g4" id="g-cat"><p class="loading-row"><span class="spin"></span>Chargement…</p></div>`;
  try {
    const list = await A.P.getCategoryStreams(cat, lang);
    if (!pg.isConnected || A.S.cat !== cat) return;
    const g = $("#g-cat");
    g.innerHTML = list.length ? "" : "<p class=\"empty\">Personne n’est en direct dans cette catégorie pour le moment.</p>";
    list.forEach(c => g.appendChild(liveCard(c)));
    if (A.S.view === "cat") A.focusFirstIn("#v-cat");
  } catch (e) {
    log("ERR", e);
    $("#g-cat").innerHTML = `<p class="empty">Impossible de charger cette catégorie. ${esc(e.message)}</p>`;
  }
}

/* ---------- recherche ---------- */
let Q = "", qTimer = null, qSeq = 0;
export function renderSearch() {
  const pg = $("#search-page");
  pg.innerHTML = `<h1 class="page-h">Recherche</h1><p class="page-sub">Chaînes et catégories. Tapez avec la télécommande ou un clavier.</p>
    <div class="srch"><div class="kb"><div class="sbox" id="sbox"></div><div class="kgrid" id="kgrid"></div></div><div class="sres" id="sres"></div></div>`;
  const g = $("#kgrid");
  [..."abcdefghijklmnopqrstuvwxyz0123456789"].forEach(ch => { const k = h("div", "key focusable", ch); k.dataset.key = "k:" + ch; k._enter = () => typeQ(ch); g.appendChild(k); });
  const sp = h("div", "key wide focusable", "Espace"); sp.dataset.key = "k:sp"; sp._enter = () => typeQ(" "); g.appendChild(sp);
  const del = h("div", "key wide focusable", "Effacer"); del.dataset.key = "k:del"; del._enter = () => backQ(); g.appendChild(del);
  updSearch();
}
export function typeQ(ch) { if (Q.length < 30) Q += ch; updSearch(); }
export function backQ() { if (!Q) return false; Q = Q.slice(0, -1); updSearch(); return true; }
function updSearch() {
  const b = $("#sbox");
  if (!b) return;
  b.innerHTML = Q ? `<span>${esc(Q).replace(/ /g, "&nbsp;")}</span><span class="cur"></span>` : "<span class=\"cur\"></span><span class=\"ph\">Nom d’une chaîne ou d’une catégorie</span>";
  clearTimeout(qTimer);
  const q = Q.trim().toLowerCase();
  if (q.length < 2) { showResults(A.lives().slice(0, 6), A.D.cats.slice(0, 4), true); return; }
  qTimer = setTimeout(async () => {
    const my = ++qSeq;
    try {
      const r = await A.P.search(q);
      if (my === qSeq) showResults(r.channels, r.categories, false);
    } catch (e) { log("ERR", e); }
  }, 400);
}
function showResults(chans, cats, suggest) {
  const r = $("#sres");
  if (!r) return;
  r.innerHTML = "";
  if (!chans.length && !cats.length) { r.innerHTML = `<p class="empty">Aucun résultat pour « ${esc(Q.trim())} ». Vérifiez l’orthographe ou cherchez une catégorie.</p>`; return; }
  if (chans.length) {
    r.appendChild(h("h3", "", suggest ? "Vos chaînes en direct" : "Chaînes"));
    const l = h("div", "rlist");
    chans.forEach(c => {
      const e = h("div", "ritem focusable", `${ava(c, 64)}<div class="ci"><div class="n">${esc(c.name)}</div><div class="s ${c.live ? "l" : ""}">${c.live ? "En direct" + (c.stream?.cat ? ", " + esc(c.stream.cat) : "") : "Hors ligne"}</div></div>`);
      e.dataset.key = "r:" + c.login; e._enter = () => A.openChannel(c); l.appendChild(e);
    });
    r.appendChild(l);
  }
  if (cats.length) {
    r.appendChild(h("h3", "", suggest ? "Catégories populaires" : "Catégories"));
    const l = h("div", "rlist");
    cats.forEach(c => {
      const pic = c.art ? `<span class="ava sq" style="width:64px;height:85px;background-image:url(\x27${esc(c.art)}\x27)"></span>` : `<span class="ava sq" style="width:64px;height:85px;font-size:30px;background:${gradBg(hueOf(c.name), 1)}">${c.glyph || ""}</span>`;
      const e = h("div", "ritem focusable", `${pic}<div class="ci"><div class="n">${esc(c.name)}</div></div>`);
      e.dataset.key = "rc:" + c.id; e._enter = () => A.openCategory(c); l.appendChild(e);
    });
    r.appendChild(l);
  }
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
    ["upd", "Mises à jour", `Version installée : ${esc(CONFIG.version)}. OK pour vérifier s’il y a plus récent.`, "Vérifier", () => A.checkUpdate(true)],
    ["bug", "Signaler un problème", "Affiche le journal de l’app et un QR code pour ouvrir un rapport sur GitHub.", "Ouvrir", () => A.showBugReport()],
    ["acc", "Compte Twitch", `Connecté en tant que ${esc(me?.display_name || "?")}.${DEMO ? " (mode démo)" : ""}`, "Se déconnecter", () => A.logout()],
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
