// Navigation à la télécommande : déplace le « focus » vers l’élément le plus proche dans la direction choisie.
export const N = { focused: null, scale: 1, cands: () => [] };
const side = () => document.getElementById("side");

export function setFocus(el, { scroll = true, smooth = true } = {}) {
  if (!el) return;
  if (N.focused && N.focused !== el) N.focused.classList.remove("focused");
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
  if (inSide && dir === "left") return;
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
    const sc = p + s * 2.6;
    if (sc < bs) { bs = sc; best = e; }
  }
  if (vc.length) {
    // Haut/bas : on va dans la rangée la plus proche, puis vers l’élément le plus aligné.
    const pm = Math.min(...vc.map(v => v[1]));
    for (const [e, p, s] of vc) if (p <= pm + 40 * N.scale && s < bs) { bs = s; best = e; }
  }
  if (best && !inSide && sd.contains(best)) best = sd.querySelector(".nav.active") || best;
  if (best) setFocus(best);
}

export function activate(el) { if (el && el._enter) el._enter(); }

export function restoreFocus(container, key, idx = 0) {
  const all = [...container.querySelectorAll(".focusable")].filter(e => e.offsetParent !== null);
  const el = (key && all.find(e => e.dataset.key === key)) || all[Math.min(idx, all.length - 1)];
  if (el) setFocus(el, { smooth: false });
  return el;
}
