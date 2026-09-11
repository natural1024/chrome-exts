import { bootstrapApplication } from '@angular/platform-browser';
import { provideExperimentalZonelessChangeDetection } from '@angular/core';
import { OptionsComponent } from './options.component';

bootstrapApplication(OptionsComponent, {
  providers: [provideExperimentalZonelessChangeDetection()],
}).catch(err => console.error(err));
