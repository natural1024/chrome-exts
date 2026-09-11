# My Zero Omega

A simplified Chrome extension inspired by [SwitchyOmega / Zero Omega](https://github.com/zero-peak/ZeroOmega) — proxy profile switcher with rule-based auto-switching. Written in plain ES modules (no build step).

## Features (MVP)

- Two built-in profiles: **Direct** and **System**
- **Fixed Proxy** profiles: HTTP / HTTPS / SOCKS5 / SOCKS4 with bypass list
- **Auto Switch** profiles: match URLs by **wildcard** patterns (`*`, `?`) and route to a target profile; fall back to a default profile
- Popup with one-click switching, badge shows current profile
- Options page for full CRUD of profiles and rules
- Detects when another extension controls Chrome's proxy setting and warns you

**Not (yet) included** — planned for v2:
- Authenticated proxies (username / password)
- Regex / domain-suffix match types
- Rule subscriptions (GFWList etc.)
- External PAC URL profiles
- Import / export of settings

## Install (unpacked)

1. Generate icons once (requires Python 3):
   ```bash
   python3 tools/gen-icons.py
   ```
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and select this directory.

## Layout

```
manifest.json            # MV3 manifest
background.js            # Service worker: RPC + apply proxy + badge
lib/
  constants.js           # Enums, message names, storage key
  storage.js             # chrome.storage.local wrapper with defaults
  proxy.js               # Profile -> chrome.proxy ProxyConfig
  pac.js                 # Auto-switch profile -> PAC source
  rpc.js                 # Promise wrapper around sendMessage
popup/                   # Toolbar popup: pick a profile
options/                 # Full-page config UI
tools/gen-icons.py       # Icon generator (stdlib only, no PIL)
icons/                   # Generated PNGs (16 / 32 / 48 / 128)
```

## Data model

Everything persists under one key (`zo_state_v1`) in `chrome.storage.local`:

```js
{
  activeProfileId: "direct",
  profiles: {
    direct: { id, name, type: "builtin_direct" },
    system: { id, name, type: "builtin_system" },
    fixed_ab12cd: {
      id, name, type: "fixed",
      scheme: "http" | "https" | "socks5" | "socks4",
      host, port, bypassList: ["<local>", "*.internal"]
    },
    auto_ef34gh: {
      id, name, type: "auto_switch",
      defaultProfileId: "direct",
      rules: [
        { pattern: "*.google.com", profileId: "fixed_ab12cd", matchType: "wildcard" }
      ]
    }
  }
}
```

## How Auto Switch works

Chrome's `chrome.proxy` API can accept a PAC (Proxy Auto-Config) script as an opaque string. That script runs in an isolated sandbox — it **cannot** access `chrome.storage` or any extension API. So `lib/pac.js` compiles our rule table into a JS literal that's embedded directly in the PAC source:

```js
var __rules = [ ["^.*\\.google\\.com$", "PROXY 1.2.3.4:8080; DIRECT"], ... ];
var __fallback = "DIRECT";
function FindProxyForURL(url, host) { ... }
```

Every time a profile is saved that could affect the active auto-switch profile, the service worker regenerates the PAC and re-calls `chrome.proxy.settings.set`.

## Known limitations

- **`system` profile in PAC** cannot be expressed; if you point an auto-switch default at `system`, PAC returns `DIRECT` instead. (Set the auto profile itself; don't nest.)
- Auto-switch **cannot target another auto-switch** profile (no nesting).
- Only Chrome regular scope is touched — Incognito uses whatever it inherits or has been separately configured.

## Development

No build tooling required. Edit files, then hit the "reload" icon on the `chrome://extensions` card. Debug the service worker via **Inspect views: service worker** on the same card.
