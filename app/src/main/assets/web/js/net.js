// Requêtes réseau : via la coque Android (pas de blocage CORS) ou fetch dans un navigateur.
const pending = new Map();
let seq = 0;
window.__nb = Object.assign(window.__nb || {}, {
  resolve(id, status, body) { const p = pending.get(id); if (p) { pending.delete(id); p({ status, body }); } },
});
export const isNative = () => !!(window.Android && window.Android.http);

export async function request(method, url, { headers = {}, body = "", timeout = 15000 } = {}) {
  if (isNative()) {
    const id = String(++seq);
    const res = await new Promise((resolve, reject) => {
      const t = setTimeout(() => { pending.delete(id); reject(new Error("Délai dépassé : " + url.split("?")[0])); }, timeout);
      pending.set(id, r => { clearTimeout(t); resolve(r); });
      window.Android.http(id, method, url, JSON.stringify(headers), body || "");
    });
    if (res.status === 0) throw new Error("Réseau indisponible (" + res.body + ")");
    return res;
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, headers, body: body || undefined, signal: ctl.signal });
    return { status: r.status, body: await r.text() };
  } finally { clearTimeout(t); }
}
export async function json(method, url, opts) {
  const r = await request(method, url, opts);
  let data = null;
  try { data = r.body ? JSON.parse(r.body) : null; } catch { /* réponse non JSON */ }
  return { status: r.status, data, body: r.body };
}
