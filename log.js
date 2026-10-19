// Journal interne : les 200 derniers événements, affichés dans Réglages > Signaler un problème.
const buf = [];
export function log(level, ...args) {
  const msg = args.map(x => x instanceof Error ? x.message : typeof x === "object" ? safe(x) : String(x)).join(" ");
  const line = `${new Date().toTimeString().slice(0, 8)} ${level} ${msg}`;
  buf.push(line);
  if (buf.length > 200) buf.shift();
  (level === "ERR" ? console.error : console.log)(line);
}
function safe(o) { try { return JSON.stringify(o).slice(0, 300); } catch { return String(o); } }
export const logs = () => buf.slice();
window.addEventListener("error", e => log("ERR", e.message, (e.filename || "").split("/").pop() + ":" + e.lineno));
window.addEventListener("unhandledrejection", e => log("ERR", "promesse", e.reason));
