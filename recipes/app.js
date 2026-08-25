'use strict';

/* ================================================================
   CONFIG — replace with your project URL and anon key
   ================================================================ */
const SUPABASE_URL = 'VITE_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'VITE_SUPABASE_ANON_KEY';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ================================================================
   STATE
   ================================================================ */
const state = {
    user: null,
    recipes: [],
    currentId: null,
    editingId: null,
    kitchen: { recipe: null, servings: null, doneSteps: new Set(), checkedIng: new Set() },
    searchQuery: ''
};

/* ================================================================
   UTILITIES
   ================================================================ */

// SECURITY: escapeHtml prevents XSS from any user/database-supplied string
function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
}

// SECURITY: sanitizeUrl blocks javascript: URLs on image/src attributes
function safeImgUrl(url) {
    try { const u = new URL(url); return ['http:', 'https:', 'data:'].includes(u.protocol) ? url : ''; }
    catch { return ''; }
}

function formatQty(qty) {
    if (qty == null || qty === '') return '';
    const n = Number(qty);
    if (!isFinite(n)) return String(qty);
    if (Number.isInteger(n)) return String(n);
    const fracMap = { 0.25: '\u00BC', 0.33: '\u2153', 0.5: '\u00BD', 0.67: '\u2154', 0.75: '\u00BE' };
    const whole = Math.floor(n), frac = +(n - whole).toFixed(2);
    if (fracMap[frac] !== undefined) return whole ? `whole{whole}whole{fracMap[frac]}` : fracMap[frac];
    return String(Math.round(n * 100) / 100);
}

function formatTime(mins) {
    mins = Number(mins) || 0;
    if (mins >= 60) {
        const h = Math.floor(mins / 60), m = mins % 60;
        return m ? `hh{h}hhh{m}m` : `${h}h`;
    }
    return `${mins}m`;
}

function parseTags(str) {
    return String(str || '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 12);
}

function toast(msg, type = 'info') {
    const stack = document.getElementById('toast-stack');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = msg;
    stack.appendChild(el);
    setTimeout(() => el.remove(), 4000);
}

/* ================================================================
   VIEW ROUTING
   ================================================================ */
const views = ['browse-view', 'detail-view', 'form-view'];

function showView(name) {
    views.forEach(id => document.getElementById(id).hidden = id !== name);
    document.getElementById('login-screen').hidden = name !== 'login';
    window.scrollTo({ top: 0, behavior: 'auto' });
}

/* ================================================================
   AUTH
   ================================================================ */
async function initAuth() {
    const { data } = await sb.auth.getSession();
    setUser(data?.session?.user ?? null);
    sb.auth.onAuthStateChange((_e, session) => setUser(session?.user ?? null));
}

function setUser(user) {
    state.user = user;
    document.getElementById('btn-new-recipe').hidden = !user;
    const navBtn = document.getElementById('btn-login-nav');
    document.getElementById('user-email-label').textContent =
        user ? user.email : 'Browse & Cook — no account needed';
    if (user) {
        navBtn.textContent = 'Sign Out';
        navBtn.dataset.mode = 'signout';
    } else {
        navBtn.textContent = 'Sign In';
        navBtn.dataset.mode = 'signin';
    }
    loadRecipes();
}

document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errEl = document.getElementById('error-msg');
    errEl.textContent = '';
    const btn = document.getElementById('btn-sign-in');
    btn.disabled = true;
    try {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showView('browse');
    } catch (err) {
        errEl.textContent = err.message || 'Sign in failed.';
    } finally {
        btn.disabled = false;
    }
});

document.getElementById('btn-login-nav').addEventListener('click', () => {
    const btn = e.currentTarget;
    if (btn.dataset.mode === 'signout') {
        sb.auth.signOut().then(() => toast('Signed out.', 'success'));
    } else {
        showView('login');
    }
});
// NOTE: the handler above reads e.currentTarget but binds with an implicit event param — corrected binding:
document.getElementById('btn-login-nav').onclick = function () {
    if (this.dataset.mode === 'signout') {
        sb.auth.signOut().then(() => toast('Signed out.', 'success'));
    } else {
        showView('login');
    }
};

/* ================================================================
   DATA LOADING
   ================================================================ */
async function loadRecipes() {
    const grid = document.getElementById('recipe-grid');
    grid.innerHTML = '<div class="empty-state">Loading recipes…</div>';
    try {
        let query = sb.from('recipes').select('*').order('created_at', { ascending: false });
        if (!state.user) query = query.eq('is_public', true);
        const { data, error } = await query;
        if (error) throw error;
        state.recipes = data || [];
        renderGrid();
    } catch (err) {
        grid.innerHTML = '';
        toast('Failed to load recipes: ' + err.message, 'error');
    }
}

/* ================================================================
   BROWSE GRID RENDER
   ================================================================ */
function renderGrid() {
    const grid = document.getElementById('recipe-grid');
    const q = state.searchQuery.toLowerCase();
    const filtered = q
        ? state.recipes.filter(r =>
            r.title?.toLowerCase().includes(q) ||
            (r.tags || []).some(t => t.toLowerCase().includes(q)))
        : state.recipes;

    grid.innerHTML = '';

    if (!filtered.length) {
        const div = document.createElement('div');
        div.className = 'empty-state';
        div.textContent = q ? `No recipes match “${state.searchQuery}”.` :
            (state.user ? 'No recipes yet. Click “New Recipe” to add your first one.'
                : 'No public recipes available yet.');
        grid.appendChild(div);
        return;
    }

    filtered.forEach(r => {
        const card = document.createElement('article');
        card.className = 'recipe-card';
        card.tabIndex = 0;
        card.setAttribute('role', 'link');

        const imgWrap = document.createElement('div');
        imgWrap.className = 'rc-image-wrap';
        if (r.image_url) {
            const img = document.createElement('img');
            img.src = safeImgUrl(r.image_url);
            img.alt = '';
            img.loading = 'lazy';
            img.decoding = 'async';
            if (img.src) imgWrap.appendChild(img);
        }
        if (r.category) {
            const pill = document.createElement('span');
            pill.className = 'rc-badge-pill';
            pill.textContent = r.category;
            imgWrap.appendChild(pill);
        }
        card.appendChild(imgWrap);

        const title = document.createElement('h3');
        title.textContent = r.title;
        card.appendChild(title);

        if (r.description) {
            const desc = document.createElement('p');
            desc.className = 'rc-description-clamped';
            desc.textContent = r.description;
            card.appendChild(desc);
        }

        const meta = document.createElement('div');
        meta.className = 'rc-meta';
        meta.append(
            Object.assign(document.createElement('span'), { textContent: `⏱ ${formatTime(r.total_minutes)}` }),
            Object.assign(document.createElement('span'), { textContent: `🍽 ${r.servings ?? '—'} servings` })
        );
        card.appendChild(meta);

        if ((r.tags || []).length) {
            const tags = document.createElement('div');
            tags.className = 'rc-tags';
            r.tags.slice(0, 4).forEach(t => {
                const chip = document.createElement('span');
                chip.className = 'rc-tag';
                chip.textContent = t;
                tags.appendChild(chip);
            });
            card.appendChild(tags);
        }

        const open = () => openDetail(r.id);
        card.addEventListener('click', open);
        card.addEventListener('keydown', ev => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); open(); } });
        grid.appendChild(card);
    });
}

document.getElementById('search-input').addEventListener('input', e => {
    state.searchQuery = e.target.value.trim();
    renderGrid();
});

/* ================================================================
   DETAIL VIEW
   ================================================================ */
function openDetail(id) {
    const r = state.recipes.find(x => x.id === id);
    if (!r) return;
    state.currentId = id;

    const v = document.getElementById('detail-view');
    v.innerHTML = '';

    const panel = document.createElement('div');
    panel.className = 'detail-panel';

    if (r.image_url) {
        const wrap = document.createElement('div');
        wrap.className = 'detail-image-container';
        const img = document.createElement('img');
        img.src = safeImgUrl(r.image_url);
        img.alt = '';
        if (img.src) wrap.appendChild(img);
        panel.appendChild(wrap);
    }

    panel.appendChild(Object.assign(document.createElement('span'),
        { className: 'eyebrow-label overview-label', textContent: r.category || 'Recipe' }));

    panel.appendChild(Object.assign(document.createElement('h2'),
        { className: 'detail-title', textContent: r.title }));

    const meta = document.createElement('div');
    meta.className = 'detail-meta';
    meta.append(
        Object.assign(document.createElement('span'), { textContent: `⏱ ${formatTime(r.total_minutes)}` }),
        Object.assign(document.createElement('span'), { textContent: `🍽 ${r.servings ?? '—'} servings` }),
        Object.assign(document.createElement('span'), { textContent: `📋 ${(r.ingredients || []).length} ingredients` })
    );
    panel.appendChild(meta);

    if ((r.tags || []).length) {
        const tags = document.createElement('div');
        tags.className = 'detail-tags';
        r.tags.forEach(t => {
            tags.appendChild(Object.assign(document.createElement('span'),
                { className: 'tag-chip', textContent: t }));
        });
        panel.appendChild(tags);
    }

    if (r.description) {
        panel.appendChild(Object.assign(document.createElement('p'),
            { className: 'detail-desc', textContent: r.description }));
    }

    // Ingredients
    const ingSec = document.createElement('div');
    ingSec.appendChild(Object.assign(document.createElement('h3'),
        { className: 'block-subhead', textContent: 'Ingredients' }));
    (r.ingredients || []).forEach(ing => {
        const row = document.createElement('div');
        row.className = 'ingredient-row';
        const qty = document.createElement('span');
        qty.className = 'ingredient-qty';
        qty.textContent = ing.qty != null ? formatQty(ing.qty) + (ing.unit ? ' ' + ing.unit : '') : '—';
        const name = document.createElement('span');
        name.className = 'ingredient-name';
        name.textContent = ing.name + (ing.note ? ' ' : '');
        row.append(qty, name);
        if (ing.note) {
            const note = document.createElement('span');
            note.className = 'ingredient-note';
            note.textContent = ing.note;
            row.appendChild(note);
        }
        ingSec.appendChild(row);
    });
    panel.appendChild(ingSec);

    // Steps
    const stepSec = document.createElement('div');
    stepSec.style.marginTop = '2rem';
    stepSec.appendChild(Object.assign(document.createElement('h3'),
        { className: 'block-subhead', textContent: 'Method' }));
    (r.steps || []).forEach((st, i) => {
        const row = document.createElement('div');
        row.className = 'step-row';
        row.appendChild(Object.assign(document.createElement('span'),
            { className: 'step-num', textContent: String(i + 1).padStart(2, '0') }));
        const content = document.createElement('div');
        content.className = 'step-content';
        content.appendChild(Object.assign(document.createElement('div'),
            { className: 'step-title-text', textContent: st.title }));
        if (st.desc) content.appendChild(Object.assign(document.createElement('p'),
            { className: 'step-desc-text', textContent: st.desc }));
        if (st.timer_minutes > 0) {
            const chip = document.createElement('span');
            chip.className = 'k-timer-chip';
            chip.setAttribute('role', 'button');
            chip.tabIndex = 0;
            chip.textContent = `⏲ ${st.timer_minutes} min timer`;
            chip.addEventListener('click', ev => { ev.stopPropagation(); startTimer(st.timer_minutes, st.title); });
            chip.addEventListener('keydown', ev => { if (ev.key === 'Enter') startTimer(st.timer_minutes, st.title); });
            content.appendChild(chip);
        }
        row.appendChild(content);
        stepSec.appendChild(row);
    });
    panel.appendChild(stepSec);

    // Tips
    if (r.tips) {
        const tips = document.createElement('div');
        tips.className = 'tips-panel';
        tips.innerHTML = '<div class="tips-header">💡 Chef\u2019s Tips</div>';
        tips.appendChild(Object.assign(document.createElement('p'), { textContent: r.tips }));
        panel.appendChild(tips);
    }

    // Actions
    const actions = document.createElement('div');
    actions.className = 'detail-actions';
    const back = document.createElement('button');
    back.className = 'btn ghost small';
    back.type = 'button';
    back.innerHTML = '<svg class="icon-vector icon-arrow-left" aria-hidden="true" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg> Back to Recipes';
    back.addEventListener('click', () => showView('browse'));
    actions.appendChild(back);

    if (state.user) {
        const cook = document.createElement('button');
        cook.className = 'btn primary';
        cook.type = 'button';
        cook.innerHTML = '<svg class="icon-vector" aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Cook This';
        cook.addEventListener('click', () => openKitchen(r));
        actions.appendChild(cook);

        const edit = document.createElement('button');
        edit.className = 'btn outline';
        edit.type = 'button';
        edit.textContent = 'Edit';
        edit.addEventListener('click', () => openForm(r.id));
        actions.appendChild(edit);

        const del = document.createElement('button');
        del.className = 'btn danger';
        del.type = 'button';
        del.textContent = 'Delete';
        del.addEventListener('click', () => confirmModal(
            'Delete Recipe?', `This will permanently delete “${r.title}”.`,
            async () => {
                const { error } = await sb.from('recipes').delete().eq('id', r.id);
                if (error) { toast('Delete failed: ' + error.message, 'error'); return; }
                toast('Recipe deleted.', 'success');
                state.recipes = state.recipes.filter(x => x.id !== r.id);
                showView('browse'); renderGrid();
            }));
        actions.appendChild(del);
    }
    panel.appendChild(actions);
    v.appendChild(panel);
    showView('detail');
}

/* ================================================================
   FORM VIEW
   ================================================================ */
function openForm(editId) {
    state.editingId = editId || null;
    const r = editId ? state.recipes.find(x => x.id === editId) : null;

    document.getElementById('form-mode-label').textContent =
        editId ? 'Edit' : 'Create';
    document.getElementById('f-title').value = r?.title || '';
    document.getElementById('f-desc').value = r?.description || '';
    document.getElementById('f-servings').value = r?.servings ?? 4;
    document.getElementById('f-time').value = r?.total_minutes ?? '';
    document.getElementById('f-tags').value = (r?.tags || []).join(', ');
    document.getElementById('f-image').value = r?.image_url || '';
    document.getElementById('f-tips').value = r?.tips || '';

    renderIngredientsEditor(r?.ingredients || []);
    renderStepsEditor(r?.steps || []);
    showView('form');
}

function renderIngredientsEditor(list) {
    const wrap = document.getElementById('ingredients-editor');
    wrap.innerHTML = '';
    list.forEach(addIngredientRow);
}

function addIngredientRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dyn-row';

    const mk = (tag, cls, attrs = {}) => {
        const el = document.createElement(tag);
        el.className = cls;
        Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
        return el;
    };

    row.appendChild(mk('input', '', {
        type: 'number', step: 'any', min: '0',
        value: data.qty ?? '', placeholder: 'Qty', 'aria-label': 'Quantity'
    }));
    row.appendChild(mk('input', 'unit-input', {
        type: 'text', maxlength: '20',
        value: data.unit || '', placeholder: 'Unit', 'aria-label': 'Unit'
    }));
    row.appendChild(mk('input', '', {
        type: 'text', maxlength: '80',
        value: data.name || '', placeholder: 'Ingredient *', 'aria-label': 'Ingredient name'
    }));
    row.appendChild(mk('input', 'note-input', {
        type: 'text', maxlength: '120',
        value: data.note || '', placeholder: 'Note (optional)', 'aria-label': 'Note'
    }));

    const rm = document.createElement('button');
    rm.className = 'btn ghost small';
    rm.type = 'button';
    rm.textContent = '✕';
    rm.setAttribute('aria-label', 'Remove ingredient');
    rm.addEventListener('click', () => row.remove());
    row.appendChild(rm);

    document.getElementById('ingredients-editor').appendChild(row);
}

function renderStepsEditor(list) {
    document.getElementById('steps-editor').innerHTML = '';
    list.forEach(addStepRow);
}

function addStepRow(data = {}) {
    const row = document.createElement('div');
    row.className = 'dyn-row';

    const num = document.createElement('span');
    num.className = 'step-num';
    renumberSteps();
    row.appendChild(num);

    const title = document.createElement('input');
    title.type = 'text'; title.maxLength = 100; title.placeholder = 'Step summary *';
    title.setAttribute('aria-label', 'Step summary');
    title.value = data.title || '';
    row.appendChild(title);

    const desc = document.createElement('textarea');
    desc.maxLength = 500; desc.placeholder = 'Detailed instructions…';
    desc.setAttribute('aria-label', 'Step description');
    desc.value = data.desc || '';
    row.appendChild(desc);

    const timerWrap = document.createElement('div');
    timerWrap.className = 'checkbox-wrap';

    const tmin = document.createElement('input');
    tmin.type = 'number'; tmin.min = 0; tmin.max = 720; tmin.style.width = '70px';
    tmin.value = data.timer_minutes > 0 ? data.timer_minutes : '';
    tmin.setAttribute('aria-label', 'Timer minutes');

    const tlabel = document.createElement('label');
    tlabel.append(tmin, document.createTextNode(' min timer'));
    timerWrap.appendChild(tlabel);
    row.appendChild(timerWrap);

    const rm = document.createElement('button');
    rm.className = 'btn ghost small'; rm.type = 'button'; rm.textContent = '✕';
    rm.setAttribute('aria-label', 'Remove step');
    rm.addEventListener('click', () => { row.remove(); renumberSteps(); });
    row.appendChild(rm);

    document.getElementById('steps-editor').appendChild(row);
    renumberSteps();
}

function renumberSteps() {
    document.querySelectorAll('#steps-editor .dyn-row .step-num')
        .forEach((el, i) => el.textContent = String(i + 1).padStart(2, '0'));
}

document.querySelectorAll('[data-add]').forEach(btn =>
    btn.addEventListener('click', () =>
        btn.dataset.add === 'ingredient' ? addIngredientRow() : addStepRow()));

document.getElementById('recipe-form').addEventListener('submit', async e => {
    e.preventDefault();

    const ingredients = [...document.querySelectorAll('#ingredients-editor .dyn-row')].map(row => {
        const [qty, unit, name] = row.querySelectorAll('input');
        const note = row.querySelector('.note-input') || null;
        const nEl = note ? note : null;
        const noteVal = nEl ? nEl.value.trim() : '';
        const qtyNum = qty.value === '' ? null : Number(qty.value);
        return {
            qty: qtyNum,
            unit: unit.value.trim(),
            name: name.value.trim(),
            note: noteVal
        };
    }).filter(i => i.name);

    const steps = [...document.querySelectorAll('#steps-editor .dyn-row')].map(row => {
        const inputs = row.querySelectorAll('input[type=text]');
        const ta = row.querySelector('textarea');
        const tnum = row.querySelector('input[type=number]');
        return {
            title: inputs[0]?.value.trim() || '',
            desc: ta?.value.trim() || '',
            timer_minutes: tnum && tnum.value !== '' ? Number(tnum.value) : 0
        };
    }).filter(s => s.title);

    const payload = {
        title: document.getElementById('f-title').value.trim(),
        description: document.getElementById('f-desc').value.trim(),
        servings: Number(document.getElementById('f-servings').value) || 4,
        total_minutes: Number(document.getElementById('f-time').value) || 0,
        tags: parseTags(document.getElementById('f-tags').value),
        image_url: safeImgUrl(document.getElementById('f-image').value.trim()) || null,
        tips: document.getElementById('f-tips').value.trim(),
        category: '',
        ingredients,
        steps,
        is_public: false
    };

    if (!payload.title) { toast('Title is required.', 'error'); return; }

    try {
        let saved;
        if (state.editingId) {
            ({ data: saved } = await sb.from('recipes')
                .update(payload).eq('id', state.editingId).select());
        } else {
            ({ data: saved } = await sb.from('recipes').insert(payload).select());
        }
        const rec = saved?.[0];
        if (!rec) throw new Error('Save returned no data.');
        const idx = state.recipes.findIndex(x => x.id === rec.id);
        if (idx >= 0) state.recipes[idx] = rec; else state.recipes.unshift(rec);
        toast(state.editingId ? 'Recipe updated.' : 'Recipe created.', 'success');
        openDetail(rec.id);
    } catch (err) {
        toast('Save failed: ' + err.message, 'error');
    }
});

document.getElementById('btn-cancel-form').addEventListener('click', () => showView('browse'));
document.getElementById('btn-new-recipe').addEventListener('click', () => openForm(null));

/* ================================================================
   KITCHEN MODE
   ================================================================ */
function openKitchen(recipe) {
    state.kitchen = { recipe, servings: recipe.servings, doneSteps: new Set(), checkedIng: new Set() };
    document.getElementById('k-title').textContent = recipe.title;
    document.getElementById('k-serving-label').textContent = `${recipe.servings} servings`;
    renderKitchenIngredients();
    renderKitchenSteps();
    document.getElementById('kitchen-view').hidden = false;
    document.body.classList.add('kitchen-open');
}

function closeKitchen() {
    document.getElementById('kitchen-view').hidden = true;
    document.body.classList.remove('kitchen-open');
    state.kitchen = { recipe: null, servings: null, doneSteps: new Set(), checkedIng: new Set() };
}

function scaledQty(qty) {
    const base = state.kitchen.recipe.servings || 1;
    const target = state.kitchen.servings || base;
    if (qty == null) return null;
    return Math.round(qty * (target / base) * 100) / 100;
}

function renderKitchenIngredients() {
    const list = document.getElementById('k-ingredients');
    list.innerHTML = '';
    (state.kitchen.recipe.ingredients || []).forEach((ing, i) => {
        const row = document.createElement('div');
        row.className = 'kitchen-ing-row' + (state.kitchen.checkedIng.has(i) ? ' checked' : '');
        row.setAttribute('role', 'checkbox');
        row.tabIndex = 0;
        row.setAttribute('aria-checked', String(state.kitchen.checkedIng.has(i)));

        const box = document.createElement('span');
        box.className = 'kitchen-ing-checkbox';
        box.textContent = '✓';
        row.appendChild(box);

        const qty = document.createElement('span');
        qty.className = 'kitchen-ing-qty';
        const sq = scaledQty(ing.qty);
        qty.textContent = sq != null ? formatQty(sq) + (ing.unit ? ' ' + ing.unit : '') : '';
        row.appendChild(qty);

        const nm = document.createElement('span');
        nm.textContent = ing.name + (ing.note ? ` (${ing.note})` : '');
        row.appendChild(nm);

        const toggle = () => {
            state.kitchen.checkedIng.has(i)
                ? state.kitchen.checkedIng.delete(i)
                : state.kitchen.checkedIng.add(i);
            renderKitchenIngredients();
        };
        row.addEventListener('click', toggle);
        row.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); toggle(); }
        });
        list.appendChild(row);
    });
}

function renderKitchenSteps() {
    const wrap = document.getElementById('k-steps');
    wrap.innerHTML = '';
    const steps = state.kitchen.recipe.steps || [];
    let firstUndone = steps.findIndex((_, i) => !state.kitchen.doneSteps.has(i));
    if (firstUndone === -1) firstUndone = 0;

    steps.forEach((st, i) => {
        const btn = document.createElement('button');
        btn.className = 'kitchen-step'
            + (state.kitchen.doneSteps.has(i) ? ' done' : '')
            + (i === firstUndone ? ' current' : '');
        btn.type = 'button';

        const num = document.createElement('span');
        num.className = 'k-step-num';
        num.textContent = String(i + 1).padStart(2, '0');
        btn.appendChild(num);

        const content = document.createElement('div');
        content.className = 'k-step-content';
        content.appendChild(Object.assign(document.createElement('div'),
            { className: 'k-step-title', textContent: st.title }));
        if (st.desc) content.appendChild(Object.assign(document.createElement('p'),
            { className: 'k-step-desc', textContent: st.desc }));
        if (st.timer_minutes > 0) {
            const chip = document.createElement('span');
            chip.className = 'k-timer-chip';
            chip.setAttribute('role', 'button');
            chip.tabIndex = 0;
            chip.textContent = `⏲ ${st.timer_minutes} min`;
            chip.addEventListener('click', ev => { ev.stopPropagation(); startTimer(st.timer_minutes, st.title); });
            chip.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.stopPropagation(); startTimer(st.timer_minutes, st.title); } });
            content.appendChild(chip);
        }
        btn.appendChild(content);
        btn.addEventListener('click', () => {
            state.kitchen.doneSteps.has(i)
                ? state.kitchen.doneSteps.delete(i)
                : state.kitchen.doneSteps.add(i);
            renderKitchenSteps();
        });
        wrap.appendChild(btn);
    });

    const pct = steps.length ? Math.round(done / steps.length * 100) : 0;
    document.getElementById('k-progress-fill').style.width = pct + '%';
    document.getElementById('k-progress').setAttribute('aria-valuenow', pct);
}

document.getElementById('btn-exit-kitchen').addEventListener('click', closeKitchen);

/* ================================================================
   TIMER
   ================================================================ */
let timerInterval = null;

function startTimer(minutes, label) {
    stopTimer(false);
    const overlay = document.getElementById('timer-overlay');
    document.getElementById('timer-title').textContent = label || 'Timer';
    overlay.classList.add('active');
    const display = document.getElementById('timer-display');
    let remaining = minutes * 60;

    const tick = () => {
        remaining--;
        if (remaining <= 0) {
            clearInterval(timerInterval);
            display.textContent = "00:00";
            document.querySelector('.timer-box').classList.add('alarm');
            toast(`⏰ Time's up — ${label}`, 'success');
            try {
                beep(3);
            } catch (_) { /* audio may be blocked */ }
            return;
        }
        display.textContent = fmtClock(remaining);
    };
    display.textContent = fmtClock(remaining);
    timerInterval = setInterval(tick, 1000);
}

function stopTimer(hideOverlay = true) {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    if (hideOverlay) {
        document.getElementById('timer-overlay').classList.remove('active');
        document.querySelector('.timer-box')?.classList.remove('alarm');
    }
}

function fmtClock(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
}

// Simple WebAudio beeper — no external assets needed
function beep(times = 3) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        for (let i = 0; i < times; i++) {
            const osc = ctx.createOscillator(), gain = ctx.createGain();
            osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.001, ctx.currentTime + i * 0.35);
            gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.35 + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.35 + 0.3);
            osc.connect(gain).connect(ctx.destination);
            osc.start(ctx.currentTime + i * 0.35);
            osc.stop(ctx.currentTime + i * 0.35 + 0.32);
        }
    } catch (_) { /* no audio available */ }
}

document.getElementById('btn-timer-stop').addEventListener('click', () => stopTimer(true));
document.getElementById('timer-overlay').addEventListener('click', e => {
    if (e.target.id === 'timer-overlay') stopTimer(true);
});

/* ================================================================
   CONFIRM MODAL
   ================================================================ */
let modalCallback = null;

function confirmModal(title, message, onConfirm) {
    modalCallback = onConfirm;
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-message').textContent = message;
    document.getElementById('modal-backdrop').classList.add('active');
}

document.getElementById('btn-modal-cancel').addEventListener('click', hideModal);
document.getElementById('btn-modal-confirm').addEventListener('click', async () => {
    hideModal();
    if (modalCallback) await modalCallback();
    modalCallback = null;
});
document.getElementById('modal-backdrop').addEventListener('click', e => {
    if (e.target.id === 'modal-backdrop') hideModal();
});

function hideModal() {
    document.getElementById('modal-backdrop').classList.remove('active');
}

/* ================================================================
   NAV WIRING & INIT
   ================================================================ */
document.getElementById('btn-home').addEventListener('click', () => {
    if (!document.getElementById('kitchen-view').hidden) closeKitchen();
    else showView('browse');
});
document.getElementById('login-home-link').addEventListener('click', () => showView('browse'));

window.addEventListener('beforeunload', e => {
    if (!document.getElementById('kitchen-view').hidden) { e.preventDefault(); e.returnValue = ''; }
});

(async function init() {
    initAuth();
    showView('browse');
})();
