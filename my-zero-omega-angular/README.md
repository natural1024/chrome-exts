# My Zero Omega (Angular)

An Angular re-implementation of [`my-zero-omega`](../my-zero-omega) — a Manifest V3 Chrome extension inspired by SwitchyOmega / Zero Omega. Same features, same data model, same PAC-based auto-switch. Popup and options pages are built with **Angular 19** (standalone components + signals + zoneless change detection), and every source file — including `src/lib/` and the service worker — is **strict TypeScript**.

## Features

Identical to the vanilla / React / Vue3 editions:

- Two built-in profiles: **Direct** and **System**
- **Fixed Proxy** profiles: HTTP / HTTPS / SOCKS5 / SOCKS4 with bypass list
- **Auto Switch** profiles: wildcard rules routed to a target profile, with a default fallback
- Popup with one-click switching + active-tab reload; badge shows current profile
- Options page with full CRUD for profiles and rules
- Warns when another extension controls Chrome's proxy setting

## Tech stack

- **Angular 19** — standalone components, `signal` / `computed` / `input()` / `output()` / `model()`, `provideExperimentalZonelessChangeDetection` (no `zone.js` bundled)
- **TypeScript 5** in strict mode (`strict`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noImplicitReturns`, `noFallthroughCasesInSwitch`, plus Angular's `strictTemplates` + `strictInputAccessModifiers`)
- **Vite 6** + `@analogjs/vite-plugin-angular` — runs the Angular compiler outside the Angular CLI, so we can share Vite's plugin ecosystem
- `@crxjs/vite-plugin` — MV3 manifest emission, service-worker path hashing, HMR wiring

## Requirements

- Node.js ≥ 18
- Python 3 (only for regenerating icons)

## Install

```bash
npm install
```

## Development

```bash
npm run dev
```

Vite watches sources and rebuilds `dist/` on change. Then:

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the generated `dist/` directory.
3. Edit sources — HMR reloads the popup / options page automatically. Background changes require clicking the ⟳ icon on the extensions card.

## Production build

```bash
npm run build       # emits dist/ (loadable as unpacked or zippable for CWS)
npm run typecheck   # strict TS with Angular template checks
```

## Regenerating icons

```bash
npm run gen-icons
```

Stdlib-only Python — no Pillow required.

## Layout

```
manifest.config.ts       @crxjs manifest source (typed)
vite.config.ts           Vite + Analog (Angular) + @crxjs wiring
tsconfig.json            Strict + Angular compiler options
src/
  background/
    background.ts        Service worker: RPC router, applyProfile(), badge sync
  lib/                   Pure ES modules — no Angular, no decorators
    constants.ts         Domain types (Profile, AppState, MSG), constants, request/response shapes
    storage.ts           chrome.storage.local wrapper (built-ins re-seeded on load)
    proxy.ts             buildProxyConfig(profile) → chrome.proxy ProxyConfig; applyProxyConfig()
    pac.ts               buildPacScript() — auto-switch profile → PAC source string
    rpc.ts               send<T>() — typed Promise wrapper around chrome.runtime.sendMessage
  popup/
    index.html
    main.ts                    bootstrapApplication + zoneless CD
    popup.component.ts         Single standalone component; signals + OnPush
    popup.css
  options/
    index.html
    main.ts                    bootstrapApplication + zoneless CD
    options.component.ts       Root — owns state, dispatches to children
    sidebar.component.ts       Profile list + new-profile buttons (input/output signals)
    editor.component.ts        Wraps type-specific fieldsets, form actions, messages
    fixed-fields.component.ts  Fixed-proxy fieldset (model() 2-way binding)
    auto-fields.component.ts   Auto-switch fieldset (default profile + rules table)
    helpers.ts                 Pure helpers — profileOrder / uid / factories / validate
    options.css
tools/gen-icons.py       Stdlib-only icon generator
icons/                   PNGs (16 / 32 / 48 / 128)
```

## Data model

Identical to the other editions — a single key `zo_state_v1` in `chrome.storage.local`, but now expressed as a **discriminated union** in `src/lib/constants.ts`:

```ts
export type Profile =
  | BuiltinDirectProfile
  | BuiltinSystemProfile
  | FixedProfile
  | AutoSwitchProfile;
```

`buildProxyConfig(profile)` and the SW's `handleMessage()` both use `switch (profile.type)` with a `never` exhaustiveness check — adding a new `ProfileType` without handling it is a compile error.

## How auto-switch works

Chrome's `chrome.proxy` API accepts a PAC (Proxy Auto-Config) script as an opaque string that runs in a native sandbox — it cannot access `chrome.storage` or any extension API. So `src/lib/pac.ts` compiles the rule table into a JS literal embedded directly in the PAC source. Whenever a profile save could affect the active auto-switch profile, the service worker regenerates the PAC and re-calls `chrome.proxy.settings.set`.

## Known limitations (unchanged from other editions)

- The `system` profile inside a PAC degrades to `DIRECT` — PAC has no way to express "use OS proxy".
- Auto-switch **cannot** target another auto-switch profile (no nesting).
- Only Chrome's `regular` scope is touched. Incognito inherits.
- Not (yet) implemented: authenticated proxies, non-wildcard match types, rule subscriptions, external PAC URL, import/export.
