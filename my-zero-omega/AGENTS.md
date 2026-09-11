# AGENTS.md

> Context file for AI coding agents (Claude, Cursor, CodeBuddy, etc.) working on this repo.
> Human-facing overview lives in `README.md`; this file is denser, more prescriptive, and lists invariants an agent must not violate.

---

## 1. What this project is

A Manifest V3 Chrome extension that mimics a subset of [SwitchyOmega / Zero Omega](https://github.com/zero-peak/ZeroOmega): switch Chrome's proxy setting between named **profiles**, including a rule-based **auto-switch** profile driven by a generated PAC script.

**Scope is intentionally small (MVP).** Non-goals are listed in §8.

---

## 2. Hard constraints (do not break)

1. **No build step.** Plain HTML + CSS + ES modules loaded directly. No bundler, no TypeScript, no npm dependencies. If you need to add one, stop and ask the user first.
2. **Manifest V3 only.** Background is a `service_worker` with `"type": "module"`. Never introduce `background.page` or `background.scripts`.
3. **Native JS, readable style.** Descriptive names, meaningful comments explaining *why* (not *what*). No cleverness for its own sake. This was an explicit user requirement.
4. **All state persists in `chrome.storage.local` under one key** (`zo_state_v1`). The service worker may be killed at any time; never rely on module-level memory to hold user data.
5. **Built-in profiles `direct` and `system` are immutable and undeletable.** `lib/storage.js#loadState` re-seeds them on every load.
6. **Do not add permissions casually.** Current permissions: `proxy`, `storage`. Anything more (`tabs`, `webRequest`, `webRequestAuthProvider`, host permissions) must be justified by a concrete feature the user asked for.

---

## 3. Repository map

```
manifest.json            MV3 manifest — 2 permissions, module SW, popup + options page
background.js            Service worker: RPC router, applyProfile(), badge sync
lib/
  constants.js           ProfileType enum, BUILTIN_PROFILES, MSG names, STORAGE_KEY
  storage.js             loadState() / saveState() — the ONLY module that touches chrome.storage
  proxy.js               buildProxyConfig(profile) → chrome.proxy ProxyConfig; applyProxyConfig()
  pac.js                 buildPacScript() — compiles auto_switch profile into a PAC source string
  rpc.js                 send() — Promise wrapper around chrome.runtime.sendMessage
popup/                   Toolbar popup (small): list profiles, click to switch
  popup.html / .css / .js
options/                 Full-page config UI: profile & rule CRUD
  options.html / .css / .js
tools/gen-icons.py       Stdlib-only icon generator (no PIL). Regenerate PNGs with:
                             python3 tools/gen-icons.py
icons/                   Generated PNGs (16 / 32 / 48 / 128). Do not hand-edit.
README.md                Human-facing docs (install, features, layout).
AGENTS.md                This file.
```

---

## 4. Data model (single source of truth)

Stored under `chrome.storage.local["zo_state_v1"]`:

```jsonc
{
  "activeProfileId": "direct",
  "profiles": {
    "direct": { "id": "direct", "name": "Direct", "type": "builtin_direct" },
    "system": { "id": "system", "name": "System", "type": "builtin_system" },

    "fixed_ab12cd": {
      "id": "fixed_ab12cd",
      "name": "Home Proxy",
      "type": "fixed",
      "scheme": "http",              // "http" | "https" | "socks5" | "socks4"
      "host": "127.0.0.1",
      "port": 7890,
      "bypassList": ["<local>", "*.internal"]
    },

    "auto_ef34gh": {
      "id": "auto_ef34gh",
      "name": "Smart Routing",
      "type": "auto_switch",
      "defaultProfileId": "direct",  // used when no rule matches
      "rules": [
        {
          "pattern": "*.google.com", // wildcard: * (any) / ? (one char)
          "profileId": "fixed_ab12cd",
          "matchType": "wildcard"    // reserved; only "wildcard" implemented in MVP
        }
      ]
    }
  }
}
```

**Invariants:**
- `activeProfileId` must reference an existing profile. `loadState()` self-heals to `"direct"` if not.
- An `auto_switch` profile's `defaultProfileId` and each rule's `profileId` must reference a **non-auto** profile. No nesting.
- Deleting a profile must sweep dangling references in every `auto_switch` profile (see `background.js#DELETE_PROFILE` handler).

---

## 5. Runtime data flow

```
┌─────────┐  sendMessage    ┌────────────────┐  chrome.proxy.settings.set
│ popup / │ ──────────────► │ background.js  │ ──────────────────────────► Chrome proxy
│ options │  {type, ...}    │ (service worker)│                              │
└─────────┘                 └────────────────┘  chrome.storage.local.set    │
                                    │        ──────────────────────────►   storage
                                    │                                        │
                                    └── chrome.action.setBadgeText ───────► toolbar
```

Message contract (`lib/constants.js#MSG`):

| Type | Payload | SW behavior | Response |
|---|---|---|---|
| `GET_STATE` | — | Load state + read `levelOfControl` | `{ok, state, levelOfControl}` |
| `APPLY_PROFILE` | `{profileId}` | `applyProfile()` → set proxy + save active + badge | `{ok, profile, levelOfControl}` |
| `SAVE_PROFILE` | `{profile}` | Upsert; re-apply if it affects active | `{ok}` |
| `DELETE_PROFILE` | `{profileId}` | Delete + sweep refs; re-apply if needed | `{ok}` |

All handlers return `{ok: false, error: string}` on failure. UI expects this shape (`lib/rpc.js#send` rejects otherwise).

---

## 6. Why auto-switch is done via a generated PAC

Chrome's `chrome.proxy` API accepts a PAC script only as an **opaque string** that runs in a native sandbox. Inside it, `chrome.*` APIs, DOM, `fetch`, `console`, and `chrome.storage` are all inaccessible. Therefore:

- **Rules cannot be looked up at request time from storage.** They must be serialized into the PAC source at generation time.
- `lib/pac.js#buildPacScript` JSON-serializes the compiled rule table into a `var __rules = [...]` literal so escaping is safe.
- Each rule's wildcard pattern is converted to a **regex source string** (not a live `RegExp`) via `wildcardToRegexSource`, then re-instantiated with `new RegExp(...)` inside PAC at match time.
- Every save that could affect the active auto-switch profile re-generates the PAC and calls `chrome.proxy.settings.set` again (see the `SAVE_PROFILE`/`DELETE_PROFILE` handlers in `background.js`).

Edge case: `builtin_system` inside a PAC returns `DIRECT` (PAC has no way to say "use OS proxy"). This is documented in the README as a known limitation.

---

## 7. UX rules (from the user)

- **Popup click on any profile must:** apply the profile → reload the currently active tab (skipping `chrome://`, `chrome-extension://`, `edge://`, `about:`, `devtools:`, `view-source:` pages) → close the popup. Handled by `popup/popup.js#onPick` + `reloadActiveTab`.
- Popup shows a warning banner when `levelOfControl` is `controlled_by_other_extensions` or `not_controllable`.
- Options page sorts profiles: **built-ins first**, then alphabetical by name.
- Badge text = first 2 chars of the profile name, uppercased. Color varies by profile type (see `background.js#badgeColor`).

---

## 8. Explicit non-goals in MVP (do not implement without asking)

- Authenticated proxies (username/password) — planned for v2. Requires `webRequest` + `webRequestAuthProvider`.
- Match types other than wildcard (regex, domain suffix, IP CIDR).
- Rule subscriptions (GFWList, custom URL feeds).
- External PAC URL profile type (fetch a remote PAC and use it directly).
- Import / export settings to JSON file.
- Incognito scope handling (currently only `regular` scope is set).
- Multi-server fallback within a single fixed profile.

These are enumerated so agents don't quietly widen scope. If a task seems to require one, surface it to the user first.

---

## 9. Conventions

- **File responsibility is single-purpose.** Do not let `background.js` grow storage logic — put it in `lib/storage.js`. Do not let UI files (`popup/`, `options/`) call `chrome.storage` directly — go through `send()` + SW.
- **`lib/*` modules are pure where possible.** `lib/proxy.js#buildProxyConfig` and `lib/pac.js#buildPacScript` take inputs and return outputs — they do not read storage or call chrome APIs. Only `applyProxyConfig` / `clearProxy` touch the browser.
- **Message names are UPPER_SNAKE_CASE and defined in `lib/constants.js`.** Never string-literal a message type in a handler or sender.
- **IDs are generated with `uid(prefix)`** in `options/options.js` — form: `${prefix}_${6-char-base36}`. Prefix reflects type (`fixed_`, `auto_`).
- **All user-visible strings are English** (matching current UI).
- **Comments explain *why* + gotchas.** Do not add comments that just restate the code.
- **Do not add emojis to source or docs unless the user explicitly asks.**

---

## 10. Testing & manual verification

There is no test framework installed. Verification is manual:

1. `python3 tools/gen-icons.py` (only needed once, or after changing icon design).
2. `chrome://extensions` → **Developer mode** → **Load unpacked** → select repo root.
3. Reload the extension after every change (⟳ button on the extensions card).
4. Debug the service worker via **Inspect views: service worker** on the same card.
5. Sanity checklist:
   - Switch Direct ↔ System ↔ a Fixed profile; badge updates; active tab reloads.
   - Create an auto-switch profile with rule `*.example.com` → non-Direct target; visit `http://example.com` and a non-matching site; observe correct routing.
   - Delete a fixed profile that is referenced by an auto-switch rule; confirm the reference is swept.
   - Install another proxy extension → activate it → observe the popup's warning banner.

---

## 11. Extension points for v2 (already wired)

- `rule.matchType` field is stored but only `"wildcard"` is honored. Adding `"regex"` / `"suffix"` is a `switch` case in `lib/pac.js` — no schema change.
- `MSG` enum + `handleMessage` switch make it straightforward to add `EXPORT_STATE` / `IMPORT_STATE`.
- Options form scaffold uses `renderFixedFields` / `renderAutoFields` — additional profile types slot in as new render functions plus a `ProfileType` value.
- Auth support: add `webRequest` + `webRequestAuthProvider` permissions, register a listener in `background.js`, extend the fixed-profile schema with `username` / `password`, and render fields in `renderFixedFields`.

---

## 12. When in doubt

- Prefer editing existing files over creating new ones.
- If a change would touch `manifest.json` permissions, `chrome.storage` schema, or introduce a new profile type — surface it to the user before implementing.
- Keep the diff surface tight. This is a small codebase; sprawling refactors are almost never the answer.
