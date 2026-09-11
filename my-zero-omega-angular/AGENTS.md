# AGENTS.md

> Context file for AI coding agents working on this repo.
> Human-facing overview lives in `README.md`; this file is denser, more prescriptive, and lists invariants an agent must not violate.
>
> The design intentionally mirrors the siblings `../my-zero-omega` (vanilla), `../my-zero-omega-react`, and `../my-zero-omega-vue3`. When in doubt, keep behavior identical and only vary the presentation layer.

---

## 1. What this project is

A Manifest V3 Chrome extension that mimics a subset of SwitchyOmega / Zero Omega, implemented with:

- **Angular 19** — standalone components, signals (`signal` / `computed` / `input()` / `output()` / `model()`), zoneless change detection
- **TypeScript 5** in strict mode (see `tsconfig.json`)
- **Vite 6** + `@analogjs/vite-plugin-angular` (Angular compiler as a Vite plugin — no Angular CLI)
- `@crxjs/vite-plugin` for MV3 packaging and HMR

The vanilla edition next door (`../my-zero-omega`) is the reference implementation; this one demonstrates the same feature set with Angular's signals-based reactivity and end-to-end static typing (`src/lib/` is TS here, unlike the JS-only lib in the other editions).

---

## 2. Hard constraints (do not break)

1. **Angular only in the UI layer.** `src/popup/**` and `src/options/**` may use Angular. `src/background/**` and `src/lib/**` must remain plain TypeScript modules with **no Angular imports** — the service worker cannot host an Angular app, and `lib/` is imported from the SW so it must not pull `@angular/*` in transitively.
2. **Standalone components + signals only.** No `NgModule`, no `@Injectable` for pure helpers, no zone.js. Use `provideExperimentalZonelessChangeDetection()` in every `bootstrapApplication` call.
3. **`ChangeDetectionStrategy.OnPush` on every component.** Combined with signals this is basically free; a component author who omits it will regress performance without noticing.
4. **Manifest V3 only.** Background is a `service_worker` with `"type": "module"`. Never introduce `background.page` or `background.scripts`.
5. **All state persists in `chrome.storage.local` under one key** (`zo_state_v1`). The SW may be killed at any time; never rely on module-level memory to hold user data. Signal-based state in the UI is fine for transient concerns (drafts, form state, messages).
6. **UI pages talk to the service worker via `send<T>()` from `src/lib/rpc.ts`.** They must **not** call `chrome.storage`, `chrome.proxy`, or mutate profile data directly. All writes go through the SW.
7. **Built-in profiles `direct` and `system` are immutable and undeletable.** `loadState()` re-seeds them on every load.
8. **Do not add permissions casually.** Current permissions: `proxy`, `storage`. `chrome.tabs.query` / `chrome.tabs.reload` used by the popup work without `tabs` permission because they only touch the active tab and don't read protected fields — do not "helpfully" add `tabs` back.
9. **Storage schema parity with sibling editions.** Same `STORAGE_KEY`, same profile shape, same id prefixes (`fixed_`, `auto_`). Any schema change must land in all four projects.
10. **Strict TS is the floor.** If you disable a strict flag to make code compile, that is almost always the wrong fix — narrow types or refactor instead.

---

## 3. Repository map

```
manifest.config.ts       @crxjs manifest source, consumed by vite.config.ts
vite.config.ts           Vite + Analog + @crxjs wiring; Analog needs `tsconfig: './tsconfig.json'`
tsconfig.json            Strict + strictTemplates; single flat tsconfig (no tsconfig.app.json)
package.json             Deps: @angular/{core,common,compiler,forms,platform-browser}, rxjs, tslib
                         Dev:  @analogjs/vite-plugin-angular, @angular/{build,compiler-cli}, @crxjs/vite-plugin,
                               @types/{chrome,node}, typescript, vite
src/
  background/
    background.ts        Service worker: RPC router, applyProfile(), badge sync
  lib/                   Pure TS ES modules — no Angular
    constants.ts         Domain types + constants + request/response shapes
    storage.ts           loadState() / saveState() — the ONLY module that touches chrome.storage
    proxy.ts             buildProxyConfig(profile) → chrome.proxy ProxyConfig; applyProxyConfig()
    pac.ts               buildPacScript() — compiles auto_switch profile into PAC source
    rpc.ts               send<TResponse>() — typed Promise wrapper for chrome.runtime.sendMessage
  popup/
    index.html
    main.ts                    bootstrapApplication + provideExperimentalZonelessChangeDetection
    popup.component.ts         Single standalone component, signals + OnPush
    popup.css
  options/
    index.html
    main.ts                    bootstrapApplication + provideExperimentalZonelessChangeDetection
    options.component.ts       Root — owns state, dispatches to children
    sidebar.component.ts       Profile list (input.required / output)
    editor.component.ts        Wrapper for type-specific fieldsets + form actions
    fixed-fields.component.ts  Fixed-proxy fieldset (model.required for 2-way binding)
    auto-fields.component.ts   Auto-switch fieldset
    helpers.ts                 Pure helpers — profileOrder / uid / factories / validate
    options.css
tools/gen-icons.py       Stdlib-only icon generator (no PIL). Run: `npm run gen-icons`
icons/                   PNGs (16 / 32 / 48 / 128)
```

---

## 4. Data model (single source of truth)

`src/lib/constants.ts` exports a **discriminated union**:

```ts
export type Profile =
  | BuiltinDirectProfile
  | BuiltinSystemProfile
  | FixedProfile
  | AutoSwitchProfile;
```

Every `switch (profile.type)` must be exhaustive — end with an `_exhaustive: never = profile;` guard so that adding a new variant without updating the switch is a compile error. Existing exhaustive switches: `buildProxyConfig`, `handleMessage`, `badgeColor`.

Stored under `chrome.storage.local["zo_state_v1"]`:

```jsonc
{
  "activeProfileId": "direct",
  "profiles": {
    "direct":       { "id": "direct", "name": "Direct", "type": "builtin_direct" },
    "system":       { "id": "system", "name": "System", "type": "builtin_system" },
    "fixed_ab12cd": { "id": "fixed_ab12cd", "name": "Home Proxy", "type": "fixed",
                      "scheme": "http", "host": "127.0.0.1", "port": 7890,
                      "bypassList": ["<local>", "*.internal"] },
    "auto_ef34gh":  { "id": "auto_ef34gh", "name": "Smart", "type": "auto_switch",
                      "defaultProfileId": "direct",
                      "rules": [
                        { "pattern": "*.google.com", "profileId": "fixed_ab12cd", "matchType": "wildcard" }
                      ] }
  }
}
```

**Invariants:**
- `activeProfileId` must reference an existing profile. `loadState()` self-heals to `"direct"` if not.
- An `auto_switch` profile's `defaultProfileId` and each rule's `profileId` must reference a **non-auto** profile. No nesting.
- Deleting a profile must sweep dangling references in every `auto_switch` profile (see `background.ts#DELETE_PROFILE`).

---

## 5. Runtime data flow

```
┌───────────────────────┐  sendMessage    ┌─────────────────┐  chrome.proxy.settings.set
│ popup.component.ts /  │ ──────────────► │ background.ts   │ ──────────────────────────► Chrome proxy
│ options.component.ts  │  {type, ...}    │ (service worker)│                              │
└───────────────────────┘                 └─────────────────┘  chrome.storage.local.set    │
                                                  │        ──────────────────────────►   storage
                                                  │
                                                  └── chrome.action.setBadgeText ───────► toolbar
```

Message contract (see `MSG` + typed request/response interfaces in `constants.ts`):

| Type | Request | SW behavior | Response |
|---|---|---|---|
| `GET_STATE` | `GetStateRequest` | Load state + read `levelOfControl` | `GetStateResponse` |
| `APPLY_PROFILE` | `ApplyProfileRequest` | `applyProfile()` → set proxy + save active + badge | `ApplyProfileResponse` |
| `SAVE_PROFILE` | `SaveProfileRequest` | Upsert; re-apply if it affects active | `SimpleOkResponse` |
| `DELETE_PROFILE` | `DeleteProfileRequest` | Delete + sweep refs; re-apply if needed | `SimpleOkResponse` |

All handlers return `ErrResponse` on failure. `send<T>()` in `rpc.ts` rejects otherwise — UI code always operates on the `T` success shape.

---

## 6. Angular-layer conventions

- **Signals over RxJS for state.** Reach for `signal` / `computed`; use RxJS only for genuine streams (none exist in this project today).
- **`input()` / `output()` / `model()`, not `@Input` / `@Output`.** These are the new signal-based APIs (Angular 17.2+) and give proper typing for `input.required<T>()` and 2-way binding via `[(profile)]`.
- **Immutable updates.** Every child that receives a `model()` emits a **new object** via `.set()` or `.update(p => ({ ...p, patch }))`. Never mutate profile fields in place.
- **`structuredClone` on entry.** When the user picks a profile in the sidebar we clone it into `editing` — we never mutate the object we got back from the SW.
- **Draft detection.** A profile is a draft iff `!state.profiles[editing.id]`. Drafts have no Delete button and are never overwritten by `refresh()`.
- **No `collectForm()` step.** Every input uses `[ngModel]` + `(ngModelChange)` in "banana-in-a-box"-style back to the signal, so `editing` is always the exact payload for `SAVE_PROFILE`.
- **Templates use control flow blocks** (`@if`, `@for`, `@else`) — no `*ngIf` / `*ngFor`. This is idiomatic modern Angular and lets us drop `CommonModule` imports.
- **Do not introduce NgRx / SignalStore / services** unless explicitly requested. Two pages with local signals is plenty.
- **No new UI libraries.** No Angular Material, PrimeNG, etc. Plain CSS with the existing variables.
- **Do not add zone.js.** We're intentionally zoneless.

---

## 7. UX rules (from the user, unchanged from other editions)

- **Popup click on any profile must:** apply the profile → reload the currently active tab (skipping `chrome://`, `chrome-extension://`, `edge://`, `about:`, `devtools:`, `view-source:`) → close the popup. Handled by `popup.component.ts#onPick` + `reloadActiveTab`.
- Popup shows a warning banner when `levelOfControl` is `controlled_by_other_extensions` or `not_controllable`.
- Options page sorts profiles: **built-ins first**, then alphabetical by name (`helpers.ts#profileOrder`).
- Badge text = first 2 chars of the profile name, uppercased. Color varies by profile type (`background.ts#badgeColor`).

---

## 8. Explicit non-goals in MVP (do not implement without asking)

Same as sibling editions:

- Authenticated proxies (username/password) — planned for v2. Requires `webRequest` + `webRequestAuthProvider`.
- Match types other than wildcard (regex, domain suffix, IP CIDR).
- Rule subscriptions (GFWList, custom URL feeds).
- External PAC URL profile type.
- Import / export settings to JSON file.
- Incognito scope handling (currently only `regular` scope is set).
- Multi-server fallback within a single fixed profile.

If a task seems to require one, surface it to the user first.

---

## 9. Build system notes / gotchas

- `@analogjs/vite-plugin-angular` requires **Vite 6** (needs `defaultClientConditions` export). Do not downgrade Vite to 5.
- Analog reads `tsconfig.app.json` by default (Angular-CLI style). We use a single flat `tsconfig.json`, so `vite.config.ts` passes `angular({ tsconfig: './tsconfig.json' })` explicitly. Do not remove that argument.
- Analog also requires **`@angular/build` as a peer dep** (it uses `@angular/build/private`). Keep it in devDependencies.
- `@types/chrome` types `chrome.proxy.settings.get` as returning `void` on its callback-less overload. At runtime it returns a Promise resolving to `{ value, levelOfControl }` under MV3. Both `src/lib/proxy.ts` and `src/background/background.ts` cast through `unknown` to typed Promise. If you touch this call, keep the cast — do not just `as any`.
- Chrome extension manifest `permissions` and `background.type: "module"` are set in `manifest.config.ts`. Don't hand-edit `dist/manifest.json`.

---

## 10. Testing & manual verification

No test framework installed. Verification is manual:

1. `npm install`
2. `npm run typecheck` → must exit 0.
3. `npm run build` or `npm run dev` → load `dist/` unpacked in `chrome://extensions` (Developer mode).
4. Reload the extension after every source change that touches `src/background/**` or `manifest.config.ts` (⟳ button on the extensions card). Popup/options changes hot-reload.
5. Debug the service worker via **Inspect views: service worker** on the extensions card.
6. Sanity checklist:
   - Switch Direct ↔ System ↔ a Fixed profile; badge updates; active tab reloads.
   - Create an auto-switch profile with rule `*.example.com` → non-Direct target; visit `http://example.com` and a non-matching site; observe correct routing.
   - Delete a fixed profile referenced by an auto-switch rule; confirm the reference is swept.
   - Install another proxy extension → activate it → observe the popup's warning banner.

---

## 11. When in doubt

- Prefer editing existing files over creating new ones.
- If a change would touch `manifest.config.ts` permissions, `chrome.storage` schema, or introduce a new profile type — surface it to the user before implementing, and mirror the change across all four editions.
- Keep the diff surface tight. This is a small codebase; sprawling refactors are almost never the answer.
