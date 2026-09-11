# My Zero Omega (React)

A React re-implementation of [`my-zero-omega`](../my-zero-omega) — a Manifest V3 Chrome extension inspired by SwitchyOmega / Zero Omega. Same features, same data model, same PAC-based auto-switch — the only difference is that the popup and options UIs are built with React 18 + Vite instead of vanilla DOM.

## Features

Identical to the vanilla version:

- Two built-in profiles: **Direct** and **System**
- **Fixed Proxy** profiles: HTTP / HTTPS / SOCKS5 / SOCKS4 with bypass list
- **Auto Switch** profiles: wildcard rules routed to a target profile, with a default fallback
- Popup with one-click switching + active-tab reload; badge shows current profile
- Options page with full CRUD for profiles and rules
- Warns when another extension controls Chrome's proxy setting

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

This starts Vite with `@crxjs/vite-plugin`, which builds the extension into `dist/` and watches sources. Then:

1. Open `chrome://extensions`, enable **Developer mode**.
2. Click **Load unpacked** and select the generated `dist/` directory.
3. Edit sources — HMR reloads the popup / options page automatically. Background changes require clicking the ⟳ icon on the extensions card.

## Production build

```bash
npm run build
```

Produces a self-contained MV3 extension in `dist/` — ready to zip and upload, or to load unpacked.

## Regenerating icons

```bash
npm run gen-icons
```

Stdlib-only Python — no Pillow required. Emits `icons/icon{16,32,48,128}.png`.

## Layout

```
manifest.config.js       @crxjs manifest source — compiled into dist/manifest.json
vite.config.js           React + @crxjs plugin wiring
src/
  background/
    background.js        Service worker: RPC router, applyProfile(), badge sync
  lib/
    constants.js         ProfileType enum, MSG names, STORAGE_KEY
    storage.js           chrome.storage.local wrapper (built-ins re-seeded on load)
    proxy.js             Profile -> chrome.proxy ProxyConfig; applyProxyConfig()
    pac.js               Auto-switch profile -> PAC source string
    rpc.js               Promise wrapper around chrome.runtime.sendMessage
  popup/
    index.html
    main.jsx             React entry
    Popup.jsx            Popup UI (single component)
    popup.css
  options/
    index.html
    main.jsx             React entry
    Options.jsx          Options UI (sidebar + editor)
    options.css
tools/gen-icons.py       Stdlib-only icon generator
icons/                   Generated PNGs (16 / 32 / 48 / 128)
```

## Data model

Identical to the vanilla extension — a single key `zo_state_v1` in `chrome.storage.local`:

```jsonc
{
  "activeProfileId": "direct",
  "profiles": {
    "direct": { "id": "direct", "name": "Direct", "type": "builtin_direct" },
    "system": { "id": "system", "name": "System", "type": "builtin_system" },
    "fixed_ab12cd": {
      "id": "fixed_ab12cd", "name": "Home Proxy", "type": "fixed",
      "scheme": "http", "host": "127.0.0.1", "port": 7890,
      "bypassList": ["<local>", "*.internal"]
    },
    "auto_ef34gh": {
      "id": "auto_ef34gh", "name": "Smart", "type": "auto_switch",
      "defaultProfileId": "direct",
      "rules": [
        { "pattern": "*.google.com", "profileId": "fixed_ab12cd", "matchType": "wildcard" }
      ]
    }
  }
}
```

Because the schema and storage key are the same, this extension can pick up an existing state written by the vanilla `my-zero-omega` build (and vice versa) — although you would need to change the extension name/id if you want them to actually share a profile in the browser.

## How auto-switch works

Chrome's `chrome.proxy` API accepts a PAC (Proxy Auto-Config) script as an opaque string that runs in a native sandbox — it cannot access `chrome.storage` or any extension API. So `src/lib/pac.js` compiles the rule table into a JS literal embedded directly in the PAC source:

```js
var __rules    = [ ["^.*\\.google\\.com$", "PROXY 1.2.3.4:8080; DIRECT"], ... ];
var __fallback = "DIRECT";
function FindProxyForURL(url, host) { ... }
```

Whenever a profile save could affect the active auto-switch profile, the service worker regenerates the PAC and re-calls `chrome.proxy.settings.set`.

## Known limitations (unchanged from vanilla version)

- The `system` profile inside a PAC degrades to `DIRECT` — PAC has no way to express "use OS proxy".
- Auto-switch **cannot** target another auto-switch profile (no nesting).
- Only Chrome's `regular` scope is touched. Incognito inherits.
- Not (yet) implemented: authenticated proxies, non-wildcard match types, rule subscriptions, external PAC URL, import/export. Same v2 backlog as the vanilla version.

## how to use
```bash
cd my-zero-omega-react
npm install
npm run build      # 产出 dist/
# chrome://extensions → Developer mode → Load unpacked → 选 dist/
# 或开发时：npm run dev（HMR）
```