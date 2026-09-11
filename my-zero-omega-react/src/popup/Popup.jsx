import { useEffect, useState } from 'react';
import { MSG } from '../lib/constants.js';
import { send } from '../lib/rpc.js';

// -----------------------------------------------------------------------------
// Toolbar popup — mirrors the vanilla popup.js UX exactly:
//   - list all profiles (built-ins first, then alphabetical)
//   - click applies the profile, reloads the active tab, and closes the popup
//   - a banner is shown when another extension controls proxy settings
// State lives in this component; no context / store — the popup only exists
// for the split-second the user has it open, so a global store is overkill.
// -----------------------------------------------------------------------------

// Chrome internal pages cannot be reloaded by extensions; a call throws.
// We just skip them so the profile-switch itself never fails.
function isInternalUrl(url) {
  if (!url) return true;
  return /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(url);
}

async function reloadActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  if (isInternalUrl(tab.url)) return;
  try {
    await chrome.tabs.reload(tab.id, { bypassCache: false });
  } catch {
    // Reload failed (e.g. missing permission) — not a fatal error here.
  }
}

// Built-ins first, then alphabetical by name.
function profileOrder(a, b) {
  const abt = a.type.startsWith('builtin') ? 0 : 1;
  const bbt = b.type.startsWith('builtin') ? 0 : 1;
  if (abt !== bbt) return abt - bbt;
  return a.name.localeCompare(b.name);
}

export default function Popup() {
  const [state, setState] = useState(null);
  const [levelOfControl, setLevelOfControl] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let alive = true;
    send({ type: MSG.GET_STATE })
      .then(res => {
        if (!alive) return;
        setState(res.state);
        setLevelOfControl(res.levelOfControl);
      })
      .catch(err => alive && setError(err.message));
    return () => { alive = false; };
  }, []);

  async function onPick(profileId) {
    try {
      await send({ type: MSG.APPLY_PROFILE, profileId });
      await reloadActiveTab();
      // Close the popup so the reloaded page takes focus — feels snappier.
      window.close();
    } catch (err) {
      alert(`Failed to apply profile: ${err.message}`);
    }
  }

  const warn =
    levelOfControl === 'controlled_by_other_extensions' ||
    levelOfControl === 'not_controllable';

  return (
    <>
      <header>
        <h1>My Zero Omega</h1>
        <button
          className="btn-options"
          type="button"
          title="Open options"
          aria-label="Options"
          onClick={() => chrome.runtime.openOptionsPage()}
        >
          ⚙
        </button>
      </header>

      {warn && (
        <div className="warn">
          {`Proxy setting is "${levelOfControl}". Another extension may be in control — disable it to let My Zero Omega apply changes.`}
        </div>
      )}

      <ul className="profiles" role="listbox">
        {error && (
          <li className="profile">
            <span />
            <span className="name">{`Error: ${error}`}</span>
            <span />
          </li>
        )}

        {state && Object.values(state.profiles).sort(profileOrder).map(p => {
          const isActive = p.id === state.activeProfileId;
          return (
            <li
              key={p.id}
              className={`profile${isActive ? ' active' : ''}`}
              role="option"
              aria-selected={isActive}
              onClick={() => onPick(p.id)}
            >
              <span className={`tag tag-${p.type}`} />
              <span className="name">{p.name}</span>
              <span className="check">✓</span>
            </li>
          );
        })}
      </ul>
    </>
  );
}
