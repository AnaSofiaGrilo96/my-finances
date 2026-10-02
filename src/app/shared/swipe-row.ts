import { Component, ElementRef, HostListener, inject, input, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

/** Só uma linha aberta de cada vez. */
let openRow: SwipeRow | null = null;

/**
 * Linha que se arrasta para a esquerda (telemóvel) para revelar três ações:
 * estado de pagamento (polegar), editar e apagar. No computador clica-se na linha e usa-se a folha de detalhe.
 */
@Component({
  selector: 'app-swipe-row',
  imports: [MatIconModule],
  template: `
    <div class="actions" [class.visible]="offset() < 0">
      <button type="button" class="act paid" (click)="emit(togglePaid, $event)" [attr.aria-label]="paid() ? 'Marcar como não pago' : 'Marcar como pago'"><mat-icon>{{ paid() ? 'thumb_down' : 'thumb_up' }}</mat-icon></button>
      <button type="button" class="act edit" (click)="emit(edit, $event)" aria-label="Editar"><mat-icon>edit</mat-icon></button>
      <button type="button" class="act del" (click)="emit(remove, $event)" aria-label="Apagar"><mat-icon>delete</mat-icon></button>
    </div>
    <div class="content" [style.transform]="'translateX(' + offset() + 'px)'" [class.dragging]="dragging()"
         (pointerdown)="start($event)" (pointermove)="move($event)" (pointerup)="end($event)" (pointercancel)="end($event)" (click)="tap($event)">
      <ng-content />
    </div>
  `,
  styles: [`
    :host { display: block; position: relative; overflow: hidden; border-radius: 10px; }
    .actions { position: absolute; inset: 0 0 0 auto; display: flex; width: 192px; opacity: 0; pointer-events: none; }
    .actions.visible { opacity: 1; pointer-events: auto; }
    .act { flex: 1; border: none; color: #fff; display: grid; place-items: center; cursor: pointer; }
    .act.paid { background: #8a8f95; } .act.edit { background: #5f6b67; } .act.del { background: #d9534f; }
    .content { position: relative; background: inherit; transition: transform .18s ease-out; touch-action: pan-y; will-change: transform; }
    .content.dragging { transition: none; }
  `],
})
export class SwipeRow {
  readonly paid = input(false);
  readonly togglePaid = output<void>();
  readonly edit = output<void>();
  readonly remove = output<void>();
  readonly tapped = output<void>();

  readonly offset = signal(0);
  readonly dragging = signal(false);
  private readonly el = inject(ElementRef<HTMLElement>);
  private startX = 0; private startY = 0; private startOffset = 0; private horizontal: boolean | null = null; private moved = false;
  private readonly WIDTH = 192;

  start(ev: PointerEvent) {
    if (ev.pointerType === 'mouse') return; // no computador usa-se o hover
    this.startX = ev.clientX; this.startY = ev.clientY; this.startOffset = this.offset(); this.horizontal = null; this.moved = false;
    this.dragging.set(true);
  }
  move(ev: PointerEvent) {
    if (!this.dragging()) return;
    const dx = ev.clientX - this.startX, dy = ev.clientY - this.startY;
    if (this.horizontal === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      this.horizontal = Math.abs(dx) > Math.abs(dy);
      if (this.horizontal) { (ev.target as HTMLElement).setPointerCapture?.(ev.pointerId); if (openRow && openRow !== this) openRow.close(); }
    }
    if (!this.horizontal) return;
    this.moved = true;
    this.offset.set(Math.max(-this.WIDTH, Math.min(0, this.startOffset + dx)));
  }
  end(_ev: PointerEvent) {
    if (!this.dragging()) return;
    this.dragging.set(false);
    if (!this.horizontal) return;
    if (this.offset() < -this.WIDTH / 2.5) { this.offset.set(-this.WIDTH); openRow = this; }
    else this.close();
  }
  tap(ev: MouseEvent) {
    if (this.moved) { this.moved = false; ev.stopPropagation(); ev.preventDefault(); return; }
    if (this.offset() < 0) { this.close(); ev.stopPropagation(); ev.preventDefault(); return; }
    this.tapped.emit();
  }
  close() { this.offset.set(0); if (openRow === this) openRow = null; }
  emit(out: { emit(v: void): void }, ev: Event) { ev.stopPropagation(); out.emit(); if (out !== this.togglePaid) this.close(); }

  @HostListener('document:pointerdown', ['$event'])
  onDocDown(ev: PointerEvent) {
    if (this.offset() < 0 && !this.el.nativeElement.contains(ev.target as Node)) this.close();
  }
}
