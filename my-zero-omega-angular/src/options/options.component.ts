// Root options view — mirrors the vanilla options.js semantics. Because
// every input is bound via signals, `editing` is always the exact payload
// we send to SAVE_PROFILE — no `collectForm()` step needed.

import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  signal,
} from '@angular/core';
import {
  AppState,
  DeleteProfileRequest,
  GetStateRequest,
  GetStateResponse,
  MSG,
  Profile,
  SaveProfileRequest,
} from '../lib/constants';
import { send } from '../lib/rpc';
import {
  EditorMsg,
  makeAutoProfile,
  makeFixedProfile,
  profileOrder,
  validate,
} from './helpers';
import { SidebarComponent } from './sidebar.component';
import { EditorComponent } from './editor.component';

@Component({
  selector: 'app-options',
  standalone: true,
  imports: [SidebarComponent, EditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header><h1>My Zero Omega — Options</h1></header>
    <main>
      <app-sidebar
        [profiles]="sortedProfiles()"
        [editingId]="editing()?.id ?? null"
        (pick)="startEditing($event)"
        (newFixed)="onNewFixed()"
        (newAuto)="onNewAuto()"
      />
      <section class="editor">
        @if (!editing()) {
          <div class="empty">Pick a profile on the left, or create a new one.</div>
        } @else if (state()) {
          <app-editor
            [profile]="editingRequired()"
            (profileChange)="editing.set($event)"
            [profiles]="state()!.profiles"
            [isDraft]="isDraft()"
            [msg]="msg()"
            (submit)="onSubmit()"
            (delete)="onDelete()"
          />
        }
      </section>
    </main>
  `,
})
export class OptionsComponent implements OnInit {
  protected readonly state   = signal<AppState | null>(null);
  /** Currently-editing profile snapshot (never a direct storage reference). */
  protected readonly editing = signal<Profile | null>(null);
  protected readonly msg     = signal<EditorMsg>({ text: '', kind: '' });

  protected readonly sortedProfiles = computed<Profile[]>(() => {
    const s = this.state();
    if (!s) return [];
    return Object.values(s.profiles).sort(profileOrder);
  });

  // A draft is an in-flight new profile the user hasn't saved yet.
  protected readonly isDraft = computed<boolean>(() => {
    const e = this.editing();
    const s = this.state();
    return !!e && !!s && !s.profiles[e.id];
  });

  // For the template — narrows nullability so `<app-editor [profile]>` typechecks.
  protected readonly editingRequired = computed<Profile>(() => this.editing()!);

  async ngOnInit(): Promise<void> {
    await this.refresh();
  }

  private async refresh(): Promise<void> {
    const req: GetStateRequest = { type: MSG.GET_STATE };
    const res = await send<GetStateResponse>(req);
    this.state.set(res.state);

    // Re-sync editor with latest storage IF editor is not a draft. Drafts
    // are transient objects — never overwrite them from storage.
    const cur = this.editing();
    if (cur && res.state.profiles[cur.id]) {
      this.editing.set(structuredClone(res.state.profiles[cur.id]!));
    }
  }

  protected startEditing(profile: Profile): void {
    this.editing.set(structuredClone(profile));
    this.msg.set({ text: '', kind: '' });
  }

  protected onNewFixed(): void { this.startEditing(makeFixedProfile()); }
  protected onNewAuto():  void { this.startEditing(makeAutoProfile()); }

  protected async onSubmit(): Promise<void> {
    const draft = this.editing();
    const s     = this.state();
    if (!draft || !s) return;

    const err = validate(draft, s.profiles);
    if (err) { this.msg.set({ text: err, kind: 'error' }); return; }

    try {
      const req: SaveProfileRequest = { type: MSG.SAVE_PROFILE, profile: draft };
      await send(req);
      this.msg.set({ text: 'Saved.', kind: 'ok' });
      await this.refresh();
    } catch (e) {
      this.msg.set({ text: (e as Error).message, kind: 'error' });
    }
  }

  protected async onDelete(): Promise<void> {
    const draft = this.editing();
    if (!draft) return;
    if (!confirm(`Delete profile "${draft.name}"?`)) return;

    try {
      const req: DeleteProfileRequest = { type: MSG.DELETE_PROFILE, profileId: draft.id };
      await send(req);
      this.editing.set(null);
      this.msg.set({ text: '', kind: '' });
      await this.refresh();
    } catch (e) {
      this.msg.set({ text: (e as Error).message, kind: 'error' });
    }
  }
}
