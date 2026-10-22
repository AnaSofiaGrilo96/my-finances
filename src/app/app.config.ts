import { ApplicationConfig, LOCALE_ID, isDevMode, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding, withHashLocation } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localePt from '@angular/common/locales/pt-PT';
import { MAT_DATE_LOCALE, provideNativeDateAdapter } from '@angular/material/core';
import { MAT_FORM_FIELD_DEFAULT_OPTIONS } from '@angular/material/form-field';
import { MAT_DIALOG_DEFAULT_OPTIONS } from '@angular/material/dialog';
import { MAT_BOTTOM_SHEET_DEFAULT_OPTIONS } from '@angular/material/bottom-sheet';
import { provideServiceWorker } from '@angular/service-worker';

import { routes } from './app.routes';

registerLocaleData(localePt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Sem withViewTransitions desde 21/10: a mudança de página é instantânea (a animação fazia a app parecer mais lenta)
    provideRouter(routes, withHashLocation(), withComponentInputBinding()),
    provideNativeDateAdapter(),
    { provide: LOCALE_ID, useValue: 'pt-PT' },
    { provide: MAT_DATE_LOCALE, useValue: 'pt-PT' },
    { provide: MAT_FORM_FIELD_DEFAULT_OPTIONS, useValue: { appearance: 'outline' } },
    // O botão "Voltar" é gerido pelo BackButtonService (fecha a janela em vez de mudar de página)
    { provide: MAT_DIALOG_DEFAULT_OPTIONS, useValue: { closeOnNavigation: false, hasBackdrop: true, enterAnimationDuration: '300ms', exitAnimationDuration: '200ms' } },
    { provide: MAT_BOTTOM_SHEET_DEFAULT_OPTIONS, useValue: { closeOnNavigation: false, hasBackdrop: true, autoFocus: 'dialog' } }, // foco na folha e não no 1.º botão (aparecia um anel no caixote do detalhe)
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
