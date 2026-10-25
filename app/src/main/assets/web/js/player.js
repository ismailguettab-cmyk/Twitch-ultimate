// Lecteur plein écran : live, rediffusion, clip. Chat par-dessus l’image, 2e live, statistiques, zapping.
import { $, h, esc, hm, clk, kf, hueOf } from "./util.js";
import { settings, saveSettings, favs, toggleFav, progressOf, saveProgress } from "./store.js";
import { DEMO } from "./config.js";
import { log } from "./log.js";
import { N, setFocus, move, activate } from "./nav.js";
import { liveMasterUrl, vodMasterUrl, clipUrl, AdGuard, makeLoader } from "./playback.js";
import { Chat } from "./chat.js";
import { drawScene, fakeChatLine } from "./mock.js";
import { PLAY, PAUSE, CHATI } from "./ui.js";
import { ava } from "./util.js";
import { stopPreview } from "./preview.js";

let A;
export function bindPlayer(app) { A = app; }

const P = { open: false, seq: 0, quals: [], qi: 0, chat: false, stats: false, ads: 0 };
const el = id => document.getElementById(id);
let player, video, pipv, pcv, pipcv;
const chat = new Chat(html => pushMsg(html), st => { if (st === "reconnect") pushMsg("<span class=\"sys\">Reconnexion au chat…</span>"); });

export const isOpen = () => P.open;
export const current = () => P;

export function initPlayer() {
  player = el("player"); video = el("video"); pipv = el("pipv"); pcv = el("pcv"); pipcv = el("pipcv");
  P.stats = settings.stats === 1;
  video.addEventListener("playing", () => hideMsg());
  video.addEventListener("waiting", () => { clearTimeout(P.waitT); P.waitT = setTimeout(() => { if (P.open && video.readyState < 3) showMsg("buffer"); }, 900); });
  video.addEventListener("canplay", () => { clearTimeout(P.waitT); if (el("pmsg").dataset.kind === "buffer") hideMsg(); });
  video.addEventListener("ended", () => { if (P.open && P.mode !== "live") showMsg("end"); });
  setInterval(updateStats, 1000);
  setInterval(watchDrops, 1000);
  setInterval(() => { if (P.open && P.mode === "vod" && !DEMO) saveProgress(P.vod, video.currentTime); }, 15000);
  // Le chat est ajouté par paquets, 4 fois par seconde : le faire à chaque image volait du temps à la vidéo.
  setInterval(() => { if (P.open) flushChat(); }, 250);
  if (DEMO) requestAnimationFrame(loop);   // l’animation image par image ne sert qu’au mode démo
}

/* ---------- qualité adaptée au Fire Stick ----------
 * Si le décodeur perd beaucoup d’images (1080p60 trop lourd pour certains modèles), on descend d’un cran
 * automatiquement, une seule fois par lecture, et on prévient. */
const drops = { f: 0, d: 0, bad: 0 };
function watchDrops() {
  if (!P.open || P.demo || P.paused || !P.hls || !video.getVideoPlaybackQuality) return;
  const q = video.getVideoPlaybackQuality(), df = q.totalVideoFrames - drops.f, dd = q.droppedVideoFrames - drops.d;
  drops.f = q.totalVideoFrames; drops.d = q.droppedVideoFrames;
  if (df < 10 || P.autoLowered) { drops.bad = 0; return; }
  drops.bad = dd / df > 0.12 ? drops.bad + 1 : 0;
  if (drops.bad < 5) return;
  const auto = P.quals.length - 1;
  if (P.qi >= auto - 1) return;          // déjà au plus bas, ou en Auto
  P.autoLowered = true; drops.bad = 0;
  P.qi++; applyQuality(); refreshBtns();
  A.toast(`<div><b>Qualité réduite à ${esc(P.quals[P.qi].label)}</b><small>Votre appareil perdait des images. Vous pouvez la changer avec le bouton Qualité.</small></div>`, 4500);
  log("INFO", "qualité réduite automatiquement", P.quals[P.qi].label);
}

/* ---------- ouverture / fermeture ---------- */
export async function openPlayer(o) {
  stopPreview();
  P.ret = N.focused; P.open = true; P.ch = o.ch; P.mode = o.mode; P.vod = o.vod || null; P.clip = o.clip || null;
  P.paused = false; P.t = 0; P.dur = 0; P.ads = 0; P.vt = 0; P.reposing = false; P.mpOpen = false; P.mpSel = null; P.mpHl = null;
  if (o.chat) P.chat = true;
  player.classList.add("open");
  el("stage").classList.add("p-open");   // l’interface derrière la vidéo n’est plus dessinée
  applyChat(); buildUI(); showZap(); showUI(false);
  startChat();
  if (P.mode === "live" && !P.ch.stream) { try { P.ch.stream = await A.P.getStream(P.ch); buildUI(); } catch (e) { log("WARN", e.message); } }
  await startMain();
}
export function closePlayer() {
  if (P.mode === "vod") saveProgress(P.vod, DEMO ? P.t : video.currentTime);
  P.open = false; P.seq++;
  stopMain(); stopPip(); applyMultiplex(); chat.close();
  clearTimeout(P.uiT); clearTimeout(P.adT);
  el("adpill").classList.remove("show");
  el("qmenu").classList.add("gone");
  player.classList.remove("open", "ui");
  el("stage").classList.remove("p-open");
  A.onPlayerClosed(P.ret, P.mode);
}

function resumePos() {
  if (P.mode !== "vod" || settings.resume !== 0) return 0;
  const p = progressOf(P.vod.id);
  if (p > 0) A.toast(`<div><b>Reprise à ${clk(p)}</b><small>Là où vous vous étiez arrêté.</small></div>`, 3000);
  return p;
}

async function startMain() {
  stopMain();
  const my = ++P.seq;
  P.autoLowered = false; drops.f = drops.d = drops.bad = 0;
  showMsg("loading");
  if (DEMO) {
    P.demo = true;
    pcv.style.display = "block"; video.style.display = "none";
    P.quals = [{ label: "1080p60 source", w: 1280, h: 720 }, { label: "720p60", w: 640, h: 360 }, { label: "480p", w: 256, h: 144, px: true }, { label: "Auto", w: 1280, h: 720 }];
    P.qi = settings.quality === 1 ? 3 : 0;
    applyQuality();
    if (P.mode === "vod") { P.dur = P.vod.sec; P.t = resumePos(); }
    if (P.mode === "clip") { P.dur = P.clip.sec; P.t = 0; }
    setTimeout(() => { if (my === P.seq) hideMsg(); }, 500);
    if (P.mode === "live") P.adT = setTimeout(() => { if (my === P.seq) adStart(settings.adblock === 0 ? "backup" : "shown"); }, 7000 + Math.random() * 4000);
    buildUI();
    return;
  }
  try {
    if (P.mode === "clip") {
      const url = await clipUrl(P.clip.id);
      if (my !== P.seq) return;
      P.quals = [{ label: "Source", i: -1 }]; P.qi = 0;
      video.src = url;
      video.play().catch(() => {});
    } else {
      const url = P.mode === "live" ? await liveMasterUrl(P.ch.login) : await vodMasterUrl(P.vod.id);
      if (my !== P.seq) return;
      P.hls = attachHls(video, url, { live: P.mode === "live", login: P.ch.login, start: resumePos(), main: true });
    }
  } catch (e) {
    log("ERR", e);
    if (my !== P.seq) return;
    if (e.message === "ABO_REQUIS") showMsg("error", "Cette rediffusion est réservée aux abonnés. Si vous êtes abonné à cette chaîne, connectez votre session dans Réglages > Rediffusions des abonnés.");
    else showMsg("error", e.message);
  }
}
function stopMain() {
  if (P.hls) { try { P.hls.destroy(); } catch { /* déjà détruit */ } P.hls = null; }
  P.demo = false;
  pcv.style.display = ""; video.style.display = "";
  video.pause(); video.removeAttribute("src"); video.load();
}

function attachHls(v, url, opt) {
  // Tampons bornés : le Fire Stick a peu de mémoire. En live, 3 segments d’avance minimum :
  // avec 2, la moindre lenteur réseau vide le tampon et l’image saccade.
  const cfg = {
    enableWorker: true, lowLatencyMode: false, capLevelToPlayerSize: false,
    backBufferLength: opt.live ? 8 : 20, maxBufferLength: opt.pip ? 8 : 20, maxMaxBufferLength: opt.pip ? 12 : 30, maxBufferSize: (opt.pip ? 15 : 40) * 1e6,
    liveSyncDurationCount: settings.lowLat ? 3 : 4, liveMaxLatencyDurationCount: settings.lowLat ? 10 : 14,
    startFragPrefetch: true, nudgeMaxRetry: 6,
    manifestLoadingMaxRetry: 2, levelLoadingMaxRetry: 4, fragLoadingMaxRetry: 6,
  };
  if (opt.start > 0) cfg.startPosition = opt.start;
  let hls = null;
  if (opt.live) {
    const guard = new AdGuard(opt.login, {
      onStart: mode => { if (opt.main) { P.ads = guard.skipped; adStart(mode); } },
      onEnd: () => { if (opt.main) adEnd(); },
    });
    cfg.pLoader = makeLoader(guard, () => hls);
  }
  hls = new window.Hls(cfg);
  let retries = 0;
  const H = window.Hls;
  hls.on(H.Events.MANIFEST_PARSED, () => {
    if (opt.main) { buildQualities(hls); applyQuality(); }
    else {
      const lv = hls.levels.map((l, i) => ({ i, h: l.height })).filter(l => l.h >= 360).sort((a, b) => a.h - b.h);
      if (lv.length) hls.currentLevel = lv[0].i;
    }
    v.play().catch(() => {});
  });
  hls.on(H.Events.FRAG_LOADED, () => { retries = 0; });
  hls.on(H.Events.ERROR, (ev, d) => {
    if (!opt.main) { if (d.fatal && hls === P.pipHls) { log("WARN", "2e live", d.details); exitMultiplex("Le 2e live s’est interrompu"); } return; }
    const code = d.response && d.response.code;
    if (d.details === H.ErrorDetails.MANIFEST_LOAD_ERROR && code === 403) {
      showMsg("error", P.mode === "vod" ? "Cette rediffusion est réservée aux abonnés. Si vous êtes abonné, connectez votre session dans Réglages > Rediffusions des abonnés." : "Ce live n’est pas accessible."); hls.destroy(); return;
    }
    if (d.details === H.ErrorDetails.MANIFEST_LOAD_ERROR && code === 404) {
      showMsg("error", P.mode === "live" ? "Cette chaîne n’est plus en direct." : "Rediffusion introuvable."); hls.destroy(); return;
    }
    if (!d.fatal) {
      if (d.details === H.ErrorDetails.BUFFER_STALLED_ERROR && P.mode === "live" && hls.liveSyncPosition && v.currentTime < hls.liveSyncPosition - 10) v.currentTime = hls.liveSyncPosition;
      return;
    }
    log("WARN", "lecture", d.type, d.details, code || "");
    if (d.type === H.ErrorTypes.NETWORK_ERROR && retries < 4) { retries++; setTimeout(() => hls.startLoad(), 1000 * retries); }
    else if (d.type === H.ErrorTypes.MEDIA_ERROR && retries < 4) { retries++; hls.recoverMediaError(); }
    else showMsg("error", `La lecture a échoué (${d.details}). Revenez en arrière et réessayez.`);
  });
  hls.loadSource(url);
  hls.attachMedia(v);
  return hls;
}

/* ---------- qualité ---------- */
function buildQualities(hls) {
  const lv = hls.levels.map((l, i) => ({ i, h: l.height || 0, fr: Math.round(l.frameRate || 30) })).filter(l => l.h > 0)
    .sort((a, b) => b.h - a.h || b.fr - a.fr);
  const name = l => { const q = l.h >= 2160 ? "4K" : l.h >= 1440 ? "2K" : l.h + "p"; return q + (l.fr > 30 ? (l.h >= 1440 ? " " : "") + l.fr : ""); };
  P.quals = lv.map((l, k) => ({ label: k === 0 ? name(l) + " source" : name(l), i: l.i }));
  P.quals.push({ label: "Auto", i: -1 });
  P.qi = settings.quality === 1 ? P.quals.length - 1 : 0;
  refreshBtns();
}
function applyQuality() {
  const q = P.quals[P.qi];
  if (!q) return;
  if (P.demo) { pcv.width = q.w; pcv.height = q.h; pcv.classList.toggle("px", !!q.px); return; }
  if (P.hls) P.hls.currentLevel = q.i;
}

/* ---------- pubs ---------- */
function adStart(mode) {
  P.ads = Math.max(P.ads, 1);
  const pill = el("adpill");
  if (mode === "shown") { // démo avec blocage désactivé
    let n = 15; const o = el("adov");
    const r = () => { o.innerHTML = `<div>Publicité, ${n} s<small>Activez le blocage des pubs dans Réglages pour ne plus les voir</small></div>`; };
    r(); o.classList.add("on");
    const t = setInterval(() => { n--; if (n <= 0 || !P.open) { clearInterval(t); o.classList.remove("on"); } else r(); }, 1000);
    return;
  }
  pill.innerHTML = `<i></i>${mode === "strip" ? "Coupure pub ignorée, le live reprend dans un instant" : "Coupure pub ignorée, vous restez sur le live"}`;
  pill.classList.add("show");
  if (P.demo) setTimeout(() => pill.classList.remove("show"), 3800);
}
function adEnd() { setTimeout(() => el("adpill").classList.remove("show"), 1200); }

/* ---------- multiplex : deux lives empilés ----------
 * Chaque live occupe un cadre 16:9 de 960 × 540 au centre de sa moitié d’écran.
 * Bande noire de gauche : le panneau de réglage. Bande de droite : les infos des deux lives, ou le chat.
 * Le stream sélectionné dans le panneau est entouré de violet. */
const MP_STEP = 0.1;
const mpSlot = who => (who === "main") === (P.mpTop !== "pip") ? "top" : "bottom";   // "main" = P.ch, "pip" = P.pip
const mpCh = who => who === "main" ? P.ch : P.pip;
const pct = v => Math.round(v * 100);
function applyPip() { applyMultiplex(); }
function applyMultiplex() {
  const on = !!P.pip;
  player.classList.toggle("multiplex", on);
  player.classList.toggle("mp-main-top", on && P.mpTop !== "pip");
  el("pipwrap").classList.toggle("on", on);
  pipcv.style.display = DEMO ? "block" : "none";
  pipv.style.display = DEMO ? "none" : "block";
  if (on) { el("piplab").textContent = P.pip.name; el("mainlab").textContent = P.ch.name; }
  else { P.mpOpen = false; P.mpSel = null; P.mpHl = null; }
  el("mpanel").classList.toggle("gone", !on || !P.mpOpen);
  drawMpFrame(); drawMpInfo(); applyVolumes();
}
function applyVolumes() {
  if (DEMO) return;
  if (!P.pip) { video.volume = 1; video.muted = false; pipv.muted = true; return; }
  video.volume = P.vol.main; video.muted = P.mute.main || P.vol.main === 0;
  pipv.volume = P.vol.pip; pipv.muted = P.mute.pip || P.vol.pip === 0;
}
/** Contour violet autour du stream sélectionné. */
function drawMpFrame() {
  const f = el("mpframe");
  const on = !!(P.pip && P.mpOpen && P.mpHl);
  f.classList.toggle("on", on);
  if (on) f.classList.toggle("bottom", mpSlot(P.mpHl) === "bottom");
}
/** Bande de droite : une carte par live (masquée quand le chat est affiché). */
function drawMpInfo() {
  const box = el("mpinfo");
  if (!P.pip) { box.innerHTML = ""; return; }
  const card = who => {
    const c = mpCh(who), s = c.stream || {}, muted = P.mute[who] || P.vol[who] === 0;
    return `<div class="mpi ${mpSlot(who)}${P.mpHl === who && P.mpOpen ? " hl" : ""}">${ava(c, 64, false)}
      <div class="mpi-n">${esc(c.name)}</div><div class="mpi-c">${esc(s.cat || "")}${s.viewers != null ? ` · ${kf(s.viewers)} spectateurs` : ""}</div>
      <div class="mpi-v${muted ? " off" : ""}">${muted ? "Son coupé" : `Volume ${pct(P.vol[who])} %`}<span class="mpbar"><i style="width:${muted ? 0 : pct(P.vol[who])}%"></i></span></div></div>`;
  };
  box.innerHTML = card("main") + card("pip");
}
/** Panneau de réglage (bande noire de gauche). focusKey : élément à resélectionner après redessin. */
function drawMpPanel(focusKey) {
  const m = el("mpanel");
  if (!P.pip) return;
  const mk = (key, html, fn, cls = "") => { const e = h("div", "mp-btn focusable " + cls, html); e.dataset.key = key; e._enter = fn; return e; };
  m.innerHTML = "";
  if (!P.mpSel) {
    m.appendChild(h("div", "mp-h", "<span class=\"mp-dot\"></span>Multiplex"));
    m.appendChild(h("div", "mp-sub", "Choisissez le stream à régler"));
    const order = P.mpTop === "pip" ? ["pip", "main"] : ["main", "pip"];
    for (const who of order) {
      const c = mpCh(who), muted = P.mute[who] || P.vol[who] === 0;
      const e = mk("mp:" + who, `${ava(c, 56, false)}<div class="mp-st"><div class="mp-pos">${mpSlot(who) === "top" ? "En haut" : "En bas"}</div>
        <div class="mp-n">${esc(c.name)}</div><div class="mp-vol${muted ? " off" : ""}">${muted ? "Son coupé" : pct(P.vol[who]) + " %"}</div></div><span class="mp-go">›</span>`,
        () => { P.mpSel = who; drawMpPanel("mp:up"); }, "mp-stream");
      e._focus = () => mpHighlight(who);
      m.appendChild(e);
    }
    m.appendChild(h("div", "mp-sep"));
    const plain = (key, label, fn) => { const e = mk(key, label, fn); e._focus = () => mpHighlight(null); m.appendChild(e); };
    plain("mp:swap", "Inverser haut et bas", () => { P.mpTop = P.mpTop === "pip" ? "ch" : "pip"; applyMultiplex(); drawMpPanel("mp:swap"); });
    plain("mp:chat", P.chat ? "Masquer le chat" : `Afficher le chat de ${esc(P.ch.name)}`, () => { P.chat = !P.chat; applyChat(); refreshBtns(); drawMpPanel("mp:chat"); });
    plain("mp:hide", "Masquer ce menu", hideMpPanel);
    plain("mp:quit", "Quitter le multiplex", () => exitMultiplex());
  } else {
    const who = P.mpSel, c = mpCh(who), muted = P.mute[who] || P.vol[who] === 0;
    const back = mk("mp:back", "‹ Retour", () => { P.mpSel = null; drawMpPanel("mp:" + who); }, "mp-back");
    back._focus = () => mpHighlight(who);
    m.appendChild(back);
    m.appendChild(h("div", "mp-cur", `${ava(c, 72, false)}<div><div class="mp-pos">${mpSlot(who) === "top" ? "Stream du haut" : "Stream du bas"}</div><div class="mp-n big">${esc(c.name)}</div></div>`));
    m.appendChild(h("div", "mp-meter" + (muted ? " off" : ""), `<b>${muted ? "Son coupé" : pct(P.vol[who]) + " %"}</b><span class="mpbar big"><i style="width:${muted ? 0 : pct(P.vol[who])}%"></i></span>`));
    const set = (key, label, fn, cls) => { const e = mk(key, label, () => { fn(); applyVolumes(); drawMpInfo(); drawMpPanel(key); }, cls); e._focus = () => mpHighlight(who); m.appendChild(e); };
    set("mp:up", "Augmenter le volume <span class=\"mp-k\">+</span>", () => { P.vol[who] = clamp01(P.vol[who] + MP_STEP); P.mute[who] = false; });
    set("mp:down", "Baisser le volume <span class=\"mp-k\">−</span>", () => { P.vol[who] = clamp01(P.vol[who] - MP_STEP); });
    set("mp:mute", muted ? "Rétablir le son" : "Couper le son", () => { if (muted) { P.mute[who] = false; if (P.vol[who] === 0) P.vol[who] = 0.5; } else P.mute[who] = true; }, muted ? "on" : "");
    if (who === "pip") set("mp:next", "Changer de chaîne", nextPipChannel);
  }
  const target = (focusKey && m.querySelector(`[data-key="${focusKey}"]`)) || m.querySelector(".focusable");
  setFocus(target, { scroll: false });
}
function mpHighlight(who) { if (P.mpHl === who) return; P.mpHl = who; drawMpFrame(); drawMpInfo(); }
function showMpPanel(focusKey) {
  P.mpOpen = true;
  el("mpanel").classList.remove("gone");
  el("mphint").classList.remove("show");
  drawMpPanel(focusKey);
}
function hideMpPanel() {
  P.mpOpen = false; P.mpSel = null; P.mpHl = null;
  el("mpanel").classList.add("gone");
  drawMpFrame(); drawMpInfo();
  const hint = el("mphint");
  hint.classList.add("show");
  clearTimeout(P.mpHintT); P.mpHintT = setTimeout(() => hint.classList.remove("show"), 3500);
}
/** Change le 2e live : chaîne suivie en direct suivante. */
function nextPipChannel() {
  const l = A.lives().filter(x => x.login !== P.ch.login);
  if (l.length < 2) { A.toast("<div><b>Pas d’autre live disponible</b><small>Aucune autre chaîne suivie n’est en direct.</small></div>", 3000); return; }
  const i = l.findIndex(x => x.login === P.pip.login);
  if (P.pipHls) { try { P.pipHls.destroy(); } catch { /* rien */ } P.pipHls = null; }
  pipv.pause(); pipv.removeAttribute("src"); pipv.load();
  P.pip = l[(i + 1) % l.length];
  startPip(); applyMultiplex();
}
async function startPip() {
  if (DEMO || !P.pip) return;
  const want = P.pip.login;
  try { const url = await liveMasterUrl(want); if (P.pip && P.pip.login === want) P.pipHls = attachHls(pipv, url, { live: true, pip: true, login: want }); }
  catch (e) { log("WARN", "2e live", e.message); }
}
function stopPip() {
  if (P.pipHls) { try { P.pipHls.destroy(); } catch { /* rien */ } P.pipHls = null; }
  pipv.pause(); pipv.removeAttribute("src"); pipv.load();
  P.pip = null;
}
function togglePip() {
  if (P.pip) { exitMultiplex(); return; }
  const c = A.lives().find(x => x.login !== P.ch.login);
  if (!c) { A.toast("<div><b>Aucun autre live</b><small>Aucune autre chaîne suivie n’est en direct.</small></div>", 3000); return; }
  // Le live en cours garde le son, le 2e démarre coupé : on règle ensuite dans le panneau.
  P.pip = c; P.mpTop = "ch"; P.vol = { main: 1, pip: 0.6 }; P.mute = { main: false, pip: true }; P.mpSel = null;
  startPip();
  showUI(false);
  applyMultiplex();
  showMpPanel("mp:pip");
}
function exitMultiplex(msg) {
  stopPip();
  applyMultiplex();
  el("mphint").classList.remove("show");
  buildUI(); showUI(true, el("pc-pip"));
  if (msg) A.toast(`<div><b>${esc(msg)}</b></div>`, 3000);
}
/** Touches pendant le multiplex. */
function mpKey(a) {
  if (!P.mpOpen) {
    if (a === "back") return closePlayer();
    if (["ok", "up", "down", "left", "right"].includes(a)) return showMpPanel();
    return;
  }
  if (a === "back") { if (P.mpSel) { const w = P.mpSel; P.mpSel = null; drawMpPanel("mp:" + w); } else hideMpPanel(); return; }
  if (a === "ok") return activate(N.focused);
  if (["up", "down", "left", "right"].includes(a)) {
    if (!N.focused || !el("mpanel").contains(N.focused)) { drawMpPanel(); return; }
    move(a);
  }
}
/** Éléments sélectionnables du lecteur, selon ce qui est affiché. */
export function playerCands() {
  if (P.pip && P.mpOpen) return [...el("mpanel").querySelectorAll(".focusable")];
  if (qualityMenuOpen()) return [...el("qmenu").querySelectorAll(".focusable")];
  return player.classList.contains("ui") ? [...el("p-bottom").querySelectorAll(".focusable")] : [];
}

/* ---------- chat ---------- */
let queue = [];
function startChat() {
  chat.close();
  const m = el("msgs"); m.innerHTML = ""; queue = [];
  el("chat-h").innerHTML = `${P.mode === "live" ? "Chat" : "Chat de la rediffusion"} de ${esc(P.ch.name)}<small>La vidéo reste en plein écran</small>`;
  if (P.mode !== "live") { pushMsg("<span class=\"sys\">Le chat des rediffusions et des clips n’est pas encore disponible.</span>"); return; }
  if (DEMO) { for (let i = 0; i < 14; i++) pushMsg(fakeChatLine()); return; }
  pushMsg("<span class=\"sys\">Connexion au chat…</span>");
  chat.connect(P.ch.login);
}
function pushMsg(html) { queue.push(html); if (queue.length > 60) queue = queue.slice(-40); }
(function demoChat() { if (P.open && DEMO && P.mode === "live" && !P.paused) pushMsg(fakeChatLine()); setTimeout(demoChat, 350 + Math.random() * 900); })();
function flushChat() {
  if (!queue.length) return;
  const m = el("msgs");
  const frag = document.createDocumentFragment();
  for (const html of queue) frag.appendChild(h("div", "msg", html));
  queue = [];
  m.appendChild(frag);
  while (m.children.length > 40) m.firstChild.remove();
}
function applyChat() {
  const c = el("chat");
  c.classList.toggle("on", P.chat);
  if (settings.chatFree) { P.chatX = settings.chatX; P.chatY = settings.chatY; c.classList.add("free"); positionChatFree(); }
  else { c.classList.remove("free"); c.style.left = ""; c.style.right = ""; c.style.top = ""; c.style.bottom = ""; }
  c.classList.toggle("left", !settings.chatFree && settings.chatPos === 1);
  c.classList.toggle("st-t", settings.chatStyle === 0);
  c.classList.toggle("st-d", settings.chatStyle === 1);
  c.style.setProperty("--cfs", [22, 27, 32][settings.chatSize] + "px");
  el("stats").classList.toggle("on", P.stats);
  applyPip();
}
export function onSettingChanged() { if (P.open) { applyChat(); refreshBtns(); } }

/* ---------- interface du lecteur ---------- */
function buildUI() {
  const c = P.ch, s = c.stream || {};
  const sub = P.mode === "clip" ? `Clip, ${kf(P.clip.views)} vues` : P.mode === "vod" ? `Rediffusion du live de ${hm(P.vod.start)} à ${hm(P.vod.end)}` : `${esc(s.cat || "")}${s.viewers != null ? `, ${kf(s.viewers)} spectateurs` : ""}`;
  const title = P.mode === "clip" ? P.clip.title : P.mode === "vod" ? P.vod.title : s.title;
  el("p-top").innerHTML = `${ava(c, 84, false)}<div><div class="pn">${esc(c.name)}${favs.has(c.login) ? " <span class=\"star\">★</span>" : ""}</div><div class="pt">${esc(title || "")}</div><div class="pm">${sub}</div></div>`;
  const b = el("p-bottom");
  b.innerHTML = "";
  if (P.mode !== "live") {
    const w = h("div", "seekwrap", `<span id="tcur"></span><div class="seek focusable" id="seek"><i id="sfill"></i><div class="knob" id="sknob"></div></div><span id="tdur"></span>`);
    b.appendChild(w);
    const sk = $("#seek", w);
    sk._key = d => { if (d === "left" || d === "right") { seek(d === "left" ? -30 : 30); return true; } return false; };
    sk._enter = togglePause;
  } else {
    b.appendChild(h("div", "liverow", `<span class="tag">En direct</span><span id="tcur"></span><span class="zh">▲ ▼ commandes masquées : chaîne précédente ou suivante</span>`));
  }
  const row = h("div", "pbtns");
  const mk = (id, html, fn) => { const e = h("div", "pbtn focusable", html); e.id = id; e._enter = fn; row.appendChild(e); return e; };
  mk("pc-play", "", togglePause);
  mk("pc-chat", "", openChatMenu);
  mk("pc-cst", "", () => { settings.chatStyle ^= 1; saveSettings(); applyChat(); refreshBtns(); });
  mk("pc-cpos", "", startChatReposition);
  if (P.mode === "live") { mk("pc-pip", "", togglePip); }
  mk("pc-q", "", openQualityMenu);
  mk("pc-stats", "Statistiques", toggleStats);
  b.appendChild(row);
  refreshBtns(); updTime();
}
function buildTop() { const pn = $("#p-top .pn"); if (pn) pn.innerHTML = esc(P.ch.name) + (favs.has(P.ch.login) ? " <span class=\"star\">★</span>" : ""); }
function refreshBtns() {
  const set = (id, html) => { const e = el(id); if (e) e.innerHTML = html; };
  set("pc-play", P.paused ? PLAY + "Lecture" : PAUSE + "Pause");
  set("pc-chat", CHATI + "Chat ▾");
  set("pc-cst", "Chat " + (settings.chatStyle ? "sombre" : "transparent"));
  set("pc-cpos", "Repositionner le chat");
  set("pc-pip", "Multiplex de stream");
  set("pc-q", "Qualité ▾");
  el("pc-chat")?.classList.toggle("on", P.chat);
  el("pc-stats")?.classList.toggle("on", P.stats);
}
/* ---------- menus déroulants (qualité, chat, multiplex) ---------- */
export const qualityMenuOpen = () => !el("qmenu").classList.contains("gone");
function openMenu(anchorId, title, items) {
  const m = el("qmenu");
  m.innerHTML = `<div class="qh">${title}</div>`;
  items.forEach(it => {
    const row = h("div", "qitem focusable" + (it.cur ? " cur" : ""), `<span>${it.label}</span>${it.cur ? "<b>✓</b>" : it.right || ""}`);
    row._enter = it.fn;
    if (it.key) row._key = it.key;
    m.appendChild(row);
  });
  m.classList.remove("gone");
  const b = el(anchorId), pr = player.getBoundingClientRect(), br = b.getBoundingClientRect();
  m.style.left = (br.left - pr.left) / N.scale + "px";
  m.style.bottom = (pr.bottom - br.top) / N.scale + 16 + "px";
  setFocus($(".qitem.cur", m) || $(".qitem", m), { scroll: false });
  clearTimeout(P.uiT);
  return m;
}
function openQualityMenu() {
  if (P.quals.length < 2) { A.toast("<div><b>Une seule qualité disponible</b><small>Cette vidéo n’est proposée qu’en une qualité.</small></div>", 2500); return; }
  openMenu("pc-q", "Qualité", P.quals.map((q, i) => ({ label: esc(q.label), cur: i === P.qi, fn: () => { P.qi = i; applyQuality(); closeQualityMenu(); refreshBtns(); } })));
}
function openChatMenu() {
  openMenu("pc-chat", "Chat", [
    { label: "Afficher le chat", cur: P.chat, fn: () => { P.chat = true; applyChat(); refreshBtns(); closeQualityMenu(); } },
    { label: "Masquer le chat", cur: !P.chat, fn: () => { P.chat = false; applyChat(); refreshBtns(); closeQualityMenu(); } },
  ]);
}
const clamp01 = v => Math.max(0, Math.min(1, Math.round(v * 10) / 10));
function closeQualityMenu(refocus = true) {
  const m = el("qmenu");
  if (m.classList.contains("gone")) return;
  m.classList.add("gone");
  if (refocus) setFocus(el(N.focused && N.focused.id ? N.focused.id : "pc-q"), { scroll: false });
  bump();
}

/* ---------- repositionnement libre du chat ---------- */
function startChatReposition() {
  if (!P.chat) { P.chat = true; applyChat(); refreshBtns(); }
  P.reposing = true;
  showUI(false);
  el("chat").classList.add("reposing");
  el("repohint").classList.add("on");
  positionChatFree();
}
function stopChatReposition(save) {
  P.reposing = false;
  el("chat").classList.remove("reposing");
  el("repohint").classList.remove("on");
  if (save) { settings.chatX = P.chatX; settings.chatY = P.chatY; settings.chatFree = 1; saveSettings(); }
  showUI(true, el("pc-cpos"));
}
function moveChat(dir) {
  const step = 4;
  if (dir === "left") P.chatX = Math.max(0, (P.chatX ?? 62) - step);
  else if (dir === "right") P.chatX = Math.min(72, (P.chatX ?? 62) + step);
  else if (dir === "up") P.chatY = Math.max(0, (P.chatY ?? 0) - step);
  else if (dir === "down") P.chatY = Math.min(55, (P.chatY ?? 0) + step);
  positionChatFree();
}
function positionChatFree() {
  const c = el("chat");
  c.style.left = (P.chatX ?? 62) + "%";
  c.style.right = "auto";
  c.style.top = (P.chatY ?? 0) + "%";
  c.style.bottom = "auto";
}

function showUI(on, focusEl) {
  if (!on) { closeQualityMenu(false); player.classList.remove("ui"); clearTimeout(P.uiT); return; }
  player.classList.add("ui");
  setFocus(focusEl || (N.focused && player.contains(N.focused) && N.focused.isConnected ? N.focused : el("pc-play")), { scroll: false });
  bump();
}
function bump() { clearTimeout(P.uiT); P.uiT = setTimeout(() => { if (!P.paused && !qualityMenuOpen()) showUI(false); }, 6000); }
function togglePause() {
  P.paused = !P.paused;
  if (!P.demo) { if (P.paused) video.pause(); else video.play().catch(() => {}); }
  refreshBtns(); bump();
}
function toggleChat() { P.chat = !P.chat; applyChat(); refreshBtns(); }
function toggleStats() { P.stats = !P.stats; settings.stats = P.stats ? 1 : 0; saveSettings(); applyChat(); refreshBtns(); }
function seek(d) {
  if (P.demo) { P.t = Math.max(0, Math.min(P.dur - 1, P.t + d)); }
  else if (isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + d));
  updTime();
}
function updTime() {
  const c = el("tcur");
  if (!c) return;
  if (P.mode === "live") {
    const st = P.ch.stream?.startedAt;
    const lat = P.hls && P.hls.latency ? `, retard ${P.hls.latency.toFixed(1).replace(".", ",")} s` : "";
    c.textContent = st ? "depuis " + clk((Date.now() - st) / 1000) + lat : lat.slice(2);
    return;
  }
  const t = P.demo ? P.t : video.currentTime || 0;
  const d = P.demo ? P.dur : (isFinite(video.duration) && video.duration) || (P.vod ? P.vod.sec : P.clip?.sec) || 1;
  c.textContent = clk(t);
  el("tdur").textContent = clk(d);
  const p = Math.min(100, t / d * 100);
  el("sfill").style.width = p + "%"; el("sknob").style.left = p + "%";
}
function zap(dir) {
  const l = A.lives();
  if (!l.length) return;
  let i = l.findIndex(c => c.login === P.ch.login);
  i = i < 0 ? 0 : (i + dir + l.length) % l.length;
  P.ch = l[i];
  if (P.pip && P.pip.login === P.ch.login) { stopPip(); applyPip(); }
  startMain(); startChat(); buildUI(); showZap();
}
let zT;
function showZap() {
  const c = P.ch, z = el("zap");
  const t = P.mode === "clip" ? P.clip.title : P.mode === "vod" ? P.vod.title : c.stream?.title;
  z.innerHTML = `${ava(c, 80, false)}<div><div class="zn">${esc(c.name)}</div><div class="zt">${esc(t || "")}</div></div>`;
  z.classList.add("show");
  clearTimeout(zT); zT = setTimeout(() => z.classList.remove("show"), 3200);
}
function showMsg(kind, text) {
  const m = el("pmsg");
  m.dataset.kind = kind;
  const html = { loading: "<span class=\"spin big\"></span>", buffer: "<span class=\"spin big\"></span>", end: "<b>Fin de la vidéo</b><small>Retour pour revenir à la liste.</small>" }[kind];
  m.innerHTML = html || `<b>Lecture impossible</b><small>${esc(text || "")}</small><small>Retour pour revenir à la liste.</small>`;
  m.classList.add("on");
}
function hideMsg() { el("pmsg").classList.remove("on"); el("pmsg").dataset.kind = ""; }

/* ---------- statistiques et boucle d’animation ---------- */
let lastFrames = 0, lastT = 0, lastLost = 0, demoFrames = 0;
function updateStats() {
  if (!P.open) return;
  if (player.classList.contains("ui")) updTime();
  if (!P.stats) return;
  const rows = [];
  if (P.demo) {
    const q = P.quals[P.qi];
    rows.push(["Résolution", q.label.startsWith("1080") || q.label === "Auto" ? "1920 × 1080" : q.label.startsWith("720") ? "1280 × 720" : "852 × 480"], ["Images/s (mesuré)", P.paused ? 0 : demoFrames], ["Débit", "8,4 Mb/s"]);
    demoFrames = 0;
  } else {
    const now = performance.now();
    const q = video.getVideoPlaybackQuality ? video.getVideoPlaybackQuality() : null;
    const frames = q ? q.totalVideoFrames : 0;
    const fps = lastT ? Math.round((frames - lastFrames) * 1000 / (now - lastT)) : 0;
    const lost = q ? q.droppedVideoFrames : 0;
    // Le compteur de Chrome est cumulé depuis le début : on affiche surtout la part perdue sur la dernière seconde.
    const lostNow = frames > lastFrames ? Math.round(Math.max(0, lost - lastLost) * 100 / (frames - lastFrames)) : 0;
    lastFrames = frames; lastT = now; lastLost = lost;
    const lv = P.hls && P.hls.levels[P.hls.currentLevel >= 0 ? P.hls.currentLevel : P.hls.loadLevel];
    const buf = video.buffered.length ? video.buffered.end(video.buffered.length - 1) - video.currentTime : 0;
    rows.push(["Résolution", `${video.videoWidth} × ${video.videoHeight}`], ["Images/s (mesuré)", Math.max(0, fps)],
      ["Images perdues", q ? `${lostNow} % (total ${lost})` : "?"], ["Débit", lv ? (lv.bitrate / 1e6).toFixed(1).replace(".", ",") + " Mb/s" : "?"],
      ["Codec", lv?.videoCodec || "?"], ["Tampon", buf.toFixed(1).replace(".", ",") + " s"]);
    if (P.mode === "live" && P.hls) rows.push(["Latence", (P.hls.latency || 0).toFixed(1).replace(".", ",") + " s"]);
  }
  if (P.mode === "live") rows.push(["Pubs ignorées", P.ads]);
  el("stats").innerHTML = rows.map(([a, b]) => `<div><span>${a}</span><span>${b}</span></div>`).join("");
}
let lastFrame = performance.now();
function loop(now) {
  const dt = Math.min(.1, (now - lastFrame) / 1000);
  lastFrame = now;
  if (P.open) {
    if (P.demo) {
      if (!P.paused) { P.vt += dt; if (P.mode !== "live") P.t = Math.min(P.dur, P.t + dt); }
      drawScene(pcv.getContext("2d"), pcv.width, pcv.height, P.vt, hueOf(P.ch.login), true);
      demoFrames++;
      if (P.pip) drawScene(pipcv.getContext("2d"), 480, 270, P.vt * 1.1 + 5, hueOf(P.pip.login), true);
    }
  }
  A.animateHero && A.animateHero(now);
  requestAnimationFrame(loop);
}

/* ---------- touches ---------- */
export function playerKey(a) {
  if (P.reposing) {
    if (a === "ok") return stopChatReposition(true);
    if (a === "back") return stopChatReposition(false);
    if (["up", "down", "left", "right"].includes(a)) return moveChat(a);
    return;
  }
  if (a === "chat" || a === "menu") { toggleChat(); if (P.pip && P.mpOpen) drawMpPanel(N.focused && N.focused.dataset.key); return; }
  if (a === "stats") return toggleStats();
  if (a === "suspend") { if (!P.paused) togglePause(); return; }
  if (a === "playpause") return togglePause();
  if (P.pip) return mpKey(a);   // multiplex : le panneau de gauche gère les touches
  if ((a === "rew" || a === "ff") && P.mode !== "live") { seek(a === "rew" ? -30 : 30); return showUI(true, el("seek")); }
  if (qualityMenuOpen()) {
    if (a === "back") return closeQualityMenu();
    if (a === "ok") return activate(N.focused);
    const f = N.focused;
    if ((a === "left" || a === "right") && f && f._key && f._key(a)) return;
    if (a === "up" || a === "down") move(a);
    return;
  }
  const ui = player.classList.contains("ui");
  if (!ui) {
    if (a === "back") return closePlayer();
    if (P.mode === "live" && (a === "up" || a === "down")) return zap(a === "up" ? -1 : 1);
    if (P.mode !== "live" && (a === "left" || a === "right")) { seek(a === "left" ? -30 : 30); return showUI(true, el("seek")); }
    return showUI(true);
  }
  bump();
  if (a === "back") return showUI(false);
  if (a === "ok") return activate(N.focused);
  const f = N.focused;
  if (f && f._key && f._key(a)) return;
  move(a);
}
export function playerClick(target) {
  if (!player.classList.contains("ui")) { showUI(true); return; }
  const f = target.closest(".focusable");
  if (f && f.id !== "seek") { setFocus(f, { scroll: false }); activate(f); bump(); }
}
export function seekClick(e) {
  const sk = el("seek");
  if (!sk) return;
  const r = sk.getBoundingClientRect(), frac = (e.clientX - r.left) / r.width;
  if (P.demo) P.t = frac * P.dur; else if (isFinite(video.duration)) video.currentTime = frac * video.duration;
  updTime();
}
