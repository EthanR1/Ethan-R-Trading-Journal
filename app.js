/* ============================================================
   TradeLog — app.js
   Static GitHub Pages trade journal. Data stored in
   localStorage, organized by account.
   ============================================================ */

'use strict';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const ACCOUNTS_KEY    = 'tradelog_accounts';
const ACTIVE_ACCT_KEY = 'tradelog_active_account';
const LEGACY_KEY      = 'tradelog_v1';

const DAYS_OF_WEEK = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];

const SYMBOLS     = ['MES', 'ES', 'MNQ', 'NQ'];
const SYMBOL_TICK = { MES: 5, ES: 50, MNQ: 2, NQ: 20 };

const SESSIONS = ['closed', 'asia', 'london', 'pre-market', 'rth-open', 'midday', 'power-hour', 'ah'];
const SESSION_LABELS = {
  'closed':      'Closed',
  'asia':        'Asia',
  'london':      'London',
  'pre-market':  'Pre-Market',
  'rth-open':    'RTH Open',
  'midday':      'Midday',
  'power-hour':  'Power Hour',
  'ah':          'AH',
};
const SESSION_FULL = {
  'closed':      'Futures Closed (5–6pm ET)',
  'asia':        'Asia (6pm–2am ET)',
  'london':      'London (2am–8:30am ET)',
  'pre-market':  'Pre-Market (8:30–9:30am ET)',
  'rth-open':    'RTH Open (9:30–10:30am ET)',
  'midday':      'Midday (10:30am–3pm ET)',
  'power-hour':  'Power Hour (3–4pm ET)',
  'ah':          'After Hours (4–5pm ET)',
};

const HEATMAP_HOURS = ['Pre', '9:30', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4+'];
const HEATMAP_RANGES = [
  [0,        9*60+30],
  [9*60+30,  10*60],
  [10*60,    11*60],
  [11*60,    12*60],
  [12*60,    13*60],
  [13*60,    14*60],
  [14*60,    15*60],
  [15*60,    16*60],
  [16*60,    24*60],
];
const HEATMAP_DAYS     = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const HEATMAP_DAY_IDX  = [1, 2, 3, 4, 5];

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
  view: 'calendar',
  accountId: null,
  calYear:  new Date().getFullYear(),
  calMonth: new Date().getMonth(),
  selectedDate: null,
  expandedTradeId: null,
};

// ─── ACCOUNT LAYER ────────────────────────────────────────────────────────────
function loadAccounts() {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return [];
}

function saveAccounts(accounts) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}

function acctKey(id) {
  return 'tradelog_acct_' + id;
}

function createAccount(name) {
  const accounts = loadAccounts();
  const id = 'acct_' + Date.now() + '_' + Math.random().toString(36).slice(2, 5);
  const account = { id, name, createdAt: todayStr() };
  accounts.push(account);
  saveAccounts(accounts);
  localStorage.setItem(acctKey(id), JSON.stringify({ trades: [], journals: [] }));
  return account;
}

function deleteAccount(id) {
  const accounts = loadAccounts();
  if (accounts.length <= 1) { showToast('Cannot delete the only account', true); return; }
  if (!confirm('Delete this account and ALL its trades? This cannot be undone.')) return;
  const filtered = accounts.filter(a => a.id !== id);
  saveAccounts(filtered);
  localStorage.removeItem(acctKey(id));
  if (state.accountId === id) {
    state.accountId = filtered[0].id;
    localStorage.setItem(ACTIVE_ACCT_KEY, state.accountId);
    state.view = 'calendar';
  }
  render();
}

function renameAccount(id) {
  const accounts = loadAccounts();
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  const name = prompt('Rename account:', acc.name);
  if (name && name.trim()) {
    acc.name = name.trim();
    saveAccounts(accounts);
    render();
  }
}

function toggleBlownAccount(id) {
  const accounts = loadAccounts();
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  if (!acc.blown) {
    if (!confirm(`Mark "${acc.name}" as blown?\n\nThis will lock it to view-only — no new trades can be logged.`)) return;
    acc.blown = true;
    acc.blownAt = todayStr();
  } else {
    if (!confirm(`Restore "${acc.name}"?\n\nThis will allow trading on it again.`)) return;
    acc.blown = false;
    delete acc.blownAt;
  }
  saveAccounts(accounts);
  render();
}

function isCurrentAccountBlown() {
  const accounts = loadAccounts();
  const acc = accounts.find(a => a.id === state.accountId);
  return acc?.blown === true;
}

function setDailyLossLimit(id) {
  const accounts = loadAccounts();
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  const raw = prompt(
    `Daily Loss Limit $ for "${acc.name}"\n(Enter a positive number. Leave blank to clear.)`,
    acc.dailyLossLimit != null ? acc.dailyLossLimit : ''
  );
  if (raw === null) return;
  const trimmed = raw.trim();
  if (trimmed === '') {
    delete acc.dailyLossLimit;
    saveAccounts(accounts);
    showToast('Loss limit cleared');
  } else {
    const val = parseFloat(trimmed);
    if (isNaN(val) || val <= 0) { showToast('Enter a positive number', true); return; }
    acc.dailyLossLimit = val;
    saveAccounts(accounts);
    showToast('Loss limit updated ✓');
  }
  render();
}

function promptNewAccount() {
  const name = prompt('Account name (e.g. "Apex $50k #2"):');
  if (!name || !name.trim()) return;
  const acc = createAccount(name.trim());
  switchAccount(acc.id);
  showToast('Account created ✓');
}

function switchAccount(id) {
  state.accountId = id;
  state.expandedTradeId = null;
  state.view = 'calendar';
  state.selectedDate = null;
  localStorage.setItem(ACTIVE_ACCT_KEY, id);
  render();
}

function migrateToAccounts() {
  const existing = loadAccounts();
  if (existing.length > 0) {
    const saved = localStorage.getItem(ACTIVE_ACCT_KEY);
    state.accountId = (saved && existing.find(a => a.id === saved)) ? saved : existing[0].id;
    return;
  }
  let legacyData = { trades: [], journals: [] };
  const raw = localStorage.getItem(LEGACY_KEY);
  if (raw) {
    try { legacyData = JSON.parse(raw); } catch (e) {}
  }
  const sampleIds = new Set([
    'tr_20260424_0720_mnq_01','tr_20260424_0735_mnq_02','tr_20260424_0741_mnq_03',
    'tr_20250424_0720_mnq_01','tr_20250424_0735_mnq_02','tr_20250424_0741_mnq_03',
  ]);
  const realTrades   = (legacyData.trades   || []).filter(t => !sampleIds.has(t.id));
  const realJournals = (legacyData.journals || []).filter(j =>
    j.date !== '2026-04-24' && j.date !== '2025-04-24');

  const acc = createAccount('Account 1');
  if (realTrades.length > 0 || realJournals.length > 0) {
    localStorage.setItem(acctKey(acc.id), JSON.stringify({ trades: realTrades, journals: realJournals }));
    if (realTrades.length > 0) showToast('Existing trades migrated to Account 1 ✓');
  }
  state.accountId = acc.id;
  localStorage.setItem(ACTIVE_ACCT_KEY, acc.id);
}

// ─── DATA LAYER ───────────────────────────────────────────────────────────────
function loadDB() {
  try {
    const raw = localStorage.getItem(acctKey(state.accountId));
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { trades: [], journals: [] };
}

function saveDB(db) {
  localStorage.setItem(acctKey(state.accountId), JSON.stringify(db));
}

function getDB() { return loadDB(); }

function addTrade(trade) {
  const db = getDB();
  trade.id = 'tr_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
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

function netPnl(t) {
  return parseFloat((t.pnl - (t.fees || 0)).toFixed(2));
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
  return new Date(year, month, 1).getDay();
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
  return dateStr.slice(0, 7);
}

// ─── SESSION HELPERS ──────────────────────────────────────────────────────────
function detectSession(timeStr) {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const mins = h * 60 + m;
  if (mins >= 17*60 && mins < 18*60) return 'closed';      // 5–6pm  futures maintenance
  if (mins >= 16*60)                 return 'ah';           // 4–5pm  after hours equity
  if (mins >= 15*60)                 return 'power-hour';   // 3–4pm
  if (mins >= 10*60 + 30)            return 'midday';       // 10:30am–3pm
  if (mins >= 9*60 + 30)             return 'rth-open';     // 9:30–10:30am
  if (mins >= 8*60 + 30)             return 'pre-market';   // 8:30–9:30am
  if (mins >= 2*60)                  return 'london';       // 2–8:30am
  return 'asia';                                            // midnight–2am + 6pm–midnight handled above
}

function sessionForTrade(t) {
  return t.session || detectSession(t.time) || '';
}

// ─── R-MULTIPLE HELPERS ───────────────────────────────────────────────────────
function calcInitialR(stopPts, size, tickValue) {
  if (!stopPts || !size || !tickValue) return null;
  return parseFloat(Math.abs(stopPts * size * tickValue).toFixed(2));
}

function calcRealizedR(netPnlVal, initialR) {
  if (!initialR) return null;
  return parseFloat((netPnlVal / initialR).toFixed(2));
}

function fmtR(r) {
  if (r === null || r === undefined) return null;
  const sign = r > 0 ? '+' : '';
  return sign + r.toFixed(2) + 'R';
}

function tradeR(t) {
  const initR = calcInitialR(t.plannedStop, t.size, t.tickValue);
  return calcRealizedR(netPnl(t), initR);
}

// ─── DRAWDOWN HELPERS ─────────────────────────────────────────────────────────
function calcDrawdownSeries(trades) {
  const sorted = [...trades].sort((a, b) => (a.date + (a.time||'')).localeCompare(b.date + (b.time||'')));
  let equity = 0, peak = 0;
  return sorted.map(t => {
    equity += netPnl(t);
    if (equity > peak) peak = equity;
    const dd    = parseFloat((equity - peak).toFixed(2));
    const ddPct = peak > 0 ? parseFloat(((dd / peak) * 100).toFixed(2)) : 0;
    return { date: t.date, equity: parseFloat(equity.toFixed(2)), peak: parseFloat(peak.toFixed(2)), dd, ddPct };
  });
}

function getDrawdownStats(trades) {
  const series = calcDrawdownSeries(trades);
  if (!series.length) return { peak:0, currentDd:0, currentDdPct:0, maxDd:0, maxDdPct:0 };
  const last = series[series.length - 1];
  const maxDd    = Math.min(0, ...series.map(s => s.dd));
  const maxDdPct = Math.min(0, ...series.map(s => s.ddPct));
  return {
    peak: last.peak,
    currentDd: last.dd,
    currentDdPct: last.ddPct,
    maxDd: parseFloat(maxDd.toFixed(2)),
    maxDdPct: parseFloat(maxDdPct.toFixed(2)),
  };
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
function sparkline(values, w = 80, h = 20) {
  if (!values || values.length < 2) return '';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const n = values.length;
  const pts = values.map((v, i) => {
    const x = (i / (n - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  const lastVal = values[values.length - 1];
  const color = lastVal >= 0 ? '#00cc44' : '#ff2244';
  return `<svg class="kpi-sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.65"/></svg>`;
}

// ─── STATS CALCULATORS ────────────────────────────────────────────────────────
function calcStats(trades) {
  if (!trades.length) return { totalPnl:0, winRate:0, wins:0, losses:0, breakeven:0,
    avgWin:0, avgLoss:0, profitFactor:0, bestTrade:null, worstTrade:null };

  const wins   = trades.filter(t => netPnl(t) > 0);
  const losses = trades.filter(t => netPnl(t) < 0);
  const be     = trades.filter(t => netPnl(t) === 0);
  const totalPnl    = trades.reduce((s, t) => s + netPnl(t), 0);
  const grossWin    = wins.reduce((s, t) => s + netPnl(t), 0);
  const grossLoss   = Math.abs(losses.reduce((s, t) => s + netPnl(t), 0));
  const avgWin      = wins.length   ? grossWin  / wins.length   : 0;
  const avgLoss     = losses.length ? grossLoss / losses.length : 0;
  const winRate     = Math.round(wins.length / trades.length * 100);
  const profitFactor = grossLoss > 0 ? parseFloat((grossWin / grossLoss).toFixed(2)) : '∞';
  const sorted = [...trades].sort((a, b) => netPnl(a) - netPnl(b));
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

// ─── EXPORT / IMPORT ──────────────────────────────────────────────────────────
function exportJSON() {
  const db = getDB();
  const accounts = loadAccounts();
  const acc = accounts.find(a => a.id === state.accountId);
  const slug = (acc?.name || 'backup').replace(/\s+/g, '-').toLowerCase();
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tradelog-${slug}-backup.json`;
  a.click();
}

function importJSON(file) {
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.trades || !data.journals) throw new Error('Invalid format');
      if (!confirm('This will replace all data in the current account. Continue?')) return;
      saveDB(data);
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
  const rows = ['Date,Time,Symbol,Direction,Session,Entry,Exit,Size,Tick Value,Gross PnL,Fees,Net PnL,Planned Stop,Planned Target,Initial R,Realized R,Setup,Timeframe,Setup Grade,Exec Grade,Mistake,Notes'];
  trades.forEach(t => {
    const initR = calcInitialR(t.plannedStop, t.size, t.tickValue);
    const realR = calcRealizedR(netPnl(t), initR);
    rows.push([
      t.date, t.time, t.symbol, t.direction,
      sessionForTrade(t),
      t.entry, t.exit, t.size, t.tickValue, t.pnl, (t.fees || 0), netPnl(t),
      t.plannedStop || '', t.plannedTarget || '',
      initR || '', realR || '',
      `"${(t.setup  || '').replace(/"/g, '""')}"`,
      t.timeframe, t.setupGrade, t.execGrade, t.mistake,
      `"${(t.notes || '').replace(/"/g, '""')}"`,
    ].join(','));
  });
  const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'trades.csv';
  a.click();
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────
function fireProgressBar() {
  let bar = document.getElementById('page-progress');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'page-progress';
    document.body.appendChild(bar);
  }
  bar.style.transition = 'none';
  bar.style.width = '0%';
  bar.style.opacity = '1';
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      bar.style.transition = 'width 280ms ease';
      bar.style.width = '80%';
      setTimeout(() => {
        bar.style.width = '100%';
        setTimeout(() => {
          bar.style.opacity = '0';
          bar.style.transition = 'opacity 200ms ease';
        }, 200);
      }, 250);
    });
  });
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

// ─── TOPBAR ───────────────────────────────────────────────────────────────────
function renderTopbar() {
  const accounts = loadAccounts();
  const blown = isCurrentAccountBlown();
  const acctOptions = accounts.map(a =>
    `<option value="${a.id}" ${a.id === state.accountId ? 'selected' : ''}>${a.name}${a.blown ? ' (blown)' : ''}</option>`
  ).join('');

  return `
    <div class="topbar">
      <div class="logo"><span class="logo-glyph">▲</span>TRADE<span>LOG</span></div>
      <div class="acct-bar">
        <select class="acct-select ${blown ? 'acct-select-blown' : ''}" onchange="switchAccount(this.value)">${acctOptions}</select>
        <button class="acct-add" onclick="promptNewAccount()" title="New account">+</button>
      </div>
      <div class="nav-tabs">
        <button class="nav-tab ${state.view === 'calendar' ? 'active' : ''}"
          onclick="navigate('calendar')">Calendar</button>
        <button class="nav-tab ${state.view === 'stats' ? 'active' : ''}"
          onclick="navigate('stats')">Stats</button>
        <button class="nav-tab ${state.view === 'accounts' ? 'active' : ''}"
          onclick="navigate('accounts')">Accounts</button>
      </div>
      <div class="topbar-right">
        ${blown
          ? `<span class="blown-topbar-badge">BLOWN — VIEW ONLY</span>`
          : `<button class="btn btn-primary btn-sm" onclick="openAddTrade()">+ Add Trade</button>`}
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

  // Build day map
  const dayMap = {};
  trades.forEach(t => {
    if (!dayMap[t.date]) dayMap[t.date] = { pnl: 0, count: 0 };
    dayMap[t.date].pnl   += netPnl(t);
    dayMap[t.date].count++;
  });

  const journalMap = {};
  db.journals.forEach(j => { journalMap[j.date] = j; });

  // Drawdown by date: track which dates set a new drawdown low
  const ddSeries = calcDrawdownSeries(trades);
  const ddLowDates = new Set();
  let runningMinDd = 0;
  ddSeries.forEach(s => {
    if (s.dd < runningMinDd) {
      runningMinDd = s.dd;
      ddLowDates.add(s.date);
    }
  });

  // Daily loss limit from account settings
  const accounts = loadAccounts();
  const acc = accounts.find(a => a.id === state.accountId);
  const dailyLossLimit = acc?.dailyLossLimit;

  const daysInMonth  = getDaysInMonth(calYear, calMonth);
  const firstDay     = getFirstDayOfMonth(calYear, calMonth);
  const today        = todayStr();
  const prevMonthDays = getDaysInMonth(calYear, calMonth - 1 < 0 ? 11 : calMonth - 1);

  let cells = '';

  for (let i = 0; i < firstDay; i++) {
    const d = prevMonthDays - firstDay + 1 + i;
    cells += `<div class="cal-cell other-month"><span class="cal-date">${d}</span></div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const mm  = String(calMonth + 1).padStart(2, '0');
    const dd  = String(d).padStart(2, '0');
    const key = `${calYear}-${mm}-${dd}`;
    const data = dayMap[key];
    const isToday = key === today;

    let pnlHtml = '';
    let cls     = 'cal-cell';
    if (isToday) cls += ' today';

    // Daily loss limit highlights
    if (data && dailyLossLimit && data.pnl < 0) {
      const loss = Math.abs(data.pnl);
      if (loss >= dailyLossLimit) cls += ' limit-hit';
      else if (loss >= dailyLossLimit * 0.8) cls += ' limit-warn';
    }

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
      const ddBadge = ddLowDates.has(key) ? `<div class="cal-dd-badge">▼ DD low</div>` : '';
      pnlHtml = `
        <div class="cal-bottom">
          <div class="cal-pnl ${sign}">${fmtPnl(data.pnl)}</div>
          <div class="cal-meta">${data.count} trade${data.count !== 1 ? 's' : ''}</div>
          ${ddBadge}
        </div>`;
    }

    cells += `
      <div class="${cls}" onclick="openDay('${key}')">
        <span class="cal-date">${d}</span>
        ${psychHtml}
        ${pnlHtml}
      </div>`;
  }

  const totalCells = firstDay + daysInMonth;
  const remainder  = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remainder; i++) {
    cells += `<div class="cal-cell other-month"><span class="cal-date">${i}</span></div>`;
  }

  const dowHeaders = DAYS_OF_WEEK.map(d => `<div class="cal-dow">${d}</div>`).join('');

  const blownBanner = isCurrentAccountBlown() ? `
    <div class="blown-banner">
      <span class="blown-banner-icon">⛔</span>
      <span>This account is blown — <strong>view only</strong>. No new trades can be logged.</span>
    </div>` : '';

  return `
    <div class="view">
      ${blownBanner}
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
    all:     { label: 'Followed all rules',             cls: 'psych-good' },
    mostly:  { label: 'Mostly followed rules',          cls: 'psych-ok'   },
    some:    { label: 'Broke a few rules',               cls: 'psych-warn' },
    several: { label: 'Broke several rules',             cls: 'psych-bad'  },
    revenge: { label: 'Went off-plan / revenge traded', cls: 'psych-bad'  },
  };
  const rules = rulesMap[j.rules];

  const items = [
    j.mood      && `<div class="psych-item"><div class="psych-lbl">Mood</div><div class="psych-val">${moodMap[j.mood] || j.mood}</div></div>`,
    j.sleep     && `<div class="psych-item"><div class="psych-lbl">Sleep</div><div class="psych-val">${sleepMap[j.sleep] || j.sleep}</div></div>`,
    j.dayrating && `<div class="psych-item"><div class="psych-lbl">Day Rating</div><div class="psych-val">${ratingMap[j.dayrating] || j.dayrating + '/5'}</div></div>`,
    rules       && `<div class="psych-item"><div class="psych-lbl">Rules</div><div class="psych-val ${rules.cls}">${rules.label}</div></div>`,
    j.focus     && `<div class="psych-item psych-item-wide"><div class="psych-lbl">Today\'s Focus</div><div class="psych-val psych-focus-text">${j.focus}</div></div>`,
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
  const total   = trades.reduce((s, t) => s + netPnl(t), 0);
  const blown   = isCurrentAccountBlown();

  const tradeCards = trades.length
    ? trades.map(t => renderTradeCard(t, blown)).join('')
    : `<div class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">No trades logged for this day</div>
        ${!blown ? `<button class="btn btn-primary" style="margin-top:10px" onclick="openAddTrade()">Log a Trade</button>` : ''}
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
          ${!blown ? `<button class="btn btn-primary btn-sm" onclick="openAddTrade('${dateStr}')">+ Add Trade</button>` : ''}
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
          <span class="day-stat-value ${stats.bestTrade ? pnlClass(netPnl(stats.bestTrade)) : ''}">
            ${stats.bestTrade ? fmtPnl(netPnl(stats.bestTrade)) : '—'}
          </span>
        </div>
        <div class="day-stat">
          <span class="day-stat-label">Worst Trade</span>
          <span class="day-stat-value ${stats.worstTrade ? pnlClass(netPnl(stats.worstTrade)) : ''}">
            ${stats.worstTrade && netPnl(stats.worstTrade) < 0 ? fmtPnl(netPnl(stats.worstTrade)) : '—'}
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

function renderTradeCard(t, blown = false) {
  const isExpanded = state.expandedTradeId === t.id;
  const net = netPnl(t);
  const r = tradeR(t);
  const rFmt = fmtR(r);
  const sess = sessionForTrade(t);
  const sessLabel = sess ? SESSION_LABELS[sess] || sess : '';

  const sessCls = `trade-sess-${sess || 'normal'}`;
  return `
    <div class="trade-card ${sessCls}" id="tc-${t.id}">
      <div class="trade-card-head" onclick="toggleTrade('${t.id}')">
        <span class="trade-symbol">${t.symbol}</span>
        <span class="badge ${t.direction === 'long' ? 'badge-long' : 'badge-short'}">
          ${t.direction.toUpperCase()}
        </span>
        ${t.time ? `<span class="muted text-small">${t.time}</span>` : ''}
        ${sessLabel ? `<span class="trade-session-badge">${sessLabel}</span>` : ''}
        ${t.setupGrade ? `<span class="badge ${gradeClass(t.setupGrade)}" title="Setup">${t.setupGrade}</span>` : ''}
        ${t.execGrade  ? `<span class="badge ${gradeClass(t.execGrade)}"  title="Exec">${t.execGrade}</span>`  : ''}
        ${rFmt ? `<span class="trade-r-badge ${r >= 0 ? 'trade-r-pos' : 'trade-r-neg'}">${rFmt}</span>` : ''}
        <span class="trade-pnl ${pnlClass(net)}">${fmtPnl(net)}</span>
      </div>
      <div class="trade-card-body ${isExpanded ? 'open' : ''}">
        <div class="trade-card-body-inner">
          <div class="trade-detail-grid">
            <div class="trade-detail-item">
              <div class="tdl">${t.fills && t.fills.length > 1 ? 'Avg Entry' : 'Entry'}</div>
              <div class="tdv">${t.entry}</div>
            </div>
            <div class="trade-detail-item">
              <div class="tdl">${t.exitFills && t.exitFills.length > 1 ? 'Avg Exit' : 'Exit'}</div>
              <div class="tdv">${t.exit}</div>
            </div>
            <div class="trade-detail-item">
              <div class="tdl">Size</div>
              <div class="tdv">${t.size} × $${t.tickValue}/pt</div>
            </div>
            ${t.fills && t.fills.length > 1 ? `<div class="trade-detail-item" style="grid-column:span 3">
              <div class="tdl">Entry Fills</div>
              <div class="fills-breakdown">
                ${t.fills.map((f, i) => `<span class="fill-chip">E${i+1}: ${f.price} × ${f.size}</span>`).join('')}
              </div>
            </div>` : ''}
            ${t.exitFills && t.exitFills.length > 1 ? `<div class="trade-detail-item" style="grid-column:span 3">
              <div class="tdl">Exit Fills</div>
              <div class="fills-breakdown">
                ${t.exitFills.map((f, i) => `<span class="fill-chip">X${i+1}: ${f.price} × ${f.size}</span>`).join('')}
              </div>
            </div>` : ''}
            <div class="trade-detail-item">
              <div class="tdl">Gross PnL</div>
              <div class="tdv ${pnlClass(t.pnl)}">${fmtPnl(t.pnl)}</div>
            </div>
            <div class="trade-detail-item">
              <div class="tdl">Fees</div>
              <div class="tdv" style="color:${t.fees ? 'var(--red)' : 'var(--text3)'}">
                ${t.fees ? '−$' + Number(t.fees).toFixed(2) : '—'}
              </div>
            </div>
            <div class="trade-detail-item">
              <div class="tdl">Net PnL</div>
              <div class="tdv ${pnlClass(net)}">${fmtPnl(net)}</div>
            </div>
            ${t.plannedStop ? `<div class="trade-detail-item">
              <div class="tdl">Stop (pts)</div>
              <div class="tdv">${t.plannedStop}</div>
            </div>` : ''}
            ${t.plannedTarget ? `<div class="trade-detail-item">
              <div class="tdl">Target (pts)</div>
              <div class="tdv">${t.plannedTarget}</div>
            </div>` : ''}
            ${r !== null ? `<div class="trade-detail-item">
              <div class="tdl">Realized R</div>
              <div class="tdv ${pnlClass(net)}">${rFmt}</div>
            </div>` : ''}
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
          ${!blown ? `<div class="trade-actions">
            <button class="btn btn-ghost btn-sm" onclick="openEditTrade('${t.id}')">Edit</button>
            <button class="btn btn-danger btn-sm" onclick="confirmDeleteTrade('${t.id}')">Delete</button>
          </div>` : ''}
        </div>
      </div>
    </div>`;
}

function renderJournalPreview(j) {
  const moodMap  = { rough:'😤', off:'😟', neutral:'😐', good:'🙂', locked:'🔥' };
  const sleepMap = { terrible:'Terrible', poor:'Poor', okay:'Okay', good:'Good', great:'Great' };
  const biasMap  = { bullish:'Bullish', bearish:'Bearish', neutral:'Neutral', volatile:'High Vol' };
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

  // Build last-10-trading-days PnL for sparklines
  const sortedDays = Object.entries(
    trades.reduce((m, t) => { m[t.date] = (m[t.date] || 0) + netPnl(t); return m; }, {})
  ).sort((a, b) => a[0].localeCompare(b[0]));
  const last10 = sortedDays.slice(-10).map(e => e[1]);

  const kpis = [
    { label: 'Total PnL',     value: fmtPnl(s.totalPnl), cls: pnlClass(s.totalPnl), spark: last10 },
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
      ${k.spark && k.spark.length >= 2 ? sparkline(k.spark) : ''}
    </div>`).join('');

  return `
    <div class="view">
      <div class="kpi-grid">${kpiHtml}</div>
      ${renderEquityCurve(trades)}
      ${renderDrawdownPanel(trades)}
      <div class="stats-grid" style="margin-bottom:12px">
        <div>
          <div class="card">
            <div class="card-head"><span class="card-title">Session Breakdown</span></div>
            <div class="card-body">${renderSessionBreakdown(trades)}</div>
          </div>
        </div>
        <div>
          <div class="card">
            <div class="card-head"><span class="card-title">R-Multiple Distribution</span></div>
            <div class="card-body">${renderRDistribution(trades)}</div>
          </div>
        </div>
      </div>
      ${renderTimeHeatmap(trades)}
      <div class="stats-grid" style="margin-top:12px">
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
  trades.forEach(t => { dayMap[t.date] = (dayMap[t.date] || 0) + netPnl(t); });
  const vals = Object.values(dayMap);
  if (!vals.length) return '—';
  const best = Math.max(...vals);
  return best > 0 ? fmtPnl(best) : '—';
}

function getWorstDay(trades) {
  const dayMap = {};
  trades.forEach(t => { dayMap[t.date] = (dayMap[t.date] || 0) + netPnl(t); });
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

  const sorted = [...trades].sort((a, b) => (a.date + (a.time||'')).localeCompare(b.date + (b.time||'')));
  let cum = 0;
  const points = sorted.map(t => { cum += netPnl(t); return { date: t.date, cum: parseFloat(cum.toFixed(2)) }; });

  const W = 900, H = 200, PAD = { top:16, right:16, bottom:24, left:60 };
  const minY = Math.min(0, ...points.map(p => p.cum));
  const maxY = Math.max(0, ...points.map(p => p.cum));
  const rangeY = maxY - minY || 1;
  const rangeX = points.length - 1 || 1;

  const xPos = i => PAD.left + (i / rangeX) * (W - PAD.left - PAD.right);
  const yPos = v => PAD.top + (1 - (v - minY) / rangeY) * (H - PAD.top - PAD.bottom);
  const zeroY = yPos(0);

  const linePoints = points.map((p, i) => `${xPos(i).toFixed(1)},${yPos(p.cum).toFixed(1)}`).join(' ');
  const areaPoints = `${xPos(0).toFixed(1)},${zeroY.toFixed(1)} ` + linePoints + ` ${xPos(points.length-1).toFixed(1)},${zeroY.toFixed(1)}`;

  // Grid lines at auto-scaled intervals
  const gridInterval = (() => {
    const raw = rangeY / 5;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return Math.ceil(raw / mag) * mag;
  })();
  const gridLines = [];
  const gridStart = Math.ceil(minY / gridInterval) * gridInterval;
  for (let v = gridStart; v <= maxY; v += gridInterval) {
    const y = yPos(v);
    gridLines.push(`
      <line x1="${PAD.left}" y1="${y.toFixed(1)}" x2="${W - PAD.right}" y2="${y.toFixed(1)}"
        stroke="rgba(255,255,255,0.04)" stroke-width="1" stroke-dasharray="4,6"/>
      <text x="${PAD.left - 6}" y="${(y + 4).toFixed(1)}" text-anchor="end"
        font-size="10" font-family="IBM Plex Mono,monospace" fill="#3d5068">${fmtPnl(v, false)}</text>`);
  }

  const zeroLine = `<line x1="${PAD.left}" y1="${zeroY.toFixed(1)}" x2="${W - PAD.right}" y2="${zeroY.toFixed(1)}" stroke="rgba(255,255,255,0.10)" stroke-width="1" stroke-dasharray="4,4"/>`;

  const finalPnl = points[points.length - 1].cum;
  const lineColor = finalPnl >= 0 ? '#00cc44' : '#ff2244';
  const areaColor = finalPnl >= 0 ? 'rgba(0,204,68,0.07)' : 'rgba(255,34,68,0.07)';

  return `
    <div class="equity-wrap">
      <div class="equity-title">Equity Curve — ${fmtPnl(finalPnl)} total</div>
      <svg class="equity-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <clipPath id="chart-clip">
            <rect x="${PAD.left}" y="${PAD.top}" width="${W - PAD.left - PAD.right}" height="${H - PAD.top - PAD.bottom}"/>
          </clipPath>
        </defs>
        ${gridLines.join('')}
        ${zeroLine}
        <g clip-path="url(#chart-clip)">
          <polygon points="${areaPoints}" fill="${areaColor}"/>
          <polyline points="${linePoints}" fill="none" stroke="${lineColor}" stroke-width="2"/>
        </g>
      </svg>
    </div>`;
}

function renderDrawdownPanel(trades) {
  if (trades.length < 2) return `
    <div class="card" style="margin-bottom:12px">
      <div class="card-head"><span class="card-title">Drawdown</span></div>
      <div class="card-body"><div class="empty-text" style="color:var(--text3)">Log at least 2 trades to see drawdown</div></div>
    </div>`;

  const stats  = getDrawdownStats(trades);
  const series = calcDrawdownSeries(trades);
  const accounts = loadAccounts();
  const acc = accounts.find(a => a.id === state.accountId);
  const dailyLossLimit = acc?.dailyLossLimit;

  const W = 900, H = 90, PAD = { top:8, right:16, bottom:20, left:60 };
  const ddVals = series.map(s => s.dd);
  const minDD  = Math.min(0, ...ddVals) || -1;
  const n = series.length;
  const xPos = i => PAD.left + (i / Math.max(n - 1, 1)) * (W - PAD.left - PAD.right);
  const yPos = v => PAD.top + (1 - (v - minDD) / (0 - minDD)) * (H - PAD.top - PAD.bottom);
  const zeroY = yPos(0);

  const pts = series.map((s, i) => `${xPos(i).toFixed(1)},${yPos(s.dd).toFixed(1)}`).join(' ');
  const areaPoints = `${xPos(0).toFixed(1)},${zeroY.toFixed(1)} ${pts} ${xPos(n-1).toFixed(1)},${zeroY.toFixed(1)}`;

  const limitLine = dailyLossLimit ? (() => {
    const ly = yPos(-Math.abs(dailyLossLimit));
    if (ly < PAD.top || ly > H - PAD.bottom) return '';
    return `<line x1="${PAD.left}" y1="${ly.toFixed(1)}" x2="${W - PAD.right}" y2="${ly.toFixed(1)}"
      stroke="rgba(255,153,0,0.5)" stroke-width="1" stroke-dasharray="4,3"/>
      <text x="${PAD.left + 4}" y="${(ly - 3).toFixed(1)}" font-size="9" fill="#ff9900" font-family="IBM Plex Mono,monospace">Daily Limit</text>`;
  })() : '';

  const chart = `
    <svg width="100%" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <text x="${PAD.left - 4}" y="${(PAD.top + 10).toFixed(1)}" text-anchor="end" font-size="9" fill="#3d5068" font-family="IBM Plex Mono,monospace">$0</text>
      <text x="${PAD.left - 4}" y="${(H - PAD.bottom).toFixed(1)}" text-anchor="end" font-size="9" fill="#3d5068" font-family="IBM Plex Mono,monospace">${fmtPnl(minDD, false)}</text>
      <line x1="${PAD.left}" y1="${zeroY.toFixed(1)}" x2="${W - PAD.right}" y2="${zeroY.toFixed(1)}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
      ${limitLine}
      <polygon points="${areaPoints}" fill="rgba(255,34,68,0.10)"/>
      <polyline points="${pts}" fill="none" stroke="#ff2244" stroke-width="1.5"/>
    </svg>`;

  return `
    <div class="card" style="margin-bottom:12px">
      <div class="card-head"><span class="card-title">Drawdown</span></div>
      <div class="dd-kpis">
        <div class="dd-kpi">
          <div class="dd-kpi-label">Peak Equity</div>
          <div class="dd-kpi-val pos">${fmtPnl(stats.peak)}</div>
        </div>
        <div class="dd-kpi">
          <div class="dd-kpi-label">Current DD</div>
          <div class="dd-kpi-val ${stats.currentDd < 0 ? 'neg' : ''}">${fmtPnl(stats.currentDd)} (${Math.abs(stats.currentDdPct).toFixed(1)}%)</div>
        </div>
        <div class="dd-kpi">
          <div class="dd-kpi-label">Max DD</div>
          <div class="dd-kpi-val neg">${fmtPnl(stats.maxDd)} (${Math.abs(stats.maxDdPct).toFixed(1)}%)</div>
        </div>
        ${dailyLossLimit ? `<div class="dd-kpi">
          <div class="dd-kpi-label">Daily Loss Limit</div>
          <div class="dd-kpi-val" style="color:#ff9900">${fmtPnl(-Math.abs(dailyLossLimit), false)}</div>
        </div>` : ''}
      </div>
      <div style="padding:8px 14px 12px">${chart}</div>
    </div>`;
}

function renderSessionBreakdown(trades) {
  if (!trades.length) return `<div class="empty-text" style="color:var(--text3)">No trades yet</div>`;

  const map = {};
  SESSIONS.forEach(s => { map[s] = { trades: [], pnl: 0 }; });

  trades.forEach(t => {
    const sess = sessionForTrade(t);
    if (sess && map[sess]) {
      map[sess].trades.push(t);
      map[sess].pnl += netPnl(t);
    }
  });

  const anyData = SESSIONS.some(s => map[s].trades.length > 0);
  if (!anyData) return `<div class="empty-text" style="color:var(--text3)">No session data — log trades with a time to auto-tag sessions</div>`;

  const maxAbs = Math.max(1, ...SESSIONS.map(s => Math.abs(map[s].pnl)));

  return SESSIONS.map(sess => {
    const d = map[sess];
    if (!d.trades.length) return '';
    const wins = d.trades.filter(t => netPnl(t) > 0).length;
    const wr   = Math.round(wins / d.trades.length * 100);
    const barW = Math.round(Math.abs(d.pnl) / maxAbs * 100);
    return `
      <div class="session-row">
        <div class="session-label">${SESSION_FULL[sess]}</div>
        <div class="session-bar-wrap">
          <div class="session-bar ${d.pnl >= 0 ? 'pos-bar' : 'neg-bar'}" style="width:${barW}%"></div>
        </div>
        <span class="session-pnl ${pnlClass(d.pnl)}">${fmtPnl(d.pnl)}</span>
        <span class="session-meta">${d.trades.length}T · ${wr}%W</span>
      </div>`;
  }).join('');
}

function renderRDistribution(trades) {
  const rTrades = trades.filter(t => t.plannedStop && t.size && t.tickValue);
  if (!rTrades.length) return `<div class="empty-text" style="color:var(--text3)">Add "Planned Stop" when logging trades to see R-multiple analysis</div>`;

  const buckets = [
    { label: '< −2R',    min: -Infinity, max: -2 },
    { label: '−2 to −1R', min: -2,       max: -1 },
    { label: '−1 to 0R',  min: -1,       max:  0 },
    { label: '0 to 1R',   min:  0,       max:  1 },
    { label: '1 to 2R',   min:  1,       max:  2 },
    { label: '> 2R',      min:  2,       max: Infinity },
  ];

  const rVals = rTrades.map(t => {
    const initR = calcInitialR(t.plannedStop, t.size, t.tickValue);
    return { r: calcRealizedR(netPnl(t), initR), net: netPnl(t) };
  }).filter(x => x.r !== null);

  const counts = buckets.map(b =>
    rVals.filter(x => x.r >= b.min && x.r < b.max).length
  );

  const max = Math.max(...counts, 1);
  const rOnly = rVals.map(x => x.r);
  const avgR  = rOnly.length ? (rOnly.reduce((a, b) => a + b, 0) / rOnly.length) : 0;
  const wins  = rOnly.filter(r => r > 0);
  const losses = rOnly.filter(r => r <= 0);
  const avgWinR  = wins.length   ? wins.reduce((a, b) => a + b, 0) / wins.length   : 0;
  const avgLossR = losses.length ? Math.abs(losses.reduce((a, b) => a + b, 0)) / losses.length : 0;
  const wr = rOnly.length ? wins.length / rOnly.length : 0;
  const expectancy = wr * avgWinR - (1 - wr) * avgLossR;

  return `
    <div style="display:flex;gap:20px;margin-bottom:14px;flex-wrap:wrap;">
      <div><div class="tdl">Avg R</div><div class="tdv ${avgR >= 0 ? 'pos' : 'neg'}">${avgR >= 0 ? '+' : ''}${avgR.toFixed(2)}R</div></div>
      <div><div class="tdl">Expectancy</div><div class="tdv ${expectancy >= 0 ? 'pos' : 'neg'}">${expectancy >= 0 ? '+' : ''}${expectancy.toFixed(2)}R</div></div>
      <div><div class="tdl">Avg Win R</div><div class="tdv pos">+${avgWinR.toFixed(2)}R</div></div>
      <div><div class="tdl">Avg Loss R</div><div class="tdv neg">−${avgLossR.toFixed(2)}R</div></div>
    </div>
    ${buckets.map((b, i) => `
      <div class="r-bar-row">
        <span class="r-bar-label">${b.label}</span>
        <div class="r-bar-wrap">
          <div class="r-bar-fill ${b.min >= 0 ? 'r-pos' : 'r-neg'}" style="width:${Math.round(counts[i] / max * 100)}%"></div>
        </div>
        <span class="r-bar-count">${counts[i]}</span>
      </div>`).join('')}`;
}

function renderTimeHeatmap(trades) {
  const grid = HEATMAP_DAYS.map(() => HEATMAP_HOURS.map(() => ({ pnl: 0, count: 0 })));

  trades.forEach(t => {
    if (!t.time) return;
    const [h, m] = t.time.split(':').map(Number);
    const mins = h * 60 + m;
    const dow  = new Date(t.date).getDay();
    const dayIdx  = HEATMAP_DAY_IDX.indexOf(dow);
    if (dayIdx < 0) return;
    const hourIdx = HEATMAP_RANGES.findIndex(([s, e]) => mins >= s && mins < e);
    if (hourIdx < 0) return;
    grid[dayIdx][hourIdx].pnl   += netPnl(t);
    grid[dayIdx][hourIdx].count++;
  });

  let maxPnl = 0;
  grid.forEach(row => row.forEach(c => { if (Math.abs(c.pnl) > maxPnl) maxPnl = Math.abs(c.pnl); }));
  if (maxPnl === 0) maxPnl = 1;

  const headerCells = HEATMAP_HOURS.map(h => `<div class="hm-cell hm-header">${h}</div>`).join('');

  const rows = HEATMAP_DAYS.map((day, di) => {
    const cells = grid[di].map((cell, hi) => {
      if (cell.count === 0) return `<div class="hm-cell hm-empty"></div>`;
      const intensity = Math.min(1, Math.abs(cell.pnl) / maxPnl);
      const alpha = 0.15 + intensity * 0.75;
      const bg = cell.pnl > 0
        ? `rgba(0,229,255,${alpha.toFixed(2)})`
        : `rgba(255,34,68,${alpha.toFixed(2)})`;
      const textColor = intensity > 0.55 ? '#000011' : cell.pnl > 0 ? '#00e5ff' : '#ff2244';
      const short = (cell.pnl >= 0 ? '+' : '-') + '$' + Math.abs(cell.pnl).toFixed(0);
      return `<div class="hm-cell hm-data" style="background:${bg};color:${textColor}"
        onclick="heatmapFilter(${di},${hi})"
        title="${HEATMAP_DAYS[di]} ${HEATMAP_HOURS[hi]}: ${fmtPnl(cell.pnl)} (${cell.count} trade${cell.count!==1?'s':''})">
        <span class="hm-val">${short}</span>
      </div>`;
    }).join('');
    return `<div class="hm-row"><div class="hm-day-label">${day}</div>${cells}</div>`;
  }).join('');

  return `
    <div class="card" style="margin-bottom:12px">
      <div class="card-head">
        <span class="card-title">Time of Day Heatmap</span>
        <span class="hm-hint">Click a cell to view those trades</span>
      </div>
      <div class="heatmap-wrap" style="padding:12px">
        <div class="hm-grid">
          <div class="hm-row"><div class="hm-day-label"></div>${headerCells}</div>
          ${rows}
        </div>
        <div id="heatmap-trade-list"></div>
      </div>
    </div>`;
}

function heatmapFilter(dayIdx, hourIdx) {
  const [start, end] = HEATMAP_RANGES[hourIdx];
  const dow  = HEATMAP_DAY_IDX[dayIdx];
  const filtered = getAllTrades().filter(t => {
    if (!t.time) return false;
    const [h, m] = t.time.split(':').map(Number);
    const mins = h * 60 + m;
    return new Date(t.date).getDay() === dow && mins >= start && mins < end;
  });
  const container = document.getElementById('heatmap-trade-list');
  if (!container) return;
  if (!filtered.length) { container.innerHTML = ''; return; }
  container.innerHTML =
    `<div class="hm-filter-label">${HEATMAP_DAYS[dayIdx]} · ${HEATMAP_HOURS[hourIdx]} — ${filtered.length} trade${filtered.length!==1?'s':''}</div>` +
    `<div class="trade-list" style="margin-top:6px">${filtered.map(t => renderTradeCard(t)).join('')}</div>`;
}

function renderBreakdownTable(trades, type) {
  if (!trades.length) return `<div class="empty-state" style="padding:24px"><div class="empty-text">No trades yet</div></div>`;

  const keyFn = type === 'monthly' ? monthKey : isoWeekKey;
  const groups = groupBy(trades, keyFn);
  const keys   = Object.keys(groups).sort().reverse();

  const rows = keys.map(k => {
    const ts  = groups[k];
    const s   = calcStats(ts);
    const pnl = ts.reduce((acc, t) => acc + netPnl(t), 0);
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
    map[key].pnl += netPnl(t);
  });

  return Object.entries(map)
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([setup, d]) => {
      const wins = d.trades.filter(t => netPnl(t) > 0).length;
      const wr   = Math.round(wins / d.trades.length * 100);
      return `
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:4px;">
            <span style="font-size:13px;color:var(--text1);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${setup}</span>
            <span class="num ${pnlClass(d.pnl)}">${fmtPnl(d.pnl)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div style="flex:1;height:4px;background:var(--bg3);">
              <div style="height:100%;width:${wr}%;background:${d.pnl>=0?'var(--cyan)':'var(--red)'};"></div>
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

// ─── ACCOUNTS VIEW ────────────────────────────────────────────────────────────
function renderAccounts() {
  const accounts = loadAccounts();

  const cards = accounts.map(acc => {
    let db = { trades: [], journals: [] };
    try {
      const raw = localStorage.getItem(acctKey(acc.id));
      if (raw) db = JSON.parse(raw);
    } catch (e) {}

    const trades    = db.trades || [];
    const totalNet  = trades.reduce((s, t) => s + netPnl(t), 0);
    const dates     = trades.map(t => t.date).sort();
    const dateRange = dates.length
      ? (dates[0] === dates[dates.length - 1]
          ? fmtShortDate(dates[0])
          : fmtShortDate(dates[0]) + ' – ' + fmtShortDate(dates[dates.length - 1]))
      : 'No trades yet';
    const isActive = acc.id === state.accountId;

    return `
      <div class="acct-card ${isActive ? 'acct-card-active' : ''} ${acc.blown ? 'acct-card-blown' : ''}">
        <div class="acct-card-left">
          <div class="acct-card-badges">
            ${isActive ? '<span class="acct-active-badge">Active</span>' : ''}
            ${acc.blown ? `<span class="acct-blown-badge">Blown${acc.blownAt ? ' · ' + fmtShortDate(acc.blownAt) : ''}</span>` : ''}
            ${acc.dailyLossLimit ? `<span class="acct-loss-limit-badge">Limit: $${acc.dailyLossLimit}</span>` : ''}
          </div>
          <div class="acct-card-name" onclick="renameAccount('${acc.id}')" title="Click to rename">${acc.name}</div>
          <div class="acct-card-meta">${dateRange} · ${trades.length} trade${trades.length !== 1 ? 's' : ''}</div>
        </div>
        <div class="acct-card-right">
          <div class="acct-card-pnl ${trades.length ? pnlClass(totalNet) : ''}">${trades.length ? fmtPnl(totalNet) : '—'}</div>
          <div class="acct-card-actions">
            ${!isActive ? `<button class="btn btn-primary btn-sm" onclick="switchAccount('${acc.id}')">Switch</button>` : ''}
            <button class="btn btn-ghost btn-sm" onclick="renameAccount('${acc.id}')">Rename</button>
            <button class="btn btn-ghost btn-sm" onclick="setDailyLossLimit('${acc.id}')">Loss Limit</button>
            <button class="btn ${acc.blown ? 'btn-ghost' : 'btn-danger'} btn-sm" onclick="toggleBlownAccount('${acc.id}')">
              ${acc.blown ? 'Restore' : 'Mark Blown'}
            </button>
            ${accounts.length > 1 ? `<button class="btn btn-danger btn-sm" onclick="deleteAccount('${acc.id}')">Delete</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');

  return `
    <div class="view">
      <div class="accounts-header">
        <span class="accounts-title">Accounts</span>
        <button class="btn btn-primary btn-sm" onclick="promptNewAccount()">+ New Account</button>
      </div>
      <div class="accounts-list">${cards}</div>
    </div>`;
}

// ─── TRADE MODAL ──────────────────────────────────────────────────────────────
function renderTradeModal(prefillDate, existingTrade) {
  const t = existingTrade || {};
  const isEdit   = !!existingTrade;
  const dateVal  = t.date || prefillDate || todayStr();

  const knownSym  = t.symbol && SYMBOLS.includes(t.symbol.toUpperCase());
  const symSelVal = knownSym ? t.symbol.toUpperCase() : (t.symbol ? 'OTHER' : '');
  const symOpts   = SYMBOLS.map(s =>
    `<option value="${s}" ${symSelVal === s ? 'selected' : ''}>${s}</option>`
  ).join('');

  const sessOpts = SESSIONS.map(s =>
    `<option value="${s}" ${(t.session === s) ? 'selected' : ''}>${SESSION_FULL[s]}</option>`
  ).join('');

  const gross = (t.entry && t.exit && t.size) ? t.pnl : null;
  const net   = (gross !== null) ? netPnl(t) : null;

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
              <select id="f-symbol-select" onchange="onSymbolChange(this)">
                <option value="">Select...</option>
                ${symOpts}
                <option value="OTHER" ${symSelVal === 'OTHER' ? 'selected' : ''}>Other...</option>
              </select>
              <input id="f-symbol-custom" type="text"
                style="margin-top:4px;${symSelVal === 'OTHER' ? '' : 'display:none'}"
                placeholder="Symbol" value="${!knownSym && t.symbol ? t.symbol : ''}"
                oninput="this.value=this.value.toUpperCase()">
            </div>
            <div class="field"><label>Direction</label>
              <select id="f-direction" onchange="updatePnlPreview()">
                <option value="long"  ${t.direction==='long' ?'selected':''}>Long</option>
                <option value="short" ${t.direction==='short'?'selected':''}>Short</option>
              </select>
            </div>
            <div class="field"><label>Date</label>
              <input id="f-date" type="date" value="${dateVal}">
            </div>
            <div class="field"><label>Time</label>
              <input id="f-time" type="time" value="${t.time||''}" oninput="onTimeChange(this)">
            </div>
          </div>

          <div class="form-grid g4" style="margin-top:10px">
            <div class="field" style="grid-column:span 2"><label>Session</label>
              <select id="f-session">
                <option value="">Auto-detect from time</option>
                ${sessOpts}
              </select>
              <div class="session-suggest" id="session-suggest"></div>
            </div>
          </div>

          <div class="form-section-label" style="margin-top:14px">Entry Fills</div>
          <div id="fills-list" class="fills-list">
            ${(t.fills && t.fills.length > 0
              ? t.fills
              : [{ price: t.entry || '', size: t.size || '' }]
            ).map((f, i) => fillRowHtml(f.price, f.size, i)).join('')}
          </div>
          <div class="fills-footer">
            <button class="btn btn-ghost btn-sm" onclick="addFill()">+ Add Fill</button>
            <div class="fill-avg-display" id="fill-avg-display"></div>
          </div>

          <div class="form-section-label" style="margin-top:14px">Exit Fills</div>
          <div id="exit-fills-list" class="fills-list">
            ${(t.exitFills && t.exitFills.length > 0
              ? t.exitFills
              : [{ price: t.exit || '', size: t.size || '' }]
            ).map((f) => exitFillRowHtml(f.price, f.size)).join('')}
          </div>
          <div class="fills-footer">
            <button class="btn btn-ghost btn-sm" onclick="addExitFill()">+ Add Exit</button>
            <div class="fill-avg-display" id="exit-fill-avg-display"></div>
          </div>

          <div class="form-grid g2" style="margin-top:10px">
            <div class="field"><label>$/Point</label>
              <input id="f-tick" type="number" step="0.01" value="${t.tickValue||''}" placeholder="e.g. 2 = MNQ" oninput="updatePnlPreview()">
            </div>
          </div>

          <div class="form-grid g4" style="margin-top:10px">
            <div class="field"><label>Commission / Fees $</label>
              <input id="f-fees" type="number" step="0.01" min="0" value="${t.fees||''}" placeholder="0.00" oninput="updatePnlPreview()">
            </div>
            <div class="field"><label>Planned Stop (pts)</label>
              <input id="f-stop" type="number" step="0.25" min="0" value="${t.plannedStop||''}" placeholder="e.g. 4" oninput="updateRPreview()">
            </div>
            <div class="field"><label>Planned Target (pts)</label>
              <input id="f-target" type="number" step="0.25" min="0" value="${t.plannedTarget||''}" placeholder="e.g. 8" oninput="updateRPreview()">
            </div>
          </div>

          <div id="r-preview-bar" class="pnl-preview-bar" style="display:none">
            <div class="pnl-preview-item">
              <span class="pnl-preview-label">Initial R</span>
              <span class="pnl-preview-value" id="r-initial">—</span>
            </div>
            <div class="pnl-preview-item">
              <span class="pnl-preview-label">R:R Ratio</span>
              <span class="pnl-preview-value" id="r-ratio">—</span>
            </div>
          </div>

          <div id="pnl-preview-bar" class="pnl-preview-bar" style="${gross !== null ? '' : 'display:none'}">
            <div class="pnl-preview-item">
              <span class="pnl-preview-label">Gross</span>
              <span class="pnl-preview-value ${gross !== null ? pnlClass(gross) : ''}" id="pnl-preview-gross">${gross !== null ? fmtPnl(gross) : ''}</span>
            </div>
            <div class="pnl-preview-item">
              <span class="pnl-preview-label">Fees</span>
              <span class="pnl-preview-fees" id="pnl-preview-fees">${t.fees ? '−$' + Number(t.fees).toFixed(2) : '$0.00'}</span>
            </div>
            <div class="pnl-preview-item">
              <span class="pnl-preview-label">Net PnL</span>
              <span class="pnl-preview-value ${net !== null ? pnlClass(net) : ''}" id="pnl-preview-net">${net !== null ? fmtPnl(net) : ''}</span>
            </div>
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
          <div class="field" style="margin-top:12px"><label>Emotions &amp; Execution Notes</label>
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

// ─── ENTRY FILLS ──────────────────────────────────────────────────────────────
function fillRowHtml(price, size) {
  return `<div class="fill-row">
    <div class="field" style="flex:2;min-width:0">
      <label>Price</label>
      <input type="number" class="fill-price" step="0.01" value="${price||''}" placeholder="0.00" oninput="updateFillAvg()">
    </div>
    <div class="field" style="flex:1;min-width:0">
      <label>Contracts</label>
      <input type="number" class="fill-qty" min="1" value="${size||''}" placeholder="1" oninput="updateFillAvg()">
    </div>
    <button class="btn-icon fill-remove" onclick="removeFill(this)" title="Remove fill">×</button>
  </div>`;
}

function addFill() {
  const list = document.getElementById('fills-list');
  if (!list) return;
  const div = document.createElement('div');
  div.innerHTML = fillRowHtml('', '');
  list.appendChild(div.firstElementChild);
  updateFillAvg();
}

function removeFill(btn) {
  const list = document.getElementById('fills-list');
  if (!list || list.querySelectorAll('.fill-row').length <= 1) return;
  btn.closest('.fill-row').remove();
  updateFillAvg();
}

function collectFills() {
  return [...document.querySelectorAll('#fills-list .fill-row')].map(row => ({
    price: parseFloat(row.querySelector('.fill-price')?.value) || 0,
    size:  parseFloat(row.querySelector('.fill-qty')?.value)  || 0,
  })).filter(f => f.price && f.size);
}

function updateFillAvg() {
  const fills   = collectFills();
  const display = document.getElementById('fill-avg-display');
  if (!display) return;
  if (!fills.length) { display.innerHTML = ''; updatePnlPreview(); return; }
  const totalQty = fills.reduce((s, f) => s + f.size, 0);
  const avgPrice = fills.reduce((s, f) => s + f.price * f.size, 0) / totalQty;
  display.innerHTML =
    `<span class="fill-avg-label">Avg entry</span>` +
    `<span class="fill-avg-price">${avgPrice.toFixed(2)}</span>` +
    `<span class="fill-avg-sep">·</span>` +
    `<span class="fill-avg-qty">${totalQty} contract${totalQty !== 1 ? 's' : ''}</span>`;
  updatePnlPreview();
}

function exitFillRowHtml(price, size) {
  return `<div class="fill-row exit-fill-row">
    <div class="field" style="flex:2;min-width:0">
      <label>Price</label>
      <input type="number" class="exit-fill-price" step="0.01" value="${price||''}" placeholder="0.00" oninput="updateExitFillAvg()">
    </div>
    <div class="field" style="flex:1;min-width:0">
      <label>Contracts</label>
      <input type="number" class="exit-fill-qty" min="1" value="${size||''}" placeholder="1" oninput="updateExitFillAvg()">
    </div>
    <button class="btn-icon fill-remove" onclick="removeExitFill(this)" title="Remove exit">×</button>
  </div>`;
}

function addExitFill() {
  const list = document.getElementById('exit-fills-list');
  if (!list) return;
  const div = document.createElement('div');
  div.innerHTML = exitFillRowHtml('', '');
  list.appendChild(div.firstElementChild);
  updateExitFillAvg();
}

function removeExitFill(btn) {
  const list = document.getElementById('exit-fills-list');
  if (!list || list.querySelectorAll('.exit-fill-row').length <= 1) return;
  btn.closest('.exit-fill-row').remove();
  updateExitFillAvg();
}

function collectExitFills() {
  return [...document.querySelectorAll('#exit-fills-list .exit-fill-row')].map(row => ({
    price: parseFloat(row.querySelector('.exit-fill-price')?.value) || 0,
    size:  parseFloat(row.querySelector('.exit-fill-qty')?.value)  || 0,
  })).filter(f => f.price && f.size);
}

function updateExitFillAvg() {
  const fills   = collectExitFills();
  const display = document.getElementById('exit-fill-avg-display');
  if (!display) return;
  if (!fills.length) { display.innerHTML = ''; updatePnlPreview(); return; }
  const totalQty = fills.reduce((s, f) => s + f.size, 0);
  const avgPrice = fills.reduce((s, f) => s + f.price * f.size, 0) / totalQty;
  display.innerHTML =
    `<span class="fill-avg-label">Avg exit</span>` +
    `<span class="fill-avg-price">${avgPrice.toFixed(2)}</span>` +
    `<span class="fill-avg-sep">·</span>` +
    `<span class="fill-avg-qty">${totalQty} contract${totalQty !== 1 ? 's' : ''}</span>`;
  updatePnlPreview();
}

function onSymbolChange(sel) {
  const custom = document.getElementById('f-symbol-custom');
  if (!sel || !custom) return;
  const isOther = sel.value === 'OTHER' || sel.value === '';
  custom.style.display = isOther ? 'block' : 'none';
  if (!isOther && SYMBOL_TICK[sel.value]) {
    const tickInput = document.getElementById('f-tick');
    if (tickInput) tickInput.value = SYMBOL_TICK[sel.value];
    updatePnlPreview();
  }
}

function onTimeChange(input) {
  const suggest = document.getElementById('session-suggest');
  const sessSelect = document.getElementById('f-session');
  if (!suggest || !input.value) return;
  const sess = detectSession(input.value);
  if (sess && sessSelect && !sessSelect.value) {
    suggest.textContent = `↳ Auto: ${SESSION_FULL[sess]} — click to apply`;
    suggest.className = 'session-suggest show';
    suggest.onclick = () => {
      sessSelect.value = sess;
      suggest.className = 'session-suggest';
    };
  } else {
    suggest.className = 'session-suggest';
  }
}

function updatePnlPreview() {
  const fills     = collectFills();
  const exitFills = collectExitFills();
  const totalSize = fills.reduce((s, f) => s + f.size, 0);
  const exitSize  = exitFills.reduce((s, f) => s + f.size, 0);
  const entry = totalSize ? fills.reduce((s, f) => s + f.price * f.size, 0) / totalSize : 0;
  const exit  = exitSize  ? exitFills.reduce((s, f) => s + f.price * f.size, 0) / exitSize : 0;
  const size  = totalSize || exitSize;
  const tick  = parseFloat(document.getElementById('f-tick')?.value)  || 1;
  const fees  = parseFloat(document.getElementById('f-fees')?.value)  || 0;
  const dir   = document.getElementById('f-direction')?.value || 'long';
  const bar   = document.getElementById('pnl-preview-bar');
  if (!bar) return;

  if (!entry || !exit || !size) { bar.style.display = 'none'; updateRPreview(); return; }

  const gross = calcPnl(entry, exit, size, tick, dir);
  const net   = parseFloat((gross - fees).toFixed(2));

  bar.style.display = 'flex';

  const grossEl = document.getElementById('pnl-preview-gross');
  const feesEl  = document.getElementById('pnl-preview-fees');
  const netEl   = document.getElementById('pnl-preview-net');

  if (grossEl) { grossEl.textContent = fmtPnl(gross); grossEl.className = 'pnl-preview-value ' + pnlClass(gross); }
  if (feesEl)  { feesEl.textContent = fees > 0 ? '−$' + fees.toFixed(2) : '$0.00'; }
  if (netEl)   { netEl.textContent = fmtPnl(net); netEl.className = 'pnl-preview-value ' + pnlClass(net); }

  updateRPreview();
}

function updateRPreview() {
  const stop   = parseFloat(document.getElementById('f-stop')?.value)   || 0;
  const target = parseFloat(document.getElementById('f-target')?.value) || 0;
  const fills  = collectFills();
  const size   = fills.reduce((s, f) => s + f.size, 0);
  const tick   = parseFloat(document.getElementById('f-tick')?.value)   || 1;
  const bar    = document.getElementById('r-preview-bar');
  if (!bar) return;

  if (!stop || !size) { bar.style.display = 'none'; return; }

  const initR = calcInitialR(stop, size, tick);
  const ratio = target && stop ? (target / stop).toFixed(2) : null;

  bar.style.display = 'flex';
  const initEl  = document.getElementById('r-initial');
  const ratioEl = document.getElementById('r-ratio');
  if (initEl)  initEl.textContent  = initR ? fmtPnl(initR, false) : '—';
  if (ratioEl) ratioEl.textContent = ratio ? '1 : ' + ratio : '—';
}

// ─── JOURNAL MODAL ────────────────────────────────────────────────────────────
function renderJournalModal(dateStr) {
  const j = getJournalForDate(dateStr) || {};

  const moodOpts = [
    { v:'rough',   icon:'😤', label:'Rough'     },
    { v:'off',     icon:'😟', label:'Off'       },
    { v:'neutral', icon:'😐', label:'Neutral'   },
    { v:'good',    icon:'🙂', label:'Good'      },
    { v:'locked',  icon:'🔥', label:'Locked In' },
  ];
  const sleepOpts  = ['Terrible','Poor','Okay','Good','Great'].map(v => v.toLowerCase());
  const ratingOpts = [
    {v:1,icon:'💀'},{v:2,icon:'😓'},{v:3,icon:'😐'},{v:4,icon:'😊'},{v:5,icon:'🏆'}
  ];

  const moodBtns = moodOpts.map(o => `
    <div class="mood-btn ${j.mood===o.v?'mood-selected':''}" data-mood="${o.v}"
      onclick="selectPick('mood',this)"
      style="flex:1;background:${j.mood===o.v?'var(--cyan-d)':'var(--bg2)'};border:1px solid ${j.mood===o.v?'var(--cyan)':'var(--border)'};
      padding:7px 4px;cursor:pointer;text-align:center;">
      <div style="font-size:18px;margin-bottom:2px">${o.icon}</div>
      <div style="font-size:10px;color:var(--text2)">${o.label}</div>
    </div>`).join('');

  const sleepBtns = sleepOpts.map(v => `
    <div class="sleep-btn ${j.sleep===v?'sleep-selected':''}" data-sleep="${v}"
      onclick="selectPick('sleep',this)"
      style="flex:1;background:var(--bg2);border:1px solid ${j.sleep===v?'var(--blue)':'var(--border)'};
      padding:6px 4px;cursor:pointer;text-align:center;
      font-size:11px;color:${j.sleep===v?'var(--blue)':'var(--text2)'}">
      ${v.charAt(0).toUpperCase()+v.slice(1)}
    </div>`).join('');

  const ratingBtns = ratingOpts.map(o => `
    <div class="rating-btn" data-rating="${o.v}"
      onclick="selectPick('rating',this)"
      style="flex:1;background:${+j.dayrating===o.v?'var(--cyan-d)':'var(--bg2)'};border:1px solid ${+j.dayrating===o.v?'var(--cyan)':'var(--border)'};
      padding:7px 4px;cursor:pointer;text-align:center;">
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

          <div class="form-section-label">Personal &amp; Mindset</div>
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

const modalPicks = { mood: '', sleep: '', rating: '' };

function selectPick(type, el) {
  const attr    = { mood:'data-mood', sleep:'data-sleep', rating:'data-rating' }[type];
  const groupId = { mood:'mood-group', sleep:'sleep-group', rating:'rating-group' }[type];
  const group   = document.getElementById(groupId);
  if (!group) return;

  const isCyan   = type === 'mood' || type === 'rating';
  const selColor = isCyan ? 'var(--cyan)' : 'var(--blue)';
  const selBg    = isCyan ? 'var(--cyan-d)' : 'rgba(79,168,255,0.1)';

  group.querySelectorAll('[data-mood],[data-sleep],[data-rating]').forEach(b => {
    b.style.borderColor = 'var(--border)';
    b.style.background  = 'var(--bg2)';
    if (type === 'sleep') b.style.color = 'var(--text2)';
  });

  el.style.borderColor = selColor;
  el.style.background  = selBg;
  if (type === 'sleep') el.style.color = selColor;

  modalPicks[type] = el.getAttribute(attr);
}

function saveJournalForm(dateStr) {
  const g = id => document.getElementById(id)?.value?.trim() || '';
  const journal = {
    date:        dateStr,
    mood:        modalPicks.mood   || '',
    sleep:       modalPicks.sleep  || '',
    dayrating:   modalPicks.rating || '',
    personal:    g('j-personal'),
    bias:        document.getElementById('j-bias')?.value  || '',
    conf:        document.getElementById('j-conf')?.value  || '',
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
  updateFillAvg();
  updateExitFillAvg();
}

function openEditTrade(id) {
  const trade = getAllTrades().find(t => t.id === id);
  if (!trade) return;
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = renderTradeModal(trade.date, trade);
  updateFillAvg();
  updateExitFillAvg();
}

function openJournalModal(dateStr) {
  const modalRoot = document.getElementById('modal-root');
  modalRoot.innerHTML = renderJournalModal(dateStr);
  const j = getJournalForDate(dateStr);
  if (j) {
    modalPicks.mood   = j.mood      || '';
    modalPicks.sleep  = j.sleep     || '';
    modalPicks.rating = j.dayrating || '';
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
  const symSel = document.getElementById('f-symbol-select')?.value;
  const symbol = symSel === 'OTHER' || symSel === ''
    ? document.getElementById('f-symbol-custom')?.value?.trim()?.toUpperCase()
    : symSel;
  const fills     = collectFills();
  const exitFills = collectExitFills();
  const entrySize = fills.reduce((s, f) => s + f.size, 0);
  const exitSize  = exitFills.reduce((s, f) => s + f.size, 0);
  const size      = entrySize || exitSize;
  const entry     = entrySize ? parseFloat((fills.reduce((s, f) => s + f.price * f.size, 0) / entrySize).toFixed(2)) : 0;
  const exit      = exitSize  ? parseFloat((exitFills.reduce((s, f) => s + f.price * f.size, 0) / exitSize).toFixed(2)) : 0;
  const tick      = parseFloat(document.getElementById('f-tick')?.value) || 1;
  const fees      = parseFloat(document.getElementById('f-fees')?.value) || 0;

  if (!symbol || !entry || !exit || !size) {
    showToast('Fill in symbol, entry fill(s), exit fill(s)', true);
    return;
  }
  const dir = document.getElementById('f-direction').value;
  const pnl = calcPnl(entry, exit, size, tick, dir);

  const timeVal   = document.getElementById('f-time').value;
  const sessVal   = document.getElementById('f-session').value;
  const finalSess = sessVal || (timeVal ? detectSession(timeVal) : '');

  const stopVal   = parseFloat(document.getElementById('f-stop')?.value) || null;
  const targetVal = parseFloat(document.getElementById('f-target')?.value) || null;

  const trade = {
    date:          document.getElementById('f-date').value,
    time:          timeVal,
    session:       finalSess,
    symbol, direction: dir, entry, exit, size, tickValue: tick, pnl, fees,
    fills:         fills.length > 1 ? fills : undefined,
    exitFills:     exitFills.length > 1 ? exitFills : undefined,
    plannedStop:   stopVal,
    plannedTarget: targetVal,
    setup:         document.getElementById('f-setup').value.trim(),
    timeframe:     document.getElementById('f-timeframe').value,
    setupGrade:    document.getElementById('f-setupgrade').value,
    execGrade:     document.getElementById('f-execgrade').value,
    mistake:       document.getElementById('f-mistake').value,
    notes:         document.getElementById('f-notes').value.trim(),
    emotions:      document.getElementById('f-emotions').value.trim(),
    diff:          document.getElementById('f-diff').value.trim(),
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
  fireProgressBar();
  const app = document.getElementById('app');
  let viewHtml = '';

  if (state.view === 'calendar') viewHtml = renderCalendar();
  else if (state.view === 'day') viewHtml = renderDay(state.selectedDate || todayStr());
  else if (state.view === 'stats') viewHtml = renderStats();
  else if (state.view === 'accounts') viewHtml = renderAccounts();

  app.innerHTML = renderTopbar() + viewHtml;
  window.scrollTo(0, 0);
}

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  try {
    migrateToAccounts();
    render();
  } catch (e) {
    document.getElementById('app').innerHTML =
      `<div style="padding:40px;color:#ff2244;font-family:monospace;font-size:13px;">
        <strong>Error initialising TradeLog:</strong><br><br>${e.message}<br><br>
        <pre style="white-space:pre-wrap;color:#808080">${e.stack}</pre>
        <br><button onclick="localStorage.clear();location.reload()" style="background:#ff2244;color:#000;border:none;padding:8px 16px;cursor:pointer;font-family:monospace;font-weight:600;">
          CLEAR STORAGE &amp; RELOAD
        </button>
      </div>`;
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeModal();
});

init();
