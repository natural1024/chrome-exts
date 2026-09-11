import { MSG } from '../lib/constants.js';
import { send } from '../lib/rpc.js';

const $profiles = document.getElementById('profiles');
const $warn     = document.getElementById('warn');

document.getElementById('btn-options').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

// -----------------------------------------------------------------------------
// Render
// -----------------------------------------------------------------------------

async function render() {
  let payload;
  try {
    payload = await send({ type: MSG.GET_STATE });
  } catch (err) {
    $profiles.innerHTML = `<li class="profile"><span></span><span class="name">Error: ${escapeHtml(err.message)}</span><span></span></li>`;
    return;
  }

  const { state, levelOfControl } = payload;

  // Warn if another extension owns the proxy setting.
  if (levelOfControl === 'controlled_by_other_extensions' ||
      levelOfControl === 'not_controllable') {
    $warn.textContent = `Proxy setting is "${levelOfControl}". Another extension may be in control — disable it to let My Zero Omega apply changes.`;
    $warn.classList.remove('hidden');
  } else {
    $warn.classList.add('hidden');
  }

  const items = Object.values(state.profiles).sort(profileOrder);

  $profiles.innerHTML = '';
  for (const p of items) {
    $profiles.appendChild(renderItem(p, p.id === state.activeProfileId));
  }
}

function renderItem(profile, isActive) {
  const li = document.createElement('li');
  li.className = 'profile' + (isActive ? ' active' : '');
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', String(isActive));
  li.innerHTML = `
    <span class="tag tag-${profile.type}"></span>
    <span class="name"></span>
    <span class="check">✓</span>
  `;
  li.querySelector('.name').textContent = profile.name;
  li.addEventListener('click', () => onPick(profile.id));
  return li;
}

async function onPick(profileId) {
  try {
    await send({ type: MSG.APPLY_PROFILE, profileId });
    await reloadActiveTab();
    // Close the popup so the reloaded page takes focus — feels snappier.
    window.close();
  } catch (err) {
    // Keep it obvious — a popup alert is fine for MVP.
    alert(`Failed to apply profile: ${err.message}`);
  }
}

/**
 * Reload the currently-active tab so it picks up the new proxy config.
 * Internal pages (chrome://, chrome-extension://, edge://, about:) can't
 * be reloaded by an extension and would throw — we skip them silently.
 */
async function reloadActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) return;
  if (isInternalUrl(tab.url)) return;
  try {
    await chrome.tabs.reload(tab.id, { bypassCache: false });
  } catch {
    // Ignore — a failed reload shouldn't block the profile switch itself.
  }
}

function isInternalUrl(url) {
  if (!url) return true; // No URL access usually means an internal page.
  return /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(url);
}

// Built-ins first, then alphabetical by name.
function profileOrder(a, b) {
  const abt = a.type.startsWith('builtin') ? 0 : 1;
  const bbt = b.type.startsWith('builtin') ? 0 : 1;
  if (abt !== bbt) return abt - bbt;
  return a.name.localeCompare(b.name);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

render();
