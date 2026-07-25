
const SUPABASE_URL = "https://xatjjamalhltyiqteyki.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhdGpqYW1hbGhsdHlpcXRleWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MTI5NzksImV4cCI6MjEwMDQ4ODk3OX0.eAdK1iadG1hs0X6mn6Tx6o1vunTzj7b-D_XHPKfuqTE";

const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_PUBLIC_KEY";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- state ---------- */
let currentUser = null;
let currentSession = null; // open row (ended_at is null), or null
let tickHandle = null;
let entries = [];
let filterFrom = null;
let filterTo = null;
let filterProject = '';
let knownProjects = []; // distinct project names for this user

/* ---------- helpers ---------- */
function fmtHMS(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}
function fmtHM(totalSeconds) {
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}
function fmtMoney(amount, currency) {
  if (currency === 'CZK') return `${Math.round(amount).toLocaleString('cs-CZ')} Kč`;
  if (currency === 'EUR') return `${amount.toFixed(2)} €`;
  return `${amount.toFixed(2)} ${currency}`;
}
function fmtDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
function monthBounds() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { from: from.toISOString(), to: to.toISOString() };
}
function computeElapsed(session) {
  if (!session) return 0;
  if (session.status === 'running') {
    return (session.paused_seconds || 0) + (Date.now() - new Date(session.last_resumed_at).getTime()) / 1000;
  }
  return session.paused_seconds || 0;
}

/* ---------- auth ---------- */
async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    showApp();
  } else {
    showLogin();
  }
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('error-msg');
  errEl.textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { errEl.textContent = error.message; return; }
  currentUser = data.user;
  showApp();
});

document.getElementById('signout').addEventListener('click', async () => {
  await sb.auth.signOut();
  currentUser = null;
  if (tickHandle) clearInterval(tickHandle);
  showLogin();
});

function showLogin() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}
async function showApp() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  const b = monthBounds();
  filterFrom = b.from;
  filterTo = b.to;
  document.getElementById('summary-label').textContent = 'This month';
  await loadProjects();
  await loadOpenSession();
  await loadEntries();
  subscribeRealtime();
  if (!tickHandle) tickHandle = setInterval(renderTimer, 250);
}

/* ---------- projects ---------- */
async function loadProjects() {
  const { data, error } = await sb
    .from('sessions')
    .select('project_id')
    .eq('user_id', currentUser.id)
    .not('project_id', 'is', null);
  if (error) { console.error(error); return; }
  const set = new Set((data || []).map(r => r.project_id).filter(Boolean));
  knownProjects = Array.from(set).sort((a, b) => a.localeCompare(b));
  populateProjectSelects();
}

function populateProjectSelects() {
  const projSel = document.getElementById('project-select');
  const filterSel = document.getElementById('filter-project');
  const currentVal = projSel.value;
  const currentFilterVal = filterSel.value;

  projSel.innerHTML = '<option value="">Select a project…</option>'
    + knownProjects.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')
    + '<option value="__new__">+ Add new project…</option>';
  if (knownProjects.includes(currentVal) || currentVal === '__new__') projSel.value = currentVal;

  filterSel.innerHTML = '<option value="">All projects</option>'
    + knownProjects.map(p => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  if (knownProjects.includes(currentFilterVal)) filterSel.value = currentFilterVal;
}

document.getElementById('project-select').addEventListener('change', async (e) => {
  const val = e.target.value;
  const newRow = document.getElementById('new-project-row');
  const errEl = document.getElementById('project-error');
  errEl.textContent = '';
  if (val === '__new__') {
    newRow.classList.add('show');
    document.getElementById('new-project-input').value = '';
    document.getElementById('new-project-input').focus();
    return;
  }
  newRow.classList.remove('show');
  if (val) await prefillRateForProject(val);
});

document.getElementById('new-project-confirm').addEventListener('click', () => {
  const input = document.getElementById('new-project-input');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  if (!knownProjects.includes(name)) {
    knownProjects.push(name);
    knownProjects.sort((a, b) => a.localeCompare(b));
  }
  populateProjectSelects();
  document.getElementById('project-select').value = name;
  document.getElementById('new-project-row').classList.remove('show');
});

document.getElementById('new-project-cancel').addEventListener('click', () => {
  document.getElementById('new-project-row').classList.remove('show');
  document.getElementById('project-select').value = '';
});

async function prefillRateForProject(projectName) {
  const rateInput = document.getElementById('rate-input');
  if (rateInput.value) return; // don't override a value the user already typed
  const { data, error } = await sb
    .from('sessions')
    .select('hourly_rate, currency')
    .eq('user_id', currentUser.id)
    .eq('project_id', projectName)
    .order('started_at', { ascending: false })
    .limit(1);
  if (error || !data || !data.length) return;
  if (data[0].hourly_rate != null) rateInput.value = data[0].hourly_rate;
  if (data[0].currency) document.getElementById('currency-select').value = data[0].currency;
}

/* ---------- open session ---------- */
async function loadOpenSession() {
  const { data, error } = await sb
    .from('sessions')
    .select('*')
    .eq('user_id', currentUser.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) { console.error(error); return; }
  currentSession = (data && data.length) ? data[0] : null;
  renderTimer();
}

function renderTimer() {
  const dot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const display = document.getElementById('timer-display');
  const startBtn = document.getElementById('start-btn');
  const pauseBtn = document.getElementById('pause-btn');
  const resumeBtn = document.getElementById('resume-btn');
  const stopBtn = document.getElementById('stop-btn');
  const noteInput = document.getElementById('note-input');
  const projSel = document.getElementById('project-select');
  const rateInput = document.getElementById('rate-input');
  const currencySel = document.getElementById('currency-select');

  if (!currentSession) {
    dot.className = 'dot';
    statusText.textContent = 'No session running';
    display.textContent = '00:00:00';
    startBtn.style.display = '';
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = 'none';
    stopBtn.style.display = 'none';
    noteInput.disabled = false;
    projSel.disabled = false;
    rateInput.disabled = false;
    currencySel.disabled = false;
    return;
  }

  display.textContent = fmtHMS(computeElapsed(currentSession));
  noteInput.disabled = true;
  noteInput.value = currentSession.note || '';
  projSel.disabled = true;
  rateInput.disabled = true;
  currencySel.disabled = true;
  projSel.value = currentSession.project_id || '';
  rateInput.value = currentSession.hourly_rate != null ? currentSession.hourly_rate : '';
  currencySel.value = currentSession.currency || 'CZK';

  const projLabel = currentSession.project_id ? ` — ${currentSession.project_id}` : '';
  if (currentSession.status === 'running') {
    dot.className = 'dot running';
    statusText.textContent = 'Running' + projLabel;
    startBtn.style.display = 'none';
    pauseBtn.style.display = '';
    resumeBtn.style.display = 'none';
    stopBtn.style.display = '';
  } else {
    dot.className = 'dot paused';
    statusText.textContent = 'Paused' + projLabel;
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = '';
    stopBtn.style.display = '';
  }
}

document.getElementById('start-btn').addEventListener('click', async () => {
  const errEl = document.getElementById('project-error');
  errEl.textContent = '';
  const projectVal = document.getElementById('project-select').value;
  if (!projectVal || projectVal === '__new__') {
    errEl.textContent = 'Pick a project (or add a new one) before starting.';
    return;
  }
  const rateVal = document.getElementById('rate-input').value;
  const currencyVal = document.getElementById('currency-select').value;
  const note = document.getElementById('note-input').value.trim();
  const nowIso = new Date().toISOString();
  const { data, error } = await sb.from('sessions').insert({
    user_id: currentUser.id,
    started_at: nowIso,
    last_resumed_at: nowIso,
    paused_seconds: 0,
    status: 'running',
    note: note || null,
    project_id: projectVal,
    hourly_rate: rateVal ? parseFloat(rateVal) : null,
    currency: currencyVal
  }).select().single();
  if (error) { alert(error.message); return; }
  currentSession = data;
  renderTimer();
  await loadProjects();
});

document.getElementById('pause-btn').addEventListener('click', async () => {
  if (!currentSession) return;
  const elapsed = computeElapsed(currentSession);
  const { data, error } = await sb.from('sessions').update({
    paused_seconds: elapsed,
    status: 'paused'
  }).eq('id', currentSession.id).select().single();
  if (error) { alert(error.message); return; }
  currentSession = data;
  renderTimer();
});

document.getElementById('resume-btn').addEventListener('click', async () => {
  if (!currentSession) return;
  const { data, error } = await sb.from('sessions').update({
    status: 'running',
    last_resumed_at: new Date().toISOString()
  }).eq('id', currentSession.id).select().single();
  if (error) { alert(error.message); return; }
  currentSession = data;
  renderTimer();
});

document.getElementById('stop-btn').addEventListener('click', async () => {
  if (!currentSession) return;
  const elapsed = computeElapsed(currentSession);
  const { error } = await sb.from('sessions').update({
    ended_at: new Date().toISOString(),
    duration_seconds: Math.round(elapsed),
    status: 'stopped'
  }).eq('id', currentSession.id);
  if (error) { alert(error.message); return; }
  currentSession = null;
  document.getElementById('note-input').value = '';
  document.getElementById('project-select').value = '';
  document.getElementById('rate-input').value = '';
  document.getElementById('currency-select').value = 'CZK';
  renderTimer();
  await loadEntries();
});

/* ---------- entries list + summary ---------- */
async function loadEntries() {
  let query = sb.from('sessions')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('status', 'stopped')
    .order('started_at', { ascending: false });
  if (filterFrom) query = query.gte('started_at', filterFrom);
  if (filterTo) query = query.lt('started_at', filterTo);
  if (filterProject) query = query.eq('project_id', filterProject);
  const { data, error } = await query;
  if (error) { console.error(error); return; }
  entries = data || [];
  renderEntries();
}

function earningsFor(e) {
  if (e.hourly_rate == null) return null;
  return (e.duration_seconds || 0) / 3600 * e.hourly_rate;
}

function renderEntries() {
  const list = document.getElementById('entries-list');
  const countEl = document.getElementById('entries-count');
  countEl.textContent = entries.length;

  /* ---- totals grouped by currency (never sum different currencies together) ---- */
  const byCurrency = {};
  entries.forEach(e => {
    const cur = e.currency || 'CZK';
    if (!byCurrency[cur]) byCurrency[cur] = { seconds: 0, earnings: 0 };
    byCurrency[cur].seconds += e.duration_seconds || 0;
    const earn = earningsFor(e);
    if (earn != null) byCurrency[cur].earnings += earn;
  });
  const summaryEl = document.getElementById('summary-value');
  const currencies = Object.keys(byCurrency);
  if (!currencies.length) {
    summaryEl.innerHTML = '<div class="line">0h 00m</div>';
  } else {
    summaryEl.innerHTML = currencies.map(cur => {
      const c = byCurrency[cur];
      const earnPart = c.earnings > 0 ? ` — ${fmtMoney(c.earnings, cur)}` : '';
      return `<div class="line">${fmtHM(c.seconds)}${earnPart}</div>`;
    }).join('');
  }

  /* ---- per-project breakdown ---- */
  const byProject = {}; // { projectName: { CZK:{seconds,earnings}, EUR:{...} } }
  entries.forEach(e => {
    const proj = e.project_id || 'No project';
    const cur = e.currency || 'CZK';
    if (!byProject[proj]) byProject[proj] = {};
    if (!byProject[proj][cur]) byProject[proj][cur] = { seconds: 0, earnings: 0 };
    byProject[proj][cur].seconds += e.duration_seconds || 0;
    const earn = earningsFor(e);
    if (earn != null) byProject[proj][cur].earnings += earn;
  });
  const breakdownSection = document.getElementById('breakdown-section');
  const breakdownList = document.getElementById('breakdown-list');
  const projectNames = Object.keys(byProject);
  if (projectNames.length > 1) {
    breakdownSection.style.display = '';
    breakdownList.innerHTML = projectNames.sort((a, b) => a.localeCompare(b)).map(proj => {
      const perCurrency = byProject[proj];
      const parts = Object.keys(perCurrency).map(cur => {
        const c = perCurrency[cur];
        const earnPart = c.earnings > 0 ? ` — ${fmtMoney(c.earnings, cur)}` : '';
        return `${fmtHM(c.seconds)}${earnPart}`;
      }).join(' · ');
      return `<div class="breakdown-row"><span class="b-project">${escapeHtml(proj)}</span><span class="b-amount">${parts}</span></div>`;
    }).join('');
  } else {
    breakdownSection.style.display = 'none';
  }

  if (!entries.length) {
    list.innerHTML = '<div class="empty-state">No entries in this range yet.</div>';
    return;
  }

  list.innerHTML = '';
  entries.forEach((e, i) => {
    const row = document.createElement('div');
    row.className = 'entry';
    row.dataset.id = e.id;
    const noteText = e.note ? e.note : 'No note';
    const earn = earningsFor(e);
    const earnText = earn != null ? fmtMoney(earn, e.currency || 'CZK') : '';
    row.innerHTML = `
      <span class="num">${String(entries.length - i).padStart(2, '0')}</span>
      <span class="date-col">${fmtDate(e.started_at)}</span>
      <span class="project-col"><span class="badge">${escapeHtml(e.project_id || '—')}</span></span>
      <span class="note-col ${e.note ? '' : 'empty'}">${escapeHtml(noteText)}</span>
      <span class="dur-col">${fmtHM(e.duration_seconds)}</span>
      <span class="earn-col">${earnText}</span>
      <span class="actions">
        <button class="btn ghost edit-btn">Edit</button>
        <button class="btn danger del-btn">Delete</button>
      </span>
    `;
    list.appendChild(row);

    row.querySelector('.edit-btn').addEventListener('click', () => openEdit(row, e));
    row.querySelector('.del-btn').addEventListener('click', () => deleteEntry(e.id));
  });
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function openEdit(row, e) {
  const minutes = Math.round((e.duration_seconds || 0) / 60);
  const editRow = document.createElement('div');
  editRow.className = 'edit-row';
  editRow.innerHTML = `
    <input type="text" class="edit-note" value="${escapeHtml(e.note || '')}" placeholder="Note" />
    <span class="mini-label">minutes</span>
    <input type="number" class="edit-minutes" value="${minutes}" min="0" />
    <span class="mini-label">rate</span>
    <input type="number" class="edit-rate" value="${e.hourly_rate != null ? e.hourly_rate : ''}" min="0" step="0.01" style="width:90px" />
    <select class="edit-currency" style="width:80px">
      <option value="CZK" ${e.currency === 'CZK' ? 'selected' : ''}>CZK</option>
      <option value="EUR" ${e.currency === 'EUR' ? 'selected' : ''}>EUR</option>
    </select>
    <button class="btn primary save-btn">Save</button>
    <button class="btn ghost cancel-btn">Cancel</button>
  `;
  row.replaceWith(editRow);

  editRow.querySelector('.cancel-btn').addEventListener('click', renderEntries);
  editRow.querySelector('.save-btn').addEventListener('click', async () => {
    const newNote = editRow.querySelector('.edit-note').value.trim();
    const newMinutes = parseInt(editRow.querySelector('.edit-minutes').value, 10) || 0;
    const newRateVal = editRow.querySelector('.edit-rate').value;
    const newCurrency = editRow.querySelector('.edit-currency').value;
    const { error } = await sb.from('sessions').update({
      note: newNote || null,
      duration_seconds: newMinutes * 60,
      hourly_rate: newRateVal ? parseFloat(newRateVal) : null,
      currency: newCurrency
    }).eq('id', e.id);
    if (error) { alert(error.message); return; }
    await loadEntries();
  });
}

async function deleteEntry(id) {
  if (!confirm('Delete this entry? This cannot be undone.')) return;
  const { error } = await sb.from('sessions').delete().eq('id', id);
  if (error) { alert(error.message); return; }
  await loadEntries();
}

/* ---------- filters ---------- */
document.getElementById('filter-apply').addEventListener('click', () => {
  const fromVal = document.getElementById('filter-from').value;
  const toVal = document.getElementById('filter-to').value;
  filterFrom = fromVal ? new Date(fromVal + 'T00:00:00').toISOString() : null;
  filterTo = toVal ? new Date(toVal + 'T23:59:59').toISOString() : null;
  filterProject = document.getElementById('filter-project').value;
  document.getElementById('summary-label').textContent = 'Selected range';
  loadEntries();
});
document.getElementById('filter-reset').addEventListener('click', () => {
  const b = monthBounds();
  filterFrom = b.from;
  filterTo = b.to;
  filterProject = '';
  document.getElementById('filter-from').value = '';
  document.getElementById('filter-to').value = '';
  document.getElementById('filter-project').value = '';
  document.getElementById('summary-label').textContent = 'This month';
  loadEntries();
});

/* ---------- realtime sync across devices ---------- */
function subscribeRealtime() {
  sb.channel('sessions-changes')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'sessions', filter: `user_id=eq.${currentUser.id}` },
      () => { loadOpenSession(); loadEntries(); }
    )
    .subscribe();
}

/* ---------- boot ---------- */
checkSession();