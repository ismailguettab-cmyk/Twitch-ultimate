// Mode démo : mêmes fonctions que twitch.js mais avec des données fictives.
// Sert à tester l’interface dans un navigateur, sans compte ni Fire Stick.
import { store } from "./store.js";
import { sleep, hueOf } from "./util.js";

const H = 3600e3, NOW0 = Date.now();
const RAW = [
  { name: "NebulaKat", cat: "Speedrun", title: "Tentatives de record, on ne lâche rien", viewers: 12400, live: true, since: 2.2, sessions: [{ ago: 20, dur: 5.5, title: "Routing et entraînement des sauts" }] },
  { name: "Zephyr_GG", cat: "MOBA", title: "Solo queue sans tilt (promis)", viewers: 15800, live: true, since: 5.1 },
  { name: "Kroustyy", cat: "FPS compétitif", title: "Classé jusqu’au top 500, objectif ce soir", viewers: 8300, live: true, since: 3.6 },
  { name: "Baptou", cat: "Discussion", title: "Revue tech du lundi et vos questions", viewers: 5600, live: true, since: 1.1 },
  { name: "LunaDraws", cat: "Créatif", title: "Illustration cozy et musique douce", viewers: 2100, live: true, since: .6 },
  { name: "MadameRetro", cat: "Rétro", title: "Marathon 16-bit, jour 3", viewers: 1900, live: true, since: 7.4 },
  { name: "OrbitalOli", cat: "Stratégie", live: false, sessions: [{ ago: 9.5, dur: 4.3, title: "Campagne en difficulté maximale" }] },
  { name: "Pixelyne", cat: "Musique", live: false, sessions: [{ ago: 13, dur: 2.25, title: "Piano à la demande, vos morceaux" }] },
  { name: "TheoChess", cat: "Échecs", live: false, sessions: [{ ago: 6.2, dur: 2.5, title: "Blitz contre les abonnés" }] },
  { name: "Gargamax", cat: "IRL", live: false, sessions: [{ ago: 16, dur: 3.1, title: "Balade nocturne en ville" }] },
  { name: "SoundOfMika", cat: "Musique", live: false },
  { name: "Ravenz", cat: "Survie", live: false },
];
const CATS = ["Discussion", "FPS compétitif", "MOBA", "IRL", "Speedrun", "Survie", "Musique", "Stratégie", "Échecs", "Créatif", "Rétro", "Course auto"]
  .map((name, i) => ({ id: name, name, art: "", rank: i + 1, glyph: ["💬", "🎯", "🛡️", "📍", "⏱️", "🏕️", "🎹", "♟️", "♞", "🎨", "👾", "🏎️"][i] }));

const mkCh = r => ({ id: r.name.toLowerCase(), login: r.name.toLowerCase(), name: r.name, avatar: "", live: !!r.live,
  stream: r.live ? { title: r.title, cat: r.cat, catId: r.cat, viewers: r.viewers, startedAt: NOW0 - r.since * H, thumb: "", thumbBig: "" } : null, _raw: r });
const CH = RAW.map(mkCh);
const SYL = ["ka", "zo", "mi", "lu", "ra", "ve", "to", "ny", "ri", "sa", "do", "fe", "xo", "li", "ba", "qu"];
const TITLES = ["Chill et discussions avec la commu", "Objectif : battre mon record", "Soirée défis proposés par le chat", "On teste la nouvelle mise à jour", "Parties classées jusqu’à minuit", "Session tranquille, venez dire bonjour"];
function catStreams(cat, n = 12) {
  let s = hueOf(cat.name) + 11; const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  return Array.from({ length: n }, (_, i) => {
    let nm = ""; for (let j = 0; j < 2 + Math.floor(r() * 2); j++) nm += SYL[Math.floor(r() * SYL.length)];
    nm = nm[0].toUpperCase() + nm.slice(1) + ["", "TV", "_GG", "Live", ""][Math.floor(r() * 5)];
    return { id: nm.toLowerCase(), login: nm.toLowerCase(), name: nm, avatar: "", live: true,
      stream: { title: TITLES[Math.floor(r() * TITLES.length)], cat: cat.name, viewers: Math.floor(30000 / (i + 1) * (.5 + r())), startedAt: NOW0 - (.3 + r() * 6) * H, thumb: "", thumbBig: "" } };
  });
}

let wentLive = false;
export function createMock() {
  let resolveLogin = null;
  return {
    demo: true,
    isLogged: () => store.get("demoLogged", false),
    getMe: () => ({ display_name: "TOI", login: "toi", profile_image_url: "" }),
    logout() { store.del("demoLogged"); },
    async startDeviceAuth() { await sleep(300); return { userCode: "K7PXM4QD", uri: "https://www.twitch.tv/activate?device-code=K7PXM4QD" }; },
    pollDeviceAuth() { return new Promise(res => { resolveLogin = () => { store.set("demoLogged", true); res(true); }; setTimeout(() => resolveLogin && resolveLogin(), 9000); }); },
    validateDemoLogin() { resolveLogin && resolveLogin(); },
    async getFollowed() {
      await sleep(250);
      // Au bout de 40 s, une chaîne passe en live pour montrer les alertes.
      if (!wentLive && Date.now() - NOW0 > 40000) { wentLive = true; const c = CH.find(x => x.name === "OrbitalOli"); c.live = true; c.stream = { title: "Nouvelle campagne, on recommence de zéro", cat: "Stratégie", viewers: 640, startedAt: Date.now(), thumb: "", thumbBig: "" }; }
      return CH.map(c => ({ ...c }));
    },
    async getRecentVods(channels) {
      await sleep(700);
      const out = [];
      for (const c of channels) for (const s of (c._raw?.sessions || [])) {
        const start = NOW0 - s.ago * H, sec = s.dur * 3600;
        out.push({ id: c.login + s.ago, ch: c, title: s.title, start, end: start + sec * 1000, sec, thumb: "", views: 1200 });
      }
      return out.sort((a, b) => b.end - a.end);
    },
    async getLastVod() { return null; },
    async getClips(channels) {
      await sleep(500);
      const T = ["Le retournement le plus improbable de la soirée", "Record battu à 3 dixièmes près", "Seul contre quatre, et il gagne", "Le chat lui demande un morceau impossible", "Rencontre surprise en pleine rue"];
      return channels.slice(0, 5).map((ch, i) => ({ id: "clip" + i, ch, title: T[i % T.length], sec: 27 + i * 8, views: 48000 / (i + 1) | 0, thumb: "" }));
    },
    async getSchedule(channels) {
      await sleep(600);
      const off = channels.filter(c => !c.live).slice(0, 4);
      return off.map((ch, i) => { const d = new Date(NOW0 + [2.5, 4, 22, 26][i] * H); d.setMinutes(d.getMinutes() < 30 ? 0 : 30, 0, 0); return { id: "s" + i, ch, title: ["Concert acoustique en direct", "Nouvelle saison de survie", "Tournoi des abonnés", "Campagne, épisode 2"][i], at: d.getTime() }; });
    },
    async getTopCategories() { await sleep(200); return CATS; },
    async getCategoryStreams(cat) { await sleep(500); return catStreams(cat); },
    async getStream(ch) { return ch.stream; },
    async search(q) {
      await sleep(250);
      const pool = [...CH, ...CATS.flatMap(c => catStreams(c, 4))];
      return { channels: pool.filter(c => c.name.toLowerCase().includes(q)).slice(0, 8), categories: CATS.filter(c => c.name.toLowerCase().includes(q)).slice(0, 4) };
    },
  };
}

/* Lecteur simulé : animation dessinée à la place de la vidéo. */
export function drawScene(ctx, w, hh, t, hue, cam) {
  const hz = hh * .58;
  let g = ctx.createLinearGradient(0, 0, 0, hz); g.addColorStop(0, `hsl(${hue},60%,8%)`); g.addColorStop(1, `hsl(${hue + 30},70%,30%)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, hz);
  g = ctx.createLinearGradient(0, hz, 0, hh); g.addColorStop(0, `hsl(${hue - 20},55%,10%)`); g.addColorStop(1, `hsl(${hue},60%,3%)`);
  ctx.fillStyle = g; ctx.fillRect(0, hz, w, hh - hz);
  const r = hh * .24, sx = w * .62 + Math.sin(t * .2) * w * .02;
  const sg = ctx.createLinearGradient(0, hz - r, 0, hz); sg.addColorStop(0, `hsl(${hue + 70},100%,72%)`); sg.addColorStop(1, `hsl(${hue - 15},95%,58%)`);
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(sx, hz, r, Math.PI, 0); ctx.fill();
  ctx.strokeStyle = `hsla(${hue + 40},100%,72%,.55)`; ctx.lineWidth = Math.max(1, w / 700);
  const sp = (t * .35) % 1;
  for (let i = 0; i < 16; i++) { const p = (i + sp) / 16, y = hz + (hh - hz) * p * p; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
  for (let i = -14; i <= 14; i++) { ctx.beginPath(); ctx.moveTo(w / 2 + i * w * .012, hz); ctx.lineTo(w / 2 + i * w * .14, hh); ctx.stroke(); }
  for (let i = 0; i < 46; i++) { const x = (i * 97.3 + t * 18 * (1 + i % 3)) % w, y = (i * 53.7) % (hz * .92); ctx.fillStyle = `hsla(${hue + 80},100%,88%,${.25 + .55 * Math.abs(Math.sin(t * 2 + i))})`; const s = Math.max(1, w / 640) * 1.6; ctx.fillRect(x, y, s, s); }
  if (cam) {
    const cw = w * .2, ch = cw * .62, cx = w * .035, cy = hh - ch - hh * .06;
    ctx.fillStyle = `hsl(${hue + 20},35%,16%)`; ctx.fillRect(cx, cy, cw, ch);
    ctx.fillStyle = `hsl(${hue + 60},40%,35%)`; const bob = Math.sin(t * 1.8) * ch * .02;
    ctx.beginPath(); ctx.arc(cx + cw * .5, cy + ch * .42 + bob, ch * .17, 0, 7); ctx.fill();
    ctx.strokeStyle = `hsla(${hue + 40},100%,75%,.9)`; ctx.lineWidth = Math.max(1.5, w / 500); ctx.strokeRect(cx, cy, cw, ch);
  }
}
const USERS = ["pixel_pirate", "LaMouetteRieuse", "krypto_kev", "Sushi2Fois", "moonwalkr", "Nina_dlb", "grosbidule", "Lumen404", "choco.lat", "BaguetteSpeed", "renard_roux", "Kaelys"];
const MSGS = ["GG !", "première fois ici, l’image est super nette", "le son est trop propre", "on y croit", "tu peux montrer le setup ?", "salut le chat 👋", "ça se voit que c’est du 60 fps", "trop chill ce live", "encore une !", "ce passage était fou"];
export function fakeChatLine() {
  const u = USERS[Math.random() * USERS.length | 0], c = ["#ff8fc3", "#7ad7ff", "#c3a1ff", "#7dffb0", "#ffd166"][u.length % 5];
  return `${Math.random() < .35 ? "<span class=\"bdg\" style=\"background:#9b5cff\"></span>" : ""}<b style="color:${c}">${u}</b> : ${MSGS[Math.random() * MSGS.length | 0]}`;
}
