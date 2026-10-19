// Petites fonctions partagées par toute l’interface.
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export function h(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}
export const esc = s => String(s ?? "").replace(/[&<>"\x27]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "\x27": "&#39;" }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const pad2 = n => String(n).padStart(2, "0");
export const hm = ms => { const d = new Date(ms); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); };
export const durTxt = sec => { const m = Math.round(sec / 60), a = Math.floor(m / 60), b = m % 60; return a ? `${a} h ${pad2(b)}` : `${b} min`; };
export const agoTxt = ms => {
  const m = Math.max(1, Math.round((Date.now() - ms) / 60000));
  if (m < 60) return `il y a ${m} min`;
  const hh = Math.round(m / 60);
  if (hh < 48) return `il y a ${hh} h`;
  return `il y a ${Math.round(hh / 24)} jours`;
};
export const clk = s => { s = Math.max(0, Math.floor(s)); const a = Math.floor(s / 3600), b = Math.floor(s % 3600 / 60), c = s % 60; return (a ? a + ":" + pad2(b) : b) + ":" + pad2(c); };
export const kf = n => n == null ? "" : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(".", ",") + "\u00a0k" : String(n);
export const hashS = s => { let x = 7; for (const ch of String(s)) x = (x * 31 + ch.charCodeAt(0)) % 100000; return x; };
export const hueOf = s => hashS(s) % 360;

export function gradBg(hu, seed) {
  const a = (seed * 37) % 100, b = (seed * 61 + 30) % 100;
  return `radial-gradient(circle at ${a}% ${b}%,hsla(${hu + 30},90%,66%,.85) 0,transparent 38%),radial-gradient(circle at ${100 - a}% ${100 - b / 2}%,hsla(${hu - 40},85%,55%,.7) 0,transparent 46%),linear-gradient(135deg,hsl(${hu},55%,14%),hsl(${hu + 50},65%,30%))`;
}
/** Style d’une vignette : image Twitch si disponible, sinon dégradé coloré. */
export function thumbStyle(url, key) {
  const g = gradBg(hueOf(key), String(key).length);
  return url ? `background-image:url(\x27${esc(url)}\x27),${g};background-size:cover,auto;background-position:center` : `background:${g}`;
}
function initials(n) {
  const c = String(n).match(/[A-Z]/g);
  return (c && c.length > 1 ? c.slice(0, 2).join("") : String(n).replace(/[^A-Za-z0-9]/g, "").slice(0, 2)).toUpperCase();
}
/** Avatar rond d’une chaîne. ring = anneau rouge si en direct. */
export function ava(ch, size, ring = true) {
  const cls = `ava${ring && ch.live ? " is-live" : ""}`;
  const base = `width:${size}px;height:${size}px;font-size:${Math.round(size * .36)}px;`;
  if (ch.avatar) return `<span class="${cls}" style="${base}background-image:url(\x27${esc(ch.avatar)}\x27)"></span>`;
  const hu = hueOf(ch.login || ch.name);
  return `<span class="${cls}" style="${base}background:linear-gradient(135deg,hsl(${hu},78%,62%),hsl(${hu + 50},70%,36%))">${esc(initials(ch.name || "?"))}</span>`;
}
export function versionGt(a, b) {
  const p = v => String(v).replace(/^v/, "").split(/[.-]/).map(x => parseInt(x, 10) || 0);
  const x = p(a), y = p(b);
  for (let i = 0; i < 3; i++) { if ((x[i] || 0) > (y[i] || 0)) return true; if ((x[i] || 0) < (y[i] || 0)) return false; }
  return false;
}
