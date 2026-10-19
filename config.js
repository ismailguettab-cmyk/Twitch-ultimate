// Configuration fournie par la coque Android (BuildConfig), ou mode démo dans un navigateur.
function read() {
  try { if (window.Android && window.Android.config) return JSON.parse(window.Android.config()); } catch { /* navigateur */ }
  return { clientId: "", repo: "", version: "dev", versionCode: 0, device: "navigateur" };
}
export const CONFIG = read();
export const DEMO = !CONFIG.clientId || new URLSearchParams(location.search).has("demo");
