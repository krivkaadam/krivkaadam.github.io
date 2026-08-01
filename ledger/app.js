const SUPABASE_URL = "https://xatjjamalhltyiqteyki.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhdGpqYW1hbGhsdHlpcXRleWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MTI5NzksImV4cCI6MjEwMDQ4ODk3OX0.eAdK1iadG1hs0X6mn6Tx6o1vunTzj7b-D_XHPKfuqTE";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- theme (Alpine Prism: seamless light / dark) ---------- */
const THEME_KEY = 'ledger_theme';

function applyTheme(theme){
  document.documentElement.setAttribute('data-theme', theme);
}
function initTheme(){
  let theme = null;
  try{ theme = localStorage.getItem(THEME_KEY); } catch(e){ /* storage unavailable */ }
  if(!theme){
    theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) ? 'light' : 'dark';
  }
  applyTheme(theme);
}
function toggleTheme(){
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  applyTheme(next);
  try{ localStorage.setItem(THEME_KEY, next); } catch(e){ /* storage unavailable */ }
}
initTheme();
['theme-toggle', 'theme-toggle-app'].forEach(id=>{
  const el = document.getElementById(id);
  if(el) el.addEventListener('click', toggleTheme);
});

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
function fmtHMS(totalSeconds){
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(totalSeconds/3600);
  const m = Math.floor((totalSeconds%3600)/60);
  const s = totalSeconds%60;
  return [h,m,s].map(n=>String(n).padStart(2,'0')).join(':');
}
function fmtHM(totalSeconds){
  totalSeconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(totalSeconds/3600);
  const m = Math.floor((totalSeconds%3600)/60);
  return `${h}h ${String(m).padStart(2,'0')}m`;
}
function fmtMoney(amount, currency){
  if(currency === 'CZK') return `${Math.round(amount).toLocaleString('cs-CZ')} Kč`;
  if(currency === 'EUR') return `${amount.toFixed(2)} €`;
  return `${amount.toFixed(2)} ${currency}`;
}
function fmtDate(iso){
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {month:'short', day:'numeric'});
}
function fmtTime(iso){
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {hour:'2-digit', minute:'2-digit'});
}
function monthBounds(){
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth()+1, 1);
  return {from: from.toISOString(), to: to.toISOString()};
}
function computeElapsed(session){
  if(!session) return 0;
  if(session.status === 'running'){
    return (session.paused_seconds||0) + (Date.now() - new Date(session.last_resumed_at).getTime())/1000;
  }
  return session.paused_seconds || 0;
}

/* Only the running clock ticks, and only while a session is actually running.
   Everything else (buttons, status text) re-renders on real state changes, not every 250ms. */
function startTicking(){
  if(tickHandle) return;
  tickHandle = setInterval(()=>{
    if(currentSession && currentSession.status === 'running'){
      document.getElementById('timer-display').textContent = fmtHMS(computeElapsed(currentSession));
    }
  }, 250);
}
function stopTicking(){
  if(tickHandle){ clearInterval(tickHandle); tickHandle = null; }
}

/* Swaps the focus-mode image between the "running" and "paused" gif.
   Uses a data attribute so we don't restart the same gif's animation on every re-render. */
function updateFocusGif(status){
  const img = document.getElementById('focus-gif');
  const placeholder = document.getElementById('focus-visual-placeholder');
  const src = status === 'paused' ? '../src/assets/CoffeePause.gif' : '../src/assets/PiggyBank.gif';
  if(img.dataset.currentSrc === src) return;
  img.dataset.currentSrc = src;
  img.style.display = 'block';
  placeholder.style.display = 'none';
  img.src = src;
}

/* ---------- auth ---------- */
async function checkSession(){
  const { data:{ session } } = await sb.auth.getSession();
  if(session){
    currentUser = session.user;
    showApp();
  } else {
    showLogin();
  }
}

async function attemptLogin(){
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const errEl = document.getElementById('error-msg');
  errEl.textContent = '';
  const { data, error } = await sb.auth.signInWithPassword({ email, password });
  if(error){ errEl.textContent = error.message; return; }
  currentUser = data.user;
  showApp();
}
document.getElementById('login-btn').addEventListener('click', attemptLogin);
['email','password'].forEach(id=>{
  document.getElementById(id).addEventListener('keydown', (e)=>{
    if(e.key === 'Enter') attemptLogin();
  });
});

document.getElementById('signout').addEventListener('click', async ()=>{
  await sb.auth.signOut();
  currentUser = null;
  stopTicking();
  showLogin();
});

function showLogin(){
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
}
async function showApp(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  const b = monthBounds();
  filterFrom = b.from;
  filterTo = b.to;
  document.getElementById('summary-label').textContent = 'This month';
  loadStatementPrefs();
  updateStatementRangeNote();
  await loadProjects();
  await loadOpenSession();
  await loadEntries();
  subscribeRealtime();
}

/* ---------- projects ---------- */
async function loadProjects(){
  const { data, error } = await sb
    .from('sessions')
    .select('project_id')
    .eq('user_id', currentUser.id)
    .not('project_id', 'is', null);
  if(error){ console.error(error); return; }
  const set = new Set((data||[]).map(r=>r.project_id).filter(Boolean));
  knownProjects = Array.from(set).sort((a,b)=> a.localeCompare(b));
  populateProjectSelects();
}

function populateProjectSelects(){
  const projSel = document.getElementById('project-select');
  const filterSel = document.getElementById('filter-project');
  const currentVal = projSel.value;
  const currentFilterVal = filterSel.value;

  projSel.innerHTML = '<option value="">Select a project…</option>'
    + knownProjects.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('')
    + '<option value="__new__">+ Add new project…</option>';
  if(knownProjects.includes(currentVal) || currentVal === '__new__') projSel.value = currentVal;

  filterSel.innerHTML = '<option value="">All projects</option>'
    + knownProjects.map(p=>`<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join('');
  if(knownProjects.includes(currentFilterVal)) filterSel.value = currentFilterVal;
}

document.getElementById('project-select').addEventListener('change', async (e)=>{
  const val = e.target.value;
  const newRow = document.getElementById('new-project-row');
  const errEl = document.getElementById('project-error');
  errEl.textContent = '';
  if(val === '__new__'){
    newRow.classList.add('show');
    document.getElementById('new-project-input').value = '';
    document.getElementById('new-project-input').focus();
    return;
  }
  newRow.classList.remove('show');
  if(val) await prefillRateForProject(val);
});

document.getElementById('new-project-confirm').addEventListener('click', ()=>{
  const input = document.getElementById('new-project-input');
  const name = input.value.trim();
  if(!name){ input.focus(); return; }
  if(!knownProjects.includes(name)){
    knownProjects.push(name);
    knownProjects.sort((a,b)=> a.localeCompare(b));
  }
  populateProjectSelects();
  document.getElementById('project-select').value = name;
  document.getElementById('new-project-row').classList.remove('show');
});

document.getElementById('new-project-cancel').addEventListener('click', ()=>{
  document.getElementById('new-project-row').classList.remove('show');
  document.getElementById('project-select').value = '';
});

async function prefillRateForProject(projectName){
  const rateInput = document.getElementById('rate-input');
  if(rateInput.value) return; // don't override a value the user already typed
  const { data, error } = await sb
    .from('sessions')
    .select('hourly_rate, currency')
    .eq('user_id', currentUser.id)
    .eq('project_id', projectName)
    .order('started_at', {ascending:false})
    .limit(1);
  if(error || !data || !data.length) return;
  if(data[0].hourly_rate != null) rateInput.value = data[0].hourly_rate;
  if(data[0].currency) document.getElementById('currency-select').value = data[0].currency;
}

/* ---------- open session ---------- */
async function loadOpenSession(){
  const { data, error } = await sb
    .from('sessions')
    .select('*')
    .eq('user_id', currentUser.id)
    .is('ended_at', null)
    .order('started_at', {ascending:false})
    .limit(1);
  if(error){ console.error(error); return; }
  currentSession = (data && data.length) ? data[0] : null;
  renderTimer();
}

function renderTimer(){
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
  const sessionMeta = document.getElementById('session-meta');

  if(!currentSession){
    stopTicking();
    document.body.classList.remove('session-active');
    dot.className = 'dot';
    statusText.textContent = 'No session running';
    display.textContent = '00:00:00';
    sessionMeta.textContent = '';
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

  document.body.classList.add('session-active');
  display.textContent = fmtHMS(computeElapsed(currentSession));
  if(document.activeElement !== noteInput){
    noteInput.value = currentSession.note || '';
  }
  projSel.disabled = true;
  rateInput.disabled = true;
  currencySel.disabled = true;
  projSel.value = currentSession.project_id || '';
  rateInput.value = currentSession.hourly_rate != null ? currentSession.hourly_rate : '';
  currencySel.value = currentSession.currency || 'CZK';
  sessionMeta.textContent = currentSession.note ? currentSession.note : '';

  const projLabel = currentSession.project_id ? ` — ${currentSession.project_id}` : '';
  if(currentSession.status === 'running'){
    startTicking();
    updateFocusGif('running');
    dot.className = 'dot running';
    statusText.textContent = 'Running' + projLabel;
    startBtn.style.display = 'none';
    pauseBtn.style.display = '';
    resumeBtn.style.display = 'none';
    stopBtn.style.display = '';
  } else {
    stopTicking();
    updateFocusGif('paused');
    dot.className = 'dot paused';
    statusText.textContent = 'Paused' + projLabel;
    startBtn.style.display = 'none';
    pauseBtn.style.display = 'none';
    resumeBtn.style.display = '';
    stopBtn.style.display = '';
  }
}

document.getElementById('note-input').addEventListener('blur', async ()=>{
  if(!currentSession) return; // no active session yet — note is just staged for the next Start
  const newNote = document.getElementById('note-input').value.trim();
  if(newNote === (currentSession.note || '')) return; // nothing changed
  const { data, error } = await sb.from('sessions').update({
    note: newNote || null
  }).eq('id', currentSession.id).select().single();
  if(error){ alert(error.message); return; }
  currentSession = data;
  document.getElementById('session-meta').textContent = currentSession.note || '';
});
document.getElementById('note-input').addEventListener('keydown', (e)=>{
  if(e.key === 'Enter') e.target.blur();
});

document.getElementById('start-btn').addEventListener('click', async ()=>{
  const errEl = document.getElementById('project-error');
  errEl.textContent = '';
  const projectVal = document.getElementById('project-select').value;
  if(!projectVal || projectVal === '__new__'){
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
  if(error){ alert(error.message); return; }
  currentSession = data;
  renderTimer();
  await loadProjects();
});

document.getElementById('pause-btn').addEventListener('click', async ()=>{
  if(!currentSession) return;
  const elapsed = computeElapsed(currentSession);
  const { data, error } = await sb.from('sessions').update({
    paused_seconds: elapsed,
    status: 'paused'
  }).eq('id', currentSession.id).select().single();
  if(error){ alert(error.message); return; }
  currentSession = data;
  renderTimer();
});

document.getElementById('resume-btn').addEventListener('click', async ()=>{
  if(!currentSession) return;
  const { data, error } = await sb.from('sessions').update({
    status: 'running',
    last_resumed_at: new Date().toISOString()
  }).eq('id', currentSession.id).select().single();
  if(error){ alert(error.message); return; }
  currentSession = data;
  renderTimer();
});

document.getElementById('stop-btn').addEventListener('click', async ()=>{
  if(!currentSession) return;
  const elapsed = computeElapsed(currentSession);
  const { error } = await sb.from('sessions').update({
    ended_at: new Date().toISOString(),
    duration_seconds: Math.round(elapsed),
    status: 'stopped'
  }).eq('id', currentSession.id);
  if(error){ alert(error.message); return; }
  currentSession = null;
  document.getElementById('note-input').value = '';
  document.getElementById('project-select').value = '';
  document.getElementById('rate-input').value = '';
  document.getElementById('currency-select').value = 'CZK';
  renderTimer();
  await loadEntries();
});

/* ---------- entries list + summary ---------- */
async function loadEntries(){
  let query = sb.from('sessions')
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('status', 'stopped')
    .order('started_at', {ascending:false});
  if(filterFrom) query = query.gte('started_at', filterFrom);
  if(filterTo) query = query.lt('started_at', filterTo);
  if(filterProject) query = query.eq('project_id', filterProject);
  const { data, error } = await query;
  if(error){ console.error(error); return; }
  entries = data || [];
  renderEntries();
}

function earningsFor(e){
  if(e.hourly_rate == null) return null;
  return (e.duration_seconds||0)/3600 * e.hourly_rate;
}

function renderEntries(){
  const list = document.getElementById('entries-list');
  const countEl = document.getElementById('entries-count');
  countEl.textContent = entries.length;

  /* ---- totals grouped by currency (never sum different currencies together) ---- */
  const byCurrency = {};
  entries.forEach(e=>{
    const cur = e.currency || 'CZK';
    if(!byCurrency[cur]) byCurrency[cur] = {seconds:0, earnings:0};
    byCurrency[cur].seconds += e.duration_seconds||0;
    const earn = earningsFor(e);
    if(earn != null) byCurrency[cur].earnings += earn;
  });
  const summaryEl = document.getElementById('summary-value');
  const currencies = Object.keys(byCurrency);
  if(!currencies.length){
    summaryEl.innerHTML = '<div class="line">0h 00m</div>';
  } else {
    summaryEl.innerHTML = currencies.map(cur=>{
      const c = byCurrency[cur];
      const earnPart = c.earnings > 0 ? ` — ${fmtMoney(c.earnings, cur)}` : '';
      return `<div class="line">${fmtHM(c.seconds)}${earnPart}</div>`;
    }).join('');
  }

  /* ---- per-project breakdown ---- */
  const byProject = {}; // { projectName: { CZK:{seconds,earnings}, EUR:{...} } }
  entries.forEach(e=>{
    const proj = e.project_id || 'No project';
    const cur = e.currency || 'CZK';
    if(!byProject[proj]) byProject[proj] = {};
    if(!byProject[proj][cur]) byProject[proj][cur] = {seconds:0, earnings:0};
    byProject[proj][cur].seconds += e.duration_seconds||0;
    const earn = earningsFor(e);
    if(earn != null) byProject[proj][cur].earnings += earn;
  });
  const breakdownSection = document.getElementById('breakdown-section');
  const breakdownList = document.getElementById('breakdown-list');
  const projectNames = Object.keys(byProject);
  if(projectNames.length > 1){
    breakdownSection.style.display = '';
    breakdownList.innerHTML = projectNames.sort((a,b)=>a.localeCompare(b)).map(proj=>{
      const perCurrency = byProject[proj];
      const parts = Object.keys(perCurrency).map(cur=>{
        const c = perCurrency[cur];
        const earnPart = c.earnings > 0 ? ` — ${fmtMoney(c.earnings, cur)}` : '';
        return `${fmtHM(c.seconds)}${earnPart}`;
      }).join(' · ');
      return `<div class="breakdown-row"><span class="b-project">${escapeHtml(proj)}</span><span class="b-amount">${parts}</span></div>`;
    }).join('');
  } else {
    breakdownSection.style.display = 'none';
  }

  if(!entries.length){
    list.innerHTML = '<div class="empty-state">No entries in this range yet.</div>';
    return;
  }

  list.innerHTML = '';
  entries.forEach((e, i)=>{
    const row = document.createElement('div');
    row.className = 'entry';
    row.dataset.id = e.id;
    const noteText = e.note ? e.note : 'No note';
    const earn = earningsFor(e);
    const earnText = earn != null ? fmtMoney(earn, e.currency||'CZK') : '';
    row.innerHTML = `
      <div class="entry-row">
        <div class="entry-left">
          <span class="num">${String(entries.length - i).padStart(2,'0')}</span>
          <span class="date-col">${fmtDate(e.started_at)} · ${fmtTime(e.started_at)}</span>
          <span class="badge">${escapeHtml(e.project_id || '—')}</span>
        </div>
        <div class="entry-right">
          <span class="dur-col">${fmtHM(e.duration_seconds)}</span>
          ${earnText ? `<span class="earn-col">${earnText}</span>` : ''}
        </div>
      </div>
      <div class="entry-row">
        <span class="note-col ${e.note ? '' : 'empty'}">${escapeHtml(noteText)}</span>
        <span class="actions">
          <button class="btn ghost edit-btn">Edit</button>
          <button class="btn danger del-btn">Delete</button>
        </span>
      </div>
    `;
    list.appendChild(row);

    row.querySelector('.edit-btn').addEventListener('click', ()=> openEdit(row, e));
    row.querySelector('.del-btn').addEventListener('click', ()=> deleteEntry(e.id));
  });
}

function escapeHtml(str){
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

function openEdit(row, e){
  const minutes = Math.round((e.duration_seconds||0)/60);
  const editRow = document.createElement('div');
  editRow.className = 'edit-row';
  editRow.innerHTML = `
    <input type="text" class="edit-note" value="${escapeHtml(e.note||'')}" placeholder="Note" />
    <span class="mini-label">minutes</span>
    <input type="number" class="edit-minutes" value="${minutes}" min="0" />
    <span class="mini-label">rate</span>
    <input type="number" class="edit-rate" value="${e.hourly_rate != null ? e.hourly_rate : ''}" min="0" step="0.01" style="width:90px" />
    <select class="edit-currency" style="width:80px">
      <option value="CZK" ${e.currency==='CZK'?'selected':''}>CZK</option>
      <option value="EUR" ${e.currency==='EUR'?'selected':''}>EUR</option>
    </select>
    <button class="btn primary save-btn">Save</button>
    <button class="btn ghost cancel-btn">Cancel</button>
  `;
  row.replaceWith(editRow);

  editRow.querySelector('.cancel-btn').addEventListener('click', renderEntries);
  editRow.querySelector('.save-btn').addEventListener('click', async ()=>{
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
    if(error){ alert(error.message); return; }
    await loadEntries();
  });
}

async function deleteEntry(id){
  if(!confirm('Delete this entry? This cannot be undone.')) return;
  const { error } = await sb.from('sessions').delete().eq('id', id);
  if(error){ alert(error.message); return; }
  await loadEntries();
}

/* ---------- filters ---------- */
document.getElementById('filter-apply').addEventListener('click', ()=>{
  const fromVal = document.getElementById('filter-from').value;
  const toVal = document.getElementById('filter-to').value;
  filterFrom = fromVal ? new Date(fromVal + 'T00:00:00').toISOString() : null;
  filterTo = toVal ? new Date(toVal + 'T23:59:59').toISOString() : null;
  filterProject = document.getElementById('filter-project').value;
  document.getElementById('summary-label').textContent = 'Selected range';
  updateStatementRangeNote();
  loadEntries();
});
document.getElementById('filter-reset').addEventListener('click', ()=>{
  const b = monthBounds();
  filterFrom = b.from;
  filterTo = b.to;
  filterProject = '';
  document.getElementById('filter-from').value = '';
  document.getElementById('filter-to').value = '';
  document.getElementById('filter-project').value = '';
  document.getElementById('summary-label').textContent = 'This month';
  updateStatementRangeNote();
  loadEntries();
});

/* ---------- statement / print export ---------- */
const STMT_PREFS_KEY = 'ledger_statement_prefs';

function loadStatementPrefs(){
  let prefs = {};
  try{
    const raw = localStorage.getItem(STMT_PREFS_KEY);
    if(raw) prefs = JSON.parse(raw);
  } catch(e){ /* ignore malformed storage */ }
  document.getElementById('stmt-your-name').value = prefs.yourName || '';
  document.getElementById('stmt-friend-name').value = prefs.friendName || '';
  document.getElementById('stmt-iban').value = prefs.iban || '';
  document.getElementById('stmt-vs').value = prefs.vs || '';
  document.getElementById('stmt-msg').value = prefs.msg || '';
}
function saveStatementPrefs(){
  const prefs = {
    yourName: document.getElementById('stmt-your-name').value.trim(),
    friendName: document.getElementById('stmt-friend-name').value.trim(),
    iban: document.getElementById('stmt-iban').value.trim(),
    vs: document.getElementById('stmt-vs').value.trim(),
    msg: document.getElementById('stmt-msg').value.trim()
  };
  try{ localStorage.setItem(STMT_PREFS_KEY, JSON.stringify(prefs)); } catch(e){ /* storage unavailable */ }
  return prefs;
}
['stmt-your-name','stmt-friend-name','stmt-iban','stmt-vs','stmt-msg'].forEach(id=>{
  document.getElementById(id).addEventListener('blur', saveStatementPrefs);
});

function updateStatementRangeNote(){
  const label = filterProject ? `project "${filterProject}"` : 'all projects';
  const fromTxt = filterFrom ? new Date(filterFrom).toLocaleDateString() : '(no start limit)';
  const toTxt = filterTo ? new Date(new Date(filterTo).getTime() - 1).toLocaleDateString() : '(no end limit)';
  document.getElementById('stmt-range-note').innerHTML =
    `Uses the range/project currently applied above: <b>${fromTxt} → ${toTxt}</b>, <b>${escapeHtml(label)}</b>. <br>Adjust the filters above, then come back and preview again.`;
}

function stripDiacritics(str){
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/* Builds a Czech "QR platba" (SPAYD) payment string */
function buildSpayd({ iban, amount, currency, vs, msg }){
  const parts = ['SPD*1.0', `ACC:${iban.replace(/\s+/g,'').toUpperCase()}`, `AM:${amount.toFixed(2)}`, `CC:${currency}`];
  const cleanMsg = stripDiacritics(msg).replace(/[^A-Za-z0-9 .,\-\/]/g, '').slice(0, 60).trim();
  if(cleanMsg) parts.push(`MSG:${cleanMsg}`);
  const cleanVs = (vs || '').replace(/\D/g, '').slice(0, 10);
  if(cleanVs) parts.push(`X-VS:${cleanVs}`);
  return parts.join('*');
}

async function generateStatement(){
  const prefs = saveStatementPrefs();

  // header / meta
  const fromTxt = filterFrom ? new Date(filterFrom).toLocaleDateString() : 'the beginning';
  const toTxt = filterTo ? new Date(new Date(filterTo).getTime() - 1).toLocaleDateString() : 'today';
  document.getElementById('ps-period').textContent = `${fromTxt} — ${toTxt}`;
  document.getElementById('ps-from').textContent = prefs.yourName || '—';
  document.getElementById('ps-to').textContent = prefs.friendName || '—';
  document.getElementById('ps-project').textContent = filterProject || 'All projects';
  document.getElementById('ps-generated').textContent = new Date().toLocaleString();

  // rows, oldest first for a readable statement
  const rows = document.getElementById('ps-rows');
  const chronological = [...entries].sort((a,b)=> new Date(a.started_at) - new Date(b.started_at));
  rows.innerHTML = chronological.map(e=>{
    const earn = earningsFor(e);
    const earnTxt = earn != null ? fmtMoney(earn, e.currency || 'CZK') : '—';
    return `<tr>
      <td>${fmtDate(e.started_at)}</td>
      <td>${fmtTime(e.started_at)}</td>
      <td>${escapeHtml(e.project_id || '—')}</td>
      <td>${escapeHtml(e.note || '')}</td>
      <td class="num">${fmtHM(e.duration_seconds)}</td>
      <td class="num">${earnTxt}</td>
    </tr>`;
  }).join('') || '<tr><td colspan="6" style="color:#999; text-align:center; padding:20px;">No sessions in this range.</td></tr>';

  // per-currency totals + QR
  const byCurrency = {};
  entries.forEach(e=>{
    const cur = e.currency || 'CZK';
    if(!byCurrency[cur]) byCurrency[cur] = {seconds:0, earnings:0};
    byCurrency[cur].seconds += e.duration_seconds || 0;
    const earn = earningsFor(e);
    if(earn != null) byCurrency[cur].earnings += earn;
  });

  const blocksEl = document.getElementById('ps-currency-blocks');
  blocksEl.innerHTML = '';
  const iban = document.getElementById('stmt-iban').value.trim();
  const msgVal = document.getElementById('stmt-msg').value.trim();
  const vsVal = document.getElementById('stmt-vs').value.trim();

  const currencies = Object.keys(byCurrency);
  for(const cur of currencies){
    const c = byCurrency[cur];
    const block = document.createElement('div');
    block.className = 'print-currency-block';

    const canQr = iban && c.earnings > 0 && (cur === 'CZK' || cur === 'EUR');
    block.innerHTML = `
      <div class="pc-totals">
        <div>
          <div class="lbl">Total hours (${escapeHtml(cur)})</div>
          <div class="big">${fmtHM(c.seconds)}</div>
        </div>
        <div>
          <div class="lbl">Total amount</div>
          <div class="big">${c.earnings > 0 ? fmtMoney(c.earnings, cur) : '—'}</div>
        </div>
      </div>
      ${canQr ? `
      <div class="pc-qr-row">
        <div class="pc-qr-canvas"></div>
        <div class="pc-qr-note">
          Scan with your banking app to pay <b>${fmtMoney(c.earnings, cur)}</b><br> to IBAN ${escapeHtml(iban)}.
          ${msgVal ? `<br>Payment note: ${escapeHtml(msgVal)}` : ''}
          ${vsVal ? `<br>Variable symbol: ${escapeHtml(vsVal)}` : ''}
        </div>
      </div>` : (iban ? '' : `<div class="pc-qr-note">Add your IBAN above to include a payment QR code for this amount.</div>`)}
    `;
    blocksEl.appendChild(block);

    if(canQr && window.QRCode){
      const container = block.querySelector('.pc-qr-canvas');
      const spayd = buildSpayd({
        iban,
        amount: c.earnings,
        currency: cur,
       vs: vsVal,
        msg: msgVal
      });
      try{
        new QRCode(container, {
          text: spayd,
          width: 150,
          height: 150,
          correctLevel: QRCode.CorrectLevel.M
        });
      } catch(err){
        console.error('QR generation failed', err);
        container.textContent = 'QR generation failed - see console.';
      }
    }
  }

  document.getElementById('print-overlay').classList.remove('hidden');
  window.scrollTo(0,0);
}

document.getElementById('stmt-generate').addEventListener('click', generateStatement);
document.getElementById('print-close').addEventListener('click', ()=>{
  document.getElementById('print-overlay').classList.add('hidden');
});
document.getElementById('print-now').addEventListener('click', ()=> window.print());

/* ---------- realtime sync across devices ---------- */
function subscribeRealtime(){
  sb.channel('sessions-changes')
    .on('postgres_changes',
      { event:'*', schema:'public', table:'sessions', filter:`user_id=eq.${currentUser.id}` },
      ()=>{ loadOpenSession(); loadEntries(); }
    )
    .subscribe();
}

/* ---------- boot ---------- */
checkSession();