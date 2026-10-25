// Aperçu : quand une vignette de live reste sélectionnée un instant, le live se lance dessus avec le son.
// La vidéo est posée dans un calque séparé, sans coins arrondis ni transparence : sur le Fire Stick,
// une vidéo placée dans un bloc arrondi et agrandi s’affiche en noir.
// Le bandeau de l’accueil reste muet, pour ne pas lancer de son dès l’ouverture de l’app.
import { DEMO } from "./config.js";
import { liveMasterUrl, AdGuard, makeLoader } from "./playback.js";
import { drawScene } from "./mock.js";
import { hueOf } from "./util.js";
import { log } from "./log.js";
import { N } from "./nav.js";

let layer = null, curBox = null, hls = null, raf = 0, seq = 0, startT = null, stopT = null;

/** box : la vignette (.thumb) ou le bandeau d’accueil (.hero) sur lequel afficher l’aperçu. */
export function previewFocus(box, ch, delay = 900, sound = true) {
  clearTimeout(stopT);
  if (curBox === box && (layer || startT)) return;
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
  if (layer) {
    const v = layer.querySelector("video");
    if (v) { v.pause(); v.removeAttribute("src"); v.load(); }
    layer.remove(); layer = null;
  }
  curBox = null;
}

/** Crée le calque : sur le bandeau, dans le bandeau (sous le texte) ; sur une vignette, par-dessus, aligné dessus. */
function makeLayer(box) {
  const d = document.createElement("div");
  if (box.classList.contains("hero")) {
    d.className = "pvlayer in-hero";
    box.insertBefore(d, box.querySelector(".hero-shade"));
  } else {
    const st = document.getElementById("stage").getBoundingClientRect(), r = box.getBoundingClientRect(), s = N.scale;
    d.className = "pvlayer over";
    Object.assign(d.style, { left: (r.left - st.left) / s + "px", top: (r.top - st.top) / s + "px", width: r.width / s + "px", height: r.height / s + "px" });
    document.getElementById("stage").appendChild(d);
  }
  layer = d;
  return d;
}

async function start(box, ch, sound) {
  const my = ++seq;
  if (!box.isConnected) return;
  if (DEMO) {
    const d = makeLayer(box), cv = document.createElement("canvas");
    cv.width = 640; cv.height = 360; d.appendChild(cv);
    const t0 = performance.now();
    const f = now => { if (my !== seq) return; drawScene(cv.getContext("2d"), 640, 360, (now - t0) / 1000, hueOf(ch.login), true); raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    d.classList.add("on");
    return;
  }
  try {
    const url = await liveMasterUrl(ch.login, "embed");
    if (my !== seq || !box.isConnected) return;
    const d = makeLayer(box), v = document.createElement("video");
    v.muted = !sound; v.volume = 1; v.playsInline = true;
    d.appendChild(v);
    let h = null;
    const guard = new AdGuard(ch.login);
    h = new window.Hls({ enableWorker: true, maxBufferLength: 6, backBufferLength: 0, liveSyncDurationCount: 2, capLevelToPlayerSize: false, pLoader: makeLoader(guard, () => h) });
    hls = h;
    h.on(window.Hls.Events.MANIFEST_PARSED, () => {
      const lv = h.levels.map((l, i) => ({ i, h: l.height || 0 })).filter(l => l.h > 0).sort((a, b) => a.h - b.h);
      const pick = lv.find(l => l.h >= 480) || lv[lv.length - 1];
      if (pick) h.currentLevel = pick.i;
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    });
    v.addEventListener("playing", () => d.classList.add("on"), { once: true });
    h.on(window.Hls.Events.ERROR, (e, dd) => { if (dd.fatal) { log("WARN", "aperçu", dd.details); if (my === seq) stopPreview(); } });
    h.loadSource(url);
    h.attachMedia(v);
  } catch (e) { log("WARN", "aperçu", e.message); }
}
