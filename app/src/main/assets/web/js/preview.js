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

let layer = null, curBox = null, hls = null, raf = 0, seq = 0, startT = null, stopT = null, lastStop = 0;
let vid = null;       // UNE seule balise vidéo réutilisée : le Fire Stick n’a qu’un ou deux décodeurs matériels
const COOLDOWN = 700; // laisse le décodeur se libérer entre deux aperçus

/** box : la vignette (.thumb) ou le bandeau d’accueil (.hero) sur lequel afficher l’aperçu. */
export function previewFocus(box, ch, delay = 1300, sound = true) {
  clearTimeout(stopT);
  if (curBox === box && (layer || startT)) return;
  stopPreview();
  curBox = box;
  const wait = Math.max(delay, lastStop + COOLDOWN - performance.now());
  startT = setTimeout(() => { startT = null; start(box, ch, sound); }, wait);
}
/** Arrêt différé : si le focus passe à un autre bouton du même bloc, l’aperçu continue. */
export function previewBlur() { clearTimeout(stopT); stopT = setTimeout(stopPreview, 60); }
export function stopPreview() {
  clearTimeout(startT); clearTimeout(stopT); startT = null; seq++;
  const busy = hls || layer;
  if (hls) { try { hls.destroy(); } catch { /* déjà détruit */ } hls = null; }
  cancelAnimationFrame(raf);
  if (vid && vid.parentNode) { vid.pause(); vid.removeAttribute("src"); vid.load(); vid.remove(); }
  if (layer) { layer.remove(); layer = null; }
  if (busy) lastStop = performance.now();
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
    const d = makeLayer(box);
    if (!vid) { vid = document.createElement("video"); vid.playsInline = true; }
    const v = vid;
    v.muted = !sound; v.volume = 1;
    d.appendChild(v);
    let h = null;
    const guard = new AdGuard(ch.login);
    // Petit tampon et pas de thread séparé : un aperçu doit coûter le moins de mémoire possible.
    h = new window.Hls({ enableWorker: false, maxBufferLength: 4, maxMaxBufferLength: 6, maxBufferSize: 8e6, backBufferLength: 0,
      liveSyncDurationCount: 2, capLevelToPlayerSize: false, pLoader: makeLoader(guard, () => h) });
    hls = h;
    h.on(window.Hls.Events.MANIFEST_PARSED, () => {
      const lv = h.levels.map((l, i) => ({ i, h: l.height || 0 })).filter(l => l.h > 0).sort((a, b) => a.h - b.h);
      const pick = lv.find(l => l.h >= 360) || lv[lv.length - 1];
      if (pick) { h.currentLevel = pick.i; h.autoLevelCapping = pick.i; }
      v.play().catch(() => { v.muted = true; v.play().catch(() => {}); });
    });
    v.onplaying = () => { if (my === seq) d.classList.add("on"); };
    h.on(window.Hls.Events.ERROR, (e, dd) => { if (dd.fatal) { log("WARN", "aperçu", dd.details); if (my === seq) stopPreview(); } });
    h.loadSource(url);
    h.attachMedia(v);
  } catch (e) { log("WARN", "aperçu", e.message); }
}
