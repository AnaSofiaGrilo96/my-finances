import { Component, input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Círculo colorido com um ícone (categorias e contas). */
@Component({
  selector: 'app-icon-badge',
  imports: [MatIconModule],
  template: `<span class="badge" [style.background]="color()" [style.width.px]="size()" [style.height.px]="size()">
    <mat-icon [style.font-size.px]="size() * 0.55" [style.width.px]="size() * 0.55" [style.height.px]="size() * 0.55">{{ icon() }}</mat-icon>
  </span>`,
  styles: [`
    :host { display: inline-flex; flex-shrink: 0; }
    .badge { display: inline-flex; align-items: center; justify-content: center; border-radius: 50%; color: #fff; }
  `],
})
export class IconBadge {
  readonly icon = input.required<string>();
  readonly color = input.required<string>();
  readonly size = input(40);
}
