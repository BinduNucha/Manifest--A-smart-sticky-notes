// Manifest Sticky AI To-Do — final app.js
// Features: dynamic AI categories, rename (pen), ✓ / ↷ / ✗, reminders + tomorrow strip,
// improved heuristics (boss/mail/grocery), theme + sticky color persistence.

let model = null, modelReady = false;
const STATUS = { PENDING: "pending", DONE: "done", SKIPPED: "skipped" };
let STATE = { active: [], history: {} };

const $ = s => document.querySelector(s);

/* ===================== THEME & STICKY COLOR ===================== */
const NOTE_COLORS = ["yellow", "mint", "sky", "rose", "lav"];

async function loadPrefs() {
  return new Promise(r =>
    chrome.storage.local.get(["theme", "noteColor"], d =>
      r({ theme: d.theme || "auto", noteColor: d.noteColor || "yellow" })
    )
  );
}
async function savePrefs(upd) {
  return new Promise(r => chrome.storage.local.set(upd, r));
}
function applyTheme(mode) {
  if (mode === "light") document.documentElement.setAttribute("data-theme", "light");
  else if (mode === "dark") document.documentElement.setAttribute("data-theme", "dark");
  else document.documentElement.removeAttribute("data-theme");
  const btn = $("#themeBtn");
  if (btn) btn.textContent = mode === "dark" ? "🌙" : mode === "light" ? "☀️" : "🌓";
}
function applyNoteColor(color) {
  const sticky = $("#sticky");
  if (sticky) sticky.setAttribute("data-note", color);
}

/* ===================== STORAGE ===================== */
async function loadState() {
  return new Promise(r =>
    chrome.storage.local.get(["active", "history"], d =>
      r({ active: d.active || [], history: d.history || {} })
    )
  );
}
async function saveState() {
  return new Promise(r => chrome.storage.local.set({ active: STATE.active, history: STATE.history }, r));
}

/* ===================== CATEGORY NORMALIZATION / MERGE ===================== */
function titleCase(s) {
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1).toLowerCase());
}
function norm(s = "") {
  return s.toLowerCase().replace(/[^\w\s]/g, "").replace(/\b(heath)\b/, "health").trim();
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array(n + 1).fill(0).map((_, j) => j);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}
function canonicalize(label) {
  const base = norm(label);
  if (!base) return "Personal";

  // Synonyms / nudges to keep categories consistent
  const syn = {
    appointment: "Appointments", interview: "Appointments", visa: "Appointments",
    work: "Work", office: "Work", project: "Work", deploy: "Work", code: "Work",
    boss: "Work", manager: "Work", supervisor: "Work", client: "Work", email: "Work", mail: "Work", reply: "Work", report: "Work",

    // Groceries / food
    grocery: "Groceries", groceries: "Groceries", fruit: "Groceries", fruits: "Groceries",
    vegetable: "Groceries", vegetables: "Groceries", grapes: "Groceries", grape: "Groceries",
    banana: "Groceries", milk: "Groceries", bread: "Groceries", eggs: "Groceries", rice: "Groceries", atta: "Groceries",

    chore: "Chores", clean: "Chores", laundry: "Chores", cook: "Chores", trash: "Chores", fix: "Chores",
    health: "Health", gym: "Health", water: "Health", medicine: "Health", med: "Health",
    bill: "Finance", bank: "Finance", pay: "Finance", rent: "Finance", loan: "Finance", tax: "Finance",
    family: "Family", kids: "Family", baby: "Family",
    message: "Messages", study: "Learning", learn: "Learning"
  };
  if (syn[base]) return syn[base];

  // Try merge with an existing label (edit distance <= 2)
  const existing = Array.from(new Set(STATE.active.map(t => t.category)));
  let best = null, score = 3;
  for (const c of existing) {
    const d = levenshtein(base, norm(c));
    if (d < score) { score = d; best = c; if (d === 0) break; }
  }
  if (best && score <= 2) return best;

  return titleCase(base);
}

/* ===================== AI (reuse existing when possible) ===================== */
async function initModel() {
  if (!('ai' in self) || !ai?.languageModel) { modelReady = false; return; }
  try {
    model = await ai.languageModel.create({
      systemPrompt:
        "You will receive a task and an optional list of existing category labels. " +
        "Return a short category (max 2 words). If any existing label fits, return it EXACTLY. " +
        "Otherwise invent a concise new label. Reply with ONLY the label."
    });
    modelReady = true;
  } catch (e) {
    console.warn("[AI] unavailable; using heuristics", e);
    modelReady = false;
  }
}
function heuristicCategory(text = "") {
  const s = text.toLowerCase();

  // Strong work signals
  if (/(boss|manager|supervisor|client)\b/.test(s)) return "Work";
  if (/\b(mail|email|e-mail|reply|send|report|deck|jira|ticket|deploy|code|meeting|office|work|project)\b/.test(s)) return "Work";

  if (/\b(doctor|dentist|visa|appointment|interview|call)\b/.test(s)) return "Appointments";
  if (/\b(gym|run|walk|health|med|pill|water|sleep)\b/.test(s)) return "Health";
  if (/\b(pay|bill|bank|rent|emi|loan|invoice|tax)\b/.test(s)) return "Finance";

  // Groceries / food
  if (/\b(grocery|groceries|supermarket|vegg?ies|vegetable|vegetables|fruit|fruits|banana|grape|grapes|apple|milk|bread|eggs|rice|atta)\b/.test(s))
    return "Groceries";

  if (/\b(clean|laundry|cook|trash|fix|repair|mop|sweep)\b/.test(s)) return "Chores";
  return "Personal";
}
async function categorize(text) {
  const existing = Array.from(new Set(STATE.active.map(t => t.category))).slice(0, 12);
  if (!modelReady) return canonicalize(heuristicCategory(text));
  try {
    const out = (await model.prompt(`Task: "${text}"\nExisting categories: ${existing.length ? existing.join(", ") : "(none)"}\nCategory:`) || "").trim();
    return canonicalize(out);
  } catch {
    return canonicalize(heuristicCategory(text));
  }
}

/* ===================== DUE PARSING & ALARMS ===================== */
function parseDue(text) {
  const s = text.toLowerCase().trim();
  const now = new Date();

  // "in a minute" / "in 1 m"
  let m = s.match(/\bin\s+(a|one|1)\s*(m|min|minute)\b/);
  if (m) return new Date(now.getTime() + 60 * 1000);

  // "in 5 minutes" / "in 2 hours"
  m = s.match(/\bin\s+(\d+)\s*(m|mins|min|minute|minutes|h|hr|hour|hours)\b/);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = m[2];
    const ms = /h|hr|hour/.test(unit) ? n * 60 * 60 * 1000 : n * 60 * 1000;
    return new Date(now.getTime() + ms);
  }

  // "tomorrow 9am"
  m = s.match(/\btomorrow\b(?:\s+at\s+)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) {
    const d = new Date(now); d.setDate(d.getDate() + 1);
    const hh = m[1] ? parseInt(m[1], 10) : 9;
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    const ap = (m[3] || "am").toLowerCase();
    let h = hh % 12; if (ap === "pm") h += 12;
    d.setHours(h, mm, 0, 0); return d;
  }
  if (/\btomorrow\b/.test(s)) { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); return d; }

  // "today 10:35"
  m = s.match(/\btoday\b(?:\s+at\s+)?\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) {
    const d = new Date(now);
    const hh = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    const ap = (m[3] || "pm").toLowerCase();
    let h = hh % 12; if (ap === "pm") h += 12;
    d.setHours(h, mm, 0, 0); return d;
  }
  if (/\btoday\b/.test(s)) { const d = new Date(now); d.setHours(18, 0, 0, 0); return d; }

  // "at/by 6pm"
  m = s.match(/\b(?:at|by)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\b/);
  if (m) {
    const d = new Date(now);
    const hh = parseInt(m[1], 10);
    const mm = m[2] ? parseInt(m[2], 10) : 0;
    const ap = (m[3] || "pm").toLowerCase();
    let h = hh % 12; if (ap === "pm") h += 12;
    d.setHours(h, mm, 0, 0); return d;
  }

  return null;
}
async function scheduleAlarmForTask(t) {
  try {
    if (t.dueAt) await chrome.alarms.create(`task:${t.id}`, { when: new Date(t.dueAt).getTime() });
  } catch (e) { console.warn("alarms.create failed", e); }
}

/* ===================== HELPERS ===================== */
const todayKey = () => new Date().toISOString().slice(0, 10);
function escapeHtml(str = "") {
  return str.replace(/[&<>"']/g, s => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[s]));
}
function slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "x"; }
const PALETTE = ["var(--blue)", "var(--red)", "var(--yellow)", "var(--green)", "var(--purple)", "var(--teal)"];
function hashCode(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; } return Math.abs(h); }
function colorFor(cat) { return PALETTE[hashCode(cat) % PALETTE.length]; }
function chipText(iso) {
  const d = new Date(iso), now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return (isToday ? "Today" : isTomorrow ? "Tomorrow" : d.toLocaleDateString()) + " " + t;
}

/* ===================== RENDER MAIN ===================== */
function renderMain() {
  const wrap = $("#cats");
  wrap.innerHTML = "";

  // Tomorrow strip
  const tomorrowBox = $("#tomorrow");
  const tomorrowList = $("#tomorrowList");
  const tomorrowTasks = STATE.active.filter(t => {
    if (!t.dueAt) return false;
    const d = new Date(t.dueAt);
    const now = new Date();
    const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
    return d.getFullYear() === tomorrow.getFullYear() &&
      d.getMonth() === tomorrow.getMonth() &&
      d.getDate() === tomorrow.getDate();
  });
  tomorrowBox.classList.toggle("hidden", tomorrowTasks.length === 0);
  tomorrowList.innerHTML = "";
  for (const t of tomorrowTasks) {
    const time = new Date(t.dueAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const pill = document.createElement("span");
    pill.className = "pill";
    pill.textContent = `${t.text} • ${time}`;
    tomorrowList.appendChild(pill);
  }

  // Group by category
  const by = {};
  for (const t of STATE.active) (by[t.category] ||= []).push(t);

  const cats = Object.keys(by).sort((a, b) => a.localeCompare(b));
  for (const cat of cats) {
    const id = slug(cat), tasks = by[cat];
    const color = colorFor(cat);

    const details = document.createElement("details");
    details.className = "cat";
    details.classList.add(`cat-${id}`);   // enables custom CSS per category (e.g., .cat-work)
    details.open = true;
    details.innerHTML = `
      <summary>
        <span>${escapeHtml(cat)}</span>
        <div style="display:flex;align-items:center;gap:6px">
          <button class="mini icon-btn" data-act="rename" title="Rename category"><span class="icon icon-pen"></span></button>
          <span class="count" id="count-${id}">${tasks.length}</span>
        </div>
      </summary>
      <div class="bar"><div class="fill" id="bar-${id}" style="background:${color};width:0%"></div></div>
      <ul id="list-${id}" class="tasks"></ul>
    `;
    wrap.appendChild(details);
    details.querySelector('[data-act="rename"]').onclick = () => renameCategory(cat);

    const ul = details.querySelector(`#list-${id}`);
    for (const t of tasks) {
      const li = document.createElement("li");
      li.className = "task";
      const dueChip = t.dueAt ? `<span class="chip">${chipText(t.dueAt)}</span>` : "";
      li.innerHTML = `
        <span class="title">${escapeHtml(t.text)} ${dueChip}</span>
        <div class="actions">
          <button class="btn-mini icon-btn" data-act="done"  title="Done"><span class="icon icon-check"></span></button>
          <button class="btn-mini icon-btn" data-act="skip"  title="Skip"><span class="icon icon-skip"></span></button>
          <button class="btn-mini icon-btn" data-act="del"   title="Delete"><span class="icon icon-x"></span></button>
        </div>`;
      li.querySelector('[data-act="done"]').onclick = () => completeTask(t.id, STATUS.DONE);
      li.querySelector('[data-act="skip"]').onclick = () => completeTask(t.id, STATUS.SKIPPED);
      li.querySelector('[data-act="del"]').onclick = () => deleteTask(t.id);
      ul.appendChild(li);
    }
  }

  const sticky = $("#sticky"); if (sticky) { sticky.classList.remove("flash"); void sticky.offsetWidth; sticky.classList.add("flash"); }
}

/* ===================== RENAME CATEGORY ===================== */
async function renameCategory(oldCat) {
  const input = prompt(`Rename category "${oldCat}" to:`, oldCat);
  if (input == null) return;
  const newCat = canonicalize(input.trim());
  if (!newCat || newCat === oldCat) return;

  for (const t of STATE.active) if (t.category === oldCat) t.category = newCat;
  for (const date of Object.keys(STATE.history))
    for (const h of STATE.history[date])
      if (h.category === oldCat) h.category = newCat;

  await saveState();
  renderMain();
  if (!$("#historyView").classList.contains("hidden")) renderHistory();
}

/* ===================== HISTORY ===================== */
function renderHistory() {
  const box = $("#historyList");
  box.innerHTML = "";
  const dates = Object.keys(STATE.history).sort().reverse();
  if (!dates.length) { box.innerHTML = `<p class="muted">No history yet.</p>`; return; }

  for (const date of dates) {
    const det = document.createElement("details"); det.open = true;
    det.innerHTML = `<summary><strong>${date}</strong> <span class="muted">(${STATE.history[date].length})</span></summary>`;
    const ul = document.createElement("ul"); ul.className = "tasks";
    for (const item of STATE.history[date]) {
      const li = document.createElement("li"); li.className = "hist-task";
      const time = new Date(item.timeISO).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      li.innerHTML = `<div><div class="title">${escapeHtml(item.text)}</div><div class="meta">${escapeHtml(item.category)} • ${item.status} • ${time}</div></div>`;
      ul.appendChild(li);
    }
    det.appendChild(ul); box.appendChild(det);
  }
}

/* ===================== ACTIONS ===================== */
async function addTask() {
  const inp = $("#taskInput");
  const text = inp.value.trim();
  if (!text) return;

  let cat = await categorize(text);
  cat = canonicalize(cat);

  const due = parseDue(text);
  const t = {
    id: crypto.randomUUID(),
    text,
    category: cat,
    status: STATUS.PENDING,
    createdAt: new Date().toISOString(),
    dueAt: due ? due.toISOString() : null
  };
  STATE.active.unshift(t);
  await saveState();
  if (t.dueAt) await scheduleAlarmForTask(t);

  inp.value = "";
  renderMain();
}
async function completeTask(id, status) {
  const i = STATE.active.findIndex(t => t.id === id);
  if (i === -1) return;
  const t = STATE.active.splice(i, 1)[0];
  const key = todayKey();
  (STATE.history[key] ||= []).unshift({
    text: t.text,
    category: t.category,
    status,
    timeISO: new Date().toISOString()
  });
  await saveState();
  renderMain();
}
async function deleteTask(id) {
  STATE.active = STATE.active.filter(t => t.id !== id);
  await saveState();
  renderMain();
}
async function clearHistory() {
  STATE.history = {};
  await saveState();
  renderHistory();
}

/* ===================== VIEW SWITCH ===================== */
function showHistory() { $("#mainView").classList.add("hidden"); $("#historyView").classList.remove("hidden"); renderHistory(); }
function showMain()    { $("#historyView").classList.add("hidden"); $("#mainView").classList.remove("hidden"); renderMain(); }

/* ===================== BOOT ===================== */
async function bootstrap() {
  // prefs
  const prefs = await loadPrefs();
  applyTheme(prefs.theme);
  applyNoteColor(prefs.noteColor);

  $("#themeBtn").addEventListener("click", async () => {
    const cur = document.documentElement.getAttribute("data-theme"); // null | "dark" | "light"
    const next = !cur ? "dark" : (cur === "dark" ? "light" : "auto");
    applyTheme(next);
    await savePrefs({ theme: next });
  });

  $("#colorBtn").addEventListener("click", async () => {
    const sticky = $("#sticky");
    const cur = sticky.getAttribute("data-note") || "yellow";
    const idx = NOTE_COLORS.indexOf(cur);
    const next = NOTE_COLORS[(idx + 1) % NOTE_COLORS.length];
    applyNoteColor(next);
    await savePrefs({ noteColor: next });
  });

  await initModel();
  STATE = await loadState();
  renderMain();

  $("#addBtn").addEventListener("click", addTask);
  $("#taskInput").addEventListener("keydown", e => { if (e.key === "Enter") addTask(); });

  $("#historyBtn").addEventListener("click", showHistory);
  $("#closeHistory").addEventListener("click", showMain);
  $("#clearHistory").addEventListener("click", clearHistory);
}
document.addEventListener("DOMContentLoaded", bootstrap);
