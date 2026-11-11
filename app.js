/* Kairo — a calm daily planner. No build step, no dependencies. */
(() => {
'use strict';

// ---------- helpers ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtTime = t => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
// Minutes between a task's start and end (an end before the start means past midnight).
const mins = t => {
  if (!t.time || !t.end) return 0;
  const [a, b] = t.time.split(':').map(Number), [c, d] = t.end.split(':').map(Number);
  const m = c * 60 + d - (a * 60 + b);
  return m < 0 ? m + 1440 : m;
};
const fmtDur = m => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ''}`;
const fmt = (s, o) => parseYmd(s).toLocaleDateString('en-US', o);
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const COLORS = ['#B9F500', '#9B74FF', '#FF6B9A', '#3DD6FF', '#FFB13D', '#F6F6F8'];

// Icon language: rounded outlines with a soft tinted fill (class "f"), solid bits use class "s".
const P = {
  today: '<path class="f" d="M6.5 15a5.5 5.5 0 0 1 11 0z"/><path d="M3 19h18M12 3.5v2M4.6 7.6L6 9M19.4 7.6L18 9"/>',
  goals: '<circle class="f" cx="12" cy="12" r="8.6"/><circle cx="12" cy="12" r="4.3"/><circle class="s" cx="12" cy="12" r="1.3"/>',
  focus: '<circle class="f" cx="12" cy="13.5" r="7.6"/><path d="M12 13.5V9.6M9.6 2.8h4.8"/>',
  you: '<circle class="f" cx="12" cy="8.2" r="3.7"/><path class="f" d="M4.8 20c1-3.5 3.8-5.2 7.2-5.2s6.2 1.7 7.2 5.2z"/>',
  plus: '<path d="M12 4.5v15M4.5 12h15"/>',
  bell: '<path class="f" d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.4 2H4.6z"/><path d="M10 21.2h4"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  star: '<path class="s" d="M12 2.8l2.75 5.6 6.15.9-4.45 4.300 1.05 6.1L12 16.8l-5.5 2.9 1.05-6.1L3.1 9.300l6.15-.9z"/>',
  repeat: '<path d="M4 11V9.8A3.8 3.8 0 0 1 7.8 6H19l-3-3M20 13v1.2a3.8 3.8 0 0 1-3.8 3.8H5l3 3"/>',
  left: '<path d="M14.5 6l-6 6 6 6"/>',
  right: '<path d="M9.5 6l6 6-6 6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${P[n]}</svg>`;

// ---------- state ----------
const KEY = 'kairo.v1';
const fresh = () => {
  const t = today(), g = uid();
  return {
    tasks: [
      { id: uid(), title: 'Tap the circle to complete a task', date: t, time: '', remind: -1, repeat: 'none', goalId: '', priority: true, notes: '', done: false },
      { id: uid(), title: 'Type “Gym 6-7pm tomorrow” in quick add', date: t, time: '', remind: -1, repeat: 'none', goalId: '', priority: false, notes: '', done: false },
      { id: uid(), title: 'Read 10 pages', date: t, time: '21:00', end: '21:30', remind: 0, repeat: 'daily', goalId: g, priority: false, notes: '', done: false },
    ],
    goals: [{ id: g, title: 'Read 12 books this year', why: 'Small pages, every day.', color: COLORS[0], due: `${new Date().getFullYear()}-12-31` }],
    settings: { theme: 'dark', notif: false, brief: false, briefAt: '08:00', focusMin: 25 },
    fired: {},
  };
};
let S;
try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { S = fresh(); }
S.settings = { ...fresh().settings, ...S.settings };
S.fired = S.fired || {};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };

const params = new URLSearchParams(location.search);
const ui = { tab: ['today', 'goals', 'focus', 'you'].includes(params.get('tab')) ? params.get('tab') : 'today', date: today(), editTask: null, editGoal: null };
const timer = { running: false, end: 0, left: S.settings.focusMin * 60000, taskId: '' };
let installEvt = null;

const goalOf = id => S.goals.find(g => g.id === id);
const tasksOn = d => S.tasks.filter(t => t.date === d);
const sortTasks = a => a.sort((x, y) => (x.done - y.done) || ((x.time || '99') < (y.time || '99') ? -1 : (x.time || '99') > (y.time || '99') ? 1 : (y.priority - x.priority)));

// ---------- quick-add parser: "Gym 6-7pm tomorrow !" ----------
function parseQuick(text, base) {
  let t = ` ${text} `, date = base, time = '', end = '', priority = false;
  if (/\s!+\s/.test(t)) { priority = true; t = t.replace(/\s!+(?=\s)/g, ''); }
  const take = (re, fn) => { const m = t.match(re); if (m) { fn(m); t = t.replace(m[0], ' '); } };
  take(/\s(?:on\s+)?(today|tomorrow|tmrw)(?=\s)/i, m => { date = addDays(today(), /today/i.test(m[1]) ? 0 : 1); });
  take(/\s(?:on\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)(?=\s)/i, m => {
    const want = WD.findIndex(w => m[1].toLowerCase().startsWith(w.toLowerCase()));
    const diff = (want - new Date().getDay() + 7) % 7 || 7;
    date = addDays(today(), diff);
  });
  // ranges first: "6-7pm", "9am to 10:30am", "14:00-15:30"
  take(/\s(?:at\s+|from\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?\s*(?:-|–|to)\s*(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?=\s)/i, m => {
    const h24 = (h, ap) => (+h % 12) + (/pm/i.test(ap) ? 12 : 0);
    const e = h24(m[4], m[6]); let s = h24(m[1], m[3] || m[6]);
    if (!m[3] && s > e) s -= 12; // "11-1pm" starts in the morning
    time = `${pad(s)}:${m[2] || '00'}`; end = `${pad(e)}:${m[5] || '00'}`;
  });
  if (!time) take(/\s(?:at\s+|from\s+)?([01]?\d|2[0-3]):([0-5]\d)\s*(?:-|–|to)\s*([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, m => {
    time = `${pad(+m[1])}:${m[2]}`; end = `${pad(+m[3])}:${m[4]}`;
  });
  if (!time) take(/\s(?:at\s+)?(\d{1,2})(?::([0-5]\d))?\s*(am|pm)(?=\s)/i, m => {
    let h = +m[1] % 12; if (/pm/i.test(m[3])) h += 12;
    time = `${pad(h)}:${m[2] || '00'}`;
  });
  if (!time) take(/\s(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s)/, m => { time = `${pad(+m[1])}:${m[2]}`; });
  return { title: t.replace(/\s+/g, ' ').trim(), date, time, end, priority };
}

// ---------- mutations ----------
function nextDate(t) {
  if (t.repeat === 'daily') return addDays(t.date, 1);
  if (t.repeat === 'weekly') return addDays(t.date, 7);
  if (t.repeat === 'weekdays') { let d = addDays(t.date, 1); while ([0, 6].includes(parseYmd(d).getDay())) d = addDays(d, 1); return d; }
  return null;
}
function toggleTask(id) {
  const t = S.tasks.find(x => x.id === id); if (!t) return;
  t.done = !t.done;
  // A finished repeating task plants its next occurrence, once.
  if (t.done && t.repeat !== 'none' && !t.spawned) {
    t.spawned = true;
    S.tasks.push({ ...t, id: uid(), date: nextDate(t), done: false, spawned: false });
  }
  save();
}
function silencePast() {
  const now = Date.now();
  for (const t of S.tasks) { const at = fireAt(t); if (at && at <= now) S.fired[`${t.id}:${at}`] = 1; }
}

// ---------- notifications ----------
const canNotify = () => 'Notification' in window;
const notifOn = () => canNotify() && S.settings.notif && Notification.permission === 'granted';
function fireAt(t) {
  if (t.done || !t.time || t.remind < 0) return 0;
  return new Date(`${t.date}T${t.time}`).getTime() - t.remind * 60000;
}
async function notify(title, body, tag) {
  toast(title, body);
  if (!notifOn()) return;
  const opts = { body, tag, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png' };
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) return void reg.showNotification(title, opts);
    new Notification(title, opts);
  } catch {}
}
function tick() {
  if (!notifOn()) return;
  const now = Date.now(), H12 = 12 * 3600e3;
  let dirty = false;
  for (const t of S.tasks) {
    const at = fireAt(t); if (!at) continue;
    const k = `${t.id}:${at}`;
    if (now >= at && now - at < H12 && !S.fired[k]) {
      S.fired[k] = 1; dirty = true;
      notify(t.title, t.remind > 0 ? `Starts at ${fmtTime(t.time)}` : `It's time · ${fmtTime(t.time)}`, t.id);
    }
  }
  if (S.settings.brief) {
    const d = today(), k = `brief:${d}`, at = new Date(`${d}T${S.settings.briefAt}`).getTime();
    if (now >= at && !S.fired[k]) {
      S.fired[k] = 1; dirty = true;
      const open = sortTasks(tasksOn(d).filter(t => !t.done));
      const first = open[0];
      notify('Your day, at a glance', open.length
        ? `${open.length} task${open.length > 1 ? 's' : ''} planned. First up: ${first.title}${first.time ? ' at ' + fmtTime(first.time) : ''}.`
        : 'Nothing planned yet — a clear page.', 'brief');
    }
  }
  if (dirty) { if (Object.keys(S.fired).length > 600) { S.fired = {}; silencePast(); } save(); }
}
async function enableNotif() {
  if (!canNotify()) return toast('Not supported here', 'On iPhone, install Kairo to your Home Screen first.');
  const p = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (p !== 'granted') { S.settings.notif = false; save(); render(); return toast('Notifications are blocked', 'Allow them in your browser settings.'); }
  S.settings.notif = true; silencePast(); S.fired[`brief:${today()}`] = S.fired[`brief:${today()}`] || 0; save(); render();
  notify('Reminders are on', 'Kairo will nudge you when it’s time.', 'hello');
}

// ---------- toasts ----------
function toast(title, body, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<div><b>${esc(title)}</b>${body ? `<small>${esc(body)}</small>` : ''}</div>`;
  if (action) {
    const b = document.createElement('button'); b.textContent = action.label;
    b.onclick = () => { action.fn(); el.remove(); }; el.append(b);
  }
  $('#toasts').append(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, action ? 5000 : 3200);
}

// ---------- views ----------
function ring(pct, label) {
  const c = 2 * Math.PI * 29;
  return `<div class="ring" role="img" aria-label="${label}"><svg viewBox="0 0 68 68"><circle class="trk" cx="34" cy="34" r="29"/><circle class="bar" cx="34" cy="34" r="29" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg><b>${Math.round(pct * 100)}%</b></div>`;
}
function taskRow(t, opts = {}) {
  const g = goalOf(t.goalId);
  const nowHM = `${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`, isToday = t.date === today();
  const dueHM = !t.end ? t.time : t.end > t.time ? t.end : '99';
  const late = !t.done && (t.date < today() || (isToday && t.time && dueHM <= nowHM));
  const live = !t.done && isToday && t.time && t.end > t.time && nowHM >= t.time && nowHM < t.end;
  const meta = [
    live && `<span class="live">Now</span>`,
    t.time && `<span class="time">${fmtTime(t.time)}${t.end ? ' – ' + fmtTime(t.end) : ''}</span>`,
    mins(t) && `<span class="dur" title="Duration">${icon('focus')}${fmtDur(mins(t))}</span>`,
    opts.showDate && `<span>${fmt(t.date, { month: 'short', day: 'numeric' })}</span>`,
    g && `<span><i class="dot" style="--c:${esc(g.color)}"></i>${esc(g.title)}</span>`,
    t.time && t.remind >= 0 && `<span title="Reminder set">${icon('bell')}</span>`,
    t.repeat !== 'none' && `<span title="Repeats ${t.repeat}">${icon('repeat')}${t.repeat}</span>`,
  ].filter(Boolean).join('');
  return `<div class="task${t.done ? ' done' : ''}${late ? ' late' : ''}${live ? ' now' : ''}" data-act="edit-task" data-id="${t.id}">
    <button class="chk" data-act="toggle" data-id="${t.id}" role="checkbox" aria-checked="${t.done}" aria-label="Complete ${esc(t.title)}">${icon('check')}</button>
    <div class="body"><div class="t">${esc(t.title)}</div>${meta ? `<div class="meta">${meta}</div>` : ''}</div>
    <div class="side">${t.priority ? icon('star') : ''}${opts.move ? `<button class="btn sm line" data-act="move" data-id="${t.id}">Today</button>` : ''}</div>
  </div>`;
}

function viewToday() {
  const d = ui.date, now = today();
  const all = sortTasks(tasksOn(d)), done = all.filter(t => t.done).length;
  const name = d === now ? 'Today' : d === addDays(now, 1) ? 'Tomorrow' : d === addDays(now, -1) ? 'Yesterday' : fmt(d, { weekday: 'long' });
  const h = new Date().getHours();
  const hello = d !== now ? fmt(d, { weekday: 'long' }) : h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  const start = addDays(d, -((parseYmd(d).getDay() + 6) % 7)); // Monday
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i)).map(x => {
    const dt = parseYmd(x);
    return `<button class="day${x === d ? ' sel' : ''}${x === now ? ' is-today' : ''}" data-act="pick" data-d="${x}" aria-label="${fmt(x, { weekday: 'long', month: 'long', day: 'numeric' })}" ${x === d ? 'aria-current="date"' : ''}><small>${WD[dt.getDay()]}</small><span>${dt.getDate()}</span>${tasksOn(x).some(t => !t.done) ? '<i></i>' : ''}</button>`;
  }).join('');
  const timed = all.filter(t => t.time), any = all.filter(t => !t.time);
  const over = d === now ? S.tasks.filter(t => !t.done && t.date < now).sort((a, b) => a.date < b.date ? 1 : -1) : [];
  const planned = all.reduce((a, t) => a + mins(t), 0);
  const status = !all.length ? 'A clear page.' : done === all.length ? 'Everything done. Rest well.' : `${all.length - done} left · ${done} done${planned ? ` · ${fmtDur(planned)} planned` : ''}`;
  return `
    <div class="hero">
      <div><div class="eyebrow">${hello} · ${fmt(d, { month: 'short', day: 'numeric' })}</div>
      <h1>${name}<em>.</em></h1><p>${status}</p></div>
      ${all.length ? ring(done / all.length, `${done} of ${all.length} done`) : ''}
    </div>
    <div class="week">
      <button class="nav" data-act="week" data-n="-7" aria-label="Previous week">${icon('left')}</button>
      <div class="days">${days}</div>
      <button class="nav" data-act="week" data-n="7" aria-label="Next week">${icon('right')}</button>
    </div>
    ${over.length ? `<h2>Carried over</h2><div class="list">${over.map(t => taskRow(t, { showDate: true, move: true })).join('')}</div>` : ''}
    ${timed.length ? `<h2>Scheduled</h2><div class="list">${timed.map(t => taskRow(t)).join('')}</div>` : ''}
    ${any.length ? `<h2>Anytime</h2><div class="list">${any.map(t => taskRow(t)).join('')}</div>` : ''}
    ${!all.length && !over.length ? `<div class="empty"><strong>Nothing planned.</strong>Add your first task below.</div>` : ''}
    <form class="quick" id="quick">${icon('plus')}<input name="q" placeholder="Add a task…" aria-label="Quick add task" autocomplete="off" enterkeyhint="done" maxlength="140"></form>
    <p class="hint">Try <kbd>Gym 6-7pm tomorrow</kbd> or end with <kbd>!</kbd> for priority.</p>`;
}

function goalStats(g) {
  const ts = S.tasks.filter(t => t.goalId === g.id), done = ts.filter(t => t.done).length;
  const next = sortTasks(ts.filter(t => !t.done && t.date >= today()).sort((a, b) => a.date < b.date ? -1 : 1))[0] || ts.find(t => !t.done);
  return { total: ts.length, done, pct: ts.length ? done / ts.length : 0, next, time: ts.filter(t => t.done).reduce((a, t) => a + mins(t), 0) };
}
function viewGoals() {
  const cards = S.goals.map(g => {
    const s = goalStats(g);
    let left = '';
    if (g.due) { const n = Math.round((parseYmd(g.due) - parseYmd(today())) / 864e5); left = n > 1 ? `${n} days left` : n === 1 ? '1 day left' : n === 0 ? 'Due today' : `${-n}d overdue`; }
    return `<div class="goal" style="--c:${esc(g.color)}" data-act="edit-goal" data-id="${g.id}" tabindex="0" role="button" aria-label="Edit goal ${esc(g.title)}">
      <div class="head"><i class="dot"></i><h3>${esc(g.title)}</h3><span class="pct">${Math.round(s.pct * 100)}%</span></div>
      ${g.why ? `<p>${esc(g.why)}</p>` : ''}
      <div class="track"><div style="width:${s.pct * 100}%"></div></div>
      <div class="foot"><span>${s.done}/${s.total} steps${s.time ? ` · ${fmtDur(s.time)} spent` : ''}${left ? ' · ' + left : ''}</span><button class="btn sm line" data-act="step" data-id="${g.id}">${icon('plus')}Step</button></div>
      ${s.next ? `<div class="next">${icon('arrow')}<span>Next</span><b>${esc(s.next.title)}</b></div>` : ''}
    </div>`;
  }).join('');
  return `
    <div class="hero"><div><div class="eyebrow">${S.goals.length} in motion</div><h1>Goals<em>.</em></h1><p>Big things, broken into daily steps.</p></div></div>
    <h2>Active</h2>
    <div class="list">${cards || `<div class="empty"><strong>Aim at something.</strong>Create a goal, then link tasks to it as steps.</div>`}</div>
    <div style="text-align:center;margin-top:18px"><button class="btn primary" data-act="new-goal">${icon('plus')}New goal</button></div>`;
}

const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; };
function viewFocus() {
  const open = sortTasks(tasksOn(today()).filter(t => !t.done));
  const total = S.settings.focusMin * 60000, c = 2 * Math.PI * 94;
  const left = timer.running ? timer.end - Date.now() : timer.left;
  return `
    <div class="hero"><div><div class="eyebrow">Deep work</div><h1>Focus<em>.</em></h1><p>One thing. One timer. Nothing else.</p></div></div>
    <div class="focus">
      <div class="dial"><svg viewBox="0 0 200 200"><defs><linearGradient id="dial-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#B9F500"/><stop offset="1" stop-color="#723BFA"/></linearGradient></defs><circle class="trk" cx="100" cy="100" r="94"/><circle class="bar" id="dial-bar" cx="100" cy="100" r="94" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - left / total)}"/></svg>
        <div class="read"><b id="dial-time" class="num">${mmss(left)}</b><span class="eyebrow">${timer.running ? 'In session' : left < total ? 'Paused' : 'Ready'}</span></div></div>
      <div class="seg" role="group" aria-label="Session length">${[15, 25, 50].map(m => `<button data-act="len" data-m="${m}" class="${S.settings.focusMin === m ? 'on' : ''}">${m} min</button>`).join('')}</div>
      <select id="focus-task" aria-label="Task to focus on"><option value="">No task — just focus</option>${open.map(t => `<option value="${t.id}" ${timer.taskId === t.id ? 'selected' : ''}>${esc(t.title)}</option>`).join('')}</select>
      <div class="row"><button class="btn primary" data-act="timer">${timer.running ? 'Pause' : left < total ? 'Resume' : 'Start session'}</button><button class="btn line" data-act="reset">Reset</button></div>
    </div>`;
}

function viewYou() {
  const now = today();
  const doneOn = d => tasksOn(d).filter(t => t.done).length;
  let streak = 0, d = doneOn(now) ? now : addDays(now, -1);
  while (doneOn(d)) { streak++; d = addDays(d, -1); }
  const week = Array.from({ length: 7 }, (_, i) => addDays(now, i - 6));
  const counts = week.map(doneOn), max = Math.max(1, ...counts);
  const wk = S.tasks.filter(t => t.date >= week[0] && t.date <= now);
  const rate = wk.length ? Math.round(wk.filter(t => t.done).length / wk.length * 100) : 0;
  const spent = wk.filter(t => t.done).reduce((a, t) => a + mins(t), 0);
  const sw = (act, on, label) => `<button class="switch" role="switch" aria-checked="${!!on}" aria-label="${label}" data-act="${act}"></button>`;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  return `
    <div class="hero"><div><div class="eyebrow">Your rhythm</div><h1>You<em>.</em></h1></div></div>
    <div class="stats">
      <div class="stat"><b>${streak}</b><span>day streak</span></div>
      <div class="stat"><b>${counts.reduce((a, b) => a + b, 0)}</b><span>done this week</span></div>
      <div class="stat"><b>${rate}<small style="font-size:.5em">%</small></b><span>completion</span></div>
      <div class="stat"><b>${spent ? fmtDur(spent) : '0h'}</b><span>time spent this week</span></div>
    </div>
    <h2>Last 7 days</h2>
    <div class="bars">${week.map((x, i) => `<div class="${counts[i] ? 'has' : ''}${x === now ? ' now' : ''}" title="${counts[i]} done"><i style="height:${counts[i] / max * 100}%"></i><small>${WD[parseYmd(x).getDay()][0]}</small></div>`).join('')}</div>
    <h2>Reminders</h2>
    <div class="rows">
      <div class="rowi"><div class="grow">Notifications<small>${!canNotify() ? 'Install the app to enable on this device' : Notification.permission === 'denied' ? 'Blocked in browser settings' : 'Nudges when a task is due'}</small></div>${sw('notif', notifOn(), 'Notifications')}</div>
      <div class="rowi"><div class="grow">Daily briefing<small>A morning summary of your day</small></div><input type="time" id="brief-at" value="${S.settings.briefAt}" aria-label="Briefing time">${sw('brief', S.settings.brief, 'Daily briefing')}</div>
    </div>
    <h2>App</h2>
    <div class="rows">
      ${standalone ? '' : `<div class="rowi"><div class="grow">Install Kairo<small>${installEvt ? 'Add it to your home screen' : 'Browser menu → “Add to Home Screen” / “Install app”'}</small></div><button class="btn sm primary" data-act="install" ${installEvt ? '' : 'hidden'}>Install</button></div>`}
      <div class="rowi"><div class="grow">Your data<small>Stored only on this device</small></div><button class="btn sm line" data-act="export">Export</button><button class="btn sm line" data-act="import">Import</button></div>
      <div class="rowi"><div class="grow">Start over<small>Erase all tasks and goals</small></div><button class="btn sm ghost danger" data-act="wipe">Erase</button></div>
    </div>
    <p class="foot-note">Kairo · made for unhurried days</p>`;
}

const VIEWS = { today: viewToday, goals: viewGoals, focus: viewFocus, you: viewYou };
let lastTab;
function render() {
  const v = $('#view');
  v.dataset.tab = ui.tab;
  v.style.setProperty('--t', (performance.now() / 1000).toFixed(2)); // keeps the hero lights in phase across re-renders
  v.innerHTML = VIEWS[ui.tab]();
  if (lastTab !== ui.tab) { v.style.animation = 'none'; void v.offsetWidth; v.style.animation = ''; scrollTo(0, 0); lastTab = ui.tab; }
  $$('.dock [data-tab]').forEach(b => { const on = b.dataset.tab === ui.tab; b.classList.toggle('on', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
  $('#bell').classList.toggle('on', notifOn());
  placeInd();
}
function placeInd() { const on = $('.dock .on'); if (on) $('.ind').style.transform = `translateX(${on.offsetLeft + on.offsetWidth / 2}px)`; }
addEventListener('resize', placeInd);
function applyTheme() {
  const t = S.settings.theme;
  t === 'auto' ? delete document.documentElement.dataset.theme : document.documentElement.dataset.theme = t;
  requestAnimationFrame(() => $('meta[name=theme-color]').content = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
}

// ---------- sheets ----------
const taskDlg = $('#task-dlg'), taskForm = $('#task-form'), goalDlg = $('#goal-dlg'), goalForm = $('#goal-form');
function openTask(t, preset = {}) {
  ui.editTask = t ? t.id : null;
  const v = t || { title: '', notes: '', date: ui.tab === 'today' ? ui.date : today(), time: '', end: '', remind: 0, repeat: 'none', goalId: '', priority: false, ...preset };
  const f = taskForm.elements;
  f.goalId.innerHTML = `<option value="">None</option>` + S.goals.map(g => `<option value="${g.id}">${esc(g.title)}</option>`).join('');
  for (const k of ['title', 'notes', 'date', 'time', 'end', 'repeat', 'goalId']) f[k].value = v[k] ?? '';
  f.remind.value = String(v.remind);
  f.priority.checked = !!v.priority;
  $('[data-act=del-task]', taskForm).hidden = !t;
  durNote();
  taskDlg.showModal();
  if (!t) f.title.focus();
}
function durNote() {
  const f = taskForm.elements, m = mins({ time: f.time.value, end: f.end.value });
  $('#dur-note').textContent = m ? `Duration · ${fmtDur(m)}` : f.end.value && !f.time.value ? 'Add a start time first.' : '';
}
taskForm.addEventListener('input', durNote);
taskForm.addEventListener('submit', () => {
  const f = taskForm.elements, title = f.title.value.trim(); if (!title) return;
  const data = { title, notes: f.notes.value.trim(), date: f.date.value || today(), time: f.time.value, end: f.time.value ? f.end.value : '', remind: +f.remind.value, repeat: f.repeat.value, goalId: f.goalId.value, priority: f.priority.checked };
  const t = S.tasks.find(x => x.id === ui.editTask);
  if (t) Object.assign(t, data); else S.tasks.push({ id: uid(), done: false, ...data });
  silencePast(); save(); render();
  if (!t && data.time && data.remind >= 0 && !notifOn() && canNotify() && Notification.permission !== 'denied')
    toast('Want a reminder?', 'Turn on notifications.', { label: 'Enable', fn: enableNotif });
});
function openGoal(g) {
  ui.editGoal = g ? g.id : null;
  const f = goalForm.elements, color = g?.color || COLORS[S.goals.length % COLORS.length];
  f.title.value = g?.title || ''; f.why.value = g?.why || ''; f.due.value = g?.due || '';
  $('.swatches', goalForm).innerHTML = COLORS.map(c => `<label><input type="radio" name="color" value="${c}" ${c === color ? 'checked' : ''} aria-label="Color ${c}"><span style="--c:${c}"></span></label>`).join('');
  $('[data-act=del-goal]', goalForm).hidden = !g;
  goalDlg.showModal();
  if (!g) f.title.focus();
}
goalForm.addEventListener('submit', () => {
  const f = goalForm.elements, title = f.title.value.trim(); if (!title) return;
  const data = { title, why: f.why.value.trim(), due: f.due.value, color: f.color.value || COLORS[0] };
  const g = goalOf(ui.editGoal);
  if (g) Object.assign(g, data); else S.goals.push({ id: uid(), ...data });
  save(); render();
});
// Tap on the backdrop closes a sheet.
for (const d of [taskDlg, goalDlg]) d.addEventListener('click', e => { if (e.target === d) d.close(); });

// ---------- focus timer ----------
function paintTimer() {
  if (!timer.running) return;
  const left = timer.end - Date.now(), total = S.settings.focusMin * 60000;
  if (left <= 0) {
    timer.running = false; timer.left = total;
    const t = S.tasks.find(x => x.id === timer.taskId && !x.done);
    notify('Session complete', t ? `Nice work on “${t.title}”.` : 'Take a breath. You earned it.', 'focus');
    if (t) toast('Finished the task?', t.title, { label: 'Mark done', fn: () => { toggleTask(t.id); render(); } });
    document.title = 'Kairo — Daily Planner';
    if (ui.tab === 'focus') render();
    return;
  }
  document.title = `${mmss(left)} · Kairo`;
  const b = $('#dial-bar'); if (!b) return;
  $('#dial-time').textContent = mmss(left);
  b.style.strokeDashoffset = 2 * Math.PI * 94 * (1 - left / total);
}

// ---------- events ----------
const ACT = {
  new: () => openTask(null),
  'edit-task': el => openTask(S.tasks.find(t => t.id === el.dataset.id)),
  toggle: el => {
    toggleTask(el.dataset.id);
    el.closest('.task').classList.toggle('done');
    el.classList.add('just');
    navigator.vibrate?.(12);
    setTimeout(render, 420);
  },
  move: el => { const t = S.tasks.find(x => x.id === el.dataset.id); t.date = today(); save(); render(); },
  pick: el => { ui.date = el.dataset.d; render(); },
  week: el => { ui.date = addDays(ui.date, +el.dataset.n); render(); },
  'new-goal': () => openGoal(null),
  'edit-goal': el => openGoal(goalOf(el.dataset.id)),
  step: el => openTask(null, { goalId: el.dataset.id, date: today() }),
  close: el => el.closest('dialog').close(),
  'del-task': () => {
    const i = S.tasks.findIndex(t => t.id === ui.editTask); if (i < 0) return;
    const [gone] = S.tasks.splice(i, 1); save(); taskDlg.close(); render();
    toast('Task deleted', gone.title, { label: 'Undo', fn: () => { S.tasks.push(gone); save(); render(); } });
  },
  'del-goal': () => {
    const id = ui.editGoal; if (!confirm('Delete this goal? Its tasks will be kept.')) return;
    S.goals = S.goals.filter(g => g.id !== id); S.tasks.forEach(t => { if (t.goalId === id) t.goalId = ''; });
    save(); goalDlg.close(); render();
  },
  len: el => { S.settings.focusMin = +el.dataset.m; timer.running = false; timer.left = S.settings.focusMin * 60000; save(); render(); },
  timer: () => {
    if (timer.running) { timer.left = timer.end - Date.now(); timer.running = false; }
    else { timer.end = Date.now() + timer.left; timer.running = true; }
    render();
  },
  reset: () => { timer.running = false; timer.left = S.settings.focusMin * 60000; document.title = 'Kairo — Daily Planner'; render(); },
  notif: () => { if (notifOn()) { S.settings.notif = false; save(); render(); } else enableNotif(); },
  brief: () => {
    S.settings.brief = !S.settings.brief;
    // Don't fire a briefing for a time that already passed today.
    if (S.settings.brief && Date.now() >= new Date(`${today()}T${S.settings.briefAt}`).getTime()) S.fired[`brief:${today()}`] = 1;
    save(); render();
    if (S.settings.brief && !notifOn()) enableNotif();
  },
  theme: el => { S.settings.theme = el.dataset.t; save(); applyTheme(); render(); },
  install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); },
  export: () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ tasks: S.tasks, goals: S.goals, settings: S.settings }, null, 2)], { type: 'application/json' }));
    a.download = `kairo-${today()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
  import: () => $('#import-file').click(),
  wipe: () => { if (confirm('Erase all tasks and goals on this device?')) { S.tasks = []; S.goals = []; S.fired = {}; save(); render(); } },
};
document.addEventListener('click', e => {
  const tab = e.target.closest('.dock [data-tab]');
  if (tab) { ui.tab = tab.dataset.tab; if (ui.tab === 'today' && lastTab === 'today') ui.date = today(); return render(); }
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { if (el.type !== 'submit') e.preventDefault(); ACT[el.dataset.act](el); }
});
document.addEventListener('keydown', e => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.goal, .task')) { e.preventDefault(); e.target.click(); }
  if (e.key === 'n' && !e.target.closest('input, textarea, select, dialog') && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openTask(null); }
});
document.addEventListener('submit', e => {
  if (e.target.id !== 'quick') return;
  e.preventDefault();
  const p = parseQuick(e.target.q.value, ui.date); if (!p.title) return;
  S.tasks.push({ id: uid(), notes: '', remind: p.time ? 0 : -1, repeat: 'none', goalId: '', done: false, ...p });
  silencePast(); save();
  if (p.date !== ui.date) toast('Added', `${p.title} · ${fmt(p.date, { weekday: 'short', month: 'short', day: 'numeric' })}`, { label: 'View', fn: () => { ui.date = p.date; render(); } });
  render(); $('#quick input')?.focus();
});
document.addEventListener('change', e => {
  if (e.target.id === 'focus-task') timer.taskId = e.target.value;
  if (e.target.id === 'brief-at' && e.target.value) {
    S.settings.briefAt = e.target.value;
    S.fired[`brief:${today()}`] = Date.now() >= new Date(`${today()}T${e.target.value}`).getTime() ? 1 : 0;
    save();
  }
  if (e.target.id === 'import-file' && e.target.files[0]) {
    e.target.files[0].text().then(txt => {
      const d = JSON.parse(txt);
      if (!Array.isArray(d.tasks) || !Array.isArray(d.goals)) throw 0;
      S.tasks = d.tasks; S.goals = d.goals; S.settings = { ...S.settings, ...d.settings, notif: S.settings.notif };
      silencePast(); save(); applyTheme(); render(); toast('Imported', `${d.tasks.length} tasks · ${d.goals.length} goals`);
    }).catch(() => toast('Import failed', 'That file is not a Kairo backup.'));
    e.target.value = '';
  }
});
$('#bell').addEventListener('click', () => { if (notifOn()) { ui.tab = 'you'; render(); } else enableNotif(); });
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (ui.tab === 'you') render(); });
addEventListener('appinstalled', () => { installEvt = null; toast('Kairo installed', 'Find it on your home screen.'); render(); });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); paintTimer(); if (!$('dialog[open]') && document.activeElement?.tagName !== 'INPUT') render(); } });

// ---------- boot ----------
$('#bell').innerHTML = icon('bell');
$$('.dock [data-tab]').forEach(b => b.innerHTML = icon(b.dataset.tab) + `<span>${b.getAttribute('aria-label')}</span>`);
$('.fab').innerHTML = icon('plus');
applyTheme();
render();
if (params.get('new')) openTask(null);
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
tick();
setInterval(tick, 20000);
setInterval(paintTimer, 250);
// Refresh the "Now" badge and late states once a minute, unless the user is mid-typing.
setInterval(() => { if (ui.tab === 'today' && !$('dialog[open]') && document.activeElement?.tagName !== 'INPUT') render(); }, 60000);
})();
