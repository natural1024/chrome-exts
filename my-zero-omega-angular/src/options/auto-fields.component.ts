// Auto-switch fieldset: default profile picker + rules table.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AutoSwitchProfile,
  AutoSwitchRule,
  Profile,
  ProfileMap,
  ProfileType,
} from '../lib/constants';
import { profileOrder } from './helpers';

@Component({
  selector: 'app-auto-fields',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>Auto Switch</legend>

      <div class="row">
        <label>
          Default profile
          <span class="hint">used when no rule matches</span>
        </label>
        <select
          [ngModel]="profile().defaultProfileId"
          (ngModelChange)="patch({ defaultProfileId: $event })"
        >
          @for (t of targets(); track t.id) {
            <option [value]="t.id">{{ t.name }}</option>
          }
        </select>
      </div>

      <div class="row">
        <label>
          Rules
          <span class="hint">wildcard: * = any chars, ? = one char</span>
        </label>
        <div>
          <table class="rules">
            <thead>
              <tr><th>Pattern</th><th>Target Profile</th><th></th></tr>
            </thead>
            <tbody>
              @for (r of profile().rules; track $index; let i = $index) {
                <tr>
                  <td>
                    <input
                      type="text"
                      placeholder="*.example.com"
                      [ngModel]="r.pattern"
                      (ngModelChange)="updateRule(i, { pattern: $event })"
                    >
                  </td>
                  <td>
                    <select
                      [ngModel]="r.profileId"
                      (ngModelChange)="updateRule(i, { profileId: $event })"
                    >
                      @for (t of targets(); track t.id) {
                        <option [value]="t.id">{{ t.name }}</option>
                      }
                    </select>
                  </td>
                  <td>
                    <button
                      type="button"
                      class="btn-remove-rule"
                      title="Remove rule"
                      (click)="removeRule(i)"
                    >×</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          <button type="button" class="btn-add-rule" (click)="addRule()">
            + Add rule
          </button>
        </div>
      </div>
    </fieldset>
  `,
})
export class AutoFieldsComponent {
  readonly profile  = model.required<AutoSwitchProfile>();
  readonly profiles = input.required<ProfileMap>();

  // Only non-auto profiles can be a rule/default target — no auto→auto nesting.
  protected readonly targets = computed<Profile[]>(() =>
    Object.values(this.profiles())
      .filter(x => x.type !== ProfileType.AUTO_SWITCH)
      .sort(profileOrder)
  );

  private readonly firstNonAutoId = computed<string>(() =>
    this.targets()[0]?.id ?? 'direct'
  );

  protected patch(update: Partial<AutoSwitchProfile>): void {
    this.profile.update(p => ({ ...p, ...update }));
  }

  protected addRule(): void {
    const newRule: AutoSwitchRule = {
      pattern:   '*.example.com',
      profileId: this.firstNonAutoId(),
      matchType: 'wildcard',
    };
    this.patch({ rules: [...(this.profile().rules ?? []), newRule] });
  }

  protected removeRule(i: number): void {
    this.patch({
      rules: (this.profile().rules ?? []).filter((_, idx) => idx !== i),
    });
  }

  protected updateRule(i: number, patch: Partial<AutoSwitchRule>): void {
    this.patch({
      rules: (this.profile().rules ?? []).map(
        (r, idx) => idx === i ? { ...r, ...patch } : r
      ),
    });
  }
}
