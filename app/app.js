// Point d’entrée : démarrage, chargement des données, navigation entre écrans, touches, mises à jour.
import { $, $$, h, esc, hueOf, versionGt, ava, hm } from "./util.js";
import { CONFIG, DEMO } from "./config.js";
import { log, logs } from "./log.js";
import { settings, favs, reminders, store } from "./store.js";
import { json } from "./net.js";
import * as twitch from "./twitch.js";
import { createMock, drawScene } from "./mock.js";
import { N, setFocus, move, activate, restoreFocus, ensureVisible } from "./nav.js";
import * as UI from "./ui.js";
import { stopPreview } from "./preview.js";
import { bindPlayer, initPlayer, openPlayer, isOpen, playerKey, playerClick, seekClick, onSettingChanged } from "./player.js";

const P = DEMO ? createMock() : twitch;
const D = { followed: [], vods: [], clips: [], sched: [], cats: [], catRow: null, loadingExtra: true };
const S = { view: "home", stack: [], mem: {}, cat: null, homeDirty: true };
const VIEWS = { home: "#v-home", today: "#v-today", following: "#v-following", cats: "#v-cats", cat: "#v-cat", search: "#v-search", settings: "#v-settings", homecfg: "#v-homecfg" };
const RENDER = { home: UI.renderHome, today: UI.renderToday, following: UI.renderFollowing, cats: UI.renderCats, cat: () => UI.renderCat(S.cat), search: UI.renderSearch, settings: UI.renderSettings, homecfg: UI.renderHomeCfg };

/* ---------- objet partagé avec ui.js et player.js ---------- */
const A = {
  P, D, S, heroHue: 270,
  lives: () => D.followed.filter(c => c.live && c.stream).sort((a, b) => (favs.has(b.login) - favs.has(a.login)) || (b.stream.viewers - a.stream.viewers)),
  show, toast, openPlayer: o => { closeModal(); return openPlayer(o); }, openChannel, openCategory, focusFirstIn,
  checkUpdate, showBugReport, logout, startLogin,
  onSetting: k => { onSettingChanged(); if (k === "lang") S.homeDirty = true; },
  onPlayerClosed(ret, mode) {
    if (mode === "vod") S.homeDirty = true;
    if (S.view === "home" && S.homeDirty) { rerender(); return; }
    if (ret && ret.isConnected) setFocus(ret, { scroll: false }); else focusFirstIn(VIEWS[S.view]);
  },
  animateHero(now) {
    if (isOpen() || S.view !== "home") return;
    const cv = document.getElementById("hero-cv");
    if (cv) drawScene(cv.getContext("2d"), cv.width, cv.height, now / 1000, A.heroHue, false);
  },
};
UI.bindUI(A);
bindPlayer(A);

/* ---------- mise à l’échelle 1920 × 1080 ---------- */
function fit() {
  const st = $("#stage"), w = innerWidth, hh = innerHeight;
  N.scale = Math.min(w / 1920, hh / 1080);
  st.style.transform = `translate(${(w - 1920 * N.scale) / 2}px,${(hh - 1080 * N.scale) / 2}px) scale(${N.scale})`;
}
addEventListener("resize", fit); addEventListener("load", fit); setTimeout(fit, 500); setTimeout(fit, 2000);

/* ---------- écrans ---------- */
function cands() {
  if (!$("#modal").classList.contains("gone")) return $$("#modal .focusable");
  if (!$("#login").classList.contains("gone")) return $$("#login .focusable");
  if (isOpen() && !$("#qmenu").classList.contains("gone")) return $$("#qmenu .focusable");
  if (isOpen()) return $("#player").classList.contains("ui") ? $$("#p-bottom .focusable") : [];
  return [...$$("#side .focusable"), ...$$(".view.active .focusable")].filter(e => e.offsetParent !== null);
}
N.cands = cands;

function focusFirstIn(sel) { const v = $(sel); if (v) restoreFocus(v, null, 0); }
function show(name, { fromSide = false, back = false } = {}) {
  const old = S.view;
  stopPreview();
  if (N.focused && !$("#side").contains(N.focused) && $(VIEWS[old]).contains(N.focused)) S.mem[old] = N.focused.dataset.key;
  if (fromSide) S.stack = name === "home" ? [] : ["home"];
  else if (!back && name !== old) S.stack.push(old);
  S.view = name;
  $$(".view").forEach(v => v.classList.remove("active"));
  $(VIEWS[name]).classList.add("active");
  if (name !== "home" || S.homeDirty) { RENDER[name](); if (name === "home") S.homeDirty = false; }
  UI.renderSide(name);
  restoreFocus($(VIEWS[name]), fromSide && name !== "home" ? null : S.mem[name], 0) || setFocus($("#side .nav.active"));
  topbar();
}
function goBack() {
  if (S.stack.length) { show(S.stack.pop(), { back: true }); return true; }
  if (!$("#side").contains(N.focused)) { setFocus($("#side .nav.active") || $("#side .nav")); return true; }
  if (S.view !== "home") { show("home", { fromSide: true }); return true; }
  if (Date.now() - (goBack.t || 0) < 2500) return false; // 2e appui : on quitte
  goBack.t = Date.now();
  toast("<div><b>Appuyez encore sur Retour pour quitter</b></div>", 2500);
  return true;
}
/** Redessine l’écran courant en gardant l’élément sélectionné. */
function rerender() {
  const v = $(VIEWS[S.view]);
  const key = N.focused && v.contains(N.focused) ? N.focused.dataset.key : null;
  const inSide = $("#side").contains(N.focused);
  stopPreview();
  RENDER[S.view]();
  if (S.view === "home") S.homeDirty = false;
  UI.renderSide(S.view);
  if (isOpen() || !$("#modal").classList.contains("gone")) return;
  if (inSide) setFocus(N.focused, { scroll: false }); else restoreFocus(v, key, 0);
}
function topbar() {
  const sc = $("#home-scroll");
  $(".topbar").classList.toggle("solid", S.view !== "home" || sc.scrollTop > 120);
}
setInterval(topbar, 150);

async function openChannel(c) {
  if (c.live) return A.openPlayer({ ch: c, mode: "live" });
  let v = D.vods.find(x => x.ch.login === c.login);
  if (!v) { try { v = await P.getLastVod(c); } catch (e) { log("WARN", e.message); } }
  if (v) return A.openPlayer({ ch: c, mode: "vod", vod: v });
  toast(`${ava(c, 64, false)}<div><b>${esc(c.name)} n’a pas de rediffusion disponible</b><small>Activez les alertes de live pour être prévenu au prochain direct.</small></div>`);
}
function openCategory(cat) { S.cat = cat; show("cat"); }

/* ---------- notifications ---------- */
let tT;
function toast(html, ms = 4500) {
  const t = $("#toast");
  t.innerHTML = html;
  t.classList.add("show");
  clearTimeout(tT);
  tT = setTimeout(() => t.classList.remove("show"), ms);
}

/* ---------- fenêtres (mise à jour, problème) ---------- */
let modalRet = null, modalOnBack = null;
function modal(html, buttons, onBack) {
  const m = $("#modal");
  modalRet = N.focused; modalOnBack = onBack || null;
  m.innerHTML = `<div class="mbox">${html}<div class="btns"></div></div>`;
  const b = $(".btns", m);
  buttons.forEach(([label, primary, fn], i) => { const e = h("div", "btn focusable" + (primary ? " primary" : ""), esc(label)); e._enter = fn; e.dataset.key = "m" + i; b.appendChild(e); });
  m.classList.remove("gone");
  setFocus($(".focusable", m), { scroll: false });
}
function closeModal() {
  const m = $("#modal");
  if (m.classList.contains("gone")) return;
  m.classList.add("gone"); m.innerHTML = "";
  if (modalRet && modalRet.isConnected) setFocus(modalRet, { scroll: false }); else if (!isOpen()) focusFirstIn(VIEWS[S.view]);
}

async function checkUpdate(manual) {
  if (!CONFIG.repo) { if (manual) toast("<div><b>Mises à jour indisponibles</b><small>Cette version n’a pas été compilée par GitHub (mode démo ou compilation locale).</small></div>"); return; }
  try {
    const r = await json("GET", `https://api.github.com/repos/${CONFIG.repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" } });
    if (r.status !== 200) throw new Error("GitHub " + r.status);
    const tag = r.data.tag_name, asset = (r.data.assets || []).find(a => a.name.endsWith(".apk"));
    if (!asset || !versionGt(tag, CONFIG.version)) { if (manual) toast(`<div><b>Vous avez la dernière version</b><small>Version ${esc(CONFIG.version)}.</small></div>`, 3000); return; }
    if (!manual && store.get("skipVersion") === tag) return;
    const notes = esc((r.data.body || "").slice(0, 500)).replace(/\n/g, "<br>");
    modal(`<h2>Mise à jour ${esc(tag)} disponible</h2><p class="mtxt">Version installée : ${esc(CONFIG.version)}.</p>${notes ? `<div class="notes">${notes}</div>` : ""}<div class="upbar" id="upbar"><i></i></div><p class="mtxt" id="upmsg"></p>`,
      [["Installer maintenant", true, () => installUpdate(asset.browser_download_url)], ["Plus tard", false, () => { store.set("skipVersion", tag); closeModal(); }]]);
  } catch (e) { log("WARN", "mise à jour", e.message); if (manual) toast(`<div><b>Vérification impossible</b><small>${esc(e.message)}</small></div>`); }
}
function installUpdate(url) {
  if (!window.Android || !window.Android.installUpdate) { $("#upmsg").textContent = "L’installation n’est possible que sur le Fire Stick."; return; }
  $("#upbar").classList.add("on");
  $("#upmsg").textContent = "Téléchargement…";
  window.Android.installUpdate(url);
}
window.__nb = Object.assign(window.__nb || {}, {
  updateProgress(p) { const b = $("#upbar i"); if (b) b.style.width = p + "%"; const m = $("#upmsg"); if (m) m.textContent = p >= 100 ? "Téléchargé. Confirmez l’installation à l’écran." : `Téléchargement… ${p} %`; },
  updateError(msg) { const m = $("#upmsg"); if (m) m.textContent = msg; log("ERR", "mise à jour", msg); },
});

function showBugReport() {
  const L = logs().slice(-14);
  const body = `**Version** ${CONFIG.version} (${CONFIG.versionCode}), ${CONFIG.device}, Android ${CONFIG.android || "?"}\n\n**Ce qui s’est passé :**\n\n\n**Journal :**\n\`\`\`\n${L.join("\n").slice(-1100)}\n\`\`\``;
  const url = CONFIG.repo ? `https://github.com/${CONFIG.repo}/issues/new?title=${encodeURIComponent("Problème : ")}&body=${encodeURIComponent(body)}` : "";
  modal(`<h2>Signaler un problème</h2><div class="bug"><div class="loglist">${L.length ? L.map(l => `<div>${esc(l)}</div>`).join("") : "<div>Aucun événement enregistré.</div>"}</div>
    ${url ? "<div class=\"bugqr\"><div class=\"qr small\"><canvas id=\"bugqr\"></canvas></div><p class=\"mtxt\">Scannez pour ouvrir un rapport pré-rempli sur GitHub, avec ce journal.</p></div>" : ""}</div>`,
    [["Fermer", true, closeModal]]);
  if (url) UI.qrInto($("#bugqr"), url);
}

/* ---------- connexion ---------- */
let loginDone = null, loginRun = 0;
function startLogin() {
  const L = $("#login");
  const run = ++loginRun;
  L.className = "";
  UI.renderLogin({ phase: "code" });
  return new Promise(async res => {
    loginDone = res;
    try {
      const dev = await P.startDeviceAuth();
      if (run !== loginRun) return;
      UI.renderLogin({ phase: "code", code: dev.userCode, uri: dev.uri });
      const ok = await P.pollDeviceAuth(dev, () => run !== loginRun);
      if (ok && run === loginRun) finishLogin();
    } catch (e) {
      log("ERR", "connexion", e);
      if (run === loginRun) { UI.renderLogin({ phase: "error", error: e.message }); setFocus($("#lg-retry"), { scroll: false }); }
    }
  });
}
function finishLogin() {
  const L = $("#login");
  L.classList.add("done");
  setTimeout(() => { L.classList.add("hide"); setTimeout(() => L.classList.add("gone"), 500); loginDone && loginDone(); }, 1200);
}
function logout() {
  modal("<h2>Se déconnecter ?</h2><p class=\"mtxt\">Il faudra scanner un nouveau QR code pour revenir.</p>", [
    ["Se déconnecter", true, () => { P.logout(); location.reload(); }], ["Annuler", false, closeModal]]);
}

/* ---------- chargement des données ---------- */
async function loadAll() {
  const boot = $("#boot");
  boot.querySelector("p").textContent = "Chargement de vos chaînes…";
  try {
    const [fol, cats] = await Promise.all([P.getFollowed(), P.getTopCategories().catch(e => { log("WARN", e.message); return []; })]);
    D.followed = fol; D.cats = cats;
  } catch (e) {
    log("ERR", e);
    boot.innerHTML = `<div class="boot-err"><b>Impossible de charger vos chaînes</b><small>${esc(e.message)}</small><div class="btn primary focusable" id="boot-retry">Réessayer</div></div>`;
    $("#boot-retry")._enter = () => location.reload();
    setFocus($("#boot-retry"), { scroll: false });
    N.cands = () => [$("#boot-retry")];
    return false;
  }
  boot.classList.add("gone");
  show("home", { fromSide: true });
  loadExtra();
  return true;
}
async function loadExtra() {
  D.loadingExtra = true;
  try {
    D.vods = await P.getRecentVods(D.followed, Date.now() - 24 * 3600e3);
    D.loadingExtra = false;
    softRefresh();
    const active = D.followed.filter(c => c.live || D.vods.some(v => v.ch.login === c.login));
    const [clips, sched] = await Promise.all([P.getClips(active).catch(() => []), P.getSchedule(D.followed).catch(() => [])]);
    D.clips = clips; D.sched = sched;
    const top = A.lives()[0];
    if (top && top.stream.catId) {
      const cat = D.cats.find(c => c.id === top.stream.catId) || { id: top.stream.catId, name: top.stream.cat };
      const list = (await P.getCategoryStreams(cat, settings.lang === 1 ? "fr" : "").catch(() => [])).filter(c => !D.followed.some(f => f.login === c.login));
      D.catRow = { cat, list };
    }
  } catch (e) { log("ERR", e); }
  D.loadingExtra = false;
  softRefresh();
}
/** Met à jour l’écran affiché sans gêner la navigation. */
function softRefresh() {
  S.homeDirty = true;
  if (isOpen() || !$("#modal").classList.contains("gone")) { UI.renderSide(S.view); return; }
  if (["home", "today", "following"].includes(S.view)) rerender(); else UI.renderSide(S.view);
}
async function refreshLives() {
  try {
    const before = new Set(A.lives().map(c => c.login));
    D.followed = await P.getFollowed(true);
    const started = A.lives().filter(c => !before.has(c.login));
    for (const c of started.slice(0, 3)) {
      const reminded = D.sched.some(s => s.ch.login === c.login && reminders.has(s.id));
      if (settings.alerts === 2 && !reminded) continue;
      if (settings.alerts === 1 && !favs.has(c.login) && !reminded) continue;
      toast(`${ava(c, 72, false)}<div><b>${esc(c.name)} vient de lancer un live</b><small>${esc(c.stream.cat || "")}, ${esc(c.stream.title || "")}</small></div>`, 6000);
    }
    if (started.length) softRefresh();
  } catch (e) { log("WARN", "actualisation", e.message); }
}

/* ---------- touches ---------- */
let lastKey = Date.now();
function onAction(a) {
  lastKey = Date.now();
  if (!$("#modal").classList.contains("gone")) {
    if (a === "back") { modalOnBack ? modalOnBack() : closeModal(); return true; }
    if (a === "ok") { activate(N.focused); return true; }
    if (["up", "down", "left", "right"].includes(a)) move(a);
    return true;
  }
  if (!$("#login").classList.contains("gone")) {
    if (a === "ok") { if (N.focused && $("#login").contains(N.focused)) activate(N.focused); else if (DEMO) P.validateDemoLogin && P.validateDemoLogin(); }
    if (a === "back") return false;
    return true;
  }
  if (!$("#boot").classList.contains("gone")) { if (a === "ok") activate(N.focused); return a !== "back"; }
  if (isOpen()) { playerKey(a); return true; }
  if (a === "back") return goBack();
  if (a === "ok") { activate(N.focused); return true; }
  if (["up", "down", "left", "right"].includes(a)) {
    const f = N.focused;
    if (f && f._key && f._key(a)) return true;
    move(a);
  }
  return true;
}
// Appelé par la coque Android pour Retour et les touches média. Renvoie false pour quitter l’app.
window.TU = { onKey: a => onAction(a) !== false };

addEventListener("keydown", e => {
  if (S.view === "search" && !isOpen() && $("#modal").classList.contains("gone") && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (/^[a-z0-9]$/i.test(e.key)) { e.preventDefault(); UI.typeQ(e.key.toLowerCase()); return; }
    if (e.key === "Backspace" && UI.backQ()) { e.preventDefault(); return; }
  }
  const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "ok", " ": "ok", Escape: "back", Backspace: "back", c: "chat", C: "chat", s: "stats", S: "stats", MediaPlayPause: "playpause" };
  let a = map[e.key];
  if (!a && e.keyCode === 23) a = "ok"; // bouton central de certaines télécommandes
  if (!a) return;
  e.preventDefault();
  if (a === "chat" || a === "stats") { if (isOpen()) playerKey(a); return; }
  onAction(a);
});
document.addEventListener("click", e => {
  lastKey = Date.now();
  if (!$("#login").classList.contains("gone") && DEMO && !e.target.closest(".focusable")) { P.validateDemoLogin && P.validateDemoLogin(); return; }
  if (isOpen() && $("#modal").classList.contains("gone")) {
    if (e.target.closest("#seek")) seekClick(e); else playerClick(e.target);
    return;
  }
  const f = e.target.closest(".focusable");
  if (f) { setFocus(f); activate(f); }
});

// Minuterie de mise en veille
setInterval(() => {
  const mins = [0, 30, 60, 90, 120][settings.sleep] || 0;
  if (mins && isOpen() && Date.now() - lastKey > mins * 60000) {
    window.TU.onKey("back");
    modal("<h2>Lecture arrêtée</h2><p class=\"mtxt\">La minuterie de mise en veille a arrêté la lecture.</p>", [["OK", true, closeModal]]);
    lastKey = Date.now();
  }
}, 30000);

/* ---------- démarrage ---------- */
async function boot() {
  fit();
  initPlayer();
  setInterval(() => { $("#clock").textContent = hm(Date.now()); }, 15000);
  $("#clock").textContent = hm(Date.now());
  log("INFO", `démarrage ${CONFIG.version} ${DEMO ? "(démo)" : ""}`);
  if (!P.isLogged()) { $("#boot").classList.add("gone"); await startLogin(); $("#boot").classList.remove("gone"); }
  const me = P.getMe();
  if (me) $("#me").outerHTML = ava({ name: me.display_name, login: me.login, avatar: me.profile_image_url }, 56, false).replace("class=\"ava\"", "class=\"ava\" id=\"me\"");
  if (!(await loadAll())) return;
  setInterval(refreshLives, DEMO ? 20000 : 90000);
  setInterval(() => { if (!isOpen()) loadExtra(); }, 15 * 60000);
  setTimeout(() => checkUpdate(false), 5000);
}
boot();
