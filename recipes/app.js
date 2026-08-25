const SUPABASE_URL = "https://eyvgammlolmqsylagygk.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV5dmdhbW1sb2xtcXN5bGFneWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0NjE3NzcsImV4cCI6MjEwMjAzNzc3N30.ZMNTTj_VRblCWGo-BI_ixEOxsz0EPtRJGKGIrr3zfLg";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const NAME_KEY = 'recipes_author_name';
let currentUser = null;
let recipes = [];
let searchTerm = '';
let currentView = 'browse';
let currentRecipeId = null;
let formState = null;
let kitchen = null;

// Dynamic Copyright Year
const yearEl = document.getElementById('year');
if (yearEl) yearEl.textContent = new Date().getFullYear();

/* ==========================================================================
   1. AUTHENTICATION & SESSION HANDLING
   ========================================================================== */

async function checkSession() {
    const { data: { session } } = await sb.auth.getSession();
    currentUser = session ? session.user : null;
    // Always start by rendering the public catalog directly
    await showApp();
}

async function attemptLogin() {
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const errEl = document.getElementById('error-msg');
    errEl.textContent = '';

    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        errEl.textContent = error.message;
        return;
    }
    currentUser = data.user;
    await showApp();
}

// Login Screen Triggers
document.getElementById('login-btn')?.addEventListener('click', attemptLogin);

['email', 'password'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') attemptLogin();
    });
});

document.getElementById('signin-nav-btn')?.addEventListener('click', () => {
    document.getElementById('app-screen').classList.add('hidden');
    document.getElementById('login-screen').classList.remove('hidden');
});

document.getElementById('cancel-login-btn')?.addEventListener('click', () => {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');
});

document.getElementById('signout')?.addEventListener('click', async () => {
    await sb.auth.signOut();
    currentUser = null;
    await showApp();
});

async function showApp() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app-screen').classList.remove('hidden');

    const isLoggedIn = !!currentUser;

    // Toggle Navigation Controls based on Authentication
    document.getElementById('signin-nav-btn')?.classList.toggle('hidden', isLoggedIn);
    document.getElementById('signout')?.classList.toggle('hidden', !isLoggedIn);
    document.getElementById('new-recipe-btn')?.classList.toggle('hidden', !isLoggedIn);

    await loadRecipes();
    subscribeRealtime();
    showView('browse');
}

function yourName() {
    try {
        return localStorage.getItem(NAME_KEY) || prompt('Your name (contributor signature):') || 'Chef';
    } catch (e) {
        return 'Chef';
    }
}

/* ==========================================================================
   2. DATA ACCESS & REALTIME SYNC
   ========================================================================== */

async function loadRecipes() {
    const { data, error } = await sb
        .from('recipes')
        .select('*, recipe_ingredients(*), recipe_steps(*)')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching recipes:', error);
        return;
    }

    recipes = (data || []).map(r => {
        r.recipe_ingredients = (r.recipe_ingredients || []).sort((a, b) => a.sort_order - b.sort_order);
        r.recipe_steps = (r.recipe_steps || []).sort((a, b) => a.step_number - b.step_number);
        return r;
    });

    renderCurrentView();
}

function findRecipe(id) {
    return recipes.find(r => r.id === id);
}

function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, ch => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[ch]));
}

function fmtQty(ing) {
    if (ing.quantity == null) return '';
    const q = Number(ing.quantity);
    const qStr = Number.isInteger(q) ? q : q.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return `${qStr}${ing.unit ? ' ' + ing.unit : ''}`;
}

/* ==========================================================================
   3. VIEW ROUTING & SEARCH
   ========================================================================== */

function showView(name) {
    currentView = name;
    document.getElementById('browse-view').classList.toggle('hidden', name !== 'browse');
    document.getElementById('detail-view').classList.toggle('hidden', name !== 'detail');
    document.getElementById('form-view').classList.toggle('hidden', name !== 'form');
    window.scrollTo(0, 0);
    renderCurrentView();
}

function renderCurrentView() {
    if (currentView === 'browse') renderBrowse();
    else if (currentView === 'detail') renderDetail();
    else if (currentView === 'form') renderForm();
}

document.getElementById('search-input')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase();
    renderBrowse();
});

document.getElementById('new-recipe-btn')?.addEventListener('click', () => openForm(null));
document.getElementById('browse-new-recipe-btn')?.addEventListener('click', () => openForm(null));

/* ==========================================================================
   4. BROWSE VIEW
   ========================================================================== */

function renderBrowse() {
    const grid = document.getElementById('recipe-grid');
    const isLoggedIn = !!currentUser;

    const browseAddBtn = document.getElementById('browse-new-recipe-btn');
    if (browseAddBtn) browseAddBtn.classList.toggle('hidden', !isLoggedIn);

    let list = recipes;
    if (searchTerm) {
        list = recipes.filter(r => {
            const haystack = [
                r.title,
                r.description,
                r.source_note,
                ...(r.tags || []),
                ...(r.recipe_ingredients || []).map(i => i.name)
            ].join(' ').toLowerCase();
            return haystack.includes(searchTerm);
        });
    }

    if (!list.length) {
        grid.innerHTML = `<div class="empty-state">${recipes.length ? 'No recipes match your search query.' : 'No recipes cataloged yet.'}</div>`;
        return;
    }

    grid.innerHTML = list.map(r => {
        const totalMinutes = (r.prep_minutes || 0) + (r.cook_minutes || 0);
        const timeLabel = totalMinutes > 0 ? `${totalMinutes} MIN` : (r.cook_minutes ? `${r.cook_minutes} MIN COOK` : 'READY TO COOK');

        return `
            <article class="recipe-card" data-id="${r.id}">
                <div>
                    ${r.image_url ? `
                        <div class="rc-image-wrap">
                            <img src="${escapeHtml(r.image_url)}" alt="${escapeHtml(r.title)}" onerror="this.parentElement.style.display='none'" />
                            <span class="rc-badge-pill">${timeLabel}</span>
                        </div>
                    ` : ''}
                    <span class="eyebrow-label">${timeLabel} · ${r.servings ? r.servings + ' SERVINGS' : 'CHEF SPECIAL'}</span>
                    <h3>${escapeHtml(r.title)}</h3>
                    
                    ${r.description ? `<p class="rc-description-clamped">${escapeHtml(r.description)}</p>` : ''}

                    <div class="rc-meta">
                        ${r.servings ? `<span>// ${r.servings} Servings</span>` : ''}
                        ${totalMinutes > 0 ? `<span>// ${totalMinutes}m total</span>` : ''}
                        ${r.source_note ? `<span>// ${escapeHtml(r.source_note.slice(0, 30))}${r.source_note.length > 30 ? '…' : ''}</span>` : ''}
                    </div>
                </div>
                ${(r.tags && r.tags.length) ? `<div class="rc-tags">${r.tags.map(t => `<span class="rc-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            </article>
        `;
    }).join('');

    grid.querySelectorAll('.recipe-card').forEach(card => {
        card.addEventListener('click', () => {
            currentRecipeId = card.dataset.id;
            showView('detail');
        });
    });
}

/* ==========================================================================
   5. DETAIL VIEW
   ========================================================================== */

function renderDetail() {
    const r = findRecipe(currentRecipeId);
    const el = document.getElementById('detail-view');
    if (!r) {
        el.innerHTML = '<div class="empty-state">Recipe not found.</div>';
        return;
    }

    const isLoggedIn = !!currentUser;

    el.innerHTML = `
        <button class="btn outline small" id="back-btn" style="margin-bottom: 1.25rem;">
            <svg class="icon-vector icon-arrow-left" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            <span>Back to All</span>
        </button>
        <div class="detail-panel">
            ${r.image_url ? `
                <div class="detail-image-container">
                    <img src="${escapeHtml(r.image_url)}" alt="${escapeHtml(r.title)}" onerror="this.parentElement.style.display='none'" />
                </div>
            ` : ''}
            <span class="eyebrow-label">Recipe Overview</span>
            <h1 class="detail-title speckled">${escapeHtml(r.title)}</h1>
            
            <div class="detail-meta">
                ${r.servings ? `<span>// ${r.servings} SERVINGS</span>` : ''}
                ${r.prep_minutes ? `<span>// PREP ${r.prep_minutes} MIN</span>` : ''}
                ${r.cook_minutes ? `<span>// COOK ${r.cook_minutes} MIN</span>` : ''}
                ${r.added_by_name ? `<span>// BY ${escapeHtml(r.added_by_name)}</span>` : ''}
            </div>

            ${(r.tags && r.tags.length) ? `<div class="detail-tags">${r.tags.map(t => `<span class="tag-chip">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
            ${r.description ? `<div class="detail-desc">${escapeHtml(r.description)}</div>` : ''}

            <div class="block-subhead">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v18M6 3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3M18 3v18M18 8h-3a2 2 0 0 0 0 4h3v6"/></svg>
                Ingredients List
            </div>
            <div style="margin-bottom: 2.75rem;">
                ${r.recipe_ingredients.map(i => `
                    <div class="ingredient-row">
                        <span class="ingredient-name">${escapeHtml(i.name)}${i.note ? ` <span class="ingredient-note">(${escapeHtml(i.note)})</span>` : ''}</span>
                        <span class="ingredient-qty">${escapeHtml(fmtQty(i))}</span>
                    </div>
                `).join('') || '<div class="empty-state">No ingredients cataloged.</div>'}
            </div>

            <div class="block-subhead">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                Preparation Steps
            </div>
            <div>
                ${r.recipe_steps.map(s => {
        const parts = (s.instruction || '').split('\n\n');
        const stepTitle = parts[0] || '';
        const stepDesc = parts.slice(1).join('\n\n') || s.description || '';
        return `
                        <div class="step-row">
                            <span class="step-num">${s.step_number}</span>
                            <div class="step-content">
                                <div class="step-title-text">
                                    ${escapeHtml(stepTitle)}
                                    ${s.timer_seconds ? ` <strong style="color:var(--glacier); font-size:0.82rem; font-family:var(--font-mono);">(${Math.round(s.timer_seconds / 60)} min timer)</strong>` : ''}
                                </div>
                                ${stepDesc ? `<div class="step-desc-text">${escapeHtml(stepDesc)}</div>` : ''}
                            </div>
                        </div>
                    `;
    }).join('') || '<div class="empty-state">No steps listed.</div>'}
            </div>

            ${r.source_note ? `
                <div class="tips-panel">
                    <div class="tips-header">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>
                        <span>Chef's Tips &amp; Tricks / Provenance</span>
                    </div>
                    <p>${escapeHtml(r.source_note)}</p>
                </div>
            ` : ''}

            <div class="detail-actions">
                <button class="btn primary" id="cook-btn">
                    <span>Let's cook</span>
                    <svg class="icon-vector icon-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
                </button>
                ${isLoggedIn ? `
                    <button class="btn outline" id="edit-btn">Edit Recipe</button>
                    <button class="btn danger" id="delete-btn">Delete</button>
                ` : ''}
            </div>
        </div>
    `;

    document.getElementById('back-btn')?.addEventListener('click', () => showView('browse'));
    document.getElementById('cook-btn')?.addEventListener('click', () => enterKitchen(r));

    if (isLoggedIn) {
        document.getElementById('edit-btn')?.addEventListener('click', () => openForm(r));
        document.getElementById('delete-btn')?.addEventListener('click', () => deleteRecipe(r.id));
    }
}

async function deleteRecipe(id) {
    if (!confirm('Delete this recipe? This action cannot be reversed.')) return;
    const { error } = await sb.from('recipes').delete().eq('id', id);
    if (error) { alert(error.message); return; }
    await loadRecipes();
    showView('browse');
}

/* ==========================================================================
   6. FORM VIEW (CREATE & EDIT)
   ========================================================================== */

function openForm(recipe) {
    if (recipe) {
        formState = {
            id: recipe.id,
            title: recipe.title || '',
            description: recipe.description || '',
            imageUrl: recipe.image_url || '',
            servings: recipe.servings || '',
            prep_minutes: recipe.prep_minutes || '',
            cook_minutes: recipe.cook_minutes || '',
            source_note: recipe.source_note || '',
            tagsText: (recipe.tags || []).join(', '),
            ingredients: recipe.recipe_ingredients.map(i => ({
                name: i.name,
                quantity: i.quantity ?? '',
                unit: i.unit || '',
                note: i.note || '',
                include_in_price_calc: i.include_in_price_calc !== false
            })),
            steps: recipe.recipe_steps.map(s => {
                const parts = (s.instruction || '').split('\n\n');
                return {
                    instruction: parts[0] || '',
                    description: parts.slice(1).join('\n\n') || s.description || '',
                    timer_minutes: s.timer_seconds ? Math.round(s.timer_seconds / 60) : ''
                };
            })
        };
    } else {
        formState = {
            id: null,
            title: '',
            description: '',
            imageUrl: '',
            servings: '',
            prep_minutes: '',
            cook_minutes: '',
            source_note: '',
            tagsText: '',
            ingredients: [{ name: '', quantity: '', unit: '', note: '', include_in_price_calc: true }],
            steps: [{ instruction: '', description: '', timer_minutes: '' }]
        };
    }
    showView('form');
}

function renderForm() {
    const el = document.getElementById('form-view');
    const f = formState;
    if (!f) return;

    el.innerHTML = `
        <button class="btn outline small" id="form-back-btn" style="margin-bottom: 1.25rem;">
            <svg class="icon-vector icon-arrow-left" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
            <span>Cancel</span>
        </button>
        <div class="form-panel">
            <span class="eyebrow-label">Editor</span>
            <h2 class="section-title speckled" style="margin-bottom: 1.5rem;">${f.id ? 'EDIT RECIPE' : 'NEW RECIPE ENTRY'}</h2>

            <div class="form-grid">
                <div class="field full">
                    <label>Recipe Title</label>
                    <input type="text" id="f-title" value="${escapeHtml(f.title)}" placeholder="e.g. Spaghetti al Tonno" />
                </div>
                <div class="field full">
                    <label>Short Description / Summary</label>
                    <textarea id="f-description" placeholder="A brief overview or background...">${escapeHtml(f.description)}</textarea>
                </div>
                <div class="field full">
                    <label>Cover Image URL (Direct image link)</label>
                    <input type="text" id="f-image-url" value="${escapeHtml(f.imageUrl)}" placeholder="https://images.unsplash.com/..." />
                </div>
                <div class="field">
                    <label>Servings</label>
                    <input type="number" id="f-servings" min="1" value="${escapeHtml(f.servings)}" placeholder="4" />
                </div>
                <div class="field">
                    <label>Prep Minutes</label>
                    <input type="number" id="f-prep" min="0" value="${escapeHtml(f.prep_minutes)}" placeholder="15" />
                </div>
                <div class="field">
                    <label>Cook Minutes</label>
                    <input type="number" id="f-cook" min="0" value="${escapeHtml(f.cook_minutes)}" placeholder="20" />
                </div>
                <div class="field">
                    <label>Tags (comma separated)</label>
                    <input type="text" id="f-tags" value="${escapeHtml(f.tagsText)}" placeholder="dinner, pasta, seafood" />
                </div>
                <div class="field full">
                    <label>Chef's Tips &amp; Tricks / Provenance (Multiline)</label>
                    <textarea id="f-source" style="min-height:95px;" placeholder="e.g. Secret trick: Reserve 1/2 cup of salted pasta water to emulsify with the olive oil.">${escapeHtml(f.source_note)}</textarea>
                </div>
            </div>

            <div class="form-section">
                <div class="block-subhead">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v18M6 3a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3M18 3v18M18 8h-3a2 2 0 0 0 0 4h3v6"/></svg>
                    Ingredients
                </div>
                <div id="ingredient-rows"></div>
                <button class="btn outline small" id="add-ingredient-btn" style="margin-top: 0.75rem;">+ Add Ingredient</button>
            </div>

            <div class="form-section">
                <div class="block-subhead">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    Preparation Steps
                </div>
                <div id="step-rows"></div>
                <button class="btn outline small" id="add-step-btn" style="margin-top: 0.75rem;">+ Add Step</button>
            </div>

            <div class="form-actions">
                <button class="btn primary" id="save-btn">
                    <span>Save Entry</span>
                    <svg class="icon-vector icon-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
                </button>
                <button class="btn outline" id="form-cancel-btn">Cancel</button>
            </div>
        </div>
    `;

    renderIngredientRows();
    renderStepRows();

    document.getElementById('form-back-btn')?.addEventListener('click', cancelForm);
    document.getElementById('form-cancel-btn')?.addEventListener('click', cancelForm);

    document.getElementById('add-ingredient-btn')?.addEventListener('click', () => {
        formState.ingredients.push({ name: '', quantity: '', unit: '', note: '', include_in_price_calc: true });
        renderIngredientRows();
    });

    document.getElementById('add-step-btn')?.addEventListener('click', () => {
        formState.steps.push({ instruction: '', description: '', timer_minutes: '' });
        renderStepRows();
    });

    document.getElementById('save-btn')?.addEventListener('click', saveRecipe);
}

function cancelForm() {
    formState = null;
    showView(currentRecipeId ? 'detail' : 'browse');
}

function renderIngredientRows() {
    const container = document.getElementById('ingredient-rows');
    container.innerHTML = formState.ingredients.map((ing, idx) => `
        <div class="dyn-row" data-idx="${idx}">
            <input type="text" class="ing-name" placeholder="Ingredient name" value="${escapeHtml(ing.name)}" />
            <div class="qty-stepper">
                <button type="button" class="qty-btn qty-dec">−</button>
                <input type="number" class="ing-qty" placeholder="Qty" step="any" value="${escapeHtml(ing.quantity)}" />
                <button type="button" class="qty-btn qty-inc">+</button>
            </div>
            <input type="text" class="unit-input ing-unit" placeholder="Unit" list="unit-suggestions" value="${escapeHtml(ing.unit)}" />
            <input type="text" class="note-input ing-note" placeholder="Note (e.g. finely chopped)" value="${escapeHtml(ing.note)}" />
            <span class="checkbox-wrap"><input type="checkbox" class="ing-price" ${ing.include_in_price_calc ? 'checked' : ''}/> Price?</span>
            <button class="btn danger small remove-row-btn" type="button">✕</button>
        </div>
    `).join('') + `
        <datalist id="unit-suggestions">
            <option value="g"></option><option value="kg"></option><option value="ml"></option><option value="l"></option>
            <option value="ks"></option><option value="lžíce"></option><option value="lžička"></option><option value="špetka"></option>
            <option value="can"></option><option value="clove"></option>
        </datalist>
    `;

    container.querySelectorAll('.dyn-row').forEach(row => {
        const idx = Number(row.dataset.idx);
        row.querySelector('.ing-name').addEventListener('input', e => formState.ingredients[idx].name = e.target.value);
        row.querySelector('.ing-qty').addEventListener('input', e => formState.ingredients[idx].quantity = e.target.value);
        row.querySelector('.ing-unit').addEventListener('input', e => formState.ingredients[idx].unit = e.target.value);
        row.querySelector('.note-input').addEventListener('input', e => formState.ingredients[idx].note = e.target.value);
        row.querySelector('.ing-price').addEventListener('change', e => formState.ingredients[idx].include_in_price_calc = e.target.checked);
        row.querySelector('.remove-row-btn').addEventListener('click', () => {
            formState.ingredients.splice(idx, 1);
            renderIngredientRows();
        });
    });
    wireQtySteppers(container, 0.5);
}

function renderStepRows() {
    const container = document.getElementById('step-rows');
    container.innerHTML = formState.steps.map((s, idx) => `
        <div class="dyn-row" data-idx="${idx}">
            <div style="display:flex; gap:0.5rem; width:100%; align-items:center;">
                <span style="font-family:var(--font-stencil); color:var(--glacier); font-weight:700; width:22px;">${idx + 1}.</span>
                <input type="text" class="step-input step-instruction" placeholder="Step action (e.g. Sauté aromatics)" value="${escapeHtml(s.instruction)}" />
                <div class="qty-stepper" style="max-width:140px;">
                    <button type="button" class="qty-btn qty-dec">−</button>
                    <input type="number" class="ing-qty step-timer" placeholder="Timer (min)" min="0" value="${escapeHtml(s.timer_minutes)}" />
                    <button type="button" class="qty-btn qty-inc">+</button>
                </div>
                <button class="btn danger small remove-row-btn" type="button">✕</button>
            </div>
            <textarea class="step-desc-input" placeholder="Extended technique notes &amp; description (shown in kitchen mode)...">${escapeHtml(s.description || '')}</textarea>
        </div>
    `).join('');

    container.querySelectorAll('.dyn-row').forEach(row => {
        const idx = Number(row.dataset.idx);
        row.querySelector('.step-instruction').addEventListener('input', e => formState.steps[idx].instruction = e.target.value);
        row.querySelector('.step-desc-input').addEventListener('input', e => formState.steps[idx].description = e.target.value);
        row.querySelector('.step-timer').addEventListener('input', e => formState.steps[idx].timer_minutes = e.target.value);
        row.querySelector('.remove-row-btn').addEventListener('click', () => {
            formState.steps.splice(idx, 1);
            renderStepRows();
        });
    });
    wireQtySteppers(container, 1);
}

function wireQtySteppers(container, step) {
    container.querySelectorAll('.qty-stepper').forEach(stepper => {
        const input = stepper.querySelector('input[type=number]');
        const dec = stepper.querySelector('.qty-dec');
        const inc = stepper.querySelector('.qty-inc');
        const bump = (delta) => {
            const min = input.min !== '' ? parseFloat(input.min) : 0;
            let next = (parseFloat(input.value) || 0) + delta;
            if (next < min) next = min;
            input.value = Number.isInteger(step) ? next : Math.round(next * 100) / 100;
            input.dispatchEvent(new Event('input', { bubbles: true }));
        };
        dec.addEventListener('click', () => bump(-step));
        inc.addEventListener('click', () => bump(step));
    });
}

async function saveRecipe() {
    const title = document.getElementById('f-title').value.trim();
    if (!title) { alert('Please enter a recipe title.'); return; }

    const imageUrl = document.getElementById('f-image-url').value.trim();
    const payload = {
        title,
        description: document.getElementById('f-description').value.trim() || null,
        image_url: imageUrl || null,
        servings: document.getElementById('f-servings').value ? parseInt(document.getElementById('f-servings').value, 10) : null,
        prep_minutes: document.getElementById('f-prep').value ? parseInt(document.getElementById('f-prep').value, 10) : null,
        cook_minutes: document.getElementById('f-cook').value ? parseInt(document.getElementById('f-cook').value, 10) : null,
        source_note: document.getElementById('f-source').value.trim() || null,
        tags: document.getElementById('f-tags').value.split(',').map(t => t.trim()).filter(Boolean),
        updated_at: new Date().toISOString()
    };

    let recipeId = formState.id;
    let saveError = null;

    if (recipeId) {
        let res = await sb.from('recipes').update(payload).eq('id', recipeId);
        if (res.error && res.error.message.includes('image_url')) {
            delete payload.image_url;
            res = await sb.from('recipes').update(payload).eq('id', recipeId);
        }
        saveError = res.error;
    } else {
        payload.added_by_name = yourName();
        let res = await sb.from('recipes').insert(payload).select().single();
        if (res.error && res.error.message.includes('image_url')) {
            delete payload.image_url;
            res = await sb.from('recipes').insert(payload).select().single();
        }
        saveError = res.error;
        if (res.data) recipeId = res.data.id;
    }

    if (saveError) {
        alert('Save error: ' + saveError.message);
        return;
    }

    // Refresh Ingredients
    await sb.from('recipe_ingredients').delete().eq('recipe_id', recipeId);
    const validIngredients = formState.ingredients.filter(i => i.name.trim());
    if (validIngredients.length) {
        const rows = validIngredients.map((i, idx) => ({
            recipe_id: recipeId,
            name: i.name.trim(),
            quantity: i.quantity !== '' ? parseFloat(i.quantity) : null,
            unit: i.unit.trim() || null,
            note: i.note.trim() || null,
            sort_order: idx,
            include_in_price_calc: !!i.include_in_price_calc
        }));
        const { error } = await sb.from('recipe_ingredients').insert(rows);
        if (error) console.error('Ingredients save error:', error);
    }

    // Refresh Steps
    await sb.from('recipe_steps').delete().eq('recipe_id', recipeId);
    const validSteps = formState.steps.filter(s => s.instruction.trim());
    if (validSteps.length) {
        const rows = validSteps.map((s, idx) => {
            const combined = s.description.trim() ? `${s.instruction.trim()}\n\n${s.description.trim()}` : s.instruction.trim();
            return {
                recipe_id: recipeId,
                step_number: idx + 1,
                instruction: combined,
                timer_seconds: s.timer_minutes !== '' ? parseInt(s.timer_minutes, 10) * 60 : null
            };
        });
        const { error } = await sb.from('recipe_steps').insert(rows);
        if (error) console.error('Steps save error:', error);
    }

    formState = null;
    currentRecipeId = recipeId;
    await loadRecipes();
    showView('detail');
}

/* ==========================================================================
   7. KITCHEN FULLSCREEN HUD & DUAL-COLUMN WORKSTATION
   ========================================================================== */

async function enterKitchen(recipe) {
    kitchen = {
        recipe,
        stepIndex: 0,
        checked: new Set(),
        wakeLock: null,
        timerHandle: null,
        timerRemaining: 0,
        timerInitial: 0,
        timerRunning: false
    };
    document.getElementById('kitchen-view').classList.remove('hidden');
    document.querySelector('main.shell')?.classList.add('hidden');
    document.documentElement.classList.add('kitchen-open');
    document.body.classList.add('kitchen-open');
    await requestWakeLock();
    renderKitchen();
}

function exitKitchen() {
    if (kitchen?.timerHandle) clearInterval(kitchen.timerHandle);
    releaseWakeLock();
    kitchen = null;
    document.getElementById('kitchen-view').classList.add('hidden');
    document.querySelector('main.shell')?.classList.remove('hidden');
    document.documentElement.classList.remove('kitchen-open');
    document.body.classList.remove('kitchen-open');
}

async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            kitchen.wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.warn('WakeLock unavailable:', err);
    }
}

function releaseWakeLock() {
    if (kitchen?.wakeLock) {
        kitchen.wakeLock.release().catch(() => { });
    }
}

document.addEventListener('visibilitychange', async () => {
    if (kitchen && document.visibilityState === 'visible' && !kitchen.wakeLock) {
        await requestWakeLock();
    }
});

function renderKitchen() {
    const k = kitchen;
    if (!k) return;
    const r = k.recipe;
    const el = document.getElementById('kitchen-view');
    const totalSteps = r.recipe_steps.length;
    const currentStepRaw = r.recipe_steps[k.stepIndex] || { instruction: 'Enjoy your meal!' };

    const parts = (currentStepRaw.instruction || '').split('\n\n');
    const stepTitle = parts[0] || '';
    const stepDesc = parts.slice(1).join('\n\n') || currentStepRaw.description || '';
    const stepProgressPct = totalSteps ? Math.round(((k.stepIndex + 1) / totalSteps) * 100) : 100;

    el.innerHTML = `
        <div class="kitchen-topbar">
            <div>
                <span class="eyebrow-label">In Progress...</span>
                <div class="kitchen-title speckled">${escapeHtml(r.title)}</div>
            </div>
            <button class="btn danger small" id="exit-kitchen-btn">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                <span>Exit</span>
            </button>
        </div>

        <div class="kitchen-layout-grid">
            <!-- Left Column: Ingredients & Notes -->
            <aside class="kitchen-sidebar">
                <div class="kitchen-sidebar-header">
                    <div>
                        <strong style="font-size:0.85rem; text-transform:uppercase; letter-spacing:0.06em; color:var(--navy-heading);">Ingredients</strong>
                        <span style="font-size:0.75rem; color:var(--glacier); margin-left:6px; font-weight:700;">(${k.checked.size}/${r.recipe_ingredients.length})</span>
                    </div>
                    <button class="btn ghost small" id="reset-checks-btn" style="font-size:0.65rem;">Reset</button>
                </div>

                <div class="kitchen-ing-list">
                    ${r.recipe_ingredients.map((ing, idx) => `
                        <div class="kitchen-ing-row ${k.checked.has(idx) ? 'checked' : ''}" data-idx="${idx}">
                            <span class="kitchen-ing-checkbox">${k.checked.has(idx) ? '✓' : ''}</span>
                            <span style="flex:1; color:var(--navy-heading);">${escapeHtml(ing.name)}${ing.note ? ` <small style="color:var(--text-faint);">(${escapeHtml(ing.note)})</small>` : ''}</span>
                            <span class="kitchen-ing-qty">${escapeHtml(fmtQty(ing))}</span>
                        </div>
                    `).join('') || '<div class="empty-state">No ingredients listed.</div>'}
                </div>

                ${(r.description || r.source_note) ? `
                    <div class="kitchen-note-box">
                        ${r.description ? `<div><strong>Overview:</strong> ${escapeHtml(r.description)}</div>` : ''}
                        ${r.source_note ? `<div style="margin-top:0.35rem;"><strong>Tips:</strong> ${escapeHtml(r.source_note)}</div>` : ''}
                    </div>
                ` : ''}
            </aside>

            <!-- Right Column: Step Display & Timer Card -->
            <main class="kitchen-main">
                <div class="kitchen-step-meta">
                    <span class="kitchen-step-counter">
                        STEP ${k.stepIndex + 1} OF ${totalSteps || 1}
                        <span class="kitchen-step-progress-track"><span class="kitchen-step-progress-fill" style="width:${stepProgressPct}%;"></span></span>
                    </span>
                    <span class="rc-tag">${r.cook_minutes ? r.cook_minutes + ' MIN COOK' : 'PREPARATION'}</span>
                </div>

                <div class="kitchen-step-body">
        
                    <div class="kitchen-step-number-badge"><h2 class="section-title speckled">${k.stepIndex + 1}</h2></div>
                    <div class="kitchen-step-copy">
                        <div class="kitchen-step-text">${escapeHtml(stepTitle)}</div>
                        ${stepDesc ? `<div class="kitchen-step-desc">${escapeHtml(stepDesc)}</div>` : ''}
                    </div>

                    ${currentStepRaw.timer_seconds ? `
                        <div class="kitchen-timer-card" id="kitchen-timer-card">
                            <span class="kitchen-timer-label">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/></svg>
                                Step Timer
                            </span>
                            <div class="kitchen-timer-display" id="timer-display">--:--</div>
                            <div class="kitchen-timer-bar-track">
                                <div class="kitchen-timer-bar-fill" id="timer-bar-fill" style="width:100%;"></div>
                            </div>
                            <div class="kitchen-timer-controls">
                                <button class="btn primary small" id="timer-toggle-btn">
                                    <span>${k.timerRunning ? 'Pause' : (k.timerRemaining > 0 ? 'Resume' : `Start ${Math.round(currentStepRaw.timer_seconds / 60)}m`)}</span>
                                </button>
                                <button class="btn outline small" id="timer-reset-btn">Reset</button>
                            </div>
                        </div>
                    ` : ''}
                </div>

                <div class="kitchen-nav">
                    <button class="btn outline" id="prev-step-btn" ${k.stepIndex === 0 ? 'disabled' : ''}>
                        <svg class="icon-vector icon-arrow-left" viewBox="0 0 24 24"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
                        <span>Previous Step</span>
                    </button>
                    <button class="btn primary" id="next-step-btn" ${k.stepIndex >= totalSteps - 1 ? 'disabled' : ''}>
                        <span>${k.stepIndex >= totalSteps - 1 ? 'Finished ✓' : 'Next Step'}</span>
                        ${k.stepIndex < totalSteps - 1 ? `<svg class="icon-vector icon-arrow-right" viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>` : ''}
                    </button>
                </div>
            </main>
        </div>
    `;

    document.getElementById('exit-kitchen-btn')?.addEventListener('click', exitKitchen);
    document.getElementById('reset-checks-btn')?.addEventListener('click', () => {
        k.checked.clear();
        renderKitchen();
    });

    el.querySelectorAll('.kitchen-ing-row').forEach(row => {
        row.addEventListener('click', () => {
            const idx = Number(row.dataset.idx);
            if (k.checked.has(idx)) k.checked.delete(idx);
            else k.checked.add(idx);
            renderKitchen();
        });
    });

    const prevButton = document.getElementById('prev-step-btn');

    document.getElementById('prev-step-btn')?.addEventListener('click', () => {
        stopTimer();
        k.stepIndex--;
        renderKitchen();
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowLeft') {
            event.preventDefault();
            stopTimer();
            k.stepIndex--;
            renderKitchen();

        }
    })

    const nextButton = document.getElementById('next-step-btn');

    nextButton?.addEventListener('click', () => {
        if (k.stepIndex < totalSteps - 1) {
            stopTimer();
            k.stepIndex++;
            renderKitchen();
        }
    });

    window.addEventListener('keydown', (event) => {
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            if (k.stepIndex < totalSteps - 1) {
                stopTimer();
                k.stepIndex++;
                renderKitchen();
            }
        }
    })

    document.getElementById('timer-toggle-btn')?.addEventListener('click', () => {
        if (k.timerRunning) {
            pauseKitchenTimer();
        } else {
            startOrResumeKitchenTimer(currentStepRaw.timer_seconds);
        }
    });

    document.getElementById('timer-reset-btn')?.addEventListener('click', () => {
        resetKitchenTimer(currentStepRaw.timer_seconds);
    });

    if (currentStepRaw.timer_seconds) {
        if (k.timerRemaining === 0 && !k.timerRunning) {
            k.timerRemaining = currentStepRaw.timer_seconds;
            k.timerInitial = currentStepRaw.timer_seconds;
        }
        updateTimerDisplay();
    }
}

function startOrResumeKitchenTimer(defaultSeconds) {
    const k = kitchen;
    if (!k) return;
    if (k.timerRemaining <= 0) {
        k.timerRemaining = defaultSeconds;
        k.timerInitial = defaultSeconds;
    }
    k.timerRunning = true;
    if (k.timerHandle) clearInterval(k.timerHandle);

    updateTimerDisplay();
    updateTimerBtnLabel();

    k.timerHandle = setInterval(() => {
        k.timerRemaining--;
        updateTimerDisplay();
        if (k.timerRemaining <= 0) {
            clearInterval(k.timerHandle);
            k.timerHandle = null;
            k.timerRunning = false;
            if (navigator.vibrate) navigator.vibrate([300, 100, 300, 100, 300]);
            const display = document.getElementById('timer-display');
            if (display) display.textContent = "DONE! 🔔";
            const card = document.getElementById('kitchen-timer-card');
            if (card) card.classList.add('is-done');
            updateTimerBtnLabel();
        }
    }, 1000);
}

function pauseKitchenTimer() {
    const k = kitchen;
    if (!k) return;
    k.timerRunning = false;
    if (k.timerHandle) {
        clearInterval(k.timerHandle);
        k.timerHandle = null;
    }
    updateTimerBtnLabel();
}

function resetKitchenTimer(defaultSeconds) {
    const k = kitchen;
    if (!k) return;
    pauseKitchenTimer();
    k.timerRemaining = defaultSeconds;
    k.timerInitial = defaultSeconds;
    const card = document.getElementById('kitchen-timer-card');
    if (card) card.classList.remove('is-done');
    updateTimerDisplay();
    updateTimerBtnLabel();
}

function stopTimer() {
    const k = kitchen;
    if (!k) return;
    if (k.timerHandle) clearInterval(k.timerHandle);
    k.timerHandle = null;
    k.timerRunning = false;
    k.timerRemaining = 0;
}

function updateTimerBtnLabel() {
    const toggleBtn = document.getElementById('timer-toggle-btn');
    if (!toggleBtn || !kitchen) return;
    const span = toggleBtn.querySelector('span');
    if (span) {
        span.textContent = kitchen.timerRunning ? 'Pause' : (kitchen.timerRemaining > 0 && kitchen.timerRemaining < kitchen.timerInitial ? 'Resume' : 'Start Timer');
    }
}

function updateTimerDisplay() {
    const display = document.getElementById('timer-display');
    const barFill = document.getElementById('timer-bar-fill');
    if (!display || !kitchen) return;
    const m = Math.floor(kitchen.timerRemaining / 60);
    const s = kitchen.timerRemaining % 60;
    display.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    if (barFill && kitchen.timerInitial > 0) {
        const pct = Math.max(0, Math.min(100, (kitchen.timerRemaining / kitchen.timerInitial) * 100));
        barFill.style.width = `${pct}%`;
    }
}

/* ==========================================================================
   8. REALTIME SUBSCRIPTION
   ========================================================================== */

function subscribeRealtime() {
    sb.channel('recipes-sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recipes' }, () => loadRecipes())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_ingredients' }, () => loadRecipes())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'recipe_steps' }, () => loadRecipes())
        .subscribe();
}

/* ==========================================================================
   9. INITIAL BOOTSTRAP
   ========================================================================== */

checkSession();