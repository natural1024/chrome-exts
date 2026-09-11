# AGENTS.md

> Context file for AI coding agents working on this repo.
> Human-facing overview lives in `README.md`; this file is denser, more prescriptive, and lists invariants an agent must not violate.
>
> The design of this project intentionally mirrors the sibling `../my-zero-omega` (vanilla ES modules edition) and `../my-zero-omega-react` (React edition). When in doubt, keep behavior identical and only vary the presentation layer.

---

## 1. What this project is

A Manifest V3 Chrome extension that mimics a subset of SwitchyOmega / Zero Omega, implemented with **Vue 3 + Vite + `@crxjs/vite-plugin`**, using `<script setup>` composition API throughout. The vanilla edition next door (`../my-zero-omega`) is the reference implementation; this one exists to demonstrate the same feature set on a Vue tech stack.

---

## 2. Hard constraints (do not break)

1. **Vue only in the UI layer.** `src/popup/**` and `src/options/**` may use Vue SFCs. `src/background/**` and `src/lib/**` must remain plain ES modules — the service worker cannot host a Vue app, and `lib/` is imported from the SW so it must not pull Vue in transitively.
2. **`<script setup>` composition API only.** Do not introduce Options API or `defineComponent({ ... })` variants. Keep the codebase idiomatic and consistent.
3. **Manifest V3 only.** Background is a `service_worker` with `"type": "module"`. Never introduce `background.page` or `background.scripts`.
4. **All state persists in `chrome.storage.local` under one key** (`zo_state_v1`). The service worker may be killed at any time; never rely on module-level memory to hold user data. Vue `ref` / `computed` state is fine for UI-only concerns (drafts, form state, transient messages).
5. **UI pages talk to the service worker via `send()` from `src/lib/rpc.js`.** They must **not** call `chrome.storage`, `chrome.proxy`, or mutate profile data directly. All writes go through the SW so it can re-apply proxy configs and keep the badge in sync.
6. **Built-in profiles `direct` and `system` are immutable and undeletable.** `src/lib/storage.js#loadState` re-seeds them on every load.
7. **Do not add permissions casually.** Current permissions: `proxy`, `storage`. Anything more (`tabs`, `webRequest`, `webRequestAuthProvider`, host permissions) must be justified by a concrete feature the user asked for. `chrome.tabs.query` / `chrome.tabs.reload` used by the popup work without the `tabs` permission because they only operate on the active tab and don't read protected fields — do not "helpfully" add `tabs` back.
8. **Storage schema parity with the vanilla / React editions.** Same `STORAGE_KEY`, same profile shape, same id prefixes (`fixed_`, `auto_`). Any schema change must land in all three projects.

---

## 3. Repository map

```
manifest.config.js       @crxjs manifest source, consumed by vite.config.js
vite.config.js           Vite + Vue + @crxjs wiring
package.json             Deps: vue, vite, @crxjs/vite-plugin, @vitejs/plugin-vue
src/
  background/
    background.js        Service worker: RPC router, applyProfile(), badge sync
  lib/                   Pure ES modules — no Vue, no SFCs
    constants.js         ProfileType enum, BUILTIN_PROFILES, MSG names, STORAGE_KEY
    storage.js           loadState() / saveState() — the ONLY module that touches chrome.storage
    proxy.js             buildProxyConfig(profile) → chrome.proxy ProxyConfig; applyProxyConfig()
    pac.js               buildPacScript() — compiles auto_switch profile into a PAC source string
    rpc.js               send() — Promise wrapper around chrome.runtime.sendMessage
  popup/
    index.html           Popup HTML shell (root div + module script)
    main.js              Vue app root
    Popup.vue            Single-component popup UI
    popup.css
  options/
    index.html           Options page HTML shell
    main.js              Vue app root
    Options.vue          Root — owns state, dispatches to children
    Sidebar.vue          Profile list + new-profile buttons (stateless)
    Editor.vue           Wrapper for type-specific fieldsets + form actions
    FixedFields.vue      Fixed-proxy fieldset (v-model per field)
    AutoFields.vue       Auto-switch fieldset (default + rules table)
    helpers.js           Pure helpers — profileOrder / uid / factories / validate
    options.css
tools/gen-icons.py       Stdlib-only icon generator (no PIL). Run: `npm run gen-icons`
icons/                   Generated PNGs (16 / 32 / 48 / 128). Do not hand-edit.
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
      "id": "fixed_ab12cd", "name": "Home Proxy", "type": "fixed",
      "scheme": "http",              // "http" | "https" | "socks5" | "socks4"
      "host": "127.0.0.1", "port": 7890,
      "bypassList": ["<local>", "*.internal"]
    },

    "auto_ef34gh": {
      "id": "auto_ef34gh", "name": "Smart Routing", "type": "auto_switch",
      "defaultProfileId": "direct",
      "rules": [
        {
          "pattern": "*.google.com",
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
- Deleting a profile must sweep dangling references in every `auto_switch` profile (see `background.js#DELETE_PROFILE`).

---

## 5. Runtime data flow

```
┌─────────────┐  sendMessage    ┌─────────────────┐  chrome.proxy.settings.set
│ Popup.vue / │ ──────────────► │ background.js   │ ──────────────────────────► Chrome proxy
│ Options.vue │  {type, ...}    │ (service worker)│                              │
└─────────────┘                 └─────────────────┘  chrome.storage.local.set    │
                                        │        ──────────────────────────►   storage
                                        │
                                        └── chrome.action.setBadgeText ───────► toolbar
```

Message contract (`src/lib/constants.js#MSG`):

| Type | Payload | SW behavior | Response |
|---|---|---|---|
| `GET_STATE` | — | Load state + read `levelOfControl` | `{ok, state, levelOfControl}` |
| `APPLY_PROFILE` | `{profileId}` | `applyProfile()` → set proxy + save active + badge | `{ok, profile, levelOfControl}` |
| `SAVE_PROFILE` | `{profile}` | Upsert; re-apply if it affects active | `{ok}` |
| `DELETE_PROFILE` | `{profileId}` | Delete + sweep refs; re-apply if needed | `{ok}` |

All handlers return `{ok: false, error: string}` on failure. UI expects this shape (`rpc.js#send` rejects otherwise).

---

## 6. Vue-layer conventions

- **`<script setup>` + composition API.** No Options API, no `defineComponent`.
- **Unidirectional data flow via `v-model:profile`.** `Options.vue` owns the `editing` ref; children receive it as a prop and emit `update:profile` with a **new object** (`{ ...profile, ...update }`) — we never mutate the prop directly. This matches how the React version works and keeps the data flow obvious.
- **`structuredClone` on entry.** When the user picks a profile in the sidebar we `structuredClone` it into `editing` — we never mutate the object we got back from the SW.
- **Draft detection.** A profile is a draft iff `!state.profiles[editing.id]`. Drafts have no Delete button and are never overwritten by `refresh()`.
- **No `collectForm()` step.** Every input is v-modeled through a `computed({ get, set })` back to `editing`, so `editing` is always the exact payload for `SAVE_PROFILE`.
- **Do not add Pinia / Vuex** unless explicitly requested. Two pages with local state is plenty for this app.
- **Do not introduce TypeScript** unless explicitly requested. Keep parity with the vanilla / React editions.
- **No new UI libraries.** No Element Plus, Naive UI, Vuetify, Tailwind, etc. Plain CSS with the existing variables.
- **Component granularity.** Popup is one SFC. Options is `Options` → `Sidebar` + `Editor` → `FixedFields` / `AutoFields`. Further splitting is unnecessary.

---

## 7. UX rules (from the user, unchanged from other editions)

- **Popup click on any profile must:** apply the profile → reload the currently active tab (skipping `chrome://`, `chrome-extension://`, `edge://`, `about:`, `devtools:`, `view-source:`) → close the popup. Handled by `Popup.vue#onPick` + `reloadActiveTab`.
- Popup shows a warning banner when `levelOfControl` is `controlled_by_other_extensions` or `not_controllable`.
- Options page sorts profiles: **built-ins first**, then alphabetical by name (`helpers.js#profileOrder`).
- Badge text = first 2 chars of the profile name, uppercased. Color varies by profile type (`background.js#badgeColor`).

---

## 8. Explicit non-goals in MVP (do not implement without asking)

Same as other editions:

- Authenticated proxies (username/password) — planned for v2. Requires `webRequest` + `webRequestAuthProvider`.
- Match types other than wildcard (regex, domain suffix, IP CIDR).
- Rule subscriptions (GFWList, custom URL feeds).
- External PAC URL profile type.
- Import / export settings to JSON file.
- Incognito scope handling (currently only `regular` scope is set).
- Multi-server fallback within a single fixed profile.

If a task seems to require one, surface it to the user first.

---

## 9. Testing & manual verification

No test framework installed. Verification is manual:

1. `npm install`
2. `npm run dev` → load `dist/` unpacked in `chrome://extensions` (Developer mode).
3. Reload the extension after every source change that touches `src/background/**` or `manifest.config.js` (⟳ button on the extensions card). Popup/options changes hot-reload.
4. Debug the service worker via **Inspect views: service worker** on the extensions card.
5. Sanity checklist:
   - Switch Direct ↔ System ↔ a Fixed profile; badge updates; active tab reloads.
   - Create an auto-switch profile with rule `*.example.com` → non-Direct target; visit `http://example.com` and a non-matching site; observe correct routing.
   - Delete a fixed profile that is referenced by an auto-switch rule; confirm the reference is swept.
   - Install another proxy extension → activate it → observe the popup's warning banner.

---

## 10. When in doubt

- Prefer editing existing files over creating new ones.
- If a change would touch `manifest.config.js` permissions, `chrome.storage` schema, or introduce a new profile type — surface it to the user before implementing, and mirror the change into `../my-zero-omega` and `../my-zero-omega-react`.
- Keep the diff surface tight. This is a small codebase; sprawling refactors are almost never the answer.
