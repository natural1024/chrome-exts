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

import {
  AppState,
  BUILTIN_PROFILES,
  Profile,
  ProfileMap,
  STORAGE_KEY,
} from './constants';

const DEFAULT_STATE: AppState = {
  activeProfileId: 'direct',
  profiles: { ...(BUILTIN_PROFILES as unknown as ProfileMap) },
};

export async function loadState(): Promise<AppState> {
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const stored = (raw as Record<string, AppState | undefined>)[STORAGE_KEY];
  if (!stored) return structuredClone(DEFAULT_STATE);

  // Defensive: guarantee built-ins exist and haven't been mutated.
  for (const [id, p] of Object.entries(BUILTIN_PROFILES)) {
    stored.profiles[id] = { ...(p as Profile) };
  }
  if (!stored.profiles[stored.activeProfileId]) {
    stored.activeProfileId = 'direct';
  }
  return stored;
}

export async function saveState(state: AppState): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
}
