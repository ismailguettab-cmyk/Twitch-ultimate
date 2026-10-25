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
import { bindPlayer, initPlayer, openPlayer, isOpen, playerCands, playerKey, playerClick, seekClick, onSettingChanged } from "./player.js";

const P = DEMO ? createMock() : twitch;
const D = { followed: [], vods: [], clips: [], sched: [], cats: [], catRow: null, topFr: [], loadingExtra: true };
const S = { view: "home", stack: [], mem: {}, cat: null, homeDirty: true };
const VIEWS = { home: "#v-home", today: "#v-today", following: "#v-following", cats: "#v-cats", cat: "#v-cat", search: "#v-search", settings: "#v-settings", homecfg: "#v-homecfg", subs: "#v-subs", prof: "#v-prof" };
const RENDER = { home: UI.renderHome, today: UI.renderToday, following: UI.renderFollowing, cats: UI.renderCats, cat: () => UI.renderCat(S.cat), search: UI.renderSearch, settings: UI.renderSettings, homecfg: UI.renderHomeCfg, subs: UI.renderSubs, prof: () => UI.renderProfile(S.prof) };

/* ---------- objet partagé avec ui.js et player.js ---------- */
const A = {
  P, D, S, heroHue: 270,
  lives: () => D.followed.filter(c => c.live && c.stream).sort((a, b) => (favs.has(b.login) - favs.has(a.login)) || (b.stream.viewers - a.stream.viewers)),
  show, toast, openPlayer: o => { closeModal(); return openPlayer(o); }, openChannel, openCategory, focusFirstIn,
  checkUpdate, showBugReport, logout, startLogin, checkUserToken, promptText, focusKey, openProfile, channelChoice, switchProfile, addAccount,
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
  const x = (w - 1920 * N.scale) / 2, y = (hh - 1080 * N.scale) / 2;
  // Sans transformation quand l’écran fait déjà 1920 × 1080 : une vidéo dans un bloc transformé
  // perd l’affichage matériel du Fire Stick et saccade.
  st.style.transform = Math.abs(N.scale - 1) < 0.01 && Math.abs(x) < 1 && Math.abs(y) < 1 ? "none" : `translate(${x}px,${y}px) scale(${N.scale})`;
  if (st.style.transform === "none") N.scale = 1;
}
addEventListener("resize", fit); addEventListener("load", fit); setTimeout(fit, 500); setTimeout(fit, 2000);

/* ---------- écrans ---------- */
function cands() {
  if (!$("#modal").classList.contains("gone")) return $$("#modal .focusable");
  if (!$("#login").classList.contains("gone")) return $$("#login .focusable");
  if (isOpen()) return playerCands();
  return [...$$("#side .focusable"), ...$$(".view.active .focusable")].filter(e => e.offsetParent !== null);
}
const defaultCands = cands;
N.cands = cands;

function focusKey(key) { const v = $(VIEWS[S.view]); const el = v && v.querySelector(`[data-key="${key}"]`); if (el) setFocus(el, { scroll: false }); }
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
$("#home-scroll").addEventListener("scroll", topbar, { passive: true });

async function openChannel(c) {
  if (c.live) return A.openPlayer({ ch: c, mode: "live" });
  let v = D.vods.find(x => x.ch.login === c.login);
  if (!v) { try { v = await P.getLastVod(c); } catch (e) { log("WARN", e.message); } }
  if (v) return A.openPlayer({ ch: c, mode: "vod", vod: v });
  toast(`${ava(c, 64, false)}<div><b>${esc(c.name)} n’a pas de rediffusion disponible</b><small>Activez les alertes de live pour être prévenu au prochain direct.</small></div>`);
}
function openCategory(cat) { S.cat = cat; S.catNew = true; show("cat"); }
function openProfile(ch) { S.prof = ch; show("prof"); }
// Bulle de choix quand on ouvre une chaîne en live depuis Suivis.
function channelChoice(ch, anchorEl) {
  const html = `<div class="cc-title">${UI.ava ? "" : ""}${esc(ch.name)} est en direct</div>
    <div class="cc-sub">${esc(ch.stream?.title || "")}</div>`;
  popover(anchorEl, [
    ["Regarder le live", true, () => { closePopover(); openPlayer({ ch, mode: "live" }); }],
    ["Accéder au profil", false, () => { closePopover(); openProfile(ch); }],
  ], html);
}

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
let popRet = null;
function popover(anchorEl, buttons, html) {
  const m = $("#modal");
  popRet = N.focused;
  const ar = anchorEl ? anchorEl.getBoundingClientRect() : null, st = $("#stage").getBoundingClientRect(), s = N.scale;
  const pos = ar ? `style="position:absolute;left:${(ar.left - st.left) / s}px;top:${(ar.bottom - st.top) / s + 14}px"` : "";
  m.innerHTML = `<div class="popover" ${pos}>${html || ""}<div class="pop-btns"></div></div>`;
  m.classList.add("as-pop");
  const b = $(".pop-btns", m);
  buttons.forEach(([label, primary, fn], i) => { const e = h("div", "pop-item focusable" + (primary ? " primary" : ""), esc(label)); e._enter = fn; e.dataset.key = "pop" + i; b.appendChild(e); });
  m.classList.remove("gone");
  modalOnBack = closePopover;
  setFocus($(".focusable", m), { scroll: false });
}
function closePopover() {
  const m = $("#modal");
  m.classList.add("gone"); m.classList.remove("as-pop"); m.innerHTML = ""; modalOnBack = null;
  if (popRet && popRet.isConnected) setFocus(popRet, { scroll: false }); else if (!isOpen()) focusFirstIn(VIEWS[S.view]);
}
function closeModal() {
  const m = $("#modal");
  if (m.classList.contains("gone")) return;
  m.classList.add("gone"); m.innerHTML = ""; promptState = null;
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

/* ---------- session abonnés : vérification du jeton saisi ---------- */
async function checkUserToken(tok) {
  try {
    const r = await json("POST", "https://gql.twitch.tv/gql", {
      headers: { "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko", "Authorization": "OAuth " + tok, "Content-Type": "text/plain;charset=UTF-8" },
      body: JSON.stringify({ query: "{ currentUser { login } }" }),
    });
    return !!(r.data && r.data.data && r.data.data.currentUser && r.data.data.currentUser.login);
  } catch (e) { log("WARN", "vérif session", e.message); return false; }
}

/* ---------- saisie de texte (clavier à l’écran ou clavier USB) ---------- */
let promptState = null;
function promptText(title, initial, onDone) {
  promptState = { value: initial || "", onDone };
  const row = "azertyuiop|qsdfghjklm|wxcvbn0123456789";
  const keys = row.split("|").map(line => [...line].map(c => `<span class="pk focusable" data-k="${c}" data-key="pk:${c}">${c}</span>`).join("")).join("</div><div class=\"pkrow\">");
  modalRaw(`<h2>${esc(title)}</h2>
    <div class="pfield" id="pfield"></div>
    <div class="pkb"><div class="pkrow">${keys}</div>
      <div class="pkrow"><span class="pk wide focusable" data-k=" " data-key="pk:space">Espace</span><span class="pk wide focusable" data-k="back" data-key="pk:back">Effacer</span><span class="pk wide focusable" data-k="paste" data-key="pk:paste">Coller</span></div></div>
    <p class="mtxt">Astuce : un clavier USB ou l’appli télécommande Fire TV permet de coller directement.</p>`,
    [["Valider", true, () => { const v = promptState.value; closeModal(); onDone(v); }], ["Annuler", false, closeModal]]);
  drawPField();
  $$("#modal .pk").forEach(k => { k._enter = () => pressPKey(k.dataset.k); });
}
function drawPField() { const f = $("#pfield"); if (f) f.innerHTML = promptState.value ? esc(promptState.value) + "<span class=\"pcur\"></span>" : "<span class=\"pph\">Saisissez ou collez le texte</span><span class=\"pcur\"></span>"; }
async function pressPKey(k) {
  if (k === "back") promptState.value = promptState.value.slice(0, -1);
  else if (k === "paste") { try { const t = await navigator.clipboard.readText(); if (t) promptState.value += t.trim(); } catch { A.toast("<div><b>Collage indisponible</b><small>Tapez la clé avec le clavier, ou branchez un clavier USB.</small></div>", 3500); } }
  else promptState.value += k;
  drawPField();
}
function modalRaw(html, buttons) { modal(html, buttons); }

/* ---------- profils multi-comptes (écran de lancement type Netflix) ---------- */
function connectSound() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ac = new Ctx();
    const now = ac.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = "sine"; o.frequency.value = f;
      o.connect(g); g.connect(ac.destination);
      const t = now + i * 0.06;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.18, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      o.start(t); o.stop(t + 0.3);
    });
    setTimeout(() => ac.close(), 600);
  } catch { /* son non dispo */ }
}
function chooseProfile() {
  return new Promise(async resolve => {
    const profiles = P.demo ? (P.isLogged() ? [P.getMe && P.getMe() ? { id: "demo", login: "toi", name: (P.getMe() || {}).display_name || "TOI", avatar: "" } : null].filter(Boolean) : []) : P.listProfiles();
    if (!profiles.length) { await startLogin(); resolve(); return; }
    renderProfilePicker(profiles, resolve);
  });
}
function renderProfilePicker(profiles, done) {
  const L = $("#login");
  L.className = "picker";
  const cards = profiles.map(p => `<div class="pf-card focusable" data-id="${esc(p.id)}" data-key="pf:${esc(p.id)}">
      ${ava({ name: p.name, login: p.login, avatar: p.avatar }, 190, false)}<div class="pf-name">${esc(p.name)}</div></div>`).join("");
  L.innerHTML = `<div class="pf-wrap"><div class="logo">${$(".topbar .logo").innerHTML}</div>
    <h1 class="pf-title">Qui regarde ?</h1>
    <div class="pf-grid">${cards}<div class="pf-card add focusable" data-key="pf:add"><div class="pf-plus">+</div><div class="pf-name">Ajouter un compte</div></div></div></div>`;
  N.cands = () => [...L.querySelectorAll(".focusable")];
  const pick = async (id) => {
    const okSession = P.setActiveProfile ? P.setActiveProfile(id) : true;
    if (okSession === false) {
      // Profil sans session valide : on relance la connexion pour ce compte.
      N.cands = defaultCands;
      L.className = "";
      await startLogin();
      done();
      return;
    }
    connectSound();
    L.classList.add("launch");
    // Rend la navigation à l’app : sinon les flèches visent encore les cartes de profil, devenues invisibles,
    // et plus rien ne répond (menu bloqué dans tous les onglets).
    N.cands = defaultCands;
    setTimeout(() => { L.className = "gone"; L.innerHTML = ""; done(); }, 650);
  };
  let picked = false;   // un seul choix : un 2e appui sur OK pendant l’animation ne relance rien
  L.querySelectorAll(".pf-card[data-id]").forEach(el => {
    el._enter = () => { if (picked) return; picked = true; pick(el.dataset.id); };
  });
  const add = L.querySelector(".pf-card.add");
  add._enter = async () => { N.cands = defaultCands; await startLogin(); done(); };
  setFocus(L.querySelector(".focusable"), { scroll: false });
}

function switchProfile() { location.reload(); }  // relance l’app -> écran "Qui regarde ?"
async function addAccount() {
  N.cands = defaultCands;
  $("#login").className = ""; 
  await startLogin();
  location.reload();
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
    boot.innerHTML = `<div class="boot-err"><b>Impossible de charger vos chaînes</b><small>${esc(e.message)}</small>
      <div class="boot-btns"><div class="btn primary focusable" id="boot-retry">Réessayer</div><div class="btn focusable" id="boot-switch">Changer de compte</div></div></div>`;
    $("#boot-retry")._enter = () => location.reload();
    $("#boot-switch")._enter = () => { if (P.logout) { try { P.logout(); } catch { /* */ } } location.reload(); };
    N.cands = () => [...boot.querySelectorAll(".focusable")];
    setFocus($("#boot-retry"), { scroll: false });
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
    if (!A.lives().length) { D.topFr = await P.getTopFrenchStreams(10); softRefresh(); }
  } catch (e) { log("WARN", "lives FR", e.message); }
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
    if (!A.lives().length && !D.topFr.length) { try { D.topFr = await P.getTopFrenchStreams(10); } catch (e) { log("WARN", e.message); } }
    if (started.length || !A.lives().length) softRefresh();
  } catch (e) { log("WARN", "actualisation", e.message); }
}

/* ---------- touches ---------- */
let lastKey = Date.now(), lastMove = 0;
function onAction(a) {
  lastKey = Date.now();
  if (!$("#modal").classList.contains("gone")) {
    if (a === "back") { modalOnBack ? modalOnBack() : closeModal(); return true; }
    if (a === "ok") { activate(N.focused); return true; }
    if (["up", "down", "left", "right"].includes(a)) move(a);
    return true;
  }
  if (!$("#login").classList.contains("gone")) {
    if (a === "ok") {
      if (N.focused && $("#login").contains(N.focused)) activate(N.focused);
      else if (DEMO) P.validateDemoLogin && P.validateDemoLogin();
    } else if (["up", "down", "left", "right"].includes(a)) {
      move(a);   // permet d’atteindre "Ajouter un compte" et les autres profils
    }
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
  if (promptState && !$("#modal").classList.contains("gone")) {
    if (e.key === "Enter" || e.key === "Escape" || e.key.startsWith("Arrow")) { /* géré par la navigation */ }
    else if (e.key === "Backspace") { e.preventDefault(); promptState.value = promptState.value.slice(0, -1); drawPField(); return; }
    else if (e.key.length === 1) { e.preventDefault(); promptState.value += e.key; drawPField(); return; }
  }
  if (S.view === "search" && !isOpen() && $("#modal").classList.contains("gone") && !e.ctrlKey && !e.metaKey && !e.altKey) {
    if (/^[a-z0-9]$/i.test(e.key)) { e.preventDefault(); UI.typeQ(e.key.toLowerCase()); return; }
    if (e.key === "Backspace" && UI.backQ()) { e.preventDefault(); return; }
  }
  const map = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", Enter: "ok", " ": "ok", Escape: "back", Backspace: "back", c: "chat", C: "chat", s: "stats", S: "stats", MediaPlayPause: "playpause" };
  let a = map[e.key];
  if (!a && e.keyCode === 23) a = "ok"; // bouton central de certaines télécommandes
  if (!a) return;
  e.preventDefault();
  if (a === "up" || a === "down" || a === "left" || a === "right") {
    // Flèche maintenue ou tapée en rafale : on limite la cadence pour que l’écran suive,
    // et on défile sans animation (les animations empilées figeaient l’interface).
    const now = performance.now();
    if (now - lastMove < 75) return;
    N.fast = now - lastMove < 280;
    lastMove = now;
  }
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
  $("#boot").classList.add("gone");
  await chooseProfile();
  $("#boot").classList.remove("gone");
  const me = P.getMe();
  if (me) $("#me").outerHTML = ava({ name: me.display_name, login: me.login, avatar: me.profile_image_url }, 56, false).replace("class=\"ava\"", "class=\"ava\" id=\"me\"");
  if (!(await loadAll())) return;
  setInterval(refreshLives, DEMO ? 20000 : 90000);
  setInterval(() => { if (!isOpen()) loadExtra(); }, 15 * 60000);
  setTimeout(() => checkUpdate(false), 5000);
  if (P.keepProfilesAlive) { setTimeout(P.keepProfilesAlive, 20000); setInterval(P.keepProfilesAlive, 12 * 3600e3); }
}
boot();
