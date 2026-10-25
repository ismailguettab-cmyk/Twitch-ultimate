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
  setInterval(() => { if (P.open && P.mode === "vod" && !DEMO) saveProgress(P.vod, video.currentTime); }, 15000);
  requestAnimationFrame(loop);
}

/* ---------- ouverture / fermeture ---------- */
export async function openPlayer(o) {
  stopPreview();
  P.ret = N.focused; P.open = true; P.ch = o.ch; P.mode = o.mode; P.vod = o.vod || null; P.clip = o.clip || null;
  P.paused = false; P.t = 0; P.dur = 0; P.ads = 0; P.vt = 0;
  if (o.chat) P.chat = true;
  player.classList.add("open");
  applyChat(); buildUI(); showZap(); showUI(false);
  startChat();
  if (P.mode === "live" && !P.ch.stream) { try { P.ch.stream = await A.P.getStream(P.ch); buildUI(); } catch (e) { log("WARN", e.message); } }
  await startMain();
}
export function closePlayer() {
  if (P.mode === "vod") saveProgress(P.vod, DEMO ? P.t : video.currentTime);
  P.open = false; P.seq++;
  stopMain(); stopPip(); chat.close();
  clearTimeout(P.uiT); clearTimeout(P.adT);
  el("adpill").classList.remove("show");
  el("qmenu").classList.add("gone");
  player.classList.remove("open", "ui");
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
    if (my === P.seq) showMsg("error", e.message);
  }
}
function stopMain() {
  if (P.hls) { try { P.hls.destroy(); } catch { /* déjà détruit */ } P.hls = null; }
  P.demo = false;
  pcv.style.display = ""; video.style.display = "";
  video.pause(); video.removeAttribute("src"); video.load();
}

function attachHls(v, url, opt) {
  const cfg = {
    enableWorker: true, lowLatencyMode: false, backBufferLength: 30, maxBufferLength: opt.pip ? 10 : 30, capLevelToPlayerSize: false,
    liveSyncDurationCount: settings.lowLat ? 2 : 3, liveMaxLatencyDurationCount: settings.lowLat ? 6 : 10,
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
    if (!opt.main) { if (d.fatal) { log("WARN", "2e live", d.details); stopPip(); applyPip(); buildUI(); } return; }
    const code = d.response && d.response.code;
    if (d.details === H.ErrorDetails.MANIFEST_LOAD_ERROR && code === 403) {
      showMsg("error", P.mode === "vod" ? "Cette rediffusion est réservée aux abonnés de la chaîne." : "Ce live n’est pas accessible."); hls.destroy(); return;
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
  const name = l => `${l.h}p${l.fr > 30 ? l.fr : ""}`;
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

/* ---------- 2e live (incrustation) ---------- */
function applyPip() {
  const on = !!P.pip;
  el("pipwrap").classList.toggle("on", on);
  el("pipwrap").classList.toggle("left", P.chat && settings.chatPos === 0);
  pipcv.style.display = DEMO ? "block" : "none";
  pipv.style.display = DEMO ? "none" : "block";
  if (on) el("piplab").textContent = P.pip.name;
}
async function startPip() {
  if (DEMO || !P.pip) return;
  try { const url = await liveMasterUrl(P.pip.login); if (P.pip) P.pipHls = attachHls(pipv, url, { live: true, pip: true, login: P.pip.login }); }
  catch (e) { log("WARN", "2e live", e.message); }
}
function stopPip() {
  if (P.pipHls) { try { P.pipHls.destroy(); } catch { /* rien */ } P.pipHls = null; }
  pipv.pause(); pipv.removeAttribute("src"); pipv.load();
  P.pip = null;
}
function togglePip() {
  if (P.pip) stopPip();
  else {
    const c = A.lives().find(x => x.login !== P.ch.login);
    if (!c) { A.toast("<div><b>Aucun autre live</b><small>Aucune autre chaîne suivie n’est en direct.</small></div>", 3000); return; }
    P.pip = c; startPip();
  }
  applyPip(); buildUI(); setFocus(el("pc-pip"), { scroll: false }); bump();
}
function swapPip() {
  if (!P.pip) return;
  const a = P.ch, b = P.pip;
  stopPip(); P.ch = b; P.pip = a;
  startMain(); startPip(); startChat(); applyPip(); buildUI(); showZap();
  setFocus(el("pc-swap"), { scroll: false }); bump();
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
  c.classList.toggle("left", settings.chatPos === 1);
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
  mk("pc-chat", "", toggleChat);
  mk("pc-cst", "", () => { settings.chatStyle ^= 1; saveSettings(); applyChat(); refreshBtns(); });
  mk("pc-cpos", "", () => { settings.chatPos ^= 1; saveSettings(); applyChat(); refreshBtns(); });
  if (P.mode === "live") { mk("pc-pip", "", togglePip); if (P.pip) mk("pc-swap", "Inverser les lives", swapPip); }
  mk("pc-q", "", openQualityMenu);
  mk("pc-fav", "", () => { const on = toggleFav(c.login); refreshBtns(); buildTop(); A.toast(`<div><b>${on ? "Ajouté aux favoris" : "Retiré des favoris"}</b><small>${esc(c.name)} ${on ? "passera en premier partout dans l’app." : "n’est plus en favori."}</small></div>`, 2500); });
  mk("pc-stats", "Statistiques", toggleStats);
  b.appendChild(row);
  refreshBtns(); updTime();
}
function buildTop() { const pn = $("#p-top .pn"); if (pn) pn.innerHTML = esc(P.ch.name) + (favs.has(P.ch.login) ? " <span class=\"star\">★</span>" : ""); }
function refreshBtns() {
  const set = (id, html) => { const e = el(id); if (e) e.innerHTML = html; };
  set("pc-play", P.paused ? PLAY + "Lecture" : PAUSE + "Pause");
  set("pc-chat", CHATI + (P.chat ? "Masquer le chat" : "Afficher le chat"));
  set("pc-cst", "Chat " + (settings.chatStyle ? "sombre" : "transparent"));
  set("pc-cpos", "Chat " + (settings.chatPos ? "à gauche" : "à droite"));
  set("pc-pip", P.pip ? "Retirer le 2e live" : "Ajouter un 2e live");
  set("pc-q", (P.quals[P.qi]?.label || "Qualité") + " ▾");
  set("pc-fav", favs.has(P.ch?.login) ? "★ Favori" : "☆ Favori");
  el("pc-chat")?.classList.toggle("on", P.chat);
  el("pc-stats")?.classList.toggle("on", P.stats);
  el("pc-fav")?.classList.toggle("on", favs.has(P.ch?.login));
}
/* ---------- liste des qualités ---------- */
export const qualityMenuOpen = () => !el("qmenu").classList.contains("gone");
function openQualityMenu() {
  if (P.quals.length < 2) { A.toast("<div><b>Une seule qualité disponible</b><small>Cette vidéo n’est proposée qu’en une qualité.</small></div>", 2500); return; }
  const m = el("qmenu");
  m.innerHTML = "<div class=\"qh\">Qualité</div>";
  P.quals.forEach((q, i) => {
    const it = h("div", "qitem focusable" + (i === P.qi ? " cur" : ""), `<span>${esc(q.label)}</span>${i === P.qi ? "<b>✓</b>" : ""}`);
    it._enter = () => { P.qi = i; applyQuality(); closeQualityMenu(); refreshBtns(); };
    m.appendChild(it);
  });
  m.classList.remove("gone");
  const b = el("pc-q"), pr = player.getBoundingClientRect(), br = b.getBoundingClientRect();
  m.style.left = (br.left - pr.left) / N.scale + "px";
  m.style.bottom = (pr.bottom - br.top) / N.scale + 16 + "px";
  setFocus($(".qitem.cur", m) || $(".qitem", m), { scroll: false });
  clearTimeout(P.uiT);
}
function closeQualityMenu(refocus = true) {
  const m = el("qmenu");
  if (m.classList.contains("gone")) return;
  m.classList.add("gone");
  if (refocus) setFocus(el("pc-q"), { scroll: false });
  bump();
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
let lastFrames = 0, lastT = 0, demoFrames = 0;
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
    lastFrames = frames; lastT = now;
    const lv = P.hls && P.hls.levels[P.hls.currentLevel >= 0 ? P.hls.currentLevel : P.hls.loadLevel];
    const buf = video.buffered.length ? video.buffered.end(video.buffered.length - 1) - video.currentTime : 0;
    rows.push(["Résolution", `${video.videoWidth} × ${video.videoHeight}`], ["Images/s (mesuré)", Math.max(0, fps)],
      ["Images perdues", q ? q.droppedVideoFrames : "?"], ["Débit", lv ? (lv.bitrate / 1e6).toFixed(1).replace(".", ",") + " Mb/s" : "?"],
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
    flushChat();
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
  if (a === "chat" || a === "menu") return toggleChat();
  if (a === "stats") return toggleStats();
  if (a === "suspend") { if (!P.paused) togglePause(); return; }
  if (a === "playpause") return togglePause();
  if ((a === "rew" || a === "ff") && P.mode !== "live") { seek(a === "rew" ? -30 : 30); return showUI(true, el("seek")); }
  if (qualityMenuOpen()) {
    if (a === "back") return closeQualityMenu();
    if (a === "ok") return activate(N.focused);
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
