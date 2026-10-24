// Navigation à la télécommande : déplace le « focus » vers l’élément le plus proche dans la direction choisie.
export const N = { focused: null, scale: 1, cands: () => [] };
const side = () => document.getElementById("side");

export function setFocus(el, { scroll = true, smooth = true } = {}) {
  if (!el) return;
  if (N.focused && N.focused !== el) { N.focused.classList.remove("focused"); if (N.focused._blur) N.focused._blur(); }
  N.focused = el;
  el.classList.add("focused");
  side().classList.toggle("open", side().contains(el));
  if (scroll) ensureVisible(el, smooth);
  if (el._focus) el._focus();
}

export function ensureVisible(el, smooth = true) {
  const behavior = smooth ? "smooth" : "auto";
  for (let n = el.parentElement; n && n.id !== "stage"; n = n.parentElement) {
    const ax = n.dataset && n.dataset.scroll;
    if (!ax) continue;
    const cr = n.getBoundingClientRect();
    if (ax === "x") {
      const er = el.getBoundingClientRect();
      let tg = n.scrollLeft + (er.left - cr.left) / N.scale - 64;
      tg = Math.max(0, Math.min(n.scrollWidth - n.clientWidth, tg));
      n.scrollTo({ left: tg, behavior });
    } else if (n.dataset.mode === "align") {
      const u = el.closest("[data-unit]") || el, ur = u.getBoundingClientRect();
      let tg = u.dataset.unit === "top" ? 0 : n.scrollTop + (ur.top - cr.top) / N.scale - (+n.dataset.pad || 0);
      tg = Math.max(0, Math.min(n.scrollHeight - n.clientHeight, tg));
      n.scrollTo({ top: tg, behavior });
    } else {
      const er = el.getBoundingClientRect();
      const top = (er.top - cr.top) / N.scale, bot = (er.bottom - cr.top) / N.scale, H = n.clientHeight;
      let tg = null;
      if (top < 170) tg = n.scrollTop + top - 170;
      else if (bot > H - 60) tg = n.scrollTop + bot - (H - 60);
      if (tg !== null) n.scrollTo({ top: Math.max(0, Math.min(n.scrollHeight - n.clientHeight, tg)), behavior });
    }
  }
}

export function move(dir) {
  const cur = N.focused;
  let list = N.cands();
  if (!list.length) return;
  if (!cur || !list.includes(cur)) { setFocus(list[0]); return; }
  const sd = side(), inSide = sd.contains(cur), vertical = dir === "up" || dir === "down";
  if (inSide && vertical) list = list.filter(e => sd.contains(e));
  if (!inSide && vertical) list = list.filter(e => !sd.contains(e));
  // Clavier de recherche : haut/bas ne sortent jamais vers les résultats de droite.
  if (cur.dataset && cur.dataset.kb && vertical) list = list.filter(e => e.dataset && e.dataset.kb);
  // Zones (clavier / résultats de recherche) : haut/bas restent dans la même colonne.
  if (cur.dataset && cur.dataset.zone && vertical) list = list.filter(e => e.dataset && e.dataset.zone === cur.dataset.zone);
  if (inSide && dir === "left") return;
  // Rangée horizontale (carrousel) : gauche/droite suit les voisins DOM, même hors écran.
  // Évite que "gauche" trop rapide ouvre le menu ou saute des lignes.
  if (!inSide && !vertical && cur.parentElement && cur.parentElement.classList.contains("track")) {
    let sib = dir === "left" ? cur.previousElementSibling : cur.nextElementSibling;
    while (sib && !sib.classList.contains("focusable")) sib = dir === "left" ? sib.previousElementSibling : sib.nextElementSibling;
    if (sib) { setFocus(sib); return; }
    if (dir === "right") return;       // fin de rangée à droite : on ne bouge pas
    if (dir === "left") { const nav = sd.querySelector(".nav.active") || sd.querySelector(".nav"); if (nav) { setFocus(nav); return; } }
  }
  // Protection anti-saut : pour gauche/droite, ne jamais viser un élément qui n’est pas
  // à peu près sur la même ligne que l’élément courant (sinon on "saute" plusieurs lignes).
  const lockRow = !inSide && !vertical;
  const r = cur.getBoundingClientRect(), cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
  let best = null, bs = Infinity;
  const vc = [];
  for (const e of list) {
    if (e === cur) continue;
    const q = e.getBoundingClientRect(), qx = (q.left + q.right) / 2, qy = (q.top + q.bottom) / 2;
    let p, s;
    if (dir === "right") { p = qx - cx; s = Math.abs(qy - cy); }
    else if (dir === "left") { p = cx - qx; s = Math.abs(qy - cy); }
    else if (dir === "down") { p = qy - cy; s = Math.abs(qx - cx); }
    else { p = cy - qy; s = Math.abs(qx - cx); }
    if (p <= 2) continue;
    if (vertical) { vc.push([e, p, s]); continue; }
    if (lockRow && !sd.contains(e) && s > r.height * 0.9) continue; // reste sur la même ligne
    const sc = p + s * 2.6;
    if (sc < bs) { bs = sc; best = e; }
  }
  if (vc.length) {
    // Haut/bas : on va dans la rangée la plus proche, puis vers l’élément le plus aligné.
    const pm = Math.min(...vc.map(v => v[1]));
    for (const [e, p, s] of vc) if (p <= pm + 40 * N.scale && s < bs) { bs = s; best = e; }
  }
  if (best && !inSide && sd.contains(best)) best = sd.querySelector(".nav.active") || best;
  // Si rien trouvé en allant à gauche depuis la zone de contenu, ouvrir le menu.
  if (!best && dir === "left" && !inSide) best = sd.querySelector(".nav.active") || sd.querySelector(".nav");
  if (best) setFocus(best);
}

export function activate(el) { if (el && el._enter) el._enter(); }

export function restoreFocus(container, key, idx = 0) {
  const all = [...container.querySelectorAll(".focusable")].filter(e => e.offsetParent !== null);
  const el = (key && all.find(e => e.dataset.key === key)) || all[Math.min(idx, all.length - 1)];
  if (el) setFocus(el, { smooth: false });
  return el;
}
