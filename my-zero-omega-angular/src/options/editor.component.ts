// Profile editor — wraps type-specific fieldset components.
// Uses model() so the parent can bind [(profile)] and stay in sync.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  output,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AutoSwitchProfile,
  FixedProfile,
  Profile,
  ProfileMap,
  ProfileType,
} from '../lib/constants';
import { EditorMsg } from './helpers';
import { FixedFieldsComponent } from './fixed-fields.component';
import { AutoFieldsComponent } from './auto-fields.component';

@Component({
  selector: 'app-editor',
  standalone: true,
  imports: [FormsModule, FixedFieldsComponent, AutoFieldsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="editor-form" autocomplete="off" (submit)="onSubmit($event)">
      <div class="row">
        <label>Name</label>
        <input
          type="text"
          required
          [disabled]="isBuiltin()"
          [ngModel]="profile().name"
          (ngModelChange)="patch({ name: $event })"
          name="name"
        >
      </div>
      <div class="row">
        <label>Type</label>
        <input type="text" [value]="profile().type" disabled name="type">
      </div>

      @if (isFixed()) {
        <app-fixed-fields
          [profile]="fixedProfile()"
          (profileChange)="onProfile($event)"
        />
      }
      @if (isAuto()) {
        <app-auto-fields
          [profile]="autoProfile()"
          [profiles]="profiles()"
          (profileChange)="onProfile($event)"
        />
      }

      <div class="actions">
        @if (!isBuiltin()) {
          <button type="submit" class="primary">Save</button>
        }
        @if (!isBuiltin() && !isDraft()) {
          <button type="button" class="btn-delete" (click)="delete.emit()">
            Delete
          </button>
        }
      </div>
      <div class="msg" [class]="'msg ' + msg().kind">{{ msg().text }}</div>
    </form>
  `,
})
export class EditorComponent {
  readonly profile  = model.required<Profile>();
  readonly profiles = input.required<ProfileMap>();
  readonly isDraft  = input<boolean>(false);
  readonly msg      = input.required<EditorMsg>();

  readonly submit = output<void>();
  readonly delete = output<void>();

  protected readonly isBuiltin = computed(() => this.profile().type.startsWith('builtin'));
  protected readonly isFixed   = computed(() => this.profile().type === ProfileType.FIXED);
  protected readonly isAuto    = computed(() => this.profile().type === ProfileType.AUTO_SWITCH);

  // Narrow-cast helpers for the child components' `[profile]` inputs.
  // The `@if (isFixed())` guard makes the cast safe at runtime.
  protected readonly fixedProfile = computed(() => this.profile() as FixedProfile);
  protected readonly autoProfile  = computed(() => this.profile() as AutoSwitchProfile);

  protected patch(update: Partial<Profile>): void {
    // We always emit a new object; parent's model() picks up the change.
    this.profile.update(p => ({ ...p, ...update } as Profile));
  }

  protected onProfile(next: FixedProfile | AutoSwitchProfile): void {
    this.profile.set(next);
  }

  protected onSubmit(e: Event): void {
    e.preventDefault();
    this.submit.emit();
  }
}
