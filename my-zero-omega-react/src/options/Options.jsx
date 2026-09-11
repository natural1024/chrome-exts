import { useCallback, useEffect, useMemo, useState } from 'react';
import { MSG, ProfileType } from '../lib/constants.js';
import { send } from '../lib/rpc.js';

// -----------------------------------------------------------------------------
// Options page.
// Mirrors the vanilla options.js semantics, but leans on React's controlled
// inputs so we don't need a `collectForm()` step — the `editing` object is
// always the truth for what will be POSTed to SAVE_PROFILE.
// -----------------------------------------------------------------------------

// Built-ins first, then alphabetical by name.
function profileOrder(a, b) {
  const abt = a.type.startsWith('builtin') ? 0 : 1;
  const bbt = b.type.startsWith('builtin') ? 0 : 1;
  if (abt !== bbt) return abt - bbt;
  return a.name.localeCompare(b.name);
}

// Same id shape as the vanilla version, so an existing chrome.storage.local
// blob from the original extension would still round-trip cleanly.
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

function validate(p, profiles) {
  if (!p.name) return 'Name is required.';
  if (p.type === ProfileType.FIXED) {
    if (!p.host) return 'Host is required.';
    if (!(p.port >= 1 && p.port <= 65535)) return 'Port must be between 1 and 65535.';
  }
  if (p.type === ProfileType.AUTO_SWITCH) {
    if (!p.defaultProfileId) return 'Default profile is required.';
    if (!profiles[p.defaultProfileId]) return 'Default profile no longer exists.';
    for (const r of p.rules || []) {
      if (!r.pattern) return 'Rule pattern cannot be empty.';
      if (!profiles[r.profileId]) return `Rule targets a missing profile: ${r.profileId}`;
    }
  }
  return null;
}

// -----------------------------------------------------------------------------
// Root
// -----------------------------------------------------------------------------

export default function Options() {
  const [state, setState] = useState(null);
  const [editing, setEditing] = useState(null);
  const [msg, setMsg] = useState({ text: '', kind: '' });

  const refresh = useCallback(async () => {
    const res = await send({ type: MSG.GET_STATE });
    setState(res.state);
    // Re-sync editor with latest storage IF editor is not a draft. Drafts are
    // in-flight objects the user hasn't saved yet — never overwrite them.
    setEditing(prev => {
      if (!prev) return prev;
      const stored = res.state.profiles[prev.id];
      if (!stored) return prev; // draft or just-deleted profile
      return structuredClone(stored);
    });
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const startEditing = useCallback(profile => {
    setEditing(structuredClone(profile));
    setMsg({ text: '', kind: '' });
  }, []);

  const onSubmit = async e => {
    e.preventDefault();
    const err = validate(editing, state.profiles);
    if (err) return setMsg({ text: err, kind: 'error' });
    try {
      await send({ type: MSG.SAVE_PROFILE, profile: editing });
      setMsg({ text: 'Saved.', kind: 'ok' });
      await refresh();
    } catch (e2) {
      setMsg({ text: e2.message, kind: 'error' });
    }
  };

  const onDelete = async () => {
    if (!confirm(`Delete profile "${editing.name}"?`)) return;
    try {
      await send({ type: MSG.DELETE_PROFILE, profileId: editing.id });
      setEditing(null);
      setMsg({ text: '', kind: '' });
      await refresh();
    } catch (e2) {
      setMsg({ text: e2.message, kind: 'error' });
    }
  };

  if (!state) {
    return (
      <>
        <header><h1>My Zero Omega — Options</h1></header>
        <main><aside className="sidebar" /><section className="editor"><div className="empty">Loading…</div></section></main>
      </>
    );
  }

  const isDraft = editing && !state.profiles[editing.id];

  return (
    <>
      <header><h1>My Zero Omega — Options</h1></header>
      <main>
        <Sidebar
          profiles={state.profiles}
          editingId={editing?.id}
          onNewFixed={() => startEditing(makeFixedProfile())}
          onNewAuto={() => startEditing(makeAutoProfile())}
          onPick={startEditing}
        />
        <section className="editor">
          {!editing && (
            <div className="empty">Pick a profile on the left, or create a new one.</div>
          )}
          {editing && (
            <Editor
              profile={editing}
              profiles={state.profiles}
              isDraft={isDraft}
              onChange={setEditing}
              onSubmit={onSubmit}
              onDelete={onDelete}
              msg={msg}
            />
          )}
        </section>
      </main>
    </>
  );
}

// -----------------------------------------------------------------------------
// Sidebar
// -----------------------------------------------------------------------------

function Sidebar({ profiles, editingId, onNewFixed, onNewAuto, onPick }) {
  const items = useMemo(
    () => Object.values(profiles).sort(profileOrder),
    [profiles]
  );

  return (
    <aside className="sidebar">
      <div className="toolbar">
        <button type="button" onClick={onNewFixed}>+ Fixed Proxy</button>
        <button type="button" onClick={onNewAuto}>+ Auto Switch</button>
      </div>
      <ul className="profile-list">
        {items.map(p => (
          <li
            key={p.id}
            className={`item${editingId === p.id ? ' selected' : ''}`}
            onClick={() => onPick(p)}
          >
            <span className={`tag tag-${p.type}`} />
            <span className="name">{p.name}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}

// -----------------------------------------------------------------------------
// Editor
// -----------------------------------------------------------------------------

function Editor({ profile, profiles, isDraft, onChange, onSubmit, onDelete, msg }) {
  const p = profile;
  const isBuiltin = p.type.startsWith('builtin');
  const isFixed   = p.type === ProfileType.FIXED;
  const isAuto    = p.type === ProfileType.AUTO_SWITCH;

  // Immutably patch the editing draft.
  const patch = update => onChange({ ...p, ...update });

  return (
    <form className="editor-form" autoComplete="off" onSubmit={onSubmit}>
      <div className="row">
        <label>Name</label>
        <input
          type="text"
          value={p.name}
          disabled={isBuiltin}
          required
          onChange={e => patch({ name: e.target.value })}
        />
      </div>
      <div className="row">
        <label>Type</label>
        <input type="text" value={p.type} disabled />
      </div>

      {isFixed && <FixedFields profile={p} onChange={patch} />}
      {isAuto  && <AutoFields  profile={p} profiles={profiles} onChange={patch} />}

      <div className="actions">
        {!isBuiltin && <button type="submit" className="primary">Save</button>}
        {!isBuiltin && !isDraft && (
          <button type="button" className="btn-delete" onClick={onDelete}>Delete</button>
        )}
      </div>
      <div className={`msg ${msg.kind}`.trim()}>{msg.text}</div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Fixed Proxy fields
// -----------------------------------------------------------------------------

const FIXED_SCHEMES = ['http', 'https', 'socks5', 'socks4'];

function FixedFields({ profile, onChange }) {
  const p = profile;
  // Store bypassList as a newline-joined string while editing so caret /
  // trailing-empty-line UX behaves naturally; we split on save via validate/
  // submit path — actually we split here so `editing` always has array form
  // matching the storage schema.
  const bypassText = (p.bypassList || []).join('\n');

  return (
    <fieldset>
      <legend>Fixed Proxy</legend>
      <div className="row">
        <label>Scheme</label>
        <select value={p.scheme} onChange={e => onChange({ scheme: e.target.value })}>
          {FIXED_SCHEMES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="row">
        <label>Host</label>
        <input
          type="text"
          value={p.host}
          placeholder="127.0.0.1"
          required
          onChange={e => onChange({ host: e.target.value })}
        />
      </div>
      <div className="row">
        <label>Port</label>
        <input
          type="number"
          min="1"
          max="65535"
          value={p.port}
          required
          onChange={e => onChange({ port: Number(e.target.value) })}
        />
      </div>
      <div className="row">
        <label>
          Bypass List
          <span className="hint">one per line — e.g. &lt;local&gt;, *.internal, 192.168.0.0/16</span>
        </label>
        <textarea
          rows={4}
          value={bypassText}
          onChange={e => onChange({
            bypassList: e.target.value.split('\n').map(s => s.trim()).filter(Boolean),
          })}
        />
      </div>
    </fieldset>
  );
}

// -----------------------------------------------------------------------------
// Auto Switch fields
// -----------------------------------------------------------------------------

function AutoFields({ profile, profiles, onChange }) {
  const p = profile;

  // Only non-auto profiles can be a rule/default target — no auto→auto nesting.
  const targets = useMemo(
    () => Object.values(profiles)
      .filter(x => x.type !== ProfileType.AUTO_SWITCH)
      .sort(profileOrder),
    [profiles]
  );

  const firstNonAutoId = targets[0]?.id ?? 'direct';

  const addRule = () => onChange({
    rules: [
      ...(p.rules || []),
      { pattern: '*.example.com', profileId: firstNonAutoId, matchType: 'wildcard' },
    ],
  });

  const removeRule = i => onChange({
    rules: (p.rules || []).filter((_, idx) => idx !== i),
  });

  const updateRule = (i, patch) => onChange({
    rules: (p.rules || []).map((r, idx) => idx === i ? { ...r, ...patch } : r),
  });

  return (
    <fieldset>
      <legend>Auto Switch</legend>
      <div className="row">
        <label>
          Default profile
          <span className="hint">used when no rule matches</span>
        </label>
        <select
          value={p.defaultProfileId}
          onChange={e => onChange({ defaultProfileId: e.target.value })}
        >
          {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="row">
        <label>
          Rules
          <span className="hint">wildcard: * = any chars, ? = one char</span>
        </label>
        <div>
          <table className="rules">
            <thead>
              <tr><th>Pattern</th><th>Target Profile</th><th /></tr>
            </thead>
            <tbody>
              {(p.rules || []).map((r, i) => (
                <tr key={i}>
                  <td>
                    <input
                      type="text"
                      value={r.pattern}
                      placeholder="*.example.com"
                      onChange={e => updateRule(i, { pattern: e.target.value })}
                    />
                  </td>
                  <td>
                    <select
                      value={r.profileId}
                      onChange={e => updateRule(i, { profileId: e.target.value })}
                    >
                      {targets.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-remove-rule"
                      title="Remove rule"
                      onClick={() => removeRule(i)}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button type="button" className="btn-add-rule" onClick={addRule}>
            + Add rule
          </button>
        </div>
      </div>
    </fieldset>
  );
}
