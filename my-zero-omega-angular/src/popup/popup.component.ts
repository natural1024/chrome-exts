// Toolbar popup — mirrors the vanilla popup.js UX exactly:
//   - list all profiles (built-ins first, then alphabetical)
//   - click applies the profile, reloads the active tab, and closes the popup
//   - a banner is shown when another extension controls proxy settings

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import {
  AppState,
  ApplyProfileRequest,
  GetStateRequest,
  GetStateResponse,
  LevelOfControl,
  MSG,
  Profile,
} from '../lib/constants';
import { send } from '../lib/rpc';

// Built-ins first, then alphabetical by name.
function profileOrder(a: Profile, b: Profile): number {
  const abt = a.type.startsWith('builtin') ? 0 : 1;
  const bbt = b.type.startsWith('builtin') ? 0 : 1;
  if (abt !== bbt) return abt - bbt;
  return a.name.localeCompare(b.name);
}

// Chrome internal pages cannot be reloaded by extensions; a call throws.
function isInternalUrl(url: string | undefined): boolean {
  if (!url) return true;
  return /^(chrome|chrome-extension|edge|about|devtools|view-source):/i.test(url);
}

async function reloadActiveTab(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined) return;
  if (isInternalUrl(tab.url)) return;
  try {
    await chrome.tabs.reload(tab.id, { bypassCache: false });
  } catch {
    // Not fatal — the profile switch itself already succeeded.
  }
}

@Component({
  selector: 'app-popup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      <h1>My Zero Omega</h1>
      <button
        type="button"
        class="btn-options"
        title="Open options"
        aria-label="Options"
        (click)="openOptions()"
      >⚙</button>
    </header>

    @if (showWarn()) {
      <div class="warn">
        Proxy setting is "{{ levelOfControl() }}". Another extension may be in
        control — disable it to let My Zero Omega apply changes.
      </div>
    }

    <ul class="profiles" role="listbox">
      @if (error()) {
        <li class="profile">
          <span></span>
          <span class="name">Error: {{ error() }}</span>
          <span></span>
        </li>
      }
      @for (p of sortedProfiles(); track p.id) {
        <li
          class="profile"
          [class.active]="p.id === state()?.activeProfileId"
          role="option"
          [attr.aria-selected]="p.id === state()?.activeProfileId"
          (click)="onPick(p.id)"
        >
          <span class="tag" [class]="'tag ' + 'tag-' + p.type"></span>
          <span class="name">{{ p.name }}</span>
          <span class="check">✓</span>
        </li>
      }
    </ul>
  `,
})
export class PopupComponent implements OnInit {
  protected readonly state          = signal<AppState | null>(null);
  protected readonly levelOfControl = signal<LevelOfControl | null>(null);
  protected readonly error          = signal<string | null>(null);

  protected readonly sortedProfiles = computed<Profile[]>(() => {
    const s = this.state();
    if (!s) return [];
    return Object.values(s.profiles).sort(profileOrder);
  });

  protected readonly showWarn = computed(() => {
    const l = this.levelOfControl();
    return l === 'controlled_by_other_extensions' || l === 'not_controllable';
  });

  async ngOnInit(): Promise<void> {
    try {
      const req: GetStateRequest = { type: MSG.GET_STATE };
      const res = await send<GetStateResponse>(req);
      this.state.set(res.state);
      this.levelOfControl.set(res.levelOfControl);
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  protected async onPick(profileId: string): Promise<void> {
    try {
      const req: ApplyProfileRequest = { type: MSG.APPLY_PROFILE, profileId };
      await send(req);
      await reloadActiveTab();
      // Close so the reloaded page takes focus — feels snappier.
      window.close();
    } catch (e) {
      alert(`Failed to apply profile: ${(e as Error).message}`);
    }
  }

  protected openOptions(): void {
    chrome.runtime.openOptionsPage();
  }
}
