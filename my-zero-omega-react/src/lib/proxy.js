// Translates our Profile model into chrome.proxy's ProxyConfig shape,
// and provides a thin apply/clear API. Keeping this module pure (no message
// handling, no badge) makes it easy to unit-test if we ever want to.

import { ProfileType } from './constants.js';
import { buildPacScript } from './pac.js';

/**
 * @param {object} profile
 * @param {Record<string, object>} profilesById
 * @returns {chrome.proxy.ProxyConfig}
 */
export function buildProxyConfig(profile, profilesById) {
  switch (profile.type) {
    case ProfileType.BUILTIN_DIRECT:
      return { mode: 'direct' };

    case ProfileType.BUILTIN_SYSTEM:
      return { mode: 'system' };

    case ProfileType.FIXED:
      return {
        mode: 'fixed_servers',
        rules: {
          singleProxy: {
            scheme: profile.scheme,
            host:   profile.host,
            port:   Number(profile.port),
          },
          bypassList: profile.bypassList || [],
        },
      };

    case ProfileType.AUTO_SWITCH:
      return {
        mode: 'pac_script',
        pacScript: {
          data:      buildPacScript(profile, profilesById),
          mandatory: true, // If PAC errors, do NOT silently fall back to direct.
        },
      };

    default:
      // Should never happen; be safe.
      return { mode: 'direct' };
  }
}

/**
 * Apply a ProxyConfig to Chrome's regular scope, and report who's in control.
 * @returns {Promise<'controlled_by_this_extension' | 'controllable_by_this_extension' | string>}
 */
export async function applyProxyConfig(config) {
  await chrome.proxy.settings.set({ value: config, scope: 'regular' });
  const cur = await chrome.proxy.settings.get({});
  return cur.levelOfControl;
}

export async function clearProxy() {
  await chrome.proxy.settings.clear({ scope: 'regular' });
}
