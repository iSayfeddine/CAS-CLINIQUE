// Shared helpers
const sb = supabase.createClient(CFG.URL, CFG.KEY, { auth: { persistSession: false } });
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
async function rpc(fn, args) { const { data, error } = await sb.rpc(fn, args); if (error) throw new Error(error.message); return data; }
let clockOff = 0;
const sync = s => { clockOff = new Date(s.server_now).getTime() - Date.now(); };
const secsLeft = s => s.timer_ends_at ? Math.max(0, Math.ceil((new Date(s.timer_ends_at).getTime() - (Date.now() + clockOff)) / 1000)) : 0;
const MSG = { session_not_found: "Cette session n'existe pas ou est terminée.", name_taken: "Ce nom est déjà utilisé. Choisissez un autre nom.",
  invalid_name: "Nom invalide (1 à 24 caractères).", closed: "Les réponses sont actuellement verrouillées.", already_answered: "Réponse déjà enregistrée.",
  unauthorized: "Accès présentateur non autorisé.", session_finished: "Cette session est terminée.", participant_not_found: "Participant introuvable.",
  paused: "Session en pause.", invalid_option: "Option invalide.", invalid_transition: "Action impossible à cette étape." };
const msg = e => { const m = (e.message || '').trim(); return MSG[m] || m; };
// deterministic rounding (largest remainder) -> always sums to 100
function pcts(d) {
  const k = Object.keys(d), t = k.reduce((a, x) => a + d[x], 0), r = {};
  if (!t) { k.forEach(x => r[x] = 0); return r; }
  let sum = 0; const f = k.map(x => { const v = d[x] * 100 / t; r[x] = Math.floor(v); sum += r[x]; return [x, v - r[x]]; });
  f.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  for (let i = 0; i < 100 - sum; i++) r[f[i][0]]++;
  return r;
}
// ACR TI-RADS: category computed from the points (0 TR1, 2 TR2, 3 TR3, 4-6 TR4, >=7 TR5)
function acr(items) { const t = items.reduce((a, i) => a + i.pts, 0); return { t, c: t >= 7 ? 'TR5' : t >= 4 ? 'TR4' : t === 3 ? 'TR3' : t === 2 ? 'TR2' : 'TR1' }; }
function qrSvg(text) { const q = qrcode(0, 'M'); q.addData(text); q.make(); return q.createSvgTag({ scalable: true }); }
function joinUrl(code) { const u = new URL('join.html', location.href); u.search = '?session=' + code; u.hash = ''; return u.href; }
function room(code, { onTick, onPresence, onStatus, track, key }) {
  const ch = sb.channel('room:' + code, { config: { presence: { key: key || crypto.randomUUID() } } });
  let t; ch.on('broadcast', { event: 'tick' }, () => { clearTimeout(t); t = setTimeout(onTick, 250); });
  ch.on('presence', { event: 'sync' }, () => onPresence && onPresence(Object.values(ch.presenceState()).flat().filter(x => x.role === 'p').length));
  ch.subscribe(async st => { onStatus && onStatus(st); if (st === 'SUBSCRIBED') { if (track) await ch.track({ role: 'p' }); onTick(); } });
  return ch;
}
function distHTML(s, anim) {
  const q = s.question, d = s.distribution || {}, p = pcts(d);
  return q.options.map(o => `<div class="bar ${q.correct === o.key ? 'ok' : ''}"><b>${o.key}</b><span>${esc(o.text)}</span>
    <div class="track"><i ${anim ? `data-w="${p[o.key]}"` : `style="width:${p[o.key]}%"`}></i></div><em>${d[o.key] || 0} · ${p[o.key]}%</em></div>`).join('');
}
const animate = () => requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('.track i[data-w]').forEach(e => e.style.width = e.dataset.w + '%')));
function acrHTML(a) {
  const r = acr(a.items);
  return `<div class="acr"><h3>ACR TI-RADS</h3>${a.items.map((i, n) => `<div style="animation-delay:${n * .35}s"><span>${esc(i.k)} — ${esc(i.v)}</span><b>+${i.pts}</b></div>`).join('')}
  <div class="tot" style="animation-delay:${a.items.length * .35}s"><span>TOTAL</span><b>${r.t} points → ${r.c}</b></div></div>`;
}
function lbHTML(lb) { return `<div class="lb">${(lb || []).map(r => `<div><span>${r.rank}. ${esc(r.name)}</span><b>${r.score}</b></div>`).join('') || '<p class="muted">Aucun participant</p>'}</div>`; }
function fileHTML(s) {
  const sec = ['Clinique', 'Biologie', 'Imagerie', 'Cytologie', 'Prise en charge'];
  const rank = { BIOLOGY: 1, ULTRASOUND: 2, CYTOLOGY: 3, MANAGEMENT: 4, FINAL_DECISION: 4 };
  let cur = ['lobby', 'interrogation', 'exam'].includes(s.phase) ? 0 : s.phase === 'join' ? 1 : s.phase === 'final' ? 5 : (rank[s.stage_key] ?? 1);
  return `<span class="file"><span>PATIENT FILE</span>${sec.map((n, i) => `<span class="${i === cur ? 'cur' : ''}">${i < cur ? '✓' : i === cur ? '●' : '○'} ${n}</span>`).join('')}</span>`;
}

if (/YOUR-PROJECT|YOUR_PUBLISHABLE/.test(CFG.URL + CFG.KEY)) document.addEventListener('DOMContentLoaded', () => document.body.insertAdjacentHTML('afterbegin',
  '<div style="background:#c0392b;color:#fff;padding:12px;font:600 14px system-ui">config.js n\'est pas configuré : remplacez l\'URL et la clé publishable Supabase.</div>'));
