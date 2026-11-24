/* Ember — streak builder */
"use strict";

const STORAGE_KEY = "ember-data-v1";
const MILESTONES = [7, 30, 100];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

const PALETTE = [
  "#E8833A", "#F59E4B", "#F4A261", "#E76F51", "#D97706",
  "#EA8A5A", "#C97D60", "#BC6C25", "#E9A56B", "#DE6C4E"
];

const EMOJIS = ["💧","🚶","🏃","🏋️","🧘","📚","✍️","🧠","🦷","🍎","🥗","☕","💤","🌅","🧹","🧴","🙏","🎵","🎨","💼","🎯","❤️","📱","🚿","🚴","🌞","📝","🍵","💊","🌱","🐶","🧑‍🍳","🪞","📵","🧃","🧊","🛏️","📞","🪥","🧩"];

const SUGGESTIONS = [
  { name: "Drink water", emoji: "💧", color: "#F59E4B" },
  { name: "Walk", emoji: "🚶", color: "#E8833A" },
  { name: "Read", emoji: "📚", color: "#C97D60" },
  { name: "Stretch", emoji: "🧘", color: "#F4A261" }
];

const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

function esc(s) {
  return String(s ?? "").replace(/[&<>"'`]/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;"
  }[c]));
}
function pad(n) { return String(n).padStart(2, "0"); }
function toISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function parseISO(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
function weekday(iso) { return parseISO(iso).getDay(); }
function startOfWeekMonday(iso) {
  const d = parseISO(iso);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toISO(d);
}
function monthKey(iso) { return iso.slice(0, 7); }
function formatLong(iso) {
  const d = parseISO(iso);
  return `${DAY_NAMES[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
function greeting(d = new Date()) {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
function uid() {
  return "h_" + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
}
function haptic(kind) {
  if (!navigator.vibrate) return;
  if (kind === "success") navigator.vibrate([12, 30, 18]);
  else if (kind === "celebrate") navigator.vibrate([18, 40, 18, 40, 36]);
  else if (kind === "warn") navigator.vibrate([30, 40, 30]);
  else navigator.vibrate(10);
}

function defaultData() {
  return {
    version: 1,
    habits: [],
    checkins: {},
    freezes: {},
    celebrated: {},
    settings: {
      theme: "auto",
      displayName: "",
      freezeEnabled: true,
      freezesPerMonth: 2
    },
    onboardingComplete: false
  };
}

let data = defaultData();
let ui = {
  tab: "today",
  onboardingStep: 0,
  sheet: null,
  editor: null,
  statsMonth: null,
  toastTimer: null
};

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) { data = defaultData(); return; }
    const parsed = JSON.parse(raw);
    const base = defaultData();
    data = {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      habits: Array.isArray(parsed.habits) ? parsed.habits : [],
      checkins: parsed.checkins && typeof parsed.checkins === "object" ? parsed.checkins : {},
      freezes: parsed.freezes && typeof parsed.freezes === "object" ? parsed.freezes : {},
      celebrated: parsed.celebrated && typeof parsed.celebrated === "object" ? parsed.celebrated : {}
    };
  } catch (err) {
    console.warn("Ember: could not load data", err);
    data = defaultData();
  }
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    showToast("Could not save — storage may be full.");
  }
}

function exportPayload() {
  return {
    app: "ember-streak-builder",
    version: 1,
    exportedAt: new Date().toISOString(),
    habits: data.habits,
    checkins: data.checkins,
    freezes: data.freezes,
    celebrated: data.celebrated,
    settings: data.settings,
    onboardingComplete: data.onboardingComplete
  };
}

function importPayload(obj) {
  if (!obj || typeof obj !== "object") throw new Error("Not a valid Ember backup.");
  if (!Array.isArray(obj.habits)) throw new Error("Backup is missing habits.");
  const base = defaultData();
  data = {
    ...base,
    habits: obj.habits,
    checkins: obj.checkins && typeof obj.checkins === "object" ? obj.checkins : {},
    freezes: obj.freezes && typeof obj.freezes === "object" ? obj.freezes : {},
    celebrated: obj.celebrated && typeof obj.celebrated === "object" ? obj.celebrated : {},
    settings: { ...base.settings, ...(obj.settings || {}) },
    onboardingComplete: true
  };
  save();
}

function isScheduled(habit, iso) {
  const freq = habit.frequency || { type: "daily" };
  if (freq.type === "daily") return true;
  if (freq.type === "weekdays") return (freq.days || []).includes(weekday(iso));
  return true;
}

function isDone(habit, iso) {
  return !!(data.checkins[habit.id] && data.checkins[habit.id][iso]) ||
         !!(data.freezes[habit.id] && data.freezes[habit.id][iso]);
}
function isCheckin(habit, iso) {
  return !!(data.checkins[habit.id] && data.checkins[habit.id][iso]);
}
function isFreeze(habit, iso) {
  return !!(data.freezes[habit.id] && data.freezes[habit.id][iso]);
}

function previousScheduled(habit, iso) {
  const freq = habit.frequency || { type: "daily" };
  if (freq.type === "timesPerWeek") return addDays(iso, -1);
  let cursor = addDays(iso, -1);
  const created = (habit.createdAt || "").slice(0, 10);
  for (let i = 0; i < 400; i++) {
    if (created && cursor < created) return null;
    if (isScheduled(habit, cursor)) return cursor;
    cursor = addDays(cursor, -1);
  }
  return null;
}

function weekCheckCount(habit, weekStart) {
  let n = 0;
  for (let i = 0; i < 7; i++) {
    if (isDone(habit, addDays(weekStart, i))) n++;
  }
  return n;
}

function currentWeeklyStreak(habit) {
  const times = Math.max(1, (habit.frequency && habit.frequency.times) || 3);
  const today = toISO();
  const created = (habit.createdAt || "").slice(0, 10);
  let w = startOfWeekMonday(today);
  const thisCount = weekCheckCount(habit, w);
  const weekEnd = addDays(w, 6);
  let count = 0;
  if (thisCount >= times) {
    count++;
    w = addDays(w, -7);
  } else if (today <= weekEnd) {
    w = addDays(w, -7);
  } else {
    return 0;
  }
  for (let i = 0; i < 80; i++) {
    const wEnd = addDays(w, 6);
    if (created && wEnd < created) break;
    if (weekCheckCount(habit, w) >= times) {
      count++;
      w = addDays(w, -7);
    } else break;
  }
  return count;
}

function currentStreak(habit) {
  const freq = habit.frequency || { type: "daily" };
  if (freq.type === "timesPerWeek") return currentWeeklyStreak(habit);
  const today = toISO();
  const created = (habit.createdAt || "").slice(0, 10);
  let cursor = today;
  if (!isScheduled(habit, today) || !isDone(habit, today)) {
    cursor = previousScheduled(habit, today);
    if (!cursor || !isDone(habit, cursor)) return 0;
  }
  let count = 0;
  while (cursor) {
    if (created && cursor < created) break;
    if (!isScheduled(habit, cursor)) {
      cursor = previousScheduled(habit, cursor);
      continue;
    }
    if (!isDone(habit, cursor)) break;
    count++;
    cursor = previousScheduled(habit, cursor);
  }
  return count;
}

function bestStreak(habit) {
  const freq = habit.frequency || { type: "daily" };
  const created = (habit.createdAt || "").slice(0, 10) || toISO();
  const today = toISO();
  if (freq.type === "timesPerWeek") {
    const times = Math.max(1, freq.times || 3);
    let best = 0, run = 0;
    let w = startOfWeekMonday(created);
    const last = startOfWeekMonday(today);
    while (w <= last) {
      if (weekCheckCount(habit, w) >= times) {
        run++;
        if (run > best) best = run;
      } else if (w === last && today <= addDays(w, 6)) {
        /* current open week does not break the best */
      } else {
        run = 0;
      }
      w = addDays(w, 7);
    }
    return Math.max(best, currentStreak(habit));
  }
  let best = 0, run = 0;
  let cursor = created;
  while (cursor <= today) {
    if (isScheduled(habit, cursor)) {
      if (isDone(habit, cursor)) {
        run++;
        if (run > best) best = run;
      } else if (cursor === today) {
        /* today not done yet */
      } else {
        run = 0;
      }
    }
    cursor = addDays(cursor, 1);
  }
  return Math.max(best, currentStreak(habit));
}

function clampRange(habit, from, to) {
  const created = (habit.createdAt || "").slice(0, 10);
  if (created && created > from) from = created;
  const today = toISO();
  if (today < to) to = today;
  return { from, to };
}

function scheduledDaysInRange(habit, from, to) {
  ({ from, to } = clampRange(habit, from, to));
  if (from > to) return 0;
  const freq = habit.frequency || { type: "daily" };
  if (freq.type === "timesPerWeek") {
    const times = Math.max(1, freq.times || 3);
    const days = Math.max(1, Math.round((parseISO(to) - parseISO(from)) / 86400000) + 1);
    return Math.max(1, Math.round((days / 7) * times));
  }
  let n = 0;
  let cursor = from;
  while (cursor <= to) {
    if (isScheduled(habit, cursor)) n++;
    cursor = addDays(cursor, 1);
  }
  return n;
}

function completionPct(habit, from, to) {
  const total = scheduledDaysInRange(habit, from, to);
  if (!total) return 0;
  const freq = habit.frequency || { type: "daily" };
  ({ from, to } = clampRange(habit, from, to));
  let doneAll = 0;
  let cursor = from;
  while (cursor <= to) {
    if (freq.type === "timesPerWeek") {
      if (isCheckin(habit, cursor)) doneAll++;
    } else if (isScheduled(habit, cursor) && isDone(habit, cursor)) {
      doneAll++;
    }
    cursor = addDays(cursor, 1);
  }
  return Math.min(100, Math.round((doneAll / total) * 100));
}

function dueToday(habit) { return isScheduled(habit, toISO()); }

function frequencyLabel(habit) {
  const f = habit.frequency || { type: "daily" };
  if (f.type === "daily") return "Daily";
  if (f.type === "weekdays") {
    const days = (f.days || []).slice().sort((a, b) => a - b);
    if (days.length === 7) return "Daily";
    if (days.length === 5 && days.join() === "1,2,3,4,5") return "Weekdays";
    if (days.length === 2 && days.join() === "0,6") return "Weekends";
    return days.map((d) => DAY_LETTERS[d]).join(" · ") || "Custom days";
  }
  return `${f.times || 3}× a week`;
}

function freezesUsedThisMonth() {
  const key = monthKey(toISO());
  let n = 0;
  for (const hid of Object.keys(data.freezes || {})) {
    for (const iso of Object.keys(data.freezes[hid] || {})) {
      if (iso.startsWith(key) && data.freezes[hid][iso]) n++;
    }
  }
  return n;
}
function freezesLeft() {
  if (!data.settings.freezeEnabled) return 0;
  return Math.max(0, (data.settings.freezesPerMonth || 0) - freezesUsedThisMonth());
}

function setCheck(habit, iso, on) {
  if (!data.checkins[habit.id]) data.checkins[habit.id] = {};
  if (on) {
    data.checkins[habit.id][iso] = true;
    if (data.freezes[habit.id]) delete data.freezes[habit.id][iso];
  } else {
    delete data.checkins[habit.id][iso];
  }
}
function setFreeze(habit, iso, on) {
  if (!data.freezes[habit.id]) data.freezes[habit.id] = {};
  if (on) {
    data.freezes[habit.id][iso] = true;
    if (data.checkins[habit.id]) delete data.checkins[habit.id][iso];
  } else {
    delete data.freezes[habit.id][iso];
  }
}

function maybeCelebrate(habit) {
  const streak = currentStreak(habit);
  const hit = MILESTONES.filter((m) => streak >= m);
  if (!hit.length) return null;
  if (!data.celebrated[habit.id]) data.celebrated[habit.id] = {};
  const fresh = hit.filter((m) => !data.celebrated[habit.id][String(m)]);
  if (!fresh.length) return null;
  const milestone = Math.max(...fresh);
  data.celebrated[habit.id][String(milestone)] = true;
  save();
  return milestone;
}

function preferredDark() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function isDark() {
  const t = data.settings.theme || "auto";
  return t === "dark" || (t === "auto" && preferredDark());
}
function applyTheme() {
  const dark = isDark();
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  const meta = $("#meta-theme-color");
  if (meta) meta.setAttribute("content", dark ? "#1A1410" : "#FFF6EC");
}

function isStandalone() {
  return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
    window.navigator.standalone === true;
}

let confettiAnim = 0;
function burstConfetti() {
  const canvas = $("#confetti");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const rect = canvas.getBoundingClientRect();
  const width = rect.width, height = rect.height;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const colors = ["#F59E4B", "#E8833A", "#FFD8B0", "#FFF6EC", "#E76F51", "#E9A56B", "#FFFFFF", "#F4A261"];
  const parts = [];
  const cx = width / 2, cy = height * 0.38;
  for (let i = 0; i < 110; i++) {
    const ang = Math.random() * Math.PI * 2;
    const spd = 3 + Math.random() * 8;
    parts.push({
      x: cx, y: cy,
      vx: Math.cos(ang) * spd,
      vy: Math.sin(ang) * spd - 4,
      w: 5 + Math.random() * 6,
      h: 8 + Math.random() * 8,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[i % colors.length],
      life: 1
    });
  }
  const start = performance.now();
  cancelAnimationFrame(confettiAnim);
  function frame(now) {
    const t = (now - start) / 1800;
    ctx.clearRect(0, 0, width, height);
    for (const p of parts) {
      p.vy += 0.18;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life = Math.max(0, 1 - t);
      ctx.save();
      ctx.globalAlpha = p.life;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (t < 1) confettiAnim = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, width, height);
  }
  confettiAnim = requestAnimationFrame(frame);
}

function showToast(message, actionLabel, action) {
  const el = $("#toast");
  el.hidden = false;
  el.innerHTML = `<span>${esc(message)}</span>` +
    (actionLabel ? `<button type="button" data-act="toast-go">${esc(actionLabel)}</button>` : "");
  el._toastAction = action || null;
  clearTimeout(ui.toastTimer);
  ui.toastTimer = setTimeout(hideToast, 4200);
}
function hideToast() {
  const el = $("#toast");
  el.hidden = true;
  el.innerHTML = "";
  el._toastAction = null;
  clearTimeout(ui.toastTimer);
}

function closeSheet() {
  const root = $("#sheet-root");
  const sheet = $(".sheet, .dialog", root);
  const back = $(".backdrop", root);
  if (!sheet) { root.innerHTML = ""; ui.sheet = null; return; }
  sheet.classList.add("closing");
  if (back) back.classList.add("closing");
  setTimeout(() => { root.innerHTML = ""; ui.sheet = null; }, 240);
}

function openSheet(innerHtml, { dialog } = {}) {
  hideToast();
  const root = $("#sheet-root");
  root.innerHTML = `<div class="backdrop" data-act="close-sheet"></div>` +
    (dialog
      ? `<div class="dialog" role="dialog" aria-modal="true">${innerHtml}</div>`
      : `<div class="sheet" role="dialog" aria-modal="true"><div class="grabber"></div>${innerHtml}</div>`);
}

function findHabit(id) { return data.habits.find((h) => h.id === id); }

function render() {
  applyTheme();
  const onboard = $("#onboarding");
  const main = $("#main");
  if (!data.onboardingComplete) {
    main.hidden = true;
    onboard.hidden = false;
    renderOnboarding();
    return;
  }
  onboard.hidden = true;
  main.hidden = false;
  renderHeader();
  renderView();
  $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === ui.tab));
}

function renderOnboarding() {
  const steps = [
    {
      title: "Welcome to Ember",
      body: "A warm, simple place to build streaks for anything — a walk, a book, a glass of water, or a promise you made to yourself."
    },
    {
      title: "One tap, every day",
      body: "Create any habit. Check in with one tap. Keep a streak going, or use a streak freeze when life gets in the way."
    },
    {
      title: "Keep it on your Home Screen",
      body: "In Safari, tap the Share button, then Add to Home Screen. Ember opens full screen, works offline, and keeps everything on this device."
    }
  ];
  const s = ui.onboardingStep;
  const last = s === steps.length - 1;
  const step = steps[s];
  $("#onboarding").innerHTML = `
    <div class="onboard">
      <div class="onboard-art">
        <img class="onboard-logo" src="./icons/icon-192.png" alt="Ember" width="108" height="108">
        <h1>${esc(step.title)}</h1>
        <p>${esc(step.body)}</p>
      </div>
      <div class="dots">${steps.map((_, i) => `<i class="${i === s ? "on" : ""}"></i>`).join("")}</div>
      <div class="onboard-actions">
        <button class="btn btn-primary btn-block" data-act="onboard-next">${last ? "Get started" : "Continue"}</button>
        ${s > 0
          ? `<button class="btn btn-secondary btn-block" data-act="onboard-back">Back</button>`
          : `<button class="btn btn-secondary btn-block" data-act="onboard-skip">Skip</button>`}
      </div>
    </div>`;
}

function ringSvg(pct, size) {
  const r = 14, c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, pct)) * c;
  return `<svg class="ring" viewBox="0 0 36 36" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="18" cy="18" r="${r}" fill="none" stroke="currentColor" stroke-width="3.5" opacity="0.15"/>
    <circle cx="18" cy="18" r="${r}" fill="none" stroke="#E8833A" stroke-width="3.5"
      stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 18 18)"/>
  </svg>`;
}

function checkIcon() {
  return `<svg viewBox="0 0 24 24"><path d="M5 12.5l5 5L19 7.5"/></svg>`;
}
function chevIcon() {
  return `<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>`;
}

function renderHeader() {
  const header = $("#app-header");
  const today = toISO();
  if (ui.tab === "today") {
    const due = data.habits.filter((h) => (h.frequency || {}).type === "timesPerWeek" || dueToday(h));
    const done = due.filter((h) => isDone(h, today)).length;
    const total = due.length;
    const name = (data.settings.displayName || "").trim();
    const greet = name ? `${greeting()}, ${name}` : greeting();
    header.innerHTML = `
      <div class="header-row">
        <div>
          <p class="kicker">${esc(greet)}</p>
          <h1>Today</h1>
          <p class="kicker" style="margin-top:4px">${esc(formatLong(today))}</p>
        </div>
        ${total ? `<div class="progress-pill">
          ${ringSvg(done / total, 36)}
          <div class="ring-label">${done} of ${total}<span>done</span></div>
        </div>` : ""}
      </div>`;
  } else if (ui.tab === "habits") {
    header.innerHTML = `<div class="header-row"><div><p class="kicker">Your list</p><h1>Habits</h1></div>
      <button type="button" class="btn btn-primary btn-sm" data-act="new-habit">+ Add</button></div>`;
  } else if (ui.tab === "stats") {
    header.innerHTML = `<p class="kicker">How you’re doing</p><h1>Stats</h1>`;
  } else {
    header.innerHTML = `<p class="kicker">Ember</p><h1>Settings</h1>`;
  }
}

function renderView() {
  const view = $("#view");
  view.classList.remove("fade");
  void view.offsetWidth;
  view.classList.add("fade");
  if (ui.tab === "today") view.innerHTML = renderToday();
  else if (ui.tab === "habits") view.innerHTML = renderHabits();
  else if (ui.tab === "stats") view.innerHTML = renderStats();
  else view.innerHTML = renderSettings();
  bindSwipeRows(view);
}

function habitCard(h, opts = {}) {
  const iso = opts.iso || toISO();
  const done = isDone(h, iso);
  const frozen = isFreeze(h, iso);
  const streak = currentStreak(h);
  const unit = (h.frequency || {}).type === "timesPerWeek" ? "wk" : "day";
  const subBits = [frequencyLabel(h)];
  if (opts.extra) subBits.push(opts.extra);
  if (h.reminderNote) subBits.push(formatTimeNote(h.reminderNote));
  if (h.goal) subBits.push(`${streak}/${h.goal} ${unit} goal`);
  return `
    <article class="habit-card ${done ? "done" : ""}" style="--hcolor:${esc(h.color || PALETTE[0])}" data-habit="${esc(h.id)}">
      <div class="habit-emoji">${esc(h.emoji || "🔥")}</div>
      <div class="habit-meta">
        <p class="habit-name">${esc(h.name)}</p>
        <div class="habit-sub">
          <span class="streak-chip ${streak ? "" : "zero"}">${streak ? "🔥 " + streak : "No streak yet"}</span>
          <span>${subBits.map(esc).join(" · ")}</span>
        </div>
      </div>
      <button type="button" class="check-btn ${done ? "on" : ""} ${frozen ? "frozen" : ""}"
        data-act="toggle-check" data-habit="${esc(h.id)}" data-iso="${iso}"
        aria-label="${done ? "Undo check-in" : "Check in"} for ${esc(h.name)}" aria-pressed="${done}">
        ${checkIcon()}
      </button>
    </article>`;
}

function formatTimeNote(t) {
  if (!t) return "";
  const m = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return t;
  let h = Number(m[1]);
  const min = m[2];
  const am = h < 12;
  const h12 = h % 12 || 12;
  return `${h12}:${min} ${am ? "AM" : "PM"}`;
}

function renderToday() {
  if (!data.habits.length) {
    return `
      <div class="empty">
        <div class="illus">🔥</div>
        <h2>Start a streak</h2>
        <p>Add anything you want to come back to. Here are a few ideas to try.</p>
        <div class="suggest-row">
          ${SUGGESTIONS.map((s, i) => `<button type="button" class="chip" data-act="quick-add" data-i="${i}">${s.emoji} ${esc(s.name)}</button>`).join("")}
        </div>
        <button type="button" class="btn btn-primary" data-act="new-habit">Add a habit</button>
      </div>`;
  }
  const today = toISO();
  const yesterday = addDays(today, -1);
  const weekly = data.habits.filter((h) => (h.frequency || {}).type === "timesPerWeek");
  const due = data.habits.filter((h) => (h.frequency || {}).type !== "timesPerWeek" && dueToday(h));
  const rest = data.habits.filter((h) => (h.frequency || {}).type !== "timesPerWeek" && !dueToday(h));
  const missed = data.habits.filter((h) => {
    const created = (h.createdAt || "").slice(0, 10);
    if (created && yesterday < created) return false;
    if ((h.frequency || {}).type === "timesPerWeek") return false;
    return isScheduled(h, yesterday) && !isDone(h, yesterday);
  });

  let html = "";
  if (missed.length) {
    const left = freezesLeft();
    const canFreeze = data.settings.freezeEnabled && left > 0;
    html += `<div class="banner">
      <div><div class="banner-title">Yesterday slipped by</div>
      <p>${canFreeze ? `You have ${left} freeze${left === 1 ? "" : "s"} left this month.` : "Mark a day late, or turn on streak freezes in Settings."}</p></div>
      ${missed.map((h) => `
        <div class="missed-row">
          <span>${esc(h.emoji || "")} ${esc(h.name)}</span>
          <span class="banner-actions">
            <button class="btn btn-sm btn-ghost" data-act="backfill" data-habit="${esc(h.id)}" data-iso="${yesterday}">Mark done</button>
            ${canFreeze ? `<button class="btn btn-sm btn-freeze" data-act="freeze-day" data-habit="${esc(h.id)}" data-iso="${yesterday}">Freeze</button>` : ""}
          </span>
        </div>`).join("")}
    </div>`;
  }

  if (due.length) {
    html += `<div class="section-label">Due today</div>`;
    html += due.map((h) => habitCard(h)).join("");
  }

  if (weekly.length) {
    html += `<div class="section-label">This week</div>`;
    const week = startOfWeekMonday(today);
    html += weekly.map((h) => {
      const got = weekCheckCount(h, week);
      const times = h.frequency.times || 3;
      return habitCard(h, { extra: `${got} / ${times} this week` });
    }).join("");
  }

  if (!due.length && !weekly.length) {
    html += `<div class="banner"><div class="banner-title">Nothing due today</div><p>Enjoy the pause — or open Habits to add something new.</p></div>`;
  }

  if (rest.length) {
    html += `<div class="section-label">Not due today</div>`;
    html += rest.map((h) => habitCard(h)).join("");
  }
  return html;
}

function renderHabits() {
  if (!data.habits.length) {
    return `
      <div class="empty">
        <div class="illus">✨</div>
        <h2>No habits yet</h2>
        <p>Create one for anything you want to keep doing. You can change it later.</p>
        <button type="button" class="btn btn-primary" data-act="new-habit">Add a habit</button>
      </div>`;
  }
  return data.habits.map((h) => {
    const streak = currentStreak(h);
    return `
      <div class="swipe-wrap">
        <div class="swipe-actions">
          <button type="button" data-act="ask-delete-habit" data-habit="${esc(h.id)}">Delete</button>
        </div>
        <button type="button" class="habit-row" data-act="edit-habit" data-habit="${esc(h.id)}" style="--hcolor:${esc(h.color || PALETTE[0])}">
          <div class="habit-emoji">${esc(h.emoji || "🔥")}</div>
          <div class="habit-meta">
            <p class="habit-name">${esc(h.name)}</p>
            <div class="habit-sub">
              <span class="streak-chip ${streak ? "" : "zero"}">${streak ? "🔥 " + streak : "No streak yet"}</span>
              <span>${esc(frequencyLabel(h))}${h.reminderNote ? " · " + esc(formatTimeNote(h.reminderNote)) : ""}</span>
            </div>
          </div>
          <span class="chev">${chevIcon()}</span>
        </button>
      </div>`;
  }).join("") + `
    <div class="fab">
      <button type="button" class="btn btn-primary" data-act="new-habit">Add a habit</button>
    </div>`;
}

function monthBounds(y, m) {
  const from = `${y}-${pad(m + 1)}-01`;
  const last = new Date(y, m + 1, 0).getDate();
  const to = `${y}-${pad(m + 1)}-${pad(last)}`;
  return { from, to };
}

function renderMonthGrid(habit, y, m) {
  const first = new Date(y, m, 1);
  const lastDate = new Date(y, m + 1, 0).getDate();
  const startDow = first.getDay();
  const today = toISO();
  const created = (habit.createdAt || "").slice(0, 10);
  const weekly = (habit.frequency || {}).type === "timesPerWeek";
  let cells = "";
  for (let i = 0; i < startDow; i++) cells += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= lastDate; d++) {
    const iso = `${y}-${pad(m + 1)}-${pad(d)}`;
    const future = iso > today;
    const before = created && iso < created;
    let cls = "cal-day";
    if (iso === today) cls += " today-mark";
    if (future || before) cls += " future";
    else if (isFreeze(habit, iso)) cls += " freeze";
    else if (isCheckin(habit, iso)) cls += " done";
    else if (!weekly && isScheduled(habit, iso) && iso < today) cls += " missed";
    cells += `<div class="${cls}">${d}</div>`;
  }
  return `<div class="cal-grid">
    ${DAY_LETTERS.map((l) => `<div class="cal-dow">${l}</div>`).join("")}
    ${cells}
  </div>`;
}

function renderStats() {
  if (!data.habits.length) {
    return `
      <div class="empty">
        <div class="illus">📈</div>
        <h2>No stats yet</h2>
        <p>Add a habit and check in once — your streaks and calendar will show up here.</p>
        <button type="button" class="btn btn-primary" data-act="new-habit">Add a habit</button>
      </div>`;
  }
  const now = new Date();
  if (!ui.statsMonth) ui.statsMonth = { y: now.getFullYear(), m: now.getMonth() };
  const { y, m } = ui.statsMonth;
  const { from, to } = monthBounds(y, m);
  const rangeTo = toISO() < to ? toISO() : to;
  const rangeFrom = from;

  const best = Math.max(0, ...data.habits.map((h) => bestStreak(h)));
  const active = data.habits.filter((h) => currentStreak(h) > 0).length;
  const pcts = data.habits.map((h) => completionPct(h, rangeFrom, rangeTo));
  const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  const monthTitle = `${MONTHS[m]} ${y}`;
  const canNext = y < now.getFullYear() || (y === now.getFullYear() && m < now.getMonth());

  let html = `
    <div class="stat-grid">
      <div class="stat-tile"><div class="num">${active}</div><div class="lbl">Active streaks</div></div>
      <div class="stat-tile"><div class="num">${best}</div><div class="lbl">Best streak</div></div>
      <div class="stat-tile"><div class="num">${avg}%</div><div class="lbl">This month</div></div>
      <div class="stat-tile"><div class="num">${data.settings.freezeEnabled ? freezesLeft() : "—"}</div><div class="lbl">Freezes left</div></div>
    </div>
    <div class="cal-head">
      <button type="button" class="icon-btn" data-act="month-prev" aria-label="Previous month">${chevIcon().replace("M9 6l6 6-6 6", "M15 6l-6 6 6 6")}</button>
      <h3>${esc(monthTitle)}</h3>
      <button type="button" class="icon-btn" data-act="month-next" aria-label="Next month" ${canNext ? "" : "disabled style='opacity:.35'"}>${chevIcon()}</button>
    </div>`;

  html += data.habits.map((h) => {
    const cur = currentStreak(h);
    const bestH = bestStreak(h);
    const pct = completionPct(h, rangeFrom, rangeTo);
    const unit = (h.frequency || {}).type === "timesPerWeek" ? "wk" : "day";
    const goal = h.goal ? Math.min(100, Math.round((cur / h.goal) * 100)) : null;
    return `
      <section class="card habit-stats-card" style="--hcolor:${esc(h.color || PALETTE[0])}">
        <div class="header-row" style="align-items:center">
          <div>
            <p class="habit-name" style="margin:0">${esc(h.emoji || "")} ${esc(h.name)}</p>
            <p class="habit-sub" style="margin:4px 0 0">🔥 ${cur} current · Best ${bestH} ${unit}${bestH === 1 ? "" : "s"} · ${pct}% this month</p>
          </div>
        </div>
        ${h.goal ? `<div class="goal-bar" aria-label="Goal progress"><span style="width:${goal}%"></span></div>
          <p class="hint" style="margin:6px 0 10px">${cur} / ${h.goal} ${unit} goal</p>` : `<div style="height:10px"></div>`}
        ${renderMonthGrid(h, y, m)}
        <div class="legend">
          <span><i style="background:${esc(h.color || PALETTE[0])}"></i>Done</span>
          <span><i style="background:var(--freeze)"></i>Freeze</span>
          <span><i style="background:var(--danger-soft)"></i>Missed</span>
        </div>
      </section>`;
  }).join("");
  return html;
}

function renderSettings() {
  const theme = data.settings.theme || "auto";
  const installed = isStandalone();
  return `
    ${installed
      ? `<p class="ok-pill" style="margin:0 0 14px">Installed on this device</p>`
      : `<div class="install-card">
          <h3>Add Ember to your iPhone</h3>
          <ol>
            <li>Open this page in Safari</li>
            <li>Tap the Share button</li>
            <li>Tap Add to Home Screen, then Add</li>
          </ol>
          <p class="hint" style="margin:10px 0 0">Safari needs HTTPS (or localhost) for the app to work offline. See the README for hosting tips.</p>
        </div>`}

    <div class="section-label">You</div>
    <div class="group">
      <div class="row">
        <div class="left"><div class="title">Display name</div><div class="sub">Used in the Today greeting</div></div>
      </div>
      <div class="row">
        <input id="setting-name" class="text-input" maxlength="24" placeholder="Your name" value="${esc(data.settings.displayName || "")}">
      </div>
    </div>

    <div class="section-label">Appearance</div>
    <div class="group">
      <div class="row">
        <div class="left"><div class="title">Theme</div><div class="sub">Warm light, warm dark, or follow the phone</div></div>
      </div>
      <div class="row">
        <div class="seg" style="width:100%">
          <button type="button" class="${theme === "auto" ? "on" : ""}" data-act="theme" data-theme="auto" style="flex:1">Auto</button>
          <button type="button" class="${theme === "light" ? "on" : ""}" data-act="theme" data-theme="light" style="flex:1">Light</button>
          <button type="button" class="${theme === "dark" ? "on" : ""}" data-act="theme" data-theme="dark" style="flex:1">Dark</button>
        </div>
      </div>
    </div>

    <div class="section-label">Streak freezes</div>
    <div class="group">
      <div class="row">
        <div class="left">
          <div class="title">Allow freezes</div>
          <div class="sub">Protect a streak on a missed day</div>
        </div>
        <button type="button" class="toggle ${data.settings.freezeEnabled ? "on" : ""}" data-act="toggle-freeze" role="switch" aria-checked="${data.settings.freezeEnabled}"></button>
      </div>
      <div class="row">
        <div class="left"><div class="title">Freezes each month</div><div class="sub">${freezesUsedThisMonth()} used this month</div></div>
        <div class="stepper">
          <button type="button" class="icon-btn" data-act="freeze-step" data-d="-1" aria-label="Fewer">−</button>
          <span class="val">${data.settings.freezesPerMonth || 0}</span>
          <button type="button" class="icon-btn" data-act="freeze-step" data-d="1" aria-label="More">+</button>
        </div>
      </div>
    </div>

    <div class="section-label">Backup</div>
    <p class="hint">Everything stays on this device. Export a JSON file if you switch phones or want a copy.</p>
    <div class="group">
      <button type="button" class="row row-btn" data-act="export-data"><div class="left"><div class="title">Export backup</div><div class="sub">Save a JSON file</div></div><span class="chev">${chevIcon()}</span></button>
      <button type="button" class="row row-btn" data-act="import-data"><div class="left"><div class="title">Import backup</div><div class="sub">Replace data with a file</div></div><span class="chev">${chevIcon()}</span></button>
      <button type="button" class="row row-btn" data-act="ask-reset"><div class="left"><div class="title" style="color:var(--danger)">Reset all data</div><div class="sub">Deletes habits and check-ins</div></div></button>
    </div>
    <input id="import-file" type="file" accept="application/json,.json" hidden>

    <p class="hint" style="text-align:center;margin-top:24px">Ember · Streak Builder · v1.0<br>Your data never leaves this device.</p>
  `;
}

function blankHabit() {
  return {
    id: uid(),
    name: "",
    emoji: "🔥",
    color: PALETTE[0],
    frequency: { type: "daily", days: [1, 2, 3, 4, 5], times: 3 },
    reminderNote: "",
    goal: null,
    createdAt: new Date().toISOString(),
    _isNew: true
  };
}

function readEditorFields() {
  if (!ui.editor) return;
  const name = $("#habit-name");
  const remind = $("#habit-remind");
  const goal = $("#habit-goal");
  if (name) ui.editor.name = name.value;
  if (remind) ui.editor.reminderNote = remind.value;
  if (goal) {
    const n = parseInt(goal.value, 10);
    ui.editor.goal = n > 0 ? n : null;
  }
}

function openEditor(habit) {
  ui.editor = habit ? { ...JSON.parse(JSON.stringify(habit)), _isNew: false } : blankHabit();
  if (!ui.editor.frequency) ui.editor.frequency = { type: "daily", days: [1, 2, 3, 4, 5], times: 3 };
  if (!ui.editor.frequency.days) ui.editor.frequency.days = [1, 2, 3, 4, 5];
  if (!ui.editor.frequency.times) ui.editor.frequency.times = 3;
  ui.sheet = "editor";
  renderEditor();
}

function renderEditor() {
  const e = ui.editor;
  const freq = e.frequency || { type: "daily" };
  openSheet(`
    <div class="sheet-head">
      <h2>${e._isNew ? "New habit" : "Edit habit"}</h2>
      <button class="btn btn-sm btn-ghost" data-act="close-sheet">Close</button>
    </div>
    <div class="sheet-body">
      <div class="field">
        <label>Emoji</label>
        <div class="emoji-grid">
          ${EMOJIS.map((em) => `<button type="button" class="emoji-cell ${e.emoji === em ? "on" : ""}" data-act="pick-emoji" data-emoji="${em}">${em}</button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label for="habit-name">Name</label>
        <input id="habit-name" class="text-input" maxlength="48" placeholder="e.g. Morning walk" value="${esc(e.name)}" autocomplete="off">
      </div>
      <div class="field">
        <label>Color</label>
        <div class="color-grid">
          ${PALETTE.map((c) => `<button type="button" class="color-cell ${e.color === c ? "on" : ""}" data-act="pick-color" data-color="${c}" style="background:${c}" aria-label="Color ${c}"></button>`).join("")}
        </div>
      </div>
      <div class="field">
        <label>How often</label>
        <div class="seg">
          <button type="button" class="${freq.type === "daily" ? "on" : ""}" data-act="freq" data-type="daily">Daily</button>
          <button type="button" class="${freq.type === "weekdays" ? "on" : ""}" data-act="freq" data-type="weekdays">Days</button>
          <button type="button" class="${freq.type === "timesPerWeek" ? "on" : ""}" data-act="freq" data-type="timesPerWeek">Weekly</button>
        </div>
      </div>
      <div class="field" ${freq.type === "weekdays" ? "" : "hidden"}>
        <label>On these days</label>
        <div class="day-picks">
          ${DAY_LETTERS.map((l, i) => `<button type="button" class="day-pick ${(freq.days || []).includes(i) ? "on" : ""}" data-act="toggle-day" data-day="${i}">${l}</button>`).join("")}
        </div>
      </div>
      <div class="field" ${freq.type === "timesPerWeek" ? "" : "hidden"}>
        <label>Times per week</label>
        <div class="stepper">
          <button type="button" class="icon-btn" data-act="times-step" data-d="-1" aria-label="Fewer">−</button>
          <span class="val">${freq.times || 3}</span>
          <button type="button" class="icon-btn" data-act="times-step" data-d="1" aria-label="More">+</button>
        </div>
      </div>
      <div class="field">
        <label for="habit-remind">Reminder time (shown on the card)</label>
        <input id="habit-remind" class="time-input" type="time" value="${esc(e.reminderNote || "")}">
        <p class="hint">This stays a note on the card. An installed iPhone web app can’t send its own reminder notifications.</p>
      </div>
      <div class="field">
        <label for="habit-goal">Goal (optional)</label>
        <input id="habit-goal" class="text-input" inputmode="numeric" placeholder="e.g. 30" value="${e.goal ? esc(e.goal) : ""}">
      </div>
    </div>
    <div class="sheet-foot">
      <button class="btn btn-primary btn-block" data-act="save-habit">Save habit</button>
      ${e._isNew ? "" : `<button class="btn btn-danger btn-block" data-act="ask-delete-habit" data-habit="${esc(e.id)}">Delete habit</button>`}
    </div>
  `);
  const name = $("#habit-name");
  if (name && e._isNew && !e.name) setTimeout(() => name.focus(), 350);
}

function saveHabitFromEditor() {
  readEditorFields();
  const e = ui.editor;
  if (!e) return;
  const name = (e.name || "").trim();
  if (!name) { showToast("Give this habit a name."); return; }
  if (e.frequency.type === "weekdays" && !(e.frequency.days || []).length) {
    showToast("Pick at least one day.");
    return;
  }
  const payload = {
    id: e.id,
    name,
    emoji: e.emoji || "🔥",
    color: e.color || PALETTE[0],
    frequency: {
      type: e.frequency.type,
      days: (e.frequency.days || []).slice(),
      times: e.frequency.times || 3
    },
    reminderNote: e.reminderNote || "",
    goal: e.goal || null,
    createdAt: e.createdAt || new Date().toISOString()
  };
  const idx = data.habits.findIndex((h) => h.id === payload.id);
  if (idx >= 0) data.habits[idx] = { ...data.habits[idx], ...payload };
  else data.habits.push(payload);
  save();
  closeSheet();
  ui.editor = null;
  haptic("success");
  render();
  showToast(idx >= 0 ? "Habit updated." : `${payload.name} added.`);
}

function toggleCheck(habitId, iso) {
  const habit = findHabit(habitId);
  if (!habit) return;
  if (iso > toISO()) return;
  const was = isCheckin(habit, iso) || isFreeze(habit, iso);
  if (was) {
    setCheck(habit, iso, false);
    setFreeze(habit, iso, false);
    save();
    haptic();
    render();
    showToast("Check-in removed");
    return;
  }
  setCheck(habit, iso, true);
  const milestone = maybeCelebrate(habit);
  save();
  haptic(milestone ? "celebrate" : "success");
  render();
  if (milestone) showCelebration(habit, milestone);
  else {
    showToast(`Nice — ${habit.name} is done.`, "Undo", () => {
      setCheck(habit, iso, false);
      save();
      render();
    });
  }
}

function backfill(habitId, iso) {
  const habit = findHabit(habitId);
  if (!habit) return;
  setCheck(habit, iso, true);
  const milestone = maybeCelebrate(habit);
  save();
  haptic(milestone ? "celebrate" : "success");
  render();
  if (milestone) showCelebration(habit, milestone);
  else showToast(`Marked ${habit.name} for yesterday.`, "Undo", () => {
    setCheck(habit, iso, false);
    save();
    render();
  });
}

function freezeDay(habitId, iso) {
  const habit = findHabit(habitId);
  if (!habit) return;
  if (!data.settings.freezeEnabled || freezesLeft() <= 0) {
    showToast("No freezes left this month.");
    return;
  }
  setFreeze(habit, iso, true);
  const milestone = maybeCelebrate(habit);
  save();
  haptic("success");
  render();
  if (milestone) showCelebration(habit, milestone);
  else showToast(`Freeze used for ${habit.name}.`, "Undo", () => {
    setFreeze(habit, iso, false);
    save();
    render();
  });
}

function showCelebration(habit, n) {
  burstConfetti();
  const unit = (habit.frequency || {}).type === "timesPerWeek" ? "week" : "day";
  openSheet(`
    <div class="celebrate-emoji">🎉</div>
    <h2>${n}-${unit} streak!</h2>
    <p>${esc(habit.emoji || "")} ${esc(habit.name)} — you kept it going for ${n} ${unit}${n === 1 ? "" : "s"}. That’s a real habit now.</p>
    <div class="dialog-actions">
      <button class="btn btn-primary btn-block" data-act="close-sheet">Keep going</button>
    </div>
  `, { dialog: true });
}

function askDelete(habitId) {
  const habit = findHabit(habitId);
  if (!habit) return;
  openSheet(`
    <h2>Delete ${esc(habit.name)}?</h2>
    <p>This removes the habit and its check-ins. You can’t undo it, unless you have a backup.</p>
    <div class="dialog-actions">
      <button class="btn btn-danger btn-block" data-act="confirm-delete" data-habit="${esc(habitId)}">Delete habit</button>
      <button class="btn btn-secondary btn-block" data-act="close-sheet">Cancel</button>
    </div>
  `, { dialog: true });
}

function confirmDelete(habitId) {
  data.habits = data.habits.filter((h) => h.id !== habitId);
  delete data.checkins[habitId];
  delete data.freezes[habitId];
  delete data.celebrated[habitId];
  save();
  closeSheet();
  ui.editor = null;
  haptic("warn");
  render();
  showToast("Habit deleted.");
}

function exportData() {
  const blob = new Blob([JSON.stringify(exportPayload(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `ember-backup-${toISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1500);
  showToast("Backup downloaded.");
}

function importFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      importPayload(JSON.parse(String(reader.result)));
      applyTheme();
      render();
      showToast("Backup restored.");
    } catch (err) {
      showToast(err.message || "Could not import that file.");
    }
  };
  reader.readAsText(file);
}

function bindSwipeRows(root) {
  $$(".swipe-wrap", root).forEach((wrap) => {
    const row = $(".habit-row", wrap);
    if (!row) return;
    let startX = 0, startY = 0, dx = 0, locked = null, open = false;
    const max = 76;
    const setX = (x) => { row.style.transform = `translateX(${x}px)`; };
    row.addEventListener("touchstart", (ev) => {
      startX = ev.touches[0].clientX;
      startY = ev.touches[0].clientY;
      locked = null;
      dx = open ? -max : 0;
      row.style.transition = "none";
    }, { passive: true });
    row.addEventListener("touchmove", (ev) => {
      const x = ev.touches[0].clientX - startX;
      const y = ev.touches[0].clientY - startY;
      if (locked === null && (Math.abs(x) > 8 || Math.abs(y) > 8)) locked = Math.abs(x) > Math.abs(y);
      if (!locked) return;
      ev.preventDefault();
      let next = (open ? -max : 0) + x;
      next = Math.min(0, Math.max(-max - 24, next));
      dx = next;
      setX(next);
    }, { passive: false });
    row.addEventListener("touchend", () => {
      row.style.transition = "transform 0.25s cubic-bezier(0.32, 0.72, 0, 1)";
      open = dx < -max / 2;
      setX(open ? -max : 0);
    });
  });
}

function onTap(e) {
  const tabBtn = e.target.closest("[data-tab]");
  if (tabBtn && tabBtn.dataset.tab) {
    ui.tab = tabBtn.dataset.tab;
    hideToast();
    haptic();
    render();
    return;
  }
  const t = e.target.closest("[data-act]");
  if (!t) return;
  const act = t.dataset.act;

  if (act === "close-sheet") { closeSheet(); return; }
  if (act === "toast-go") {
    const fn = $("#toast") && $("#toast")._toastAction;
    hideToast();
    if (typeof fn === "function") fn();
    return;
  }
  if (act === "onboard-next") {
    if (ui.onboardingStep < 2) { ui.onboardingStep += 1; render(); }
    else { data.onboardingComplete = true; save(); render(); }
    return;
  }
  if (act === "onboard-back") { ui.onboardingStep = Math.max(0, ui.onboardingStep - 1); render(); return; }
  if (act === "onboard-skip") { data.onboardingComplete = true; save(); render(); return; }

  if (act === "new-habit") { openEditor(null); return; }
  if (act === "edit-habit") { openEditor(findHabit(t.dataset.habit)); return; }
  if (act === "quick-add") {
    const s = SUGGESTIONS[Number(t.dataset.i)];
    if (!s) return;
    const h = Object.assign(blankHabit(), { name: s.name, emoji: s.emoji, color: s.color, _isNew: false });
    data.habits.push(h);
    save();
    haptic("success");
    render();
    showToast(`${s.name} added.`);
    return;
  }
  if (act === "pick-emoji") { readEditorFields(); ui.editor.emoji = t.dataset.emoji; renderEditor(); return; }
  if (act === "pick-color") { readEditorFields(); ui.editor.color = t.dataset.color; renderEditor(); return; }
  if (act === "freq") {
    readEditorFields();
    ui.editor.frequency.type = t.dataset.type;
    renderEditor();
    return;
  }
  if (act === "toggle-day") {
    readEditorFields();
    const d = Number(t.dataset.day);
    const days = new Set(ui.editor.frequency.days || []);
    if (days.has(d)) days.delete(d); else days.add(d);
    ui.editor.frequency.days = Array.from(days).sort((a, b) => a - b);
    renderEditor();
    return;
  }
  if (act === "times-step") {
    readEditorFields();
    const next = Math.min(7, Math.max(1, (ui.editor.frequency.times || 3) + Number(t.dataset.d)));
    ui.editor.frequency.times = next;
    renderEditor();
    return;
  }
  if (act === "save-habit") { saveHabitFromEditor(); return; }

  if (act === "toggle-check") { toggleCheck(t.dataset.habit, t.dataset.iso); return; }
  if (act === "backfill") { backfill(t.dataset.habit, t.dataset.iso); return; }
  if (act === "freeze-day") { freezeDay(t.dataset.habit, t.dataset.iso); return; }

  if (act === "ask-delete-habit") { askDelete(t.dataset.habit); return; }
  if (act === "confirm-delete") { confirmDelete(t.dataset.habit); return; }

  if (act === "month-prev") {
    const d = new Date(ui.statsMonth.y, ui.statsMonth.m - 1, 1);
    ui.statsMonth = { y: d.getFullYear(), m: d.getMonth() };
    render();
    return;
  }
  if (act === "month-next") {
    const now = new Date();
    const d = new Date(ui.statsMonth.y, ui.statsMonth.m + 1, 1);
    if (d.getFullYear() > now.getFullYear() || (d.getFullYear() === now.getFullYear() && d.getMonth() > now.getMonth())) return;
    ui.statsMonth = { y: d.getFullYear(), m: d.getMonth() };
    render();
    return;
  }

  if (act === "theme") {
    data.settings.theme = t.dataset.theme;
    save();
    applyTheme();
    render();
    return;
  }
  if (act === "toggle-freeze") {
    data.settings.freezeEnabled = !data.settings.freezeEnabled;
    save();
    render();
    return;
  }
  if (act === "freeze-step") {
    const next = Math.min(8, Math.max(0, (data.settings.freezesPerMonth || 0) + Number(t.dataset.d)));
    data.settings.freezesPerMonth = next;
    save();
    render();
    return;
  }

  if (act === "export-data") { exportData(); return; }
  if (act === "import-data") {
    const input = $("#import-file");
    if (input) input.click();
    return;
  }
  if (act === "ask-reset") {
    openSheet(`
      <h2>Reset Ember?</h2>
      <p>This deletes every habit, check-in, and setting on this device. An exported backup is the only way back.</p>
      <div class="dialog-actions">
        <button class="btn btn-danger btn-block" data-act="confirm-reset">Delete everything</button>
        <button class="btn btn-secondary btn-block" data-act="close-sheet">Cancel</button>
      </div>
    `, { dialog: true });
    return;
  }
  if (act === "confirm-reset") {
    data = defaultData();
    data.onboardingComplete = true;
    save();
    closeSheet();
    ui.tab = "today";
    render();
    showToast("Ember was reset.");
  }
}

function onChange(e) {
  if (e.target && e.target.id === "setting-name") {
    data.settings.displayName = e.target.value.trim();
    save();
  }
  if (e.target && e.target.id === "import-file" && e.target.files && e.target.files[0]) {
    importFromFile(e.target.files[0]);
    e.target.value = "";
  }
}

function init() {
  load();
  applyTheme();
  if (window.matchMedia) {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onMQ = () => { if ((data.settings.theme || "auto") === "auto") { applyTheme(); } };
    if (mq.addEventListener) mq.addEventListener("change", onMQ);
    else if (mq.addListener) mq.addListener(onMQ);
  }
  $("#app").addEventListener("click", onTap);
  $("#app").addEventListener("change", onChange);
  render();
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
    navigator.serviceWorker.ready.then(async () => {
      const ok = (await caches.match(new URL("app.js", document.baseURI).href)) && (await caches.match(new URL("styles.css", document.baseURI).href)) && (await caches.match(new URL("index.html", document.baseURI).href));
      document.documentElement.dataset.offlineReady = ok ? "yes" : "no";
      if (ok && !localStorage.getItem("ember-offline-ready-shown")) {
        localStorage.setItem("ember-offline-ready-shown", "1");
        showOfflineReady();
      }
    }).catch(() => {});
  }
  // Ask the browser to keep Ember's data (helps avoid storage eviction).
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
}

function showOfflineReady() {
  const el = document.createElement("div");
  el.id = "offline-ready";
  el.setAttribute("role", "status");
  el.textContent = "✓ Ember is saved on this device and now works offline";
  el.style.cssText = "position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 84px);transform:translateX(-50%);" +
    "background:#E8742C;color:#fff;padding:10px 16px;border-radius:14px;font:600 14px/1.3 -apple-system,system-ui,sans-serif;" +
    "box-shadow:0 6px 20px rgba(0,0,0,.18);z-index:9999;max-width:88vw;text-align:center";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4500);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();
