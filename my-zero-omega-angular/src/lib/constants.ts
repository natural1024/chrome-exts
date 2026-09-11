// Shared domain types + constants used across background / popup / options.
// Kept free of side effects so it can be imported from service worker,
// popup, and options page alike.
//
// The public shape of `Profile`, `AppState`, and the message payloads matches
// the storage schema written by the vanilla / React / Vue3 editions bit-for-bit
// — a chrome.storage.local blob written by any edition round-trips cleanly.

// -----------------------------------------------------------------------------
// Profile types
// -----------------------------------------------------------------------------

export const ProfileType = {
  BUILTIN_DIRECT: 'builtin_direct',
  BUILTIN_SYSTEM: 'builtin_system',
  FIXED:          'fixed',
  AUTO_SWITCH:    'auto_switch',
} as const;

export type ProfileTypeKind =
  (typeof ProfileType)[keyof typeof ProfileType];

export type FixedScheme = 'http' | 'https' | 'socks5' | 'socks4';
export type MatchType   = 'wildcard'; // reserved for future: regex, cidr, suffix …

export interface BuiltinDirectProfile {
  id:   'direct';
  name: string;
  type: typeof ProfileType.BUILTIN_DIRECT;
}

export interface BuiltinSystemProfile {
  id:   'system';
  name: string;
  type: typeof ProfileType.BUILTIN_SYSTEM;
}

export interface FixedProfile {
  id:         string;
  name:       string;
  type:       typeof ProfileType.FIXED;
  scheme:     FixedScheme;
  host:       string;
  port:       number;
  bypassList: string[];
}

export interface AutoSwitchRule {
  pattern:   string;
  profileId: string;
  matchType: MatchType;
}

export interface AutoSwitchProfile {
  id:               string;
  name:             string;
  type:             typeof ProfileType.AUTO_SWITCH;
  defaultProfileId: string;
  rules:            AutoSwitchRule[];
}

export type Profile =
  | BuiltinDirectProfile
  | BuiltinSystemProfile
  | FixedProfile
  | AutoSwitchProfile;

export type ProfileMap = Record<string, Profile>;

export interface AppState {
  activeProfileId: string;
  profiles:        ProfileMap;
}

// -----------------------------------------------------------------------------
// Built-ins
// -----------------------------------------------------------------------------

// Two built-in, non-deletable profiles.
export const BUILTIN_PROFILES = {
  direct: { id: 'direct', name: 'Direct', type: ProfileType.BUILTIN_DIRECT } as BuiltinDirectProfile,
  system: { id: 'system', name: 'System', type: ProfileType.BUILTIN_SYSTEM } as BuiltinSystemProfile,
} as const;

// -----------------------------------------------------------------------------
// Messaging protocol
// -----------------------------------------------------------------------------

// Message types exchanged between UI pages and the service worker.
export const MSG = {
  APPLY_PROFILE:  'APPLY_PROFILE',
  GET_STATE:      'GET_STATE',
  SAVE_PROFILE:   'SAVE_PROFILE',
  DELETE_PROFILE: 'DELETE_PROFILE',
} as const;

export type MsgType = (typeof MSG)[keyof typeof MSG];

export type LevelOfControl =
  | 'controlled_by_this_extension'
  | 'controllable_by_this_extension'
  | 'controlled_by_other_extensions'
  | 'not_controllable';

// Requests

export interface GetStateRequest      { type: typeof MSG.GET_STATE }
export interface ApplyProfileRequest  { type: typeof MSG.APPLY_PROFILE;  profileId: string }
export interface SaveProfileRequest   { type: typeof MSG.SAVE_PROFILE;   profile: Profile }
export interface DeleteProfileRequest { type: typeof MSG.DELETE_PROFILE; profileId: string }

export type AnyRequest =
  | GetStateRequest
  | ApplyProfileRequest
  | SaveProfileRequest
  | DeleteProfileRequest;

// Responses

export interface OkResponse<T = unknown> {
  ok:    true;
  // Payload fields spread onto response; we type them per handler below.
  [k: string]: unknown;
  data?: T;
}

export interface ErrResponse {
  ok:    false;
  error: string;
}

export interface GetStateResponse {
  ok:             true;
  state:          AppState;
  levelOfControl: LevelOfControl;
}

export interface ApplyProfileResponse {
  ok:             true;
  profile:        Profile;
  levelOfControl: LevelOfControl;
}

export interface SimpleOkResponse { ok: true }

// -----------------------------------------------------------------------------
// Storage
// -----------------------------------------------------------------------------

// Single top-level key inside chrome.storage.local — makes migrations easier.
export const STORAGE_KEY = 'zo_state_v1';
