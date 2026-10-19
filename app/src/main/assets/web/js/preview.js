// Aperçu : quand une vignette de live reste sélectionnée un instant, le live se lance dedans avec le son.
// Le bandeau de l’accueil reste muet, pour ne pas lancer de son dès l’ouverture de l’app.
import { DEMO } from "./config.js";
import { liveMasterUrl, AdGuard, makeLoader } from "./playback.js";
import { drawScene } from "./mock.js";
import { hueOf } from "./util.js";
import { log } from "./log.js";

let cur = null, curBox = null, hls = null, raf = 0, seq = 0, startT = null, stopT = null;

/** box : l’élément dans lequel afficher l’aperçu (vignette ou bandeau d’accueil). */
export function previewFocus(box, ch, delay = 900, sound = true) {
  clearTimeout(stopT);
  if (curBox === box && (cur || startT)) return; // déjà en cours sur ce même bloc
  stopPreview();
  curBox = box;
  startT = setTimeout(() => { startT = null; start(box, ch, sound); }, delay);
}
/** Arrêt différé : si le focus passe à un autre bouton du même bloc, l’aperçu continue. */
export function previewBlur() { clearTimeout(stopT); stopT = setTimeout(stopPreview, 60); }
export function stopPreview() {
  clearTimeout(startT); clearTimeout(stopT); startT = null; seq++;
  if (hls) { try { hls.destroy(); } catch { /* déjà détruit */ } hls = null; }
  cancelAnimationFrame(raf);
  if (cur) { cur.remove(); cur = null; }
  curBox = null;
}
function place(box, node) {
  const shade = box.querySelector(".hero-shade");
  if (shade) box.insertBefore(node, shade); else box.appendChild(node);
  cur = node;
}
async function start(box, ch, sound) {
  const my = ++seq;
  if (!box.isConnected) return;
  if (DEMO) {
    const cv = document.createElement("canvas");
    cv.className = "pv"; cv.width = 640; cv.height = 360;
    place(box, cv);
    const t0 = performance.now();
    const f = now => { if (my !== seq) return; drawScene(cv.getContext("2d"), 640, 360, (now - t0) / 1000, hueOf(ch.login), true); raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    setTimeout(() => cv.classList.add("on"), 50);
    return;
  }
  try {
    const url = await liveMasterUrl(ch.login, "embed");
    if (my !== seq || !box.isConnected) return;
    const v = document.createElement("video");
    v.className = "pv"; v.muted = !sound; v.volume = 1; v.playsInline = true;
    place(box, v);
    let h = null;
    const guard = new AdGuard(ch.login);
    h = new window.Hls({ enableWorker: true, maxBufferLength: 6, backBufferLength: 0, liveSyncDurationCount: 2, capLevelToPlayerSize: false, pLoader: makeLoader(guard, () => h) });
    hls = h;
    h.on(window.Hls.Events.MANIFEST_PARSED, () => {
      const lv = h.levels.map((l, i) => ({ i, h: l.height || 0 })).filter(l => l.h > 0).sort((a, b) => a.h - b.h);
      const pick = lv.find(l => l.h >= 360) || lv[lv.length - 1];
      if (pick) h.currentLevel = pick.i;
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    });
    v.addEventListener("playing", () => v.classList.add("on"), { once: true });
    h.on(window.Hls.Events.ERROR, (e, d) => { if (d.fatal) { log("WARN", "aperçu", d.details); if (my === seq) stopPreview(); } });
    h.loadSource(url);
    h.attachMedia(v);
  } catch (e) { log("WARN", "aperçu", e.message); }
}
