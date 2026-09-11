// Thin wrapper around chrome.storage.local.
// All persisted data lives under a single key `zo_state_v1`, shaped as:
//
//   {
//     activeProfileId: string,
//     profiles: { [id]: Profile }
//   }
//
// Built-in profiles are always re-seeded on load so a corrupted / partial
// state cannot leave the user without "Direct" or "System".

import { BUILTIN_PROFILES, STORAGE_KEY } from './constants.js';

const DEFAULT_STATE = {
  activeProfileId: 'direct',
  profiles: { ...BUILTIN_PROFILES },
};

export async function loadState() {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const state = raw[STORAGE_KEY];
  if (!state) return structuredClone(DEFAULT_STATE);

  // Defensive: guarantee built-ins exist and haven't been mutated.
  for (const [id, p] of Object.entries(BUILTIN_PROFILES)) {
    state.profiles[id] = { ...p };
  }
  if (!state.profiles[state.activeProfileId]) {
    state.activeProfileId = 'direct';
  }
  return state;
}

export async function saveState(state) {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}
