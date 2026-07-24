
const SUPABASE_URL = "https://xatjjamalhltyiqteyki.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhdGpqYW1hbGhsdHlpcXRleWtpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ5MTI5NzksImV4cCI6MjEwMDQ4ODk3OX0.eAdK1iadG1hs0X6mn6Tx6o1vunTzj7b-D_XHPKfuqTE";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ---------- state ---------- */
let currentUser = null;
let currentSession = null; // open row (ended_at is null), or null
let tickHandle = null;
let entries = [];
let filterFrom = null;
let filterTo = null;

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
    await loadOpenSession();
    await loadEntries();
    subscribeRealtime();
    if (!tickHandle) tickHandle = setInterval(renderTimer, 250);
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

    if (!currentSession) {
        dot.className = 'dot';
        statusText.textContent = 'No session running';
        display.textContent = '00:00:00';
        startBtn.style.display = '';
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = 'none';
        stopBtn.style.display = 'none';
        noteInput.disabled = false;
        return;
    }

    display.textContent = fmtHMS(computeElapsed(currentSession));
    noteInput.disabled = true;
    noteInput.value = currentSession.note || '';

    if (currentSession.status === 'running') {
        dot.className = 'dot running';
        statusText.textContent = 'Running';
        startBtn.style.display = 'none';
        pauseBtn.style.display = '';
        resumeBtn.style.display = 'none';
        stopBtn.style.display = '';
    } else {
        dot.className = 'dot paused';
        statusText.textContent = 'Paused';
        startBtn.style.display = 'none';
        pauseBtn.style.display = 'none';
        resumeBtn.style.display = '';
        stopBtn.style.display = '';
    }
}

document.getElementById('start-btn').addEventListener('click', async () => {
    const note = document.getElementById('note-input').value.trim();
    const nowIso = new Date().toISOString();
    const { data, error } = await sb.from('sessions').insert({
        user_id: currentUser.id,
        started_at: nowIso,
        last_resumed_at: nowIso,
        paused_seconds: 0,
        status: 'running',
        note: note || null
    }).select().single();
    if (error) { alert(error.message); return; }
    currentSession = data;
    renderTimer();
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
    const { data, error } = await query;
    if (error) { console.error(error); return; }
    entries = data || [];
    renderEntries();
}

function renderEntries() {
    const list = document.getElementById('entries-list');
    const countEl = document.getElementById('entries-count');
    const total = entries.reduce((sum, e) => sum + (e.duration_seconds || 0), 0);
    document.getElementById('summary-value').textContent = fmtHM(total);
    countEl.textContent = entries.length;

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
        row.innerHTML = `
      <span class="num">${String(entries.length - i).padStart(2, '0')}</span>
      <span class="date-col">${fmtDate(e.started_at)}</span>
      <span class="note-col ${e.note ? '' : 'empty'}">${escapeHtml(noteText)}</span>
      <span class="dur-col">${fmtHM(e.duration_seconds)}</span>
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
    <button class="btn primary save-btn">Save</button>
    <button class="btn ghost cancel-btn">Cancel</button>
  `;
    row.replaceWith(editRow);

    editRow.querySelector('.cancel-btn').addEventListener('click', renderEntries);
    editRow.querySelector('.save-btn').addEventListener('click', async () => {
        const newNote = editRow.querySelector('.edit-note').value.trim();
        const newMinutes = parseInt(editRow.querySelector('.edit-minutes').value, 10) || 0;
        const { error } = await sb.from('sessions').update({
            note: newNote || null,
            duration_seconds: newMinutes * 60
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
    document.getElementById('summary-label').textContent = 'Selected range';
    loadEntries();
});
document.getElementById('filter-reset').addEventListener('click', () => {
    const b = monthBounds();
    filterFrom = b.from;
    filterTo = b.to;
    document.getElementById('filter-from').value = '';
    document.getElementById('filter-to').value = '';
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