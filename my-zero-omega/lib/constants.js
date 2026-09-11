// Shared constants used across background / popup / options.
// Keeping this file free of side effects so it can be imported from
// service worker, popup and options page alike.

export const ProfileType = Object.freeze({
  BUILTIN_DIRECT: 'builtin_direct',
  BUILTIN_SYSTEM: 'builtin_system',
  FIXED:          'fixed',
  AUTO_SWITCH:    'auto_switch',
});

// Two built-in, non-deletable profiles.
export const BUILTIN_PROFILES = Object.freeze({
  direct: { id: 'direct', name: 'Direct', type: ProfileType.BUILTIN_DIRECT },
  system: { id: 'system', name: 'System', type: ProfileType.BUILTIN_SYSTEM },
});

// Message types exchanged between UI pages and the service worker.
export const MSG = Object.freeze({
  APPLY_PROFILE:  'APPLY_PROFILE',
  GET_STATE:      'GET_STATE',
  SAVE_PROFILE:   'SAVE_PROFILE',
  DELETE_PROFILE: 'DELETE_PROFILE',
});

// Single top-level key inside chrome.storage.local — makes migrations easier.
export const STORAGE_KEY = 'zo_state_v1';
