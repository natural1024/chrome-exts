// Service worker entry point.
// Responsibilities:
//   1. On install / startup, re-apply the last active profile from storage.
//   2. Handle RPC messages from popup / options page.
//   3. Keep the toolbar badge in sync with the active profile.
//
// The SW may be terminated by Chrome at any time — we never rely on
// in-memory state. All truth lives in chrome.storage.local.

import { MSG, ProfileType } from './lib/constants.js';
import { loadState, saveState } from './lib/storage.js';
import { buildProxyConfig, applyProxyConfig } from './lib/proxy.js';

// -----------------------------------------------------------------------------
// Badge helpers
// -----------------------------------------------------------------------------

async function updateBadge(profile) {
  await chrome.action.setBadgeText({ text: badgeLabel(profile) });
  await chrome.action.setBadgeBackgroundColor({ color: badgeColor(profile) });
  await chrome.action.setTitle({ title: `My Zero Omega: ${profile.name}` });
}

function badgeLabel(profile) {
  // At most 4 chars fit; 2 keeps it readable on all display densities.
  return profile.name.slice(0, 2).toUpperCase();
}

function badgeColor(profile) {
  switch (profile.type) {
    case ProfileType.BUILTIN_DIRECT: return '#8a8a8a';
    case ProfileType.BUILTIN_SYSTEM: return '#4a90e2';
    case ProfileType.FIXED:          return '#2ecc71';
    case ProfileType.AUTO_SWITCH:    return '#e67e22';
    default:                         return '#333333';
  }
}

// -----------------------------------------------------------------------------
// Core: apply a profile by id
// -----------------------------------------------------------------------------

async function applyProfile(profileId) {
  const state   = await loadState();
  const profile = state.profiles[profileId];
  if (!profile) throw new Error(`Profile not found: ${profileId}`);

  const config          = buildProxyConfig(profile, state.profiles);
  const levelOfControl  = await applyProxyConfig(config);

  state.activeProfileId = profileId;
  await saveState(state);
  await updateBadge(profile);

  return { profile, levelOfControl };
}

// -----------------------------------------------------------------------------
// Lifecycle: sync from storage on install / browser startup
// -----------------------------------------------------------------------------

async function syncFromStorage() {
  const state  = await loadState();
  const active = state.profiles[state.activeProfileId] || state.profiles.direct;
  const config = buildProxyConfig(active, state.profiles);
  await applyProxyConfig(config);
  await updateBadge(active);
}

chrome.runtime.onInstalled.addListener(() => { syncFromStorage(); });
chrome.runtime.onStartup.addListener(()   => { syncFromStorage(); });

// -----------------------------------------------------------------------------
// RPC router
// -----------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // sendResponse must be called asynchronously → wrap and return true.
  handleMessage(msg)
    .then(res => sendResponse(res))
    .catch(err => sendResponse({ ok: false, error: String(err?.message || err) }));
  return true;
});

async function handleMessage(msg) {
  switch (msg?.type) {
    case MSG.GET_STATE: {
      const state   = await loadState();
      const setting = await chrome.proxy.settings.get({});
      return { ok: true, state, levelOfControl: setting.levelOfControl };
    }

    case MSG.APPLY_PROFILE: {
      const res = await applyProfile(msg.profileId);
      return { ok: true, ...res };
    }

    case MSG.SAVE_PROFILE: {
      const state = await loadState();
      state.profiles[msg.profile.id] = msg.profile;
      await saveState(state);

      // Re-apply proxy if:
      //   (a) the edited profile IS the currently active one, OR
      //   (b) the active profile is auto_switch — it may reference the edited
      //       profile in its rules table, so the PAC needs regenerating.
      const active = state.profiles[state.activeProfileId];
      if (
        state.activeProfileId === msg.profile.id ||
        active?.type === ProfileType.AUTO_SWITCH
      ) {
        await applyProfile(state.activeProfileId);
      }
      return { ok: true };
    }

    case MSG.DELETE_PROFILE: {
      if (msg.profileId === 'direct' || msg.profileId === 'system') {
        return { ok: false, error: 'Cannot delete built-in profile.' };
      }

      const state = await loadState();
      delete state.profiles[msg.profileId];

      // Sweep references from any auto_switch profile so we don't leave
      // dangling profileId pointers behind.
      for (const p of Object.values(state.profiles)) {
        if (p.type !== ProfileType.AUTO_SWITCH) continue;
        if (p.defaultProfileId === msg.profileId) p.defaultProfileId = 'direct';
        p.rules = (p.rules || []).filter(r => r.profileId !== msg.profileId);
      }

      if (state.activeProfileId === msg.profileId) {
        state.activeProfileId = 'direct';
        await saveState(state);
        await applyProfile('direct');
      } else {
        await saveState(state);
        // If active is auto_switch, refresh PAC in case its rules changed.
        const active = state.profiles[state.activeProfileId];
        if (active?.type === ProfileType.AUTO_SWITCH) {
          await applyProfile(state.activeProfileId);
        }
      }
      return { ok: true };
    }

    default:
      return { ok: false, error: `Unknown message type: ${msg?.type}` };
  }
}
