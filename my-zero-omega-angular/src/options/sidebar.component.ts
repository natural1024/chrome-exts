// Sidebar: profile list + new-profile buttons.
// Purely presentational — parent owns state.

import {
  ChangeDetectionStrategy,
  Component,
  input,
  output,
} from '@angular/core';
import { Profile } from '../lib/constants';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="sidebar">
      <div class="toolbar">
        <button type="button" (click)="newFixed.emit()">+ Fixed Proxy</button>
        <button type="button" (click)="newAuto.emit()">+ Auto Switch</button>
      </div>
      <ul class="profile-list">
        @for (p of profiles(); track p.id) {
          <li
            class="item"
            [class.selected]="editingId() === p.id"
            (click)="pick.emit(p)"
          >
            <span [class]="'tag tag-' + p.type"></span>
            <span class="name">{{ p.name }}</span>
          </li>
        }
      </ul>
    </aside>
  `,
})
export class SidebarComponent {
  // Already sorted by parent — we don't re-sort here.
  readonly profiles  = input.required<Profile[]>();
  readonly editingId = input<string | null>(null);

  readonly pick     = output<Profile>();
  readonly newFixed = output<void>();
  readonly newAuto  = output<void>();
}
