// Translates our Profile model into chrome.proxy's ProxyConfig shape,
// and provides a thin apply/clear API. Keeping this module pure (no message
// handling, no badge) makes it easy to unit-test if we ever want to.

import { LevelOfControl, Profile, ProfileMap, ProfileType } from './constants';
import { buildPacScript } from './pac';

export function buildProxyConfig(
  profile: Profile,
  profilesById: ProfileMap
): chrome.proxy.ProxyConfig {
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
          bypassList: profile.bypassList ?? [],
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

    default: {
      // Exhaustiveness check — if a new ProfileType is added and not handled
      // above, TypeScript will fail this line.
      const _exhaustive: never = profile;
      void _exhaustive;
      return { mode: 'direct' };
    }
  }
}

/**
 * Apply a ProxyConfig to Chrome's regular scope, and report who's in control.
 */
export async function applyProxyConfig(
  config: chrome.proxy.ProxyConfig
): Promise<LevelOfControl> {
  await chrome.proxy.settings.set({ value: config, scope: 'regular' });
  // @types/chrome types this as `void` on the callback-less overload, but at
  // runtime Chrome returns the settings details as a Promise since MV3.
  const cur = (await (chrome.proxy.settings.get({}) as unknown as Promise<{
    levelOfControl: string;
    value: unknown;
  }>));
  return cur.levelOfControl as LevelOfControl;
}

export async function clearProxy(): Promise<void> {
  await chrome.proxy.settings.clear({ scope: 'regular' });
}
