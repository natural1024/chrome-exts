// Fixed-proxy fieldset. `bypassList` is stored as string[] in the schema; we
// serialize/deserialize against the textarea via a local model.

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  model,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FixedProfile, FixedScheme } from '../lib/constants';

const SCHEMES: readonly FixedScheme[] = ['http', 'https', 'socks5', 'socks4'];

@Component({
  selector: 'app-fixed-fields',
  standalone: true,
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>Fixed Proxy</legend>
      <div class="row">
        <label>Scheme</label>
        <select
          [ngModel]="profile().scheme"
          (ngModelChange)="patch({ scheme: $event })"
        >
          @for (s of schemes; track s) {
            <option [value]="s">{{ s }}</option>
          }
        </select>
      </div>
      <div class="row">
        <label>Host</label>
        <input
          type="text"
          placeholder="127.0.0.1"
          required
          [ngModel]="profile().host"
          (ngModelChange)="patch({ host: $event })"
        >
      </div>
      <div class="row">
        <label>Port</label>
        <input
          type="number"
          min="1"
          max="65535"
          required
          [ngModel]="profile().port"
          (ngModelChange)="patch({ port: +$event })"
        >
      </div>
      <div class="row">
        <label>
          Bypass List
          <span class="hint">one per line — e.g. &lt;local&gt;, *.internal, 192.168.0.0/16</span>
        </label>
        <textarea
          rows="4"
          [ngModel]="bypassText()"
          (ngModelChange)="onBypassText($event)"
        ></textarea>
      </div>
    </fieldset>
  `,
})
export class FixedFieldsComponent {
  // Two-way binding: parent uses `[(profile)]` and receives immutable updates.
  readonly profile = model.required<FixedProfile>();

  protected readonly schemes = SCHEMES;

  protected readonly bypassText = computed(
    () => (this.profile().bypassList ?? []).join('\n')
  );

  protected patch(update: Partial<FixedProfile>): void {
    this.profile.update(p => ({ ...p, ...update }));
  }

  protected onBypassText(text: string): void {
    this.patch({
      bypassList: text.split('\n').map(s => s.trim()).filter(Boolean),
    });
  }
}
