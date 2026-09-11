// Shared helpers for the options page — kept in a plain .js module so both
// the parent view and child components can import without .vue-file gymnastics.

import { ProfileType } from '../lib/constants.js';

// Built-ins first, then alphabetical by name.
export function profileOrder(a, b) {
  const abt = a.type.startsWith('builtin') ? 0 : 1;
  const bbt = b.type.startsWith('builtin') ? 0 : 1;
  if (abt !== bbt) return abt - bbt;
  return a.name.localeCompare(b.name);
}

// Same id shape as the vanilla / React versions, so an existing
// chrome.storage.local blob written by any edition round-trips cleanly.
export function uid(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeFixedProfile() {
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

export function makeAutoProfile() {
  return {
    id: uid('auto'),
    name: 'Auto Switch',
    type: ProfileType.AUTO_SWITCH,
    defaultProfileId: 'direct',
    rules: [],
  };
}

export function validate(p, profiles) {
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
