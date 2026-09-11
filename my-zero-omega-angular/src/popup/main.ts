import { bootstrapApplication } from '@angular/platform-browser';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { PopupComponent } from './popup.component';

// Zoneless change detection: Angular 19+ can run without zone.js, which is
// what we want in a Chrome-extension popup — no need to bundle a global
// monkey-patch of Promise/setTimeout etc. into a tiny UI.
bootstrapApplication(PopupComponent, {
  providers: [provideExperimentalZonelessChangeDetection()],
}).catch(err => console.error(err));
