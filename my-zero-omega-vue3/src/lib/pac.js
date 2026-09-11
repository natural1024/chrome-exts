// PAC (Proxy Auto-Config) script generation for auto-switch profiles.
//
// Chrome's chrome.proxy API accepts the PAC as an opaque string that runs in a
// sandbox with NO access to extension APIs. So we serialize the rule table
// directly into the PAC source at build time, then match host/URL at request
// time inside the sandbox.
//
// MVP only supports "wildcard" match:
//   *   → any sequence of characters
//   ?   → any single character

/**
 * Build a PAC script string for an auto-switch profile.
 *
 * @param {object} autoProfile        profile of type 'auto_switch'
 * @param {Record<string, object>} profilesById  all profiles keyed by id
 * @returns {string} PAC source
 */
export function buildPacScript(autoProfile, profilesById) {
  const compiled = (autoProfile.rules || [])
    .map(rule => ({
      re:    wildcardToRegexSource(rule.pattern),
      proxy: pacTargetFor(profilesById[rule.profileId]),
    }))
    .filter(r => r.re && r.proxy !== null);

  const fallback =
    pacTargetFor(profilesById[autoProfile.defaultProfileId]) || 'DIRECT';

  // Embed table as JSON literal — avoids string escaping surprises.
  const tableLiteral    = JSON.stringify(compiled.map(r => [r.re, r.proxy]));
  const fallbackLiteral = JSON.stringify(fallback);

  return [
    'var __rules = ' + tableLiteral + ';',
    'var __fallback = ' + fallbackLiteral + ';',
    'function FindProxyForURL(url, host) {',
    '  for (var i = 0; i < __rules.length; i++) {',
    '    var re = new RegExp(__rules[i][0], "i");',
    '    if (re.test(host) || re.test(url)) return __rules[i][1];',
    '  }',
    '  return __fallback;',
    '}',
  ].join('\n');
}

/**
 * Convert a wildcard pattern to a *source string* for RegExp (no flags).
 * We emit a source string (not RegExp) so it survives JSON serialization.
 */
export function wildcardToRegexSource(pattern) {
  if (!pattern) return '';
  // Escape RegExp special chars except * and ?, then replace wildcards.
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  const body    = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return '^' + body + '$';
}

/**
 * Convert a profile into a PAC return value like "PROXY 1.2.3.4:8080; DIRECT",
 * or 'DIRECT' for pass-through, or null if unsupported (auto→auto etc).
 */
function pacTargetFor(profile) {
  if (!profile) return null;
  switch (profile.type) {
    case 'builtin_direct': return 'DIRECT';
    case 'builtin_system': return 'DIRECT'; // PAC cannot express "system"; degrade to DIRECT
    case 'fixed': {
      const kw = pacKeywordFor(profile.scheme);
      return `${kw} ${profile.host}:${profile.port}; DIRECT`;
    }
    default:
      // We intentionally don't support auto_switch → auto_switch nesting.
      return null;
  }
}

function pacKeywordFor(scheme) {
  switch (scheme) {
    case 'http':   return 'PROXY';
    case 'https':  return 'HTTPS';
    case 'socks5': return 'SOCKS5';
    case 'socks4': return 'SOCKS';
    default:       return 'PROXY';
  }
}
