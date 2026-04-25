/* ============================================================
   TradeLog — app.js
   Static GitHub Pages trade journal. All data stored in
   localStorage under the key STORAGE_KEY.
   ============================================================ */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'tradelog_v1';
const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const MISTAKE_LABELS = {
  none:        'No mistake',
  'fat-finger':'Fat finger',
  'early-exit':'Early exit',
  'late-entry':'Late entry',
  oversized:   'Oversized',
  undersized:  'Undersized',
  'moved-sl':  'Moved stop',
  fomo:        'FOMO entry',
  revenge:     'Revenge trade',
  panic:       'Panic exit',
  'order-type':'Wrong order type',
  other:       'Other',
};

// ─── STATE ────────────────────────────────────────────────────────────────────
const state = {
  view: 'calendar',           // 'calendar' | 'day' | 'stats'
  calYear:  new Date().getFullYear(),
  calMonth: new Date().getMonth(), // 0-indexed
  selectedDate: null,         // 'YYYY-MM-DD'
  modal: null,                // null | 'add-trade' | 'edit-trade' | 'journal'
  editingId: null,
  expandedTradeId: null,
};

// ─── DATA LAYER ───────────────────────────────────────────────────────────────
function loadDB() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return { trades: [], journals: [] };
}

function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

function getDB() { return loadDB(); }

function addTrade(trade) {
  const db = getDB();
  trade.id = 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2,7);
  db.trades.push(trade);
  db.trades.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  saveDB(db);
  return trade;
}

function updateTrade(id, updates) {
  const db = getDB();
  const idx = db.trades.findIndex(t => t.id === id);
  if (idx < 0) return;
  db.trades[idx] = { ...db.trades[idx], ...updates };
  saveDB(db);
}

function deleteTrade(id) {
  const db = getDB();
  db.trades = db.trades.filter(t => t.id !== id);
  saveDB(db);
}

function getTradesForDate(dateStr) {
  return getDB().trades.filter(t => t.date === dateStr);
}

function getAllTrades() {
  return getDB().trades;
}

function getJournalForDate(dateStr) {
  return getDB().journals.find(j => j.date === dateStr) || null;
}

function saveJournal(journal) {
  const db = getDB();
  const idx = db.journals.findIndex(j => j.date === journal.date);
  if (idx >= 0) db.journals[idx] = journal;
  else db.journals.push(journal);
  saveDB(db);
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const dt = new Date(+y, +m - 1, +d);
  return dt.toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric', year:'numeric' });
}

function fmtShortDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { month:'short', day:'numeric' });
}

function fmtPnl(val, showPlus = true) {
  if (val === null || val === undefined) return '—';
  const s = showPlus && val > 0 ? '+' : '';
  return s + '$' + Math.abs(val).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

function pnlClass(val) {
  if (val > 0) return 'pos';
  if (val < 0) return 'neg';
  return '';
}

function calcPnl(entry, exit, size, tickValue, direction) {
  const pts = direction === 'short' ? entry - exit : exit - entry;
  return parseFloat((pts * size * tickValue).toFixed(2));
}

function gradeClass(g) {
  if (!g) return '';
  if (g === 'A+') return 'grade-ap';
  if (g === 'A')  return 'grade-a';
  if (g === 'B')  return 'grade-b';
  if (g === 'C')  return 'grade-c';
  return 'grade-d';
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year, month) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

function isoWeekKey(dateStr) {
  const d = new Date(dateStr);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2,'0')}`;
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7); // 'YYYY-MM'
}

function calcStats(trades) {
  if (!trades.length) return { totalPnl:0, winRate:0, wins:0, losses:0, breakeven:0,
    avgWin:0, avgLoss:0, profitFactor:0, bestTrade:null, worstTrade:null };

  const wins  = trades.filter(t => t.pnl > 0);
  const losses= trades.filter(t => t.pnl < 0);
  const be    = trades.filter(t => t.pnl === 0);
  const totalPnl = trades.reduce((s, t) => s + t.pnl, 0);
  const grossWin  = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const avgWin    = wins.length   ? grossWin   / wins.length  : 0;
  const avgLoss   = losses.length ? grossLoss  / losses.length: 0;
  const winRate   = Math.round(wins.length / trades.length * 100);
  const profitFactor = grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : '∞';
  const sorted = [...trades].sort((a, b) => a.pnl - b.pnl);
  return {
    totalPnl: parseFloat(totalPnl.toFixed(2)),
    winRate, wins: wins.length, losses: losses.length, breakeven: be.length,
    avgWin:  parseFloat(avgWin.toFixed(2)),
    avgLoss: parseFloat(avgLoss.toFixed(2)),
    profitFactor,
    bestTrade:  sorted[sorted.length - 1] || null,
    worstTrade: sorted[0] || null,
  };
}

function groupBy(trades, keyFn) {
  const map = {};
  trades.forEach(t => {
    const k = keyFn(t.date);
    if (!map[k]) map[k] = [];
    map[k].push(t);
  });
  return map;
}

function exportJSON() {
  const db = getDB();
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tradelog-backup.json';
  a.click();
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.trades || !data.journals) throw new Error('Invalid format');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      showToast('Data imported ✓');
      render();
    } catch (err) {
      showToast('Import failed — invalid file', true);
    }
  };
  reader.readAsText(file);
}

function exportCSV() {
  const trades = getAllTrades();
  const rows = ['Date,Time,Symbol,Direction,Entry,Exit,Size,Tick Value,PnL,Setup,Timeframe,Setup Grade,Exec Grade,Mistake,Notes'];
  trades.forEach(t => {
    rows.push([
      t.date, t.time, t.symbol, t.direction,
      t.entry, t.exit, t.size, t.tickValue, t.pnl,
      `"${(t.setup||'').replace(/"/g,'""')}"`,
      t.timeframe, t.setupGrade, t.execGrade, t.mistake,
      `"${(t.notes||'').replace(/"/g,'""')}"`,
    ].join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'trades.csv';
  a.click();
}

// ─── TOAST ────────────────────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, isError = false) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.textContent = msg;
  el.className = 'toast' + (isError ? ' error' : '') + ' show';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2600);
}

// ─── RENDER HELPERS ───────────────────────────────────────────────────────────
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v);
  });
  children.flat().forEach(c => {
    if (c === null || c === undefined) return;
    el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return el;
}

function setHTML(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

// ─── TOPBAR ───────────────────────────────────────────────────────────────────
function renderTopbar() {
  return `
    <div class="topbar">
      <div class="logo">TRADE<span>LOG</span></div>
      <div class="nav-tabs">
        <button class="nav-tab ${state.view === 'calendar' ? 'active' : ''}"
          onclick="navigate('calendar')">Calendar</button>
        <button class="nav-tab ${state.view === 'stats' ? 'active' : ''}"
          onclick="navigate('stats')">Stats</button>
      </div>
      <div class="topbar-right">
        <button class="btn btn-primary btn-sm" onclick="openAddTrade()">+ Add Trade</button>
        <button class="btn btn-ghost btn-sm" onclick="exportCSV()">CSV</button>
        <button class="btn btn-ghost btn-sm" onclick="exportJSON()">Backup</button>
        <label class="btn btn-ghost btn-sm" style="cursor:pointer;">
          Import
          <input type="file" accept=".json" style="display:none"
            onchange="importJSON(this.files[0])">
        </label>
      </div>
    </div>`;
}

// ─── CALENDAR VIEW ────────────────────────────────────────────────────────────
function renderCalendar() {
  const { calYear, calMonth } = state;
  const db = getDB();
  const trades = db.trades;

  // Build per-day lookups
  const dayMap = {};
  trades.forEach(t => {
    if (!dayMap[t.date]) dayMap[t.date] = { pnl: 0, count: 0, trades: [] };
    dayMap[t.date].pnl += t.pnl;
    dayMap[t.date].count++;
    dayMap[t.date].trades.push(t);
  });

  const journalMap = {};
  db.journals.forEach(j => { journalMap[j.date] = j; });

  const daysInMonth  = getDaysInMonth(calYear, calMonth);
  const firstDay     = getFirstDayOfMonth(calYear, calMonth);
  const today        = todayStr();

  // Prev month days to fill
  const prevMonthDays = getDaysInMonth(calYear, calMonth - 1 < 0 ? 11 : calMonth - 1);

  let cells = '';

  // Empty cells before month start
  for (let i = 0; i < firstDay; i++) {
    const d = prevMonthDays - firstDay + 1 + i;
    cells += `<div class="cal-cell other-month"><span class="cal-date">${d}</span></div>`;
  }

  // Days of month
  for (let d = 1; d <= daysInMonth; d++) {
    const mm  = String(calMonth + 1).padStart(2, '0');
    const dd  = String(d).padStart(2, '0');
    const key = `${calYear}-${mm}-${dd}`;
    const data = dayMap[key];
    const isToday = key === today;

    let pnlHtml = '';
    let dotHtml  = '';
    let cls      = 'cal-cell';
    if (isToday) cls += ' today';

    const journal = journalMap[key];
    let psychHtml = '';
    if (journal) {
      const moodEmoji = { rough:'😤', off:'😟', neutral:'😐', good:'🙂', locked:'🔥' }[journal.mood] || '';
      const rulesCls  = { all:'psych-good', mostly:'psych-ok', some:'psych-warn', several:'psych-bad', revenge:'psych-bad' }[journal.rules] || '';
      const rulesLbl  = { all:'Rules ✓', mostly:'Mostly ✓', some:'Broke rules', several:'Multi-break', revenge:'Revenge' }[journal.rules] || '';
      psychHtml = `<div class="cal-psych">${moodEmoji ? `<span class="cal-psych-mood">${moodEmoji}</span>` : ''}${rulesLbl ? `<span class="cal-psych-rules ${rulesCls}">${rulesLbl}</span>` : ''}</div>`;
    }

    if (data) {
      const sign = data.pnl > 0 ? 'pos' : data.pnl < 0 ? 'neg' : '';
      cls += data.pnl >= 0 ? ' has-pos' : ' has-neg';
      pnlHtml = `
        <div class="cal-bottom">
          <div class="cal-pnl ${sign}">${fmtPnl(data.pnl)}</div>
          <div class="cal-meta">${data.count} trade${data.count !== 1 ? 's' : ''}</div>
        </div>`;
    }

    cells += `
      <div class="${cls}" onclick="openDay('${key}')">
        <span class="cal-date">${d}</span>
        ${psychHtml}
        ${pnlHtml}
      </div>`;
  }

  // Fill remaining cells
  const totalCells = firstDay + daysInMonth;
  const remainder  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remainder; i++) {
    cells += `<div class="cal-cell other-month"><span class="cal-date">${i}</span></div>`;
  }

  const dowHeaders = DAYS_OF_WEEK.map(d => `<div class="cal-dow">${d}</div>`).join('');

  return `
    <div class="view">
      <div class="cal-header">
        <button class="btn-icon" onclick="prevMonth()">&#8592;</button>
        <span class="cal-month-label">${MONTHS[calMonth]} ${calYear}</span>
        <button class="btn-icon" onclick="nextMonth()">&#8594;</button>
      </div>
      <div class="cal-grid">
        ${dowHeaders}
        ${cells}
      </div>
    </div>`;
}

// ─── PSYCHOLOGY CARD ──────────────────────────────────────────────────────────
function renderPsychCard(j, dateStr) {
  const moodMap  = { rough:'😤 Rough', off:'😟 Off', neutral:'😐 Neutral', good:'🙂 Good', locked:'🔥 Locked In' };
  const sleepMap = { terrible:'Terrible 😴', poor:'Poor 😪', okay:'Okay 😑', good:'Good 😌', great:'Great ⚡' };
  const ratingMap = { 1:'💀 1/5', 2:'😓 2/5', 3:'😐 3/5', 4:'😊 4/5', 5:'🏆 5/5' };
  const rulesMap = {
    all:     { label: 'Followed all rules',           cls: 'psych-good' },
    mostly:  { label: 'Mostly followed rules',        cls: 'psych-ok'   },
    some:    { label: 'Broke a few rules',             cls: 'psych-warn' },
    several: { label: 'Broke several rules',           cls: 'psych-bad'  },
    revenge: { label: 'Went off-plan / revenge traded', cls: 'psych-bad' },
  };
  const rules = rulesMap[j.rules];

  const items = [
    j.mood      && `<div class="psych-item"><div class="psych-lbl">Mood</div><div class="psych-val">${moodMap[j.mood] || j.mood}</div></div>`,
    j.sleep     && `<div class="psych-item"><div class="psych-lbl">Sleep</div><div class="psych-val">${sleepMap[j.sleep] || j.sleep}</div></div>`,
    j.dayrating && `<div class="psych-item"><div class="psych-lbl">Day Rating</div><div class="psych-val">${ratingMap[j.dayrating] || j.dayrating + '/5'}</div></div>`,
    rules       && `<div class="psych-item"><div class="psych-lbl">Rules</div><div class="psych-val ${rules.cls}">${rules.label}</div></div>`,
    j.focus     && `<div class="psych-item psych-item-wide"><div class="psych-lbl">Today's Focus</div><div class="psych-val psych-focus-text">${j.focus}</div></div>`,
  ].filter(Boolean).join('');

  return `
    <div class="psych-card">
      <div class="psych-card-head">
        <span class="psych-card-title">Psychology</span>
        <button class="btn btn-ghost btn-sm" onclick="openJournalModal('${dateStr}')">Edit</button>
      </div>
      <div class="psych-items">${items}</div>
    </div>`;
}

// ─── DAY VIEW ─────────────────────────────────────────────────────────────────
function renderDay(dateStr) {
  const trades  = getTradesForDate(dateStr);
  const journal = getJournalForDate(dateStr);
  const stats   = calcStats(trades);
  const total   = trades.reduce((s, t) => s + t.pnl, 0);

  const tradeCards = trades.length
    ? trades.map(t => renderTradeCard(t)).join('')
    : `<div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">No trades logged for this day</div>
        <button class="btn btn-primary" style="margin-top:10px" onclick="openAddTrade()">Log a Trade</button>
       </div>`;

  const journalHtml = journal
    ? renderJournalPreview(journal)
    : `<div class="card-body">
        <div class="empty-state" style="padding:24px 0;">
          <div class="empty-text" style="color:var(--text3)">No journal entry yet</div>
          <button class="btn btn-ghost btn-sm" style="margin-top:10px"
            onclick="openJournalModal('${dateStr}')">Write Journal Entry</button>
        </div>
       </div>`;

  return `
    <div class="view">
      <div class="day-header">
        <button class="btn-icon" onclick="navigate('calendar')">&#8592;</button>
        <div>
          <div class="day-title">${fmtDate(dateStr)}</div>
        </div>
        <div style="margin-left:auto;display:flex;gap:8px;">
          <button class="btn btn-primary btn-sm" onclick="openAddTrade('${dateStr}')">+ Add Trade</button>
          <button class="btn btn-ghost btn-sm" onclick="openJournalModal('${dateStr}')">
            ${journal ? 'Edit Journal' : 'Write Journal'}
          </button>
        </div>
      </div>

      <div class="day-stats-bar">
        <div class="day-stat">
          <span class="day-stat-label">Day PnL</span>
          <span class="day-stat-value ${pnlClass(total)}">${fmtPnl(total)}</span>
        </div>
        <div class="day-stat">
          <span class="day-stat-label">Trades</span>
          <span class="day-stat-value">${trades.length}</span>
        </div>
        <div class="day-stat">
          <span class="day-stat-label">Win Rate</span>
          <span class="day-stat-value">${trades.length ? stats.winRate + '%' : '—'}</span>
        </div>
        <div class="day-stat">
          <span class="day-stat-label">Best Trade</span>
          <span class="day-stat-value ${stats.bestTrade ? pnlClass(stats.bestTrade.pnl) : ''}">
            ${stats.bestTrade ? fmtPnl(stats.bestTrade.pnl) : '—'}
          </span>
        </div>
        <div class="day-stat">
          <span class="day-stat-label">Worst Trade</span>
          <span class="day-stat-value ${stats.worstTrade ? pnlClass(stats.worstTrade.pnl) : ''}">
            ${stats.worstTrade && stats.worstTrade.pnl < 0 ? fmtPnl(stats.worstTrade.pnl) : '—'}
          </span>
        </div>
      </div>

      ${journal ? renderPsychCard(journal, dateStr) : ''}

      <div class="day-grid">
        <div>
          <div class="card-title" style="margin-bottom:12px;font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--text2);">Trades</div>
          <div class="trade-list">${tradeCards}</div>
        </div>
        <div>
          <div class="card-title" style="margin-bottom:12px;font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--text2);">Journal</div>
          <div class="journal-panel">${journalHtml}</div>
        </div>
      </div>
    </div>`;
}

function renderTradeCard(t) {
  const isExpanded = state.expandedTradeId === t.id;
  return `
    <div class="trade-card" id="tc-${t.id}">
      <div class="trade-card-head" onclick="toggleTrade('${t.id}')">
        <span class="trade-symbol">${t.symbol}</span>
        <span class="badge ${t.direction === 'long' ? 'badge-long' : 'badge-short'}">
          ${t.direction.toUpperCase()}
        </span>
        ${t.time ? `<span class="muted text-small">${t.time}</span>` : ''}
        ${t.setupGrade ? `<span class="badge ${gradeClass(t.setupGrade)}" title="Setup">${t.setupGrade}</span>` : ''}
        ${t.execGrade  ? `<span class="badge ${gradeClass(t.execGrade)}"  title="Exec">${t.execGrade}</span>`  : ''}
        <span class="trade-pnl ${pnlClass(t.pnl)}">${fmtPnl(t.pnl)}</span>
      </div>
      <div class="trade-card-body ${isExpanded ? 'open' : ''}">
        <div class="trade-detail-grid">
          <div class="trade-detail-item">
            <div class="tdl">Entry</div>
            <div class="tdv">${t.entry}</div>
          </div>
          <div class="trade-detail-item">
            <div class="tdl">Exit</div>
            <div class="tdv">${t.exit}</div>
          </div>
          <div class="trade-detail-item">
            <div class="tdl">Size</div>
            <div class="tdv">${t.size} × $${t.tickValue}</div>
          </div>
          ${t.setup ? `<div class="trade-detail-item" style="grid-column:span 2">
            <div class="tdl">Setup</div>
            <div class="tdv">${t.setup}</div>
          </div>` : ''}
          ${t.timeframe ? `<div class="trade-detail-item">
            <div class="tdl">Timeframe</div>
            <div class="tdv">${t.timeframe}</div>
          </div>` : ''}
          ${t.mistake && t.mistake !== 'none' ? `<div class="trade-detail-item" style="grid-column:span 3">
            <div class="tdl">Mistake</div>
            <div class="tdv" style="color:var(--red)">${MISTAKE_LABELS[t.mistake] || t.mistake}</div>
          </div>` : ''}
        </div>
        ${t.notes ? `<div class="trade-notes-block">
          <div class="trade-notes-label">Rationale</div>
          <div class="trade-notes-text">${t.notes}</div>
        </div>` : ''}
        ${t.emotions ? `<div class="trade-notes-block">
          <div class="trade-notes-label">Emotions / Execution</div>
          <div class="trade-notes-text">${t.emotions}</div>
        </div>` : ''}
        ${t.diff ? `<div class="trade-notes-block">
          <div class="trade-notes-label">Do Differently</div>
          <div class="trade-notes-text">${t.diff}</div>
        </div>` : ''}
        <div class="trade-actions">
          <button class="btn btn-ghost btn-sm" onclick="openEditTrade('${t.id}')">Edit</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDeleteTrade('${t.id}')">Delete</button>
        </div>
      </div>
    </div>`;
}

function renderJournalPreview(j) {
  const moodMap = { rough:'😤', off:'😟', neutral:'😐', good:'🙂', locked:'🔥' };
  const sleepMap= { terrible:'Terrible', poor:'Poor', okay:'Okay', good:'Good', great:'Great' };
  const biasMap = { bullish:'Bullish', bearish:'Bearish', neutral:'Neutral', volatile:'High Vol' };
  const ratingMap = {1:'💀',2:'😓',3:'😐',4:'😊',5:'🏆'};

  const tags = [
    j.mood     ? `<span class="tag">${moodMap[j.mood]||j.mood} ${j.mood}</span>` : '',
    j.sleep    ? `<span class="tag">${sleepMap[j.sleep]||j.sleep} sleep</span>` : '',
    j.bias     ? `<span class="tag tag-amber">${biasMap[j.bias]||j.bias}</span>` : '',
    j.dayrating? `<span class="tag">${ratingMap[j.dayrating]||j.dayrating} Day ${j.dayrating}/5</span>` : '',
  ].filter(Boolean).join('');

  const sections = [
    j.personal    && ['Personal', j.personal],
    j.morning     && ['Game Plan', j.morning],
    j.levels      && ['Key Levels', j.levels],
    j.intermarket && ['Market Observations', j.intermarket],
    j.well        && ['Went Well', j.well],
    j.improve     && ['Improve', j.improve],
    j.lessons     && ['Key Lessons', j.lessons],
  ].filter(Boolean);

  return sections.map(([label, text]) => `
    <div class="journal-section">
      ${tags && label === sections[0][0] ? `<div class="journal-tags">${tags}</div>` : ''}
      <div class="journal-section-label">${label}</div>
      <div class="journal-text">${text}</div>
    </div>`).join('') || `<div class="card-body"><div class="journal-text" style="color:var(--text3)">No content saved.</div></div>`;
}

// ─── STATS VIEW ───────────────────────────────────────────────────────────────
function renderStats() {
  const trades = getAllTrades();
  const s = calcStats(trades);

  const kpis = [
    { label: 'Total PnL',     value: fmtPnl(s.totalPnl), cls: pnlClass(s.totalPnl) },
    { label: 'Win Rate',      value: trades.length ? s.winRate + '%' : '—', sub: `${s.wins}W · ${s.losses}L` },
    { label: 'Profit Factor', value: s.profitFactor || '—' },
    { label: 'Total Trades',  value: trades.length },
    { label: 'Avg Win',       value: s.avgWin ? fmtPnl(s.avgWin) : '—', cls: 'pos' },
    { label: 'Avg Loss',      value: s.avgLoss ? '-$' + s.avgLoss.toFixed(2) : '—', cls: 'neg' },
    { label: 'Best Day',      value: getBestDay(trades), cls: 'pos' },
    { label: 'Worst Day',     value: getWorstDay(trades), cls: 'neg' },
  ];

  const kpiHtml = kpis.map(k => `
    <div class="kpi">
      <div class="kpi-label">${k.label}</div>
      <div class="kpi-value ${k.cls||''}">${k.value}</div>
      ${k.sub ? `<div class="kpi-sub">${k.sub}</div>` : ''}
    </div>`).join('');

  return `
    <div class="view">
      <div class="kpi-grid">${kpiHtml}</div>
      ${renderEquityCurve(trades)}
      <div class="stats-grid">
        <div>
          <div class="card">
            <div class="card-head"><span class="card-title">Monthly Breakdown</span></div>
            <div style="overflow-x:auto">${renderBreakdownTable(trades, 'monthly')}</div>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-head"><span class="card-title">Weekly Breakdown</span></div>
            <div style="overflow-x:auto">${renderBreakdownTable(trades, 'weekly')}</div>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-head"><span class="card-title">Setup Performance</span></div>
            <div class="card-body">${renderSetupStats(trades)}</div>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-head"><span class="card-title">Mistake Breakdown</span></div>
            <div class="card-body">${renderMistakeBreakdown(trades)}</div>
          </div>
        </div>
      </div>
    </div>`;
}

function getBestDay(trades) {
  const dayMap = {};
  trades.forEach(t => { dayMap[t.date] = (dayMap[t.date] || 0) + t.pnl; });
  const vals = Object.values(dayMap);
  if (!vals.length) return '—';
  const best = Math.max(...vals);
  return best > 0 ? fmtPnl(best) : '—';
}

function getWorstDay(trades) {
  const dayMap = {};
  trades.forEach(t => { dayMap[t.date] = (dayMap[t.date] || 0) + t.pnl; });
  const vals = Object.values(dayMap);
  if (!vals.length) return '—';
  const worst = Math.min(...vals);
  return worst < 0 ? fmtPnl(worst) : '—';
}

function renderEquityCurve(trades) {
  if (trades.length < 2) return `
    <div class="equity-wrap">
      <div class="equity-title">Equity Curve</div>
      <div class="empty-state" style="padding:30px 0;"><div class="empty-text">Log at least 2 trades to see your equity curve</div></div>
    </div>`;

  // Build cumulative PnL by date
  const sorted = [...trades].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  let cum = 0;
  const points = sorted.map(t => { cum += t.pnl; return { date: t.date, cum: parseFloat(cum.toFixed(2)) }; });

  const W = 900, H = 200, PAD = { top:16, right:16, bottom:24, left:56 };
  const minY = Math.min(0, ...points.map(p => p.cum));
  const maxY = Math.max(0, ...points.map(p => p.cum));
  const rangeY = maxY - minY || 1;
  const rangeX = points.length - 1 || 1;

  const xPos = i => PAD.left + (i / rangeX) * (W - PAD.left - PAD.right);
  const yPos = v => PAD.top + (1 - (v - minY) / rangeY) * (H - PAD.top - PAD.bottom);
  const zeroY = yPos(0);

  const linePoints = points.map((p, i) => `${xPos(i).toFixed(1)},${yPos(p.cum).toFixed(1)}`).join(' ');
  const areaPoints = `${xPos(0).toFixed(1)},${zeroY.toFixed(1)} ` + linePoints + ` ${xPos(points.length-1).toFixed(1)},${zeroY.toFixed(1)}`;

  // Y axis labels
  const yTicks = [minY, minY + rangeY * 0.5, maxY].map(v => ({
    v, y: yPos(v), label: fmtPnl(v, false)
  }));

  // Zero line
  const zeroLine = `<line x1="${PAD.left}" y1="${zeroY}" x2="${W - PAD.right}" y2="${zeroY}" stroke="rgba(255,255,255,0.08)" stroke-width="1" stroke-dasharray="4,4"/>`;

  const finalPnl = points[points.length - 1].cum;
  const lineColor = finalPnl >= 0 ? '#4ec994' : '#f06060';
  const areaColor = finalPnl >= 0 ? 'rgba(78,201,148,0.08)' : 'rgba(240,96,96,0.08)';

  return `
    <div class="equity-wrap">
      <div class="equity-title">Equity Curve — ${fmtPnl(finalPnl)} total</div>
      <svg class="equity-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <clipPath id="chart-clip">
            <rect x="${PAD.left}" y="${PAD.top}" width="${W - PAD.left - PAD.right}" height="${H - PAD.top - PAD.bottom}"/>
          </clipPath>
        </defs>
        ${yTicks.map(t => `
          <text x="${PAD.left - 6}" y="${t.y + 4}" text-anchor="end"
            font-size="10" font-family="IBM Plex Mono,monospace" fill="#454c63">${t.label}</text>
          <line x1="${PAD.left}" y1="${t.y}" x2="${W - PAD.right}" y2="${t.y}"
            stroke="rgba(255,255,255,0.04)" stroke-width="1"/>`).join('')}
        ${zeroLine}
        <g clip-path="url(#chart-clip)">
          <polygon points="${areaPoints}" fill="${areaColor}"/>
          <polyline points="${linePoints}" fill="none" stroke="${lineColor}" stroke-width="2"/>
        </g>
      </svg>
    </div>`;
}

function renderBreakdownTable(trades, type) {
  if (!trades.length) return `<div class="empty-state" style="padding:24px"><div class="empty-text">No trades yet</div></div>`;

  const keyFn = type === 'monthly' ? monthKey : isoWeekKey;
  const groups = groupBy(trades, keyFn);
  const keys   = Object.keys(groups).sort().reverse();

  const rows = keys.map(k => {
    const ts = groups[k];
    const s  = calcStats(ts);
    const pnl = ts.reduce((acc, t) => acc + t.pnl, 0);
    let label = k;
    if (type === 'monthly') {
      const [y, m] = k.split('-');
      label = MONTHS[+m - 1].slice(0, 3) + ' ' + y;
    }
    return `<tr>
      <td>${label}</td>
      <td class="num ${pnlClass(pnl)}">${fmtPnl(pnl)}</td>
      <td class="num">${ts.length}</td>
      <td class="num">${s.winRate}%</td>
      <td class="num">${s.profitFactor}</td>
    </tr>`;
  }).join('');

  return `
    <table class="breakdown-table">
      <thead><tr>
        <th>${type === 'monthly' ? 'Month' : 'Week'}</th>
        <th>PnL</th><th>Trades</th><th>Win%</th><th>PF</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderSetupStats(trades) {
  if (!trades.length) return `<div class="empty-text" style="color:var(--text3)">No trades yet</div>`;

  const map = {};
  trades.forEach(t => {
    const key = t.setup || 'Untagged';
    if (!map[key]) map[key] = { trades: [], pnl: 0 };
    map[key].trades.push(t);
    map[key].pnl += t.pnl;
  });

  return Object.entries(map)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([setup, d]) => {
      const wins = d.trades.filter(t => t.pnl > 0).length;
      const wr   = Math.round(wins / d.trades.length * 100);
      return `
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
            <span style="font-size:13px;color:var(--text1);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${setup}</span>
            <span class="num ${pnlClass(d.pnl)}">${fmtPnl(d.pnl)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:4px;background:var(--bg3);border-radius:2px;overflow:hidden;">
              <div style="height:100%;width:${wr}%;background:${d.pnl>=0?'var(--green)':'var(--red)'};border-radius:2px;"></div>
            </div>
            <span style="font-size:11px;color:var(--text3);white-space:nowrap">${d.trades.length} trades · ${wr}% win</span>
          </div>
        </div>`;
    }).join('');
}

function renderMistakeBreakdown(trades) {
  if (!trades.length) return `<div class="empty-text" style="color:var(--text3)">No trades yet</div>`;

  const map = {};
  trades.forEach(t => {
    const m = t.mistake || 'none';
    if (m === 'none') return;
    map[m] = (map[m] || 0) + 1;
  });

  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<div class="empty-text" style="color:var(--text3)">No mistakes logged — keep it up!</div>`;

  const max = Math.max(...entries.map(e => e[1]));
  return entries.map(([k, count]) => `
    <div class="mistake-bar-row">
      <span class="mistake-label">${MISTAKE_LABELS[k] || k}</span>
      <div class="mistake-bar-wrap">
        <div class="mistake-bar-fill" style="width:${Math.round(count/max*100)}%"></div>
      </div>
      <span class="mistake-count">${count}</span>
    </div>`).join('');
}

// ─── TRADE MODAL ──────────────────────────────────────────────────────────────
function renderTradeModal(prefillDate, existingTrade) {
  const t = existingTrade || {};
  const isEdit = !!existingTrade;
  const dateVal = t.date || prefillDate || todayStr();

  return `
    <div class="modal-overlay" id="modal-overlay" onclick="closeModalOnOverlay(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <div class="modal-head">
          <span class="modal-title">${isEdit ? 'Edit Trade' : 'Log Trade'}</span>
          <button class="btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <div class="form-section-label">Basics</div>
          <div class="form-grid g4">
            <div class="field"><label>Symbol</label>
              <input id="f-symbol" type="text" value="${t.symbol||''}" placeholder="MNQ" style="text-transform:uppercase">
            </div>
            <div class="field"><label>Direction</label>
              <select id="f-direction">
                <option value="long"  ${t.direction==='long' ?'selected':''}>Long</option>
                <option value="short" ${t.direction==='short'?'selected':''}>Short</option>
              </select>
            </div>
            <div class="field"><label>Date</label>
              <input id="f-date" type="date" value="${dateVal}">
            </div>
            <div class="field"><label>Time</label>
              <input id="f-time" type="time" value="${t.time||''}">
            </div>
          </div>

          <div class="form-grid g4" style="margin-top:12px">
            <div class="field"><label>Entry Price</label>
              <input id="f-entry" type="number" step="0.01" value="${t.entry||''}" placeholder="0.00" oninput="updatePnlPreview()">
            </div>
            <div class="field"><label>Exit Price</label>
              <input id="f-exit" type="number" step="0.01" value="${t.exit||''}" placeholder="0.00" oninput="updatePnlPreview()">
            </div>
            <div class="field"><label>Size</label>
              <input id="f-size" type="number" value="${t.size||''}" placeholder="contracts" oninput="updatePnlPreview()">
            </div>
            <div class="field"><label>Tick Value $</label>
              <input id="f-tick" type="number" step="0.01" value="${t.tickValue||''}" placeholder="2 = MNQ" oninput="updatePnlPreview()">
            </div>
          </div>

          <div id="pnl-preview-bar" class="pnl-preview-bar" style="${t.entry&&t.exit&&t.size?'':'display:none'}">
            <span class="pnl-preview-label">PnL</span>
            <span class="pnl-preview-value" id="pnl-preview-value"></span>
          </div>

          <div class="form-section-label">Grading</div>
          <div class="form-grid g3">
            <div class="field"><label>Setup Quality</label>
              <select id="f-setupgrade">
                <option value="">Select...</option>
                ${['A+','A','B','C','D'].map(g => `<option ${t.setupGrade===g?'selected':''}>${g}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Execution Grade</label>
              <select id="f-execgrade">
                <option value="">Select...</option>
                ${['A+','A','B','C','D'].map(g => `<option ${t.execGrade===g?'selected':''}>${g}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Mistake Type</label>
              <select id="f-mistake">
                ${Object.entries(MISTAKE_LABELS).map(([k,v]) =>
                  `<option value="${k}" ${t.mistake===k?'selected':''}>${v}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="form-section-label">Details</div>
          <div class="form-grid g2">
            <div class="field"><label>Setup / Strategy</label>
              <input id="f-setup" type="text" value="${t.setup||''}" placeholder="e.g. ICT 1hr FVG + SMT">
            </div>
            <div class="field"><label>Timeframe</label>
              <select id="f-timeframe">
                <option value="">Select...</option>
                ${['1m scalp','5m','15m','1h','4h','Daily','Multi-day'].map(v =>
                  `<option ${t.timeframe===v?'selected':''}>${v}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="field" style="margin-top:12px"><label>Trade Rationale / Thought Process</label>
            <textarea id="f-notes" placeholder="Why did you take this trade? What did you see?">${t.notes||''}</textarea>
          </div>
          <div class="field" style="margin-top:12px"><label>Emotions & Execution Notes</label>
            <textarea id="f-emotions" placeholder="How did you feel? Did you follow your rules?">${t.emotions||''}</textarea>
          </div>
          <div class="field" style="margin-top:12px"><label>What Would You Do Differently?</label>
            <textarea id="f-diff" placeholder="If you could replay this trade..." style="min-height:56px">${t.diff||''}</textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveTrade('${isEdit ? t.id : ''}')">
            ${isEdit ? 'Update Trade' : 'Log Trade'}
          </button>
        </div>
      </div>
    </div>`;
}

function updatePnlPreview() {
  const entry = parseFloat(document.getElementById('f-entry')?.value) || 0;
  const exit  = parseFloat(document.getElementById('f-exit')?.value)  || 0;
  const size  = parseFloat(document.getElementById('f-size')?.value)  || 0;
  const tick  = parseFloat(document.getElementById('f-tick')?.value)  || 1;
  const dir   = document.getElementById('f-direction')?.value || 'long';
  const bar   = document.getElementById('pnl-preview-bar');
  const val   = document.getElementById('pnl-preview-value');
  if (!bar || !val) return;
  if (!entry || !exit || !size) { bar.style.display = 'none'; return; }
  const pnl = calcPnl(entry, exit, size, tick, dir);
  bar.style.display = 'flex';
  val.textContent = fmtPnl(pnl);
  val.className = 'pnl-preview-value ' + pnlClass(pnl);
}

// ─── JOURNAL MODAL ────────────────────────────────────────────────────────────
function renderJournalModal(dateStr) {
  const j = getJournalForDate(dateStr) || {};

  const moodOpts = [
    { v:'rough',  icon:'😤', label:'Rough'     },
    { v:'off',    icon:'😟', label:'Off'       },
    { v:'neutral',icon:'😐', label:'Neutral'   },
    { v:'good',   icon:'🙂', label:'Good'      },
    { v:'locked', icon:'🔥', label:'Locked In' },
  ];
  const sleepOpts = ['Terrible','Poor','Okay','Good','Great'].map(v => v.toLowerCase());
  const ratingOpts = [
    {v:1,icon:'💀'},{v:2,icon:'😓'},{v:3,icon:'😐'},{v:4,icon:'😊'},{v:5,icon:'🏆'}
  ];

  const moodBtns = moodOpts.map(o => `
    <div class="mood-btn ${j.mood===o.v?'mood-selected':''}" data-mood="${o.v}"
      onclick="selectPick('mood',this)"
      style="flex:1;background:var(--bg2);border:1px solid ${j.mood===o.v?'var(--amber)':'var(--border)'};
      border-radius:var(--r);padding:7px 4px;cursor:pointer;text-align:center;
      background:${j.mood===o.v?'var(--amber-d)':'var(--bg2)'}">
      <div style="font-size:18px;margin-bottom:2px">${o.icon}</div>
      <div style="font-size:10px;color:var(--text2)">${o.label}</div>
    </div>`).join('');

  const sleepBtns = sleepOpts.map(v => `
    <div class="sleep-btn ${j.sleep===v?'sleep-selected':''}" data-sleep="${v}"
      onclick="selectPick('sleep',this)"
      style="flex:1;background:var(--bg2);border:1px solid ${j.sleep===v?'var(--blue)':'var(--border)'};
      border-radius:var(--r);padding:6px 4px;cursor:pointer;text-align:center;
      font-size:11px;color:${j.sleep===v?'var(--blue)':'var(--text2)'}">
      ${v.charAt(0).toUpperCase()+v.slice(1)}
    </div>`).join('');

  const ratingBtns = ratingOpts.map(o => `
    <div class="rating-btn" data-rating="${o.v}"
      onclick="selectPick('rating',this)"
      style="flex:1;background:var(--bg2);border:1px solid ${+j.dayrating===o.v?'var(--amber)':'var(--border)'};
      border-radius:var(--r);padding:7px 4px;cursor:pointer;text-align:center;
      background:${+j.dayrating===o.v?'var(--amber-d)':'var(--bg2)'}">
      <div style="font-size:18px;margin-bottom:2px">${o.icon}</div>
      <div style="font-size:10px;color:var(--text2)">${o.v}</div>
    </div>`).join('');

  const ta = (id, label, val, ph) =>
    `<div class="field"><label>${label}</label>
     <textarea id="${id}" placeholder="${ph}">${val||''}</textarea></div>`;

  return `
    <div class="modal-overlay" id="modal-overlay" onclick="closeModalOnOverlay(event)">
      <div class="modal" style="max-width:780px" onclick="event.stopPropagation()">
        <div class="modal-head">
          <span class="modal-title">Journal — ${fmtDate(dateStr)}</span>
          <button class="btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">

          <div class="form-section-label">Personal & Mindset</div>
          <div style="margin-bottom:12px">
            <label style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:6px">Mood</label>
            <div id="mood-group" style="display:flex;gap:6px">${moodBtns}</div>
          </div>
          <div style="margin-bottom:12px">
            <label style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:6px">Sleep</label>
            <div id="sleep-group" style="display:flex;gap:6px">${sleepBtns}</div>
          </div>
          ${ta('j-personal','Personal Notes (life outside trading)',j.personal,'Stress, social stuff, anything affecting your headspace...')}

          <div class="form-section-label">Pre-Market Prep</div>
          <div class="form-grid g2">
            <div class="field"><label>Market Bias</label>
              <select id="j-bias">
                <option value="">Select...</option>
                ${['bullish','bearish','neutral','volatile'].map(v=>
                  `<option value="${v}" ${j.bias===v?'selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('')}
              </select>
            </div>
            <div class="field"><label>Confidence</label>
              <select id="j-conf">
                <option value="">Select...</option>
                <option value="low"  ${j.conf==='low' ?'selected':''}>Low — Just a lean</option>
                <option value="med"  ${j.conf==='med' ?'selected':''}>Medium — Decent conviction</option>
                <option value="high" ${j.conf==='high'?'selected':''}>High — Strong conviction</option>
              </select>
            </div>
          </div>
          <div style="margin-top:12px" class="form-grid">
            ${ta('j-morning','Morning Thesis / Game Plan',j.morning,'What is the plan? Why are you biased this way?')}
            ${ta('j-levels','Key Levels Watching',j.levels,'FVGs, order blocks, liquidity pools, overnight highs/lows...')}
            ${ta('j-setups','Setups Identified Pre-Market',j.setups,'Specific setups you are watching...')}
          </div>
          <div class="field" style="margin-top:12px"><label>Today\'s Focus / Intention</label>
            <input id="j-focus" type="text" value="${j.focus||''}" placeholder="One thing you're committing to today...">
          </div>

          <div class="form-section-label">Market Observations</div>
          ${ta('j-intermarket','Inter-Market / Correlations',j.intermarket,'NQ vs ES spread, DXY, yields, sector rotation...')}
          ${ta('j-pa','Price Action Notes',j.pa,'How is price behaving? Trending, choppy, respecting levels?')}
          ${ta('j-strategy','Strategy / System Notes',j.strategy,'How is your approach holding up? Edge observations...')}

          <div class="form-section-label">End of Day Review</div>
          <div class="form-grid g2">
            ${ta('j-well','What Went Well',j.well,'Wins, good decisions, execution you are proud of...')}
            ${ta('j-improve','What to Improve',j.improve,'Mistakes, rule breaks, bad habits noticed...')}
          </div>
          ${ta('j-lessons','Key Lessons Learned',j.lessons,'The one or two takeaways from today...')}
          <div class="field" style="margin-top:12px"><label>Rules Followed / Broken</label>
            <select id="j-rules">
              <option value="">Select...</option>
              <option value="all"     ${j.rules==='all'    ?'selected':''}>Followed all rules</option>
              <option value="mostly"  ${j.rules==='mostly' ?'selected':''}>Mostly followed rules</option>
              <option value="some"    ${j.rules==='some'   ?'selected':''}>Broke a few rules</option>
              <option value="several" ${j.rules==='several'?'selected':''}>Broke several rules</option>
              <option value="revenge" ${j.rules==='revenge'?'selected':''}>Went off-plan / revenge traded</option>
            </select>
          </div>
          <div style="margin-top:14px">
            <label style="font-size:10px;color:var(--text2);text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:6px">Day Rating</label>
            <div id="rating-group" style="display:flex;gap:6px">${ratingBtns}</div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
          <button class="btn btn-primary" onclick="saveJournalForm('${dateStr}')">Save Journal</button>
        </div>
      </div>
    </div>`;
}

// Track selected picks in journal modal
const modalPicks = { mood: '', sleep: '', rating: '' };

function selectPick(type, el) {
  const attr = { mood:'data-mood', sleep:'data-sleep', rating:'data-rating' }[type];
  const groupId = { mood:'mood-group', sleep:'sleep-group', rating:'rating-group' }[type];
  const group = document.getElementById(groupId);
  if (!group) return;

  const isAmber  = type === 'mood' || type === 'rating';
  const selColor = isAmber ? 'var(--amber)' : 'var(--blue)';
  const selBg    = isAmber ? 'var(--amber-d)' : 'rgba(96,165,250,0.1)';
  const selText  = isAmber ? '' : 'var(--blue)';

  group.querySelectorAll('[data-mood],[data-sleep],[data-rating]').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background  = 'var(--bg2)';
    if (type === 'sleep') b.style.color = 'var(--text2)';
  });

  el.style.borderColor = selColor;
  el.style.background  = selBg;
  if (type === 'sleep') el.style.color = selText;

  modalPicks[type] = el.getAttribute(attr);
}

function saveJournalForm(dateStr) {
  const g = id => document.getElementById(id)?.value?.trim() || '';
  const journal = {
    date: dateStr,
    mood: modalPicks.mood || '',
    sleep: modalPicks.sleep || '',
    dayrating: modalPicks.rating || '',
    personal:    g('j-personal'),
    bias:        document.getElementById('j-bias')?.value || '',
    conf:        document.getElementById('j-conf')?.value || '',
    morning:     g('j-morning'),
    levels:      g('j-levels'),
    setups:      g('j-setups'),
    focus:       g('j-focus'),
    intermarket: g('j-intermarket'),
    pa:          g('j-pa'),
    strategy:    g('j-strategy'),
    well:        g('j-well'),
    improve:     g('j-improve'),
    lessons:     g('j-lessons'),
    rules:       document.getElementById('j-rules')?.value || '',
  };
  saveJournal(journal);
  closeModal();
  showToast('Journal saved ✓');
  if (state.view === 'day') render();
}

// ─── MODAL MANAGEMENT ─────────────────────────────────────────────────────────
function openAddTrade(prefillDate) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = renderTradeModal(prefillDate || todayStr(), null);
  updatePnlPreview();
}

function openEditTrade(id) {
  const trade = getAllTrades().find(t => t.id === id);
  if (!trade) return;
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = renderTradeModal(trade.date, trade);
  updatePnlPreview();
}

function openJournalModal(dateStr) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = renderJournalModal(dateStr);
  // Restore picks from existing journal
  const j = getJournalForDate(dateStr);
  if (j) {
    modalPicks.mood   = j.mood     || '';
    modalPicks.sleep  = j.sleep    || '';
    modalPicks.rating = j.dayrating|| '';
  } else {
    modalPicks.mood = modalPicks.sleep = modalPicks.rating = '';
  }
}

function closeModal() {
  document.getElementById('modal-root').innerHTML = '';
}

function closeModalOnOverlay(e) {
  if (e.target.id === 'modal-overlay') closeModal();
}

function saveTrade(editId) {
  const symbol = document.getElementById('f-symbol')?.value?.trim()?.toUpperCase();
  const entry  = parseFloat(document.getElementById('f-entry')?.value);
  const exit   = parseFloat(document.getElementById('f-exit')?.value);
  const size   = parseFloat(document.getElementById('f-size')?.value);
  const tick   = parseFloat(document.getElementById('f-tick')?.value) || 1;
  if (!symbol || !entry || !exit || !size) {
    showToast('Fill in symbol, prices, and size', true);
    return;
  }
  const dir = document.getElementById('f-direction').value;
  const pnl = calcPnl(entry, exit, size, tick, dir);

  const trade = {
    date:       document.getElementById('f-date').value,
    time:       document.getElementById('f-time').value,
    symbol, direction: dir, entry, exit, size, tickValue: tick, pnl,
    setup:      document.getElementById('f-setup').value.trim(),
    timeframe:  document.getElementById('f-timeframe').value,
    setupGrade: document.getElementById('f-setupgrade').value,
    execGrade:  document.getElementById('f-execgrade').value,
    mistake:    document.getElementById('f-mistake').value,
    notes:      document.getElementById('f-notes').value.trim(),
    emotions:   document.getElementById('f-emotions').value.trim(),
    diff:       document.getElementById('f-diff').value.trim(),
  };

  if (editId) {
    updateTrade(editId, trade);
    showToast('Trade updated ✓');
  } else {
    addTrade(trade);
    showToast('Trade logged ✓');
  }

  closeModal();
  render();
}

function confirmDeleteTrade(id) {
  if (confirm('Delete this trade? This cannot be undone.')) {
    deleteTrade(id);
    showToast('Trade deleted');
    render();
  }
}

function toggleTrade(id) {
  state.expandedTradeId = state.expandedTradeId === id ? null : id;
  render();
}

// ─── NAVIGATION ───────────────────────────────────────────────────────────────
function navigate(view, extra) {
  state.view = view;
  if (extra) state.selectedDate = extra;
  render();
}

function openDay(dateStr) {
  state.view = 'day';
  state.selectedDate = dateStr;
  render();
}

function prevMonth() {
  if (state.calMonth === 0) { state.calMonth = 11; state.calYear--; }
  else state.calMonth--;
  render();
}

function nextMonth() {
  if (state.calMonth === 11) { state.calMonth = 0; state.calYear++; }
  else state.calMonth++;
  render();
}

// ─── MAIN RENDER ──────────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  let viewHtml = '';

  if (state.view === 'calendar') viewHtml = renderCalendar();
  else if (state.view === 'day') viewHtml = renderDay(state.selectedDate || todayStr());
  else if (state.view === 'stats') viewHtml = renderStats();

  app.innerHTML = renderTopbar() + viewHtml;
  window.scrollTo(0, 0);
}

// ─── MIGRATE ──────────────────────────────────────────────────────────────────
// Removes any trades/journals that were seeded with the wrong year (2025).
function migrateData() {
  const db = getDB();
  const badIds = new Set([
    'tr_20250424_0720_mnq_01',
    'tr_20250424_0735_mnq_02',
    'tr_20250424_0741_mnq_03',
  ]);
  const before = db.trades.length;
  db.trades   = db.trades.filter(t => !badIds.has(t.id));
  db.journals = db.journals.filter(j => j.date !== '2025-04-24');
  if (db.trades.length !== before) saveDB(db);
}

// ─── SEED DATA ────────────────────────────────────────────────────────────────
// Populates localStorage when there are no trades yet.
function seedData() {
  if (getDB().trades.length > 0) return;

  saveDB({
    trades: [
      {
        id: 'tr_20260424_0720_mnq_01',
        date: '2026-04-24', time: '07:20',
        symbol: 'MNQ', direction: 'long',
        entry: 27213.5, exit: 27247.7, size: 5, tickValue: 2, pnl: 288.70,
        setup: 'ICT 1hr FVG + London High SMT divergence', timeframe: '1h',
        setupGrade: 'A+', execGrade: 'C', mistake: 'fat-finger',
        notes: 'Identified 1hr FVG on MNQ at 5AM. Manipulation through the gap at market open, waited for rebound and caught the move. Saw bearish SMT divergence from MES at London highs and sold 3 early at 27244. Then fat-fingered a buy at 27253.75 instead of placing limit sell — added 2 contracts by accident. Panic market sold all 4 remaining at 27248.5. NQ was trading ~80bps above MES all morning (risk-on tape) which means the MES SMT signal was weaker than normal — should have accounted for relative strength context before using it as an exit trigger. [Complex execution: 3x exit @27244, 2x accidental buy @27253.75, 4x panic sell @27248.5. Exit shown is blended avg.]',
        emotions: 'Tired from late Thursday night. Rushed order entry mid-trade. Panicked when size was wrong instead of staying calm and managing it.',
        diff: 'Slow down on order entry. Pre-set TP before entering. Confirm direction before clicking. A breakeven stop is protection — don\'t need to panic.',
      },
      {
        id: 'tr_20260424_0735_mnq_02',
        date: '2026-04-24', time: '07:35',
        symbol: 'MNQ', direction: 'long',
        entry: 27203, exit: 27194, size: 5, tickValue: 2, pnl: -90.00,
        setup: 'ICT 1hr FVG re-entry', timeframe: '1h',
        setupGrade: 'B', execGrade: 'B', mistake: 'order-type',
        notes: 'Re-entered the same 1hr FVG on a stop-limit order. Price had a massive wick through 27203, stop-limit triggered and filled, then price immediately snapped back up — classic ICT liquidity sweep. The FVG held. Wrong order type for fast futures conditions. Should have used stop-market or waited for a confirmed close back above the sweep candle before re-entering.',
        emotions: 'Frustrated after Trade 1 execution. Rushed the re-entry without adjusting order type.',
        diff: 'Never use stop-limit orders at a key level in fast market conditions. Use stop-market, or wait for sweep confirmation before entering.',
      },
      {
        id: 'tr_20260424_0741_mnq_03',
        date: '2026-04-24', time: '07:41',
        symbol: 'MNQ', direction: 'long',
        entry: 27218.75, exit: 27244.00, size: 5, tickValue: 2, pnl: 252.50,
        setup: 'ICT 4hr draw + 1hr FVG re-entry after manipulation sweep', timeframe: '1h',
        setupGrade: 'A+', execGrade: 'A', mistake: 'early-exit',
        notes: 'Waited for price to retrace through the 1hr FVG after a major manipulation move that filled the 4hr draw back to the Jan 26 level. Bought 5 contracts at 27218.75 targeting intraday highs and initial high draw. Sold 3 at 27248.25 (intermediate highs), 1 more at 27256.50, moved final contract to breakeven targeting 27303.25 but it reversed before getting there. FVG bottom still hasn\'t been hit. Chose to take profits and protect the day. [Partial exits: 3x@27248.25, 1x@27256.50, 1x@27218.75 BE — exit shown is blended avg 27244.]',
        emotions: 'Patient and composed. Best mental state of the three trades. Waited through two losses without revenge trading.',
        diff: 'When at breakeven on a runner with a clear draw target and no risk on the table, leave it. A BE stop IS your protection — there was no reason to pull the contract early.',
      },
    ],
    journals: [
      {
        date: '2026-04-24',
        mood: 'good', sleep: 'poor', dayrating: '3',
        personal: 'Tired from a late Thursday night out. Kevin had some stuff going on with Valerie — ended up at Ryan\'s, didn\'t make it to Ben\'s until late. Nearing the end of school. Tired but feeling pretty good overall.',
        bias: 'bullish', conf: 'med',
        morning: 'Watching ICT setups today. Still developing my own blend of ICT and Bryce\'s approach — haven\'t locked in the right mix yet. Bias is long — no interest in shorting all-time highs. Fresh $100k funded futures account, getting the hang of the prop firm rules.',
        levels: '1hr FVG on MNQ identified at 5AM. Early morning highs at 27366 as liquidity target. Bottom of 1hr FVG at 27194 as stop reference. 4hr draw back to Jan 26 level.',
        setups: 'ICT 1hr FVG on MNQ — manipulation through gap at open, rebound entry targeting early morning highs at 27366.',
        focus: 'Slow down on order entry. Confirm direction before clicking. Pre-set TP before entering.',
        intermarket: 'NQ trading ~80bps above MES all morning — tech clearly leading, risk-on tape. Bearish SMT from MES at London highs means less in a session where NQ already has strong relative strength. Need to weigh inter-market context before using SMT as an exit trigger.',
        pa: 'Classic ICT manipulation sweep on open through the 1hr FVG. 4hr draw to Jan 26 filled. Market respected FVG as support on all three re-entries. Intermediate highs at 27248-27266 as near-term draw. Initial highs at 27366 as the daily target.',
        strategy: 'ICT framework + early morning high targets working conceptually. Execution is the gap. Need a pre-trade checklist: setup → direction → size → TP placed → then entry. Stop-limit orders dangerous in fast futures conditions — use stop-market or wait for sweep confirmation.',
        well: 'Read the market correctly on all three trades. Identified the FVG at 5AM before open. Stayed patient between Trade 2\'s loss and Trade 3. Trade 3 was composed and disciplined — best execution of the day. Finished green.',
        improve: 'Trade 1 — fat-fingered buy instead of placing limit sell, triggered panic sell of 4 contracts. Trade 2 — stop-limit order triggered mid-wick during a liquidity sweep. Both mistakes were mechanical/order entry, not analytical.',
        lessons: 'Analysis was right on all three trades. The FVG held every time. Execution and order mechanics are the only problem today. (1) Slow down on order entry. (2) Use stop-market not stop-limit in fast conditions. (3) A breakeven stop is already your protection — let runners run. (4) NQ relative strength context must be factored in before using MES SMT as an exit trigger.',
        rules: 'some',
      },
    ],
  });
}

// ─── REMOTE SYNC ──────────────────────────────────────────────────────────────
// Fetches data.json and merges any trades/journals not already in localStorage.
async function syncFromRemote() {
  try {
    const res = await fetch('./data.json?t=' + Date.now());
    if (!res.ok) return;
    const remote = await res.json();
    if (!Array.isArray(remote.trades) || !Array.isArray(remote.journals)) return;
    const local = getDB();
    const localIds   = new Set(local.trades.map(t => t.id));
    const localDates = new Set(local.journals.map(j => j.date));
    let changed = false;
    remote.trades.forEach(t => {
      if (!localIds.has(t.id)) { local.trades.push(t); changed = true; }
    });
    remote.journals.forEach(j => {
      if (!localDates.has(j.date)) { local.journals.push(j); changed = true; }
    });
    if (changed) {
      local.trades.sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
      saveDB(local);
      showToast('Trades synced ✓');
      render();
    }
  } catch (e) { /* data.json absent or malformed — silent */ }
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  migrateData();
  seedData();
  render();
  syncFromRemote();
}

// Keyboard shortcut: Escape closes modal
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

init();
