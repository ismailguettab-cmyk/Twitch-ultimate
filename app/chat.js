// Chat Twitch en lecture seule (connexion anonyme), avec les vraies emotes.
import { esc } from "./util.js";

const BADGE = { broadcaster: "#e91916", moderator: "#00ad03", vip: "#e005b9", subscriber: "#9b5cff", founder: "#ffd166" };
const FALLBACK = ["#ff8fc3", "#7ad7ff", "#c3a1ff", "#7dffb0", "#ffd166", "#ffab73", "#9be7ff", "#ff7b7b", "#c8f584"];

export class Chat {
  constructor(onMsg, onStatus) { this.onMsg = onMsg; this.onStatus = onStatus; this.ws = null; this.want = false; this.tries = 0; }
  connect(login) { this.close(); this.login = login.toLowerCase(); this.want = true; this._open(); }
  close() { this.want = false; const ws = this.ws; this.ws = null; try { ws && ws.close(); } catch { /* déjà fermé */ } }
  _open() {
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    this.ws = ws;
    ws.onopen = () => {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send("PASS SCHMOOPIIE");
      ws.send("NICK justinfan" + (10000 + Math.floor(Math.random() * 80000)));
      ws.send("JOIN #" + this.login);
      this.tries = 0;
      this.onStatus && this.onStatus("ok");
    };
    ws.onmessage = e => String(e.data).split("\r\n").forEach(l => l && this._line(ws, l));
    ws.onclose = () => {
      if (this.ws !== ws || !this.want) return;
      this.onStatus && this.onStatus("reconnect");
      setTimeout(() => { if (this.want && this.ws === ws) this._open(); }, Math.min(15000, 1000 * 2 ** this.tries++));
    };
  }
  _line(ws, l) {
    if (l.startsWith("PING")) { ws.send("PONG :tmi.twitch.tv"); return; }
    const p = parse(l);
    if (p.cmd === "PRIVMSG") this.onMsg(render(p));
    else if (p.cmd === "USERNOTICE" && p.tags["system-msg"]) this.onMsg(`<span class="sys">${esc(unescapeTag(p.tags["system-msg"]))}</span>`);
  }
}

function parse(l) {
  const tags = {};
  if (l[0] === "@") {
    const sp = l.indexOf(" ");
    for (const kv of l.slice(1, sp).split(";")) { const j = kv.indexOf("="); tags[kv.slice(0, j)] = kv.slice(j + 1); }
    l = l.slice(sp + 1);
  }
  let prefix = "";
  if (l[0] === ":") { const sp = l.indexOf(" "); prefix = l.slice(1, sp); l = l.slice(sp + 1); }
  const ti = l.indexOf(" :");
  const head = ti >= 0 ? l.slice(0, ti) : l;
  const [cmd, ...params] = head.split(" ");
  return { tags, prefix, cmd, params, text: ti >= 0 ? l.slice(ti + 2) : "" };
}
const unescapeTag = s => s.replace(/\\s/g, " ").replace(/\\:/g, ";").replace(/\\\\/g, "\\");
const safeColor = c => /^#[0-9a-f]{6}$/i.test(c) ? c : null;
function colorFor(name) { let x = 0; for (const ch of name) x = (x + ch.charCodeAt(0)) % FALLBACK.length; return FALLBACK[x]; }

function render(p) {
  let text = p.text, action = false;
  if (text.startsWith("\u0001ACTION ") && text.endsWith("\u0001")) { text = text.slice(8, -1); action = true; }
  const name = p.tags["display-name"] || p.prefix.split("!")[0];
  const color = safeColor(p.tags.color) || colorFor(name);
  const badges = (p.tags.badges || "").split(",").map(b => b.split("/")[0]).filter(b => BADGE[b]).slice(0, 2)
    .map(b => `<span class="bdg" style="background:${BADGE[b]}"></span>`).join("");
  return `${badges}<b style="color:${color}">${esc(name)}</b>${action ? " " : " : "}<span${action ? ` style="color:${color}"` : ""}>${emotify(text, p.tags.emotes)}</span>`;
}
function emotify(text, spec) {
  if (!spec) return esc(text);
  const cps = Array.from(text), ranges = [];
  spec.split("/").forEach(e => {
    const [id, pos] = e.split(":");
    if (pos) pos.split(",").forEach(r => { const [a, b] = r.split("-").map(Number); ranges.push({ a, b, id }); });
  });
  ranges.sort((x, y) => x.a - y.a);
  let out = "", i = 0;
  for (const r of ranges) {
    if (r.a < i) continue;
    out += esc(cps.slice(i, r.a).join(""));
    out += `<img class="emote" src="https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(r.id)}/default/dark/2.0" alt="">`;
    i = r.b + 1;
  }
  return out + esc(cps.slice(i).join(""));
}
