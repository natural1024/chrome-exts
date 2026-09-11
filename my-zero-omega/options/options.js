import { MSG, ProfileType } from '../lib/constants.js';
import { send } from '../lib/rpc.js';

// -----------------------------------------------------------------------------
// DOM refs & module state
// -----------------------------------------------------------------------------

const $list = document.getElementById('profile-list');
const $form = document.getElementById('editor-form');
const $hint = document.getElementById('empty-hint');

/** @type {{activeProfileId: string, profiles: Record<string, object>}|null} */
let state = null;

/** Currently-editing profile snapshot (never a direct storage reference). */
let editing = null;

// -----------------------------------------------------------------------------
// Boot
// -----------------------------------------------------------------------------

document.getElementById('btn-new-fixed').addEventListener('click', () => {
  startEditing(makeFixedProfile());
});
document.getElementById('btn-new-auto').addEventListener('click', () => {
  startEditing(makeAutoProfile());
});

refresh();

// -----------------------------------------------------------------------------
// Data helpers
// -----------------------------------------------------------------------------

async function refresh() {
  const res = await send({ type: MSG.GET_STATE });
  state = res.state;
  renderList();
  // Re-render editor if editing an existing profile — pick up latest values.
  if (editing && state.profiles[editing.id] && !isDraft(editing)) {
    editing = structuredClone(state.profiles[editing.id]);
    renderEditor();
  }
}

function isDraft(p) {
  return !state.profiles[p.id];
}

function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function makeFixedProfile() {
  return {
    id: uid('fixed'),
    name: 'New Proxy',
    type: ProfileType.FIXED,
    scheme: 'http',
    host: '',
    port: 8080,
    bypassList: ['<local>'],
  };
}

function makeAutoProfile() {
  return {
    id: uid('auto'),
    name: 'Auto Switch',
    type: ProfileType.AUTO_SWITCH,
    defaultProfileId: 'direct',
    rules: [],
  };
}

// -----------------------------------------------------------------------------
// Sidebar list
// -----------------------------------------------------------------------------

function renderList() {
  $list.innerHTML = '';
  const items = Object.values(state.profiles).sort(profileOrder);
  for (const p of items) {
    const li = document.createElement('li');
    li.className = 'item' + (editing && editing.id === p.id ? ' selected' : '');
    li.innerHTML = `<span class="tag tag-${p.type}"></span><span class="name"></span>`;
    li.querySelector('.name').textContent = p.name;
    li.addEventListener('click', () => startEditing(structuredClone(p)));
    $list.appendChild(li);
  }
}

function profileOrder(a, b) {
  const abt = a.type.startsWith('builtin') ? 0 : 1;
  const bbt = b.type.startsWith('builtin') ? 0 : 1;
  if (abt !== bbt) return abt - bbt;
  return a.name.localeCompare(b.name);
}

// -----------------------------------------------------------------------------
// Editor
// -----------------------------------------------------------------------------

function startEditing(profile) {
  editing = profile;
  renderList();
  renderEditor();
}

function renderEditor() {
  const p = editing;
  const isBuiltin = p.type.startsWith('builtin');
  const isFixed   = p.type === ProfileType.FIXED;
  const isAuto    = p.type === ProfileType.AUTO_SWITCH;

  $hint.classList.add('hidden');
  $form.classList.remove('hidden');

  $form.innerHTML = `
    <div class="row">
      <label>Name</label>
      <input name="name" type="text" value="${esc(p.name)}" ${isBuiltin ? 'disabled' : ''} required>
    </div>
    <div class="row">
      <label>Type</label>
      <input type="text" value="${p.type}" disabled>
    </div>
    ${isFixed ? renderFixedFields(p) : ''}
    ${isAuto  ? renderAutoFields(p)  : ''}
    <div class="actions">
      ${isBuiltin ? '' : '<button type="submit" class="primary">Save</button>'}
      ${isBuiltin || isDraft(p) ? '' : '<button type="button" id="btn-delete">Delete</button>'}
    </div>
    <div id="editor-msg" class="msg"></div>
  `;

  if (isAuto) wireAutoHandlers();

  const $del = $form.querySelector('#btn-delete');
  if ($del) $del.addEventListener('click', onDelete);

  $form.onsubmit = onSubmit;
}

function renderFixedFields(p) {
  const schemes = ['http', 'https', 'socks5', 'socks4'];
  return `
    <fieldset>
      <legend>Fixed Proxy</legend>
      <div class="row">
        <label>Scheme</label>
        <select name="scheme">
          ${schemes.map(s => `<option value="${s}" ${p.scheme === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="row">
        <label>Host</label>
        <input name="host" type="text" value="${esc(p.host)}" placeholder="127.0.0.1" required>
      </div>
      <div class="row">
        <label>Port</label>
        <input name="port" type="number" min="1" max="65535" value="${p.port}" required>
      </div>
      <div class="row">
        <label>Bypass List
          <span class="hint">one per line — e.g. &lt;local&gt;, *.internal, 192.168.0.0/16</span>
        </label>
        <textarea name="bypassList" rows="4">${esc((p.bypassList || []).join('\n'))}</textarea>
      </div>
    </fieldset>
  `;
}

function renderAutoFields(p) {
  // Only non-auto profiles can be a rule/default target — no auto→auto nesting.
  const targets = Object.values(state.profiles)
    .filter(x => x.type !== ProfileType.AUTO_SWITCH)
    .sort(profileOrder);

  const optionsHtml = (selectedId) => targets
    .map(x => `<option value="${x.id}" ${x.id === selectedId ? 'selected' : ''}>${esc(x.name)}</option>`)
    .join('');

  const rulesHtml = (p.rules || []).map((r, i) => `
    <tr>
      <td><input name="pattern" data-i="${i}" type="text" value="${esc(r.pattern)}" placeholder="*.example.com"></td>
      <td><select name="targetProfile" data-i="${i}">${optionsHtml(r.profileId)}</select></td>
      <td><button type="button" class="btn-remove-rule" data-i="${i}" title="Remove rule">×</button></td>
    </tr>
  `).join('');

  return `
    <fieldset>
      <legend>Auto Switch</legend>
      <div class="row">
        <label>Default profile
          <span class="hint">used when no rule matches</span>
        </label>
        <select name="defaultProfileId">${optionsHtml(p.defaultProfileId)}</select>
      </div>
      <div class="row">
        <label>Rules
          <span class="hint">wildcard: * = any chars, ? = one char</span>
        </label>
        <div>
          <table class="rules">
            <thead>
              <tr><th>Pattern</th><th>Target Profile</th><th></th></tr>
            </thead>
            <tbody id="rules-body">${rulesHtml}</tbody>
          </table>
          <button type="button" id="btn-add-rule">+ Add rule</button>
        </div>
      </div>
    </fieldset>
  `;
}

// -----------------------------------------------------------------------------
// Auto-switch: rule add / remove
//   We snapshot form values back into `editing` before mutating rules,
//   otherwise typed-but-not-saved input would be lost on re-render.
// -----------------------------------------------------------------------------

function wireAutoHandlers() {
  $form.querySelector('#btn-add-rule').addEventListener('click', () => {
    Object.assign(editing, collectForm());
    editing.rules = editing.rules || [];
    editing.rules.push({
      pattern: '*.example.com',
      profileId: firstNonAutoProfileId(),
      matchType: 'wildcard',
    });
    renderEditor();
  });

  $form.querySelectorAll('.btn-remove-rule').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.i);
      Object.assign(editing, collectForm());
      editing.rules.splice(i, 1);
      renderEditor();
    });
  });
}

function firstNonAutoProfileId() {
  const p = Object.values(state.profiles)
    .find(x => x.type !== ProfileType.AUTO_SWITCH && x.id !== editing.id);
  return p ? p.id : 'direct';
}

// -----------------------------------------------------------------------------
// Submit / Delete
// -----------------------------------------------------------------------------

async function onSubmit(e) {
  e.preventDefault();
  const next = { ...editing, ...collectForm() };
  const err  = validate(next);
  if (err) return setMsg(err, 'error');

  try {
    await send({ type: MSG.SAVE_PROFILE, profile: next });
    editing = next;
    setMsg('Saved.', 'ok');
    await refresh();
  } catch (err) {
    setMsg(err.message, 'error');
  }
}

async function onDelete() {
  if (!confirm(`Delete profile "${editing.name}"?`)) return;
  try {
    await send({ type: MSG.DELETE_PROFILE, profileId: editing.id });
    editing = null;
    $form.classList.add('hidden');
    $hint.classList.remove('hidden');
    await refresh();
  } catch (err) {
    setMsg(err.message, 'error');
  }
}

// -----------------------------------------------------------------------------
// Form <-> data
// -----------------------------------------------------------------------------

function collectForm() {
  const out = {};
  const fd = new FormData($form);

  const name = fd.get('name');
  if (name != null) out.name = String(name).trim() || editing.name;

  if (editing.type === ProfileType.FIXED) {
    out.scheme = String(fd.get('scheme') || 'http');
    out.host   = String(fd.get('host') || '').trim();
    out.port   = Number(fd.get('port') || 0);
    out.bypassList = String(fd.get('bypassList') || '')
      .split('\n').map(s => s.trim()).filter(Boolean);
  }

  if (editing.type === ProfileType.AUTO_SWITCH) {
    out.defaultProfileId = String(fd.get('defaultProfileId') || 'direct');
    const patternInputs = $form.querySelectorAll('input[name="pattern"]');
    const targetSelects = $form.querySelectorAll('select[name="targetProfile"]');
    out.rules = [];
    for (let i = 0; i < patternInputs.length; i++) {
      const pattern   = patternInputs[i].value.trim();
      const profileId = targetSelects[i].value;
      if (pattern && profileId) {
        out.rules.push({ pattern, profileId, matchType: 'wildcard' });
      }
    }
  }

  return out;
}

function validate(p) {
  if (!p.name) return 'Name is required.';
  if (p.type === ProfileType.FIXED) {
    if (!p.host) return 'Host is required.';
    if (!(p.port >= 1 && p.port <= 65535)) return 'Port must be between 1 and 65535.';
  }
  if (p.type === ProfileType.AUTO_SWITCH) {
    if (!p.defaultProfileId) return 'Default profile is required.';
    if (!state.profiles[p.defaultProfileId]) return 'Default profile no longer exists.';
    for (const r of p.rules || []) {
      if (!r.pattern) return 'Rule pattern cannot be empty.';
      if (!state.profiles[r.profileId]) return `Rule targets a missing profile: ${r.profileId}`;
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Utilities
// -----------------------------------------------------------------------------

function setMsg(text, kind) {
  const $m = $form.querySelector('#editor-msg');
  if (!$m) return;
  $m.textContent = text;
  $m.className = `msg ${kind || ''}`.trim();
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
