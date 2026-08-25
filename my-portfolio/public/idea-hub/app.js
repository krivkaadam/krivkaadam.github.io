
const SUPABASE_URL = 'https://eyvgammlolmqsylagygk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dmdhbW1sb2xtcXN5bGFneWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NjE3NzcsImV4cCI6MjEwMjAzNzc3N30.ZMNTTj_VRblCWGo-BI_ixEOxsz0EPtRJGKGIrr3zfLg';



const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const COLORS = ['#00ace1', '#FF3B30', '#22c55e', '#eab308', '#a855f7', '#f97316'];

/* ---------------------------------------------------------------------
   STATE
   --------------------------------------------------------------------- */
let currentUser = null;
let currentBoard = null;
let ideas = new Map();       // id -> idea row
let connections = new Map(); // id -> connection row
let selectedIdeaId = null;
let linkMode = false;
let linkSourceId = null;

let zoom = 1;
let panX = 0, panY = 0;
let isPanning = false, panStart = null;
let dragState = null; // {id, offsetX, offsetY, moved}

let authMode = 'signin'; // or 'signup'

/* ---------------------------------------------------------------------
   ELEMENTS
   --------------------------------------------------------------------- */
const $ = (id) => document.getElementById(id);
const authScreen = $('auth-screen');
const appScreen = $('app-screen');
const canvasWrap = $('canvas-wrap');
const canvasWorld = $('canvas-world');
const edgesLayer = $('edges-layer');
const detailPanel = $('detail-panel');
const emptyState = $('empty-state');
const linkHint = $('link-hint');

/* =========================================================================
   AUTH
   ========================================================================= */
$('auth-switch-btn').addEventListener('click', () => {
  authMode = authMode === 'signin' ? 'signup' : 'signin';
  $('auth-submit-label').textContent = authMode === 'signin' ? 'Sign In' : 'Create Account';
  $('auth-switch-text').textContent = authMode === 'signin' ? 'New here?' : 'Already have an account?';
  $('auth-switch-btn').textContent = authMode === 'signin' ? 'Create an account' : 'Sign in';
  $('auth-error').classList.remove('show');
});

$('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const btn = $('auth-submit');
  const errBox = $('auth-error');
  errBox.classList.remove('show');
  btn.disabled = true;

  try {
    if (authMode === 'signin') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw error;
    } else {
      const { error } = await sb.auth.signUp({ email, password });
      if (error) throw error;
      errBox.textContent = 'Account created — check your inbox to confirm, then sign in.';
      errBox.classList.add('show');
      authMode = 'signin';
      $('auth-submit-label').textContent = 'Sign In';
      $('auth-switch-text').textContent = 'New here?';
      $('auth-switch-btn').textContent = 'Create an account';
    }
  } catch (err) {
    errBox.textContent = err.message || 'Something went wrong.';
    errBox.classList.add('show');
  } finally {
    btn.disabled = false;
  }
});

$('signout-btn').addEventListener('click', async () => {
  await sb.auth.signOut();
});

sb.auth.onAuthStateChange((_event, session) => {
  if (session && session.user) {
    currentUser = session.user;
    enterApp();
  } else {
    currentUser = null;
    authScreen.classList.add('active');
    appScreen.classList.remove('active');
  }
});

/* =========================================================================
   BOOTSTRAP APP
   ========================================================================= */
async function enterApp() {
  authScreen.classList.remove('active');
  appScreen.classList.add('active');

  await ensureBoard();
  await loadIdeasAndConnections();
  renderAll();
  subscribeRealtime();
}

async function ensureBoard() {
  let { data: boards, error } = await sb
    .from('boards')
    .select('*')
    .eq('owner_id', currentUser.id)
    .limit(1);

  if (error) { console.error(error); return; }

  if (boards && boards.length) {
    currentBoard = boards[0];
  } else {
    const { data, error: insErr } = await sb
      .from('boards')
      .insert({ owner_id: currentUser.id, name: 'My Idea Hub' })
      .select()
      .single();
    if (insErr) { console.error(insErr); return; }
    currentBoard = data;
  }
  $('board-name').textContent = currentBoard.name;
}

async function loadIdeasAndConnections() {
  const [{ data: ideaRows, error: iErr }, { data: connRows, error: cErr }] = await Promise.all([
    sb.from('ideas').select('*').eq('board_id', currentBoard.id).order('created_at'),
    sb.from('connections').select('*').eq('board_id', currentBoard.id),
  ]);
  if (iErr) console.error(iErr);
  if (cErr) console.error(cErr);

  ideas = new Map((ideaRows || []).map(i => [i.id, i]));
  connections = new Map((connRows || []).map(c => [c.id, c]));
}

function subscribeRealtime() {
  sb.channel('idea-hub-' + currentBoard.id)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'ideas', filter: `board_id=eq.${currentBoard.id}` }, (payload) => {
      if (payload.eventType === 'DELETE') ideas.delete(payload.old.id);
      else ideas.set(payload.new.id, payload.new);
      renderAll();
    })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'connections', filter: `board_id=eq.${currentBoard.id}` }, (payload) => {
      if (payload.eventType === 'DELETE') connections.delete(payload.old.id);
      else connections.set(payload.new.id, payload.new);
      renderAll();
    })
    .subscribe();
}

/* =========================================================================
   RENDER
   ========================================================================= */
function renderAll() {
  canvasWorld.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  edgesLayer.style.transform = canvasWorld.style.transform;

  emptyState.style.display = ideas.size ? 'none' : 'block';

  canvasWorld.innerHTML = '';
  ideas.forEach(idea => canvasWorld.appendChild(buildNode(idea)));

  drawEdges();

  if (selectedIdeaId && ideas.has(selectedIdeaId)) {
    renderDetailPanel(ideas.get(selectedIdeaId));
  } else if (selectedIdeaId && !ideas.has(selectedIdeaId)) {
    closePanel();
  }
}

function buildNode(idea) {
  const el = document.createElement('div');
  el.className = 'idea-node' + (idea.parent_id ? ' subidea' : '');
  el.style.left = idea.x + 'px';
  el.style.top = idea.y + 'px';
  el.style.width = (idea.width || 240) + 'px';
  el.style.borderLeftColor = idea.color || '#00ace1';
  el.dataset.id = idea.id;

  if (linkMode && idea.id === linkSourceId) el.classList.add('link-source');

  el.innerHTML = `
    <div class="idea-node-head">
      <h3>${escapeHtml(idea.title || 'Untitled')}</h3>
    </div>
    <div class="idea-node-body">${escapeHtml(truncate(idea.body || '', 140))}</div>
    <div class="idea-node-foot">
      <span class="node-badge">${idea.parent_id ? 'Sub-idea' : ''}</span>
      <div style="display:flex;">
        <button class="node-btn" data-action="comment" title="Comments">
          <svg class="icon-comment" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </button>
        <button class="node-btn" data-action="link" title="Connect">
          <svg class="icon-link" viewBox="0 0 24 24"><path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8"/></svg>
        </button>
        <button class="node-btn danger" data-action="delete" title="Delete">
          <svg class="icon-trash" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V6h12z"/></svg>
        </button>
      </div>
    </div>
  `;

  // Click node body -> open detail panel (unless in link mode, handled separately)
  el.addEventListener('click', (e) => {
    if (dragState && dragState.moved) return; // suppress click after drag
    if (linkMode) {
      handleLinkTargetClick(idea.id);
      return;
    }
    if (e.target.closest('[data-action]')) return;
    if (e.target.tagName === 'H3') return;
    openPanel(idea.id);
  });

  // Inline title edit
  const h3 = el.querySelector('h3');
  h3.addEventListener('click', (e) => {
    if (linkMode) { handleLinkTargetClick(idea.id); return; }
    e.stopPropagation();
    h3.contentEditable = 'true';
    h3.focus();
    document.execCommand('selectAll', false, null);
  });
  h3.addEventListener('blur', async () => {
    h3.contentEditable = 'false';
    const newTitle = h3.textContent.trim() || 'Untitled';
    if (newTitle !== idea.title) {
      idea.title = newTitle;
      await sb.from('ideas').update({ title: newTitle }).eq('id', idea.id);
    }
  });
  h3.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); h3.blur(); }
  });

  // Action buttons
  el.querySelector('[data-action="comment"]').addEventListener('click', (e) => {
    e.stopPropagation(); openPanel(idea.id, { focusComments: true });
  });
  el.querySelector('[data-action="link"]').addEventListener('click', (e) => {
    e.stopPropagation(); startLinkMode(idea.id);
  });
  el.querySelector('[data-action="delete"]').addEventListener('click', (e) => {
    e.stopPropagation(); deleteIdea(idea.id);
  });

  // Drag to move
  const head = el.querySelector('.idea-node-head');
  head.addEventListener('pointerdown', (e) => startDrag(e, idea, el));

  return el;
}

function drawEdges() {
  const svgns = 'http://www.w3.org/2000/svg';
  edgesLayer.innerHTML = `
    <defs>
      <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
        <path d="M0,0 L8,4 L0,8 Z" fill="var(--glacier)"></path>
      </marker>
    </defs>
  `;

  function center(idea) {
    return { x: idea.x + (idea.width || 240) / 2, y: idea.y + (idea.height || 60) / 2 };
  }

  // parent -> child (dashed)
  ideas.forEach(idea => {
    if (!idea.parent_id) return;
    const parent = ideas.get(idea.parent_id);
    if (!parent) return;
    drawLine(center(parent), center(idea), true);
  });

  // free connections (solid, with arrowhead)
  connections.forEach(conn => {
    const s = ideas.get(conn.source_id), t = ideas.get(conn.target_id);
    if (!s || !t) return;
    drawLine(center(s), center(t), false);
  });

  function drawLine(a, b, dashed) {
    const path = document.createElementNS(svgns, 'path');
    const mx = (a.x + b.x) / 2;
    const d = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
    path.setAttribute('d', d);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', dashed ? 'rgba(226,232,240,0.35)' : 'var(--glacier)');
    path.setAttribute('stroke-width', dashed ? '1.5' : '2');
    if (dashed) path.setAttribute('stroke-dasharray', '5,5');
    else path.setAttribute('marker-end', 'url(#arrowhead)');
    edgesLayer.appendChild(path);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
function truncate(str, n) { return str.length > n ? str.slice(0, n) + '…' : str; }

/* =========================================================================
   CREATE / UPDATE / DELETE IDEAS
   ========================================================================= */
$('new-idea-btn').addEventListener('click', () => createIdea());

async function createIdea(parentId = null) {
  const centerX = (-panX + canvasWrap.clientWidth / 2) / zoom - 120;
  const centerY = (-panY + canvasWrap.clientHeight / 2) / zoom - 70;

  const payload = {
    board_id: currentBoard.id,
    parent_id: parentId,
    title: 'New idea',
    body: '',
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    x: Math.max(20, centerX + (Math.random() * 60 - 30)),
    y: Math.max(20, centerY + (Math.random() * 60 - 30)),
    width: 240,
    height: 150,
    created_by: currentUser.id,
  };

  const { data, error } = await sb.from('ideas').insert(payload).select().single();
  if (error) { console.error(error); return; }
  ideas.set(data.id, data);
  renderAll();
  openPanel(data.id);
}

async function deleteIdea(id) {
  if (!confirm('Delete this idea and any sub-ideas?')) return;
  const { error } = await sb.from('ideas').delete().eq('id', id);
  if (error) { console.error(error); return; }
  ideas.delete(id);
  [...ideas.values()].filter(i => i.parent_id === id).forEach(i => ideas.delete(i.id));
  [...connections.values()].filter(c => c.source_id === id || c.target_id === id).forEach(c => connections.delete(c.id));
  if (selectedIdeaId === id) closePanel();
  renderAll();
}

/* =========================================================================
   DRAG TO REPOSITION
   ========================================================================= */
function startDrag(e, idea, el) {
  if (linkMode) return;
  e.preventDefault();
  el.setPointerCapture(e.pointerId);
  el.classList.add('dragging');

  const startX = e.clientX, startY = e.clientY;
  const originX = idea.x, originY = idea.y;
  dragState = { id: idea.id, moved: false };

  function onMove(ev) {
    const dx = (ev.clientX - startX) / zoom;
    const dy = (ev.clientY - startY) / zoom;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragState.moved = true;
    idea.x = originX + dx;
    idea.y = originY + dy;
    el.style.left = idea.x + 'px';
    el.style.top = idea.y + 'px';
    drawEdges();
  }

  async function onUp() {
    el.classList.remove('dragging');
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
    if (dragState && dragState.moved) {
      await sb.from('ideas').update({ x: idea.x, y: idea.y }).eq('id', idea.id);
    }
    setTimeout(() => { dragState = null; }, 0);
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
}

/* =========================================================================
   PAN & ZOOM
   ========================================================================= */
canvasWrap.addEventListener('pointerdown', (e) => {
  if (e.target !== canvasWrap && e.target !== canvasWorld && e.target.id !== 'edges-layer' && !e.target.classList.contains('edges-layer')) return;
  isPanning = true;
  canvasWrap.classList.add('panning');
  panStart = { x: e.clientX - panX, y: e.clientY - panY };
});
window.addEventListener('pointermove', (e) => {
  if (!isPanning) return;
  panX = e.clientX - panStart.x;
  panY = e.clientY - panStart.y;
  canvasWorld.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  edgesLayer.style.transform = canvasWorld.style.transform;
});
window.addEventListener('pointerup', () => { isPanning = false; canvasWrap.classList.remove('panning'); });

canvasWrap.addEventListener('wheel', (e) => {
  if (!e.ctrlKey && !e.metaKey) return;
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.08 : 0.08;
  setZoom(zoom + delta);
}, { passive: false });

$('zoom-in').addEventListener('click', () => setZoom(zoom + 0.15));
$('zoom-out').addEventListener('click', () => setZoom(zoom - 0.15));
$('zoom-reset').addEventListener('click', () => { zoom = 1; panX = 0; panY = 0; applyTransform(); });

function setZoom(z) { zoom = Math.min(2, Math.max(0.4, z)); applyTransform(); }
function applyTransform() {
  canvasWorld.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  edgesLayer.style.transform = canvasWorld.style.transform;
}

/* =========================================================================
   LINK MODE (free connections between any two ideas)
   ========================================================================= */
function startLinkMode(id) {
  linkMode = true;
  linkSourceId = id;
  linkHint.classList.add('show');
  renderAll();
}
$('link-cancel').addEventListener('click', exitLinkMode);
function exitLinkMode() {
  linkMode = false;
  linkSourceId = null;
  linkHint.classList.remove('show');
  renderAll();
}

async function handleLinkTargetClick(targetId) {
  if (targetId === linkSourceId) { exitLinkMode(); return; }
  const source = linkSourceId;
  const { data, error } = await sb
    .from('connections')
    .insert({ board_id: currentBoard.id, source_id: source, target_id: targetId })
    .select()
    .single();
  if (error) { console.error(error); }
  else connections.set(data.id, data);
  exitLinkMode();
}

/* =========================================================================
   DETAIL PANEL (title, body, color, sub-ideas, comments)
   ========================================================================= */
function openPanel(id, opts = {}) {
  selectedIdeaId = id;
  detailPanel.classList.add('open');
  const idea = ideas.get(id);
  renderDetailPanel(idea);
  loadComments(id, opts.focusComments);
}

function closePanel() {
  selectedIdeaId = null;
  detailPanel.classList.remove('open');
}
$('panel-close').addEventListener('click', closePanel);

function renderDetailPanel(idea) {
  $('detail-title').value = idea.title || '';
  $('detail-body').value = idea.body || '';

  const colorRow = $('color-row');
  colorRow.innerHTML = '';
  COLORS.forEach(c => {
    const dot = document.createElement('div');
    dot.className = 'color-dot' + (idea.color === c ? ' active' : '');
    dot.style.background = c;
    dot.addEventListener('click', () => { idea.color = c; renderDetailPanel(idea); });
    colorRow.appendChild(dot);
  });

  const subs = [...ideas.values()].filter(i => i.parent_id === idea.id);
  $('subidea-label').textContent = `Sub-ideas (${subs.length})`;
  const list = $('subidea-list');
  list.innerHTML = '';
  subs.forEach(s => {
    const row = document.createElement('div');
    row.className = 'subidea-item';
    row.innerHTML = `<span>${escapeHtml(s.title)}</span><span style="color:var(--glacier);">→</span>`;
    row.addEventListener('click', () => openPanel(s.id));
    list.appendChild(row);
  });
}

$('save-idea-btn').addEventListener('click', async () => {
  const idea = ideas.get(selectedIdeaId);
  if (!idea) return;
  idea.title = $('detail-title').value.trim() || 'Untitled';
  idea.body = $('detail-body').value;
  const { error } = await sb.from('ideas').update({
    title: idea.title, body: idea.body, color: idea.color,
  }).eq('id', idea.id);
  if (error) console.error(error);
  renderAll();
});

$('add-subidea-btn').addEventListener('click', () => {
  if (!selectedIdeaId) return;
  createIdea(selectedIdeaId);
});

$('link-mode-btn').addEventListener('click', () => {
  if (!selectedIdeaId) return;
  startLinkMode(selectedIdeaId);
});

$('delete-idea-btn').addEventListener('click', () => {
  if (!selectedIdeaId) return;
  deleteIdea(selectedIdeaId);
});

/* ---------------------------------------------------------------------
   COMMENTS
   --------------------------------------------------------------------- */
async function loadComments(ideaId, focus) {
  const { data, error } = await sb.from('comments').select('*').eq('idea_id', ideaId).order('created_at');
  if (error) { console.error(error); return; }
  renderComments(data || []);
  if (focus) $('comment-input').focus();
}

function renderComments(rows) {
  const list = $('comment-list');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = '<p style="font-size:0.78rem;color:var(--text-dim);">No comments yet.</p>';
    return;
  }
  rows.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';
    const date = new Date(c.created_at).toLocaleString();
    item.innerHTML = `<div class="meta">${date}</div><div class="body">${escapeHtml(c.body)}</div>`;
    list.appendChild(item);
  });
}

$('comment-submit').addEventListener('click', async () => {
  const input = $('comment-input');
  const body = input.value.trim();
  if (!body || !selectedIdeaId) return;
  const { error } = await sb.from('comments').insert({
    idea_id: selectedIdeaId, author_id: currentUser.id, body,
  });
  if (error) { console.error(error); return; }
  input.value = '';
  loadComments(selectedIdeaId);
});

/* =========================================================================
   INIT — check for an existing session on load
   ========================================================================= */
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session && session.user) {
    currentUser = session.user;
    enterApp();
  }
})();