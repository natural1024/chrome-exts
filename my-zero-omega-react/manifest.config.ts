import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineManifest } from '@crxjs/vite-plugin';

// Read package.json without `import ... with { type: 'json' }` — its syntax
// varies across Node versions. readFileSync + JSON.parse is portable.
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(resolve(here, 'package.json'), 'utf8')) as {
  version: string;
};

// MV3 manifest authored as TS so we can pull the version from package.json
// with types. @crxjs consumes this and emits the final manifest.json into dist/.
export default defineManifest({
  manifest_version: 3,
  name: 'My Zero Omega (React)',
  version: pkg.version,
  description: 'A simplified proxy switcher inspired by SwitchyOmega / Zero Omega. React edition.',
  minimum_chrome_version: '108',

  permissions: ['proxy', 'storage'],

  background: {
    service_worker: 'src/background/background.ts',
    type: 'module',
  },

  action: {
    default_popup: 'src/popup/index.html',
    default_title: 'My Zero Omega',
    default_icon: {
      16: 'icons/icon16.png',
      32: 'icons/icon32.png',
      48: 'icons/icon48.png',
      128: 'icons/icon128.png',
    },
  },

  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },

  icons: {
    16: 'icons/icon16.png',
    32: 'icons/icon32.png',
    48: 'icons/icon48.png',
    128: 'icons/icon128.png',
  },
});
