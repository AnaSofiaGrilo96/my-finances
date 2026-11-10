import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog } from '@angular/material/dialog';
import { DataService } from '../../core/data.service';
import { AuthService } from '../../core/auth.service';
import { ACCOUNT_TYPES, AccountType, Transaction, isAdjustment } from '../../core/models';
import { addDays, currentMonth, fromIso, monthRange, todayIso } from '../../core/dates';
import { MoneyPipe, formatMoney } from '../../shared/money.pipe';
import { IconBadge } from '../../shared/icon-badge';
import { DonutChart, DonutSlice } from '../../shared/charts';
import { UiService } from '../../shared/ui.service';
import { ThemeService } from '../../core/theme.service';
import { openTransactionDialog } from '../transactions/transaction.dialog';

const MON = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
function readFlag(key: string) { try { return localStorage.getItem(key) === '1'; } catch { return false; } }

const DAY_FMT = new Intl.DateTimeFormat('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric' });

@Component({
  selector: 'app-dashboard-page',
  imports: [NgTemplateOutlet, RouterLink, MatButtonModule, MatIconModule, MatTooltipModule, MoneyPipe, IconBadge, DonutChart],
  template: `
    <div class="page" [class.wide]="!isSmall()">
      @if (isSmall()) {
        <!-- Saudação (telemóvel) -->
        <div class="greet">
          <div class="muted">{{ greeting() }},</div>
          <h1>{{ firstName() }}</h1>
        </div>
        <ng-container *ngTemplateOutlet="dueCard" />
        @if (!due().length) {
          <div class="card due ok">
            <div class="due-head static">
              <span class="due-icon ok"><mat-icon>task_alt</mat-icon></span>
              <span class="due-text"><b>Nada a pagar ou receber</b><span class="muted">hoje</span></span>
            </div>
          </div>
        }
        <ng-container *ngTemplateOutlet="accountsCard" />
      } @else {
        <!-- Computador (10/11, como a nova versão da outra aplicação de gestão de finanças): barra de boas-vindas com o período
             e o modo escuro; cartão com receita/despesa do mês e ações rápidas; quatro blocos em duas colunas -->
        <div class="welcome">
          <span class="soft">{{ greeting() }}, <b>{{ shortName() }}</b></span>
          <i class="vdiv"></i>
          <span class="soft">Período atual <b>{{ periodLabel() }}</b></span>
          <span class="spacer"></span>
          <button type="button" class="toggle" [class.on]="theme.dark()" (click)="theme.dark.set(!theme.dark())" role="switch" [attr.aria-checked]="theme.dark()">
            <span class="track"><span class="thumb"></span></span>Modo escuro
          </button>
        </div>

        <!-- Cartão de resumo (10/11, medido na outra aplicação): olho, receita/despesa do mês com ícone de carteira, e à direita os
             atalhos com nome ("Despesa", "Receita", "Transferência") — só ícone quando o cartão é estreito — e o "+" verde -->
        <div class="card summary">
          <div class="sum-left">
            <button type="button" class="sq eye" (click)="toggleHidden()" [matTooltip]="hidden() ? 'Mostrar valores' : 'Esconder valores'" [attr.aria-label]="hidden() ? 'Mostrar valores' : 'Esconder valores'">
              <mat-icon fontSet="material-icons-outlined">{{ hidden() ? 'visibility_off' : 'visibility' }}</mat-icon>
            </button>
            <a class="kpi" routerLink="/relatorios">
              <span>Receita mensal
                <svg class="kic" viewBox="0 0 24 24" fill="none" stroke="var(--pos)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 11V8.5A4.5 4.5 0 0 1 7.5 4h9A4.5 4.5 0 0 1 21 8.5v7a4.5 4.5 0 0 1-4.5 4.5H13" /><path d="M21 9.5h-3.8a2.3 2.3 0 0 0 0 4.6H21" /><path d="M7.5 13.5v6.5M5 17.5l2.5 2.5 2.5-2.5" />
                </svg>
              </span>
              <b>{{ hidden() ? '€ -----' : (totals().income | money) }}</b>
            </a>
            <i class="vdiv tall"></i>
            <a class="kpi" routerLink="/relatorios">
              <span>Despesa mensal
                <svg class="kic" viewBox="0 0 24 24" fill="none" stroke="var(--neg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M3 11V8.5A4.5 4.5 0 0 1 7.5 4h9A4.5 4.5 0 0 1 21 8.5v7a4.5 4.5 0 0 1-4.5 4.5H13" /><path d="M21 9.5h-3.8a2.3 2.3 0 0 0 0 4.6H21" /><path d="M7.5 20v-6.5M5 16l2.5-2.5L10 16" />
                </svg>
              </span>
              <b>{{ hidden() ? '€ -----' : (totals().expense | money) }}</b>
            </a>
          </div>
          <div class="qa">
            <button type="button" class="qbtn" (click)="add('expense')" matTooltip="Despesa" aria-label="Nova despesa">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--neg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-9-9" /><path d="M14.4 9.4a3.2 3.2 0 1 0 0 5.2" /><path d="M8.6 11.3h4M8.6 13.1h4" /><path d="M16 8l5-5M17.4 3H21v3.6" />
              </svg><span class="lbl">Despesa</span>
            </button>
            <button type="button" class="qbtn" (click)="add('income')" matTooltip="Receita" aria-label="Nova receita">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--pos)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M21 12a9 9 0 1 1-9-9" /><path d="M14.4 9.4a3.2 3.2 0 1 0 0 5.2" /><path d="M8.6 11.3h4M8.6 13.1h4" /><path d="M21 3l-5 5M16 4.4V8h3.6" />
              </svg><span class="lbl">Receita</span>
            </button>
            <button type="button" class="qbtn" (click)="add('transfer')" matTooltip="Transferência" aria-label="Nova transferência">
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--ink-2)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M7.5 20L4.5 16h15" /><path d="M16.5 4l3 4h-15" />
              </svg><span class="lbl">Transferência</span>
            </button>
            <i class="vdiv"></i>
            <button type="button" class="qbtn add" (click)="add()" matTooltip="Novo movimento" aria-label="Novo movimento"><mat-icon>add</mat-icon></button>
          </div>
        </div>

        <ng-container *ngTemplateOutlet="dueCard" />

        <div class="grid-2">
          <div class="col">
            <section class="card w">
              <header class="w-head"><h2>Maiores gastos</h2><ng-container *ngTemplateOutlet="chev; context: { $implicit: 'top' }" /></header>
              <div class="collapse" [class.open]="!closed().has('top')"><div class="w-body">
                @if (topCategories().length) {
                  <!-- lista à esquerda e anel à direita; quando o bloco é estreito o anel passa para cima (como na outra aplicação) -->
                  <div class="top">
                    <div class="tlist">
                      @for (s of topCategories(); track s.id) {
                        <a class="trow" [routerLink]="['/movimentos']" [queryParams]="{ categoria: s.id, mes: month() }" (mouseenter)="hover.set(s.id)" (mouseleave)="hover.set(null)">
                          <app-icon-badge [icon]="s.icon" [color]="s.color" [size]="40" />
                          <span class="tname">{{ s.label }}</span>
                          <span class="tval"><b>{{ hidden() ? '€ -----' : (s.value | money) }}</b><small>{{ pct0(s.value) }}</small></span>
                        </a>
                      }
                    </div>
                    <div class="donut"><app-donut-chart [slices]="slices()" [size]="264" [stroke]="37" [gap]="0" [halo]="true" [highlight]="hover()" centerLabel="" /></div>
                  </div>
                  <div class="w-foot end"><a class="btn-out" routerLink="/relatorios">Ver relatório completo<mat-icon>chevron_right</mat-icon></a></div>
                } @else {
                  <p class="empty">Sem despesas neste mês.</p>
                }
              </div></div>
            </section>

            <section class="card w">
              <header class="w-head"><h2>Despesas a pagar</h2><ng-container *ngTemplateOutlet="chev; context: { $implicit: 'pay' }" /></header>
              <div class="collapse" [class.open]="!closed().has('pay')"><div class="w-body">
                @if (pendingPay().length) {
                  <ng-container *ngTemplateOutlet="pendingList; context: { $implicit: pendingPay(), key: 'pay', more: 'Ver mais despesas' }" />
                } @else {
                  <p class="empty">Nada a pagar nos próximos 30 dias.</p>
                }
              </div></div>
            </section>
          </div>

          <div class="col">
            <ng-container *ngTemplateOutlet="accountsCard" />

            <section class="card w">
              <header class="w-head"><h2>Receitas a receber</h2><ng-container *ngTemplateOutlet="chev; context: { $implicit: 'recv' }" /></header>
              <div class="collapse" [class.open]="!closed().has('recv')"><div class="w-body">
                @if (pendingRecv().length) {
                  <ng-container *ngTemplateOutlet="pendingList; context: { $implicit: pendingRecv(), key: 'recv', more: 'Ver mais receitas' }" />
                } @else {
                  <p class="empty">Nada a receber nos próximos 30 dias.</p>
                }
              </div></div>
            </section>
          </div>
        </div>
      }
    </div>

    <ng-template #chev let-key>
      <button type="button" class="chev-btn" (click)="toggle(key)" [attr.aria-label]="closed().has(key) ? 'Mostrar' : 'Esconder'"><mat-icon class="chev" [class.closed]="closed().has(key)">expand_less</mat-icon></button>
    </ng-template>

    <!-- Aviso: a pagar / a receber hoje (e atrasados) -->
    <ng-template #dueCard>
      @if (due().length) {
        <div class="card due" [class.open]="dueOpen()">
          <button type="button" class="due-head" (click)="dueOpen.set(!dueOpen())">
            <span class="due-icon"><mat-icon>notifications_active</mat-icon></span>
            <span class="due-text">
              <b>{{ dueTitle() }}</b>
              <span class="muted">{{ dueSubtitle() }}</span>
            </span>
            <mat-icon class="chev" [class.closed]="!dueOpen()">expand_more</mat-icon>
          </button>
          <div class="collapse" [class.open]="dueOpen()">
            <div class="rows">
              @for (t of due(); track t.id) {
                <div class="row clickable" (click)="edit(t)">
                  <app-icon-badge [icon]="iconOf(t)" [color]="colorOf(t)" [size]="34" />
                  <div class="main">
                    <div class="title">{{ t.description || (t.kind === 'income' ? 'Receita' : 'Despesa') }}</div>
                    <div class="sub">{{ dueLabel(t.date) }} · {{ accName(t) }}</div>
                  </div>
                  <div class="amount" [class]="t.kind">{{ (t.kind === 'income' ? 1 : -1) * t.amount | money:'signed' }}</div>
                  <button matIconButton class="paid" (click)="pay(t, $event)" [matTooltip]="t.kind !== 'expense' ? 'Não recebido — tocar para marcar recebido' : 'Não pago — tocar para marcar pago'"><mat-icon>thumb_down</mat-icon></button>
                </div>
              }
            </div>
          </div>
        </div>
      }
    </ng-template>

    <!-- Saldo geral + contas (telemóvel e computador) -->
    <ng-template #accountsCard>
      <section class="card accounts" [class.w]="!isSmall()">
        @if (!isSmall()) { <header class="w-head"><h2>Minhas contas</h2><ng-container *ngTemplateOutlet="chev; context: { $implicit: 'acc' }" /></header> }
        <div class="collapse" [class.open]="isSmall() || !closed().has('acc')"><div [class.w-body]="!isSmall()">
        <div class="total">
          <span class="muted">Saldo geral</span>
          @if (isSmall()) {
            <b [class.expense]="data.totalBalance() < 0">{{ data.totalBalance() | money }}</b>
          } @else {
            <b [class.expense]="data.totalBalance() < 0"><small>€</small>{{ hidden() ? '-----' : num(data.totalBalance()) }}</b>
          }
        </div>
        @if (isSmall()) { <h2>Minhas contas</h2> }
        <div class="rows lined">
          @for (a of data.activeAccounts(); track a.id) {
            <a class="row clickable" [routerLink]="['/movimentos']" [queryParams]="{ conta: a.id }">
              <app-icon-badge [icon]="a.icon" [color]="a.color" [size]="40" />
              <div class="main"><div class="title">{{ a.name }}</div><div class="sub">{{ typeLabel(a.type) }}</div></div>
              <div class="amount acc" [class.expense]="balance(a.id) < 0">{{ hidden() && !isSmall() ? '€ -----' : (balance(a.id) | money) }}</div>
            </a>
          } @empty {
            <p class="empty">Sem contas. <a routerLink="/contas">Criar a primeira</a></p>
          }
        </div>
        @if (isSmall()) {
          <div class="link-row"><a matButton="outlined" routerLink="/contas" class="manage"><mat-icon>tune</mat-icon>Gerir contas</a></div>
        } @else {
          <div class="w-foot between">
            <a class="sq" routerLink="/contas" matTooltip="Gerir contas" aria-label="Gerir contas"><mat-icon fontSet="material-icons-outlined">settings</mat-icon></a>
            <a class="btn-soft" routerLink="/contas" [queryParams]="{ nova: 1 }"><mat-icon>add_circle_outline</mat-icon>Adicionar conta</a>
          </div>
        }
        </div></div>
      </section>
    </ng-template>

    <!-- Lista de movimentos por pagar/receber (de hoje a 30 dias): "Vence hoje" (inclui atrasados) e "Próximos vencimentos".
         No computador mostra 4 e o botão "Ver mais" abre o resto (como na outra aplicação de gestão de finanças, 10/11). -->
    <ng-template #pendingList let-list let-key="key" let-more="more">
      @if (dueOf(list).length) {
        <div class="band today"><mat-icon fontSet="material-icons-outlined">event_busy</mat-icon>Vence hoje</div>
        <div class="rows lined">
          @for (t of dueOf(list); track t.id) { <ng-container *ngTemplateOutlet="pendingRow; context: { $implicit: t }" /> }
        </div>
      }
      @if (nextOf(list).length) {
        <div class="band"><mat-icon fontSet="material-icons-outlined">event</mat-icon>Próximos vencimentos</div>
        <div class="rows lined">
          @for (t of limit(nextOf(list), key); track t.id) { <ng-container *ngTemplateOutlet="pendingRow; context: { $implicit: t }" /> }
        </div>
        @if (!isSmall() && nextOf(list).length > 4) {
          <div class="w-foot center"><button type="button" class="btn-out" (click)="toggleMore(key)"><mat-icon class="chev" [class.up]="expanded().has(key)">expand_more</mat-icon>{{ expanded().has(key) ? 'Ver menos' : more }}</button></div>
        }
      }
    </ng-template>

    <ng-template #pendingRow let-t>
      <div class="row clickable pend" (click)="edit(t)">
        <app-icon-badge [icon]="iconOf(t)" [color]="colorOf(t)" [size]="32" />
        <div class="main">
          <div class="title">{{ t.description || (t.kind === 'income' ? 'Receita' : 'Despesa') }}</div>
          <div class="sub">Vence <b>{{ fmtDay(t.date) }}</b></div>
        </div>
        <div class="amount" [matTooltip]="accName(t)">{{ hidden() ? '€ -----' : (t.kind === 'income' ? '+ ' : '- ') + (t.amount | money) }}</div>
        <button matIconButton class="paid" (click)="pay(t, $event)" [matTooltip]="t.kind !== 'expense' ? 'Não recebido — clicar para marcar recebido' : 'Não pago — clicar para marcar pago'"><mat-icon fontSet="material-icons-outlined">thumb_down</mat-icon></button>
      </div>
    </ng-template>
  `,
  styles: [`
    :host { --line: color-mix(in srgb, var(--mat-sys-on-surface) 9%, transparent); --line-strong: #dbded8; --acc-blue: #3062d4; }
    :host-context(html.dark) { --acc-blue: #8fb0ff; --line-strong: var(--mat-sys-outline-variant); }
    .greet { padding: 4px 6px 14px; }
    .paid { color: #e5484d; opacity: .8; }
    .greet h1 { margin: 0; font-size: 24px; font-weight: 600; }
    .due { padding: 6px 8px; margin-bottom: var(--gap); border-left: 4px solid #f5b301; }
    .due.ok { border-left-color: #1eb980; }
    .due-head { display: flex; align-items: center; gap: 12px; width: 100%; background: none; border: none; font: inherit; color: inherit; text-align: left; cursor: pointer; padding: 8px; border-radius: 10px; }
    .due-head.static { cursor: default; }
    @media (hover: hover) { .due-head:not(.static):hover { background: var(--mat-sys-surface-container); } }
    .due-icon { width: 40px; height: 40px; border-radius: 50%; background: color-mix(in srgb, #f5b301 22%, transparent); color: #b17f00; display: grid; place-items: center; flex-shrink: 0; }
    .due-icon.ok { background: color-mix(in srgb, #1eb980 18%, transparent); color: #1eb980; }
    .due-text { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .due-text b { font-size: 15px; }
    .due-text .muted { font-size: 13px; }
    .due .rows { padding: 4px 8px 6px; }
    .col { display: flex; flex-direction: column; gap: var(--gap); min-width: 0; }
    a.row { text-decoration: none; color: inherit; }
    .link-row { display: flex; justify-content: flex-end; margin-top: 8px; }
    .total { display: flex; flex-direction: column; border-left: 4px solid var(--mat-sys-primary); padding-left: 12px; margin-bottom: 16px; }
    .total b { font-size: 26px; }
    .amount.acc { color: var(--mat-sys-primary); } .amount.acc.expense { color: #e5484d; } /* saldo negativo a vermelho (a regra .amount.acc ganhava à .expense global) */
    .empty a { color: var(--mat-sys-primary); }
    .band { text-align: center; font-size: 14px; font-weight: 500; padding: 8px; border-radius: 10px; margin: 6px 0 2px; background: var(--mat-sys-surface-container); color: var(--mat-sys-on-surface-variant); }
    .band.today { background: color-mix(in srgb, #e5484d 14%, transparent); color: #e5484d; }
    @media (max-width: 899px) {
      .link-row { justify-content: stretch; } .manage { width: 100%; }
      /* telemóvel (21/10, como na outra aplicação): saudação maior, saldo sem a barra verde, contas com tipo por baixo e saldo a azul */
      .greet { padding: 8px 4px 18px; }
      .greet .muted { font-size: 17px; color: var(--mat-sys-on-surface); }
      .greet h1 { font-size: 22px; font-weight: 700; }
      .card { padding: 20px; border-radius: 12px; }
      .due { border-left: none; padding: 8px; }
      .total { border-left: none; padding-left: 0; padding-bottom: 18px; margin-bottom: 18px; border-bottom: 1px solid var(--line); }
      .total .muted { font-size: 15px; }
      .total b { font-size: 22px; font-weight: 700; }
      .accounts h2 { font-size: 17px; font-weight: 600; margin: 0 0 8px; }
      .accounts .rows.lined > .row + .row { border-top: 1px solid var(--line); }
      .accounts .row { padding: 14px 0; gap: 16px; border-radius: 0; }
      .accounts .row .title { font-size: 16px; }
      .accounts .row .sub { font-size: 14px; }
      .amount.acc { color: var(--acc-blue); font-size: 16px; font-weight: 400; }
    }

    /* ---------- Computador (10/11): à imagem da nova versão da outra aplicação de gestão de finanças ---------- */
    .wide { --line: var(--line-div); }
    .wide .col { gap: 20px; }
    .wide .grid-2 { gap: 20px; align-items: start; }
    .soft { color: var(--ink-soft); font-size: 16px; font-weight: 400; }
    .soft b { color: var(--ink-2); font-weight: 600; }
    .vdiv { width: 1px; height: 24px; background: var(--line-strong); flex-shrink: 0; }
    .vdiv.tall { height: 48px; margin: 0 8px; }
    /* barra de boas-vindas: sem cartão, só um degradê muito leve */
    .welcome { display: flex; align-items: center; gap: 16px; height: 80px; box-sizing: border-box; padding: 16px 40px; margin-bottom: 20px; border-radius: 24px; background: linear-gradient(88deg, transparent 0%, color-mix(in srgb, var(--ink-soft) 6%, transparent) 25%, color-mix(in srgb, var(--ink-soft) 10%, transparent) 100%); }
    .toggle { display: inline-flex; align-items: center; gap: 10px; background: none; border: none; font: inherit; font-size: 14px; font-weight: 500; color: var(--ink); cursor: pointer; padding: 6px; }
    .toggle .track { width: 36px; height: 20px; border-radius: 999px; background: var(--line-strong); position: relative; transition: background-color .2s; }
    .toggle .thumb { position: absolute; left: 2px; top: 2px; width: 16px; height: 16px; border-radius: 50%; background: var(--app-card-bg); box-shadow: 0 1px 2px rgba(0,0,0,.2); transition: transform .2s; }
    .toggle.on .track { background: var(--pos); }
    .toggle.on .thumb { transform: translateX(16px); background: #fff; }
    /* cartão de resumo (medidas da outra aplicação, 10/11) */
    .wide .card.summary { container-type: inline-size; display: flex; align-items: center; justify-content: space-between; gap: 16px 32px; padding: 32px 40px; margin-bottom: 20px; }
    .sum-left { display: flex; align-items: center; gap: 20px; min-width: 0; }
    .sq { width: 48px; height: 48px; box-sizing: border-box; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--app-card-bg); color: var(--ink); display: grid; place-items: center; cursor: pointer; flex-shrink: 0; text-decoration: none; transition: background-color .2s ease-in, transform .12s; }
    @media (hover: hover) { .sq:hover { background: var(--app-bg); } }
    .sq:active { transform: scale(.95); }
    .sq mat-icon { font-size: 22px; width: 22px; height: 22px; }
    .sq.eye { border-radius: 16px; color: var(--ink-2); }
    .sq.eye mat-icon { font-size: 24px; width: 24px; height: 24px; }
    .kpi { display: flex; flex-direction: column; gap: 8px; padding: 16px 4px; text-decoration: none; color: inherit; }
    .kpi span { display: inline-flex; align-items: center; gap: 8px; font-size: 16px; font-weight: 400; line-height: 24px; color: var(--ink-2); white-space: nowrap; }
    .kpi b { font-size: 24px; font-weight: 600; line-height: 32px; color: var(--ink); white-space: nowrap; }
    .kic { width: 24px; height: 24px; flex-shrink: 0; }
    .vdiv.tall { height: 40px; margin: 0; }
    .qa { display: flex; align-items: center; justify-content: flex-end; gap: 16px; flex-shrink: 0; }
    .qa .vdiv { height: 32px; }
    .qbtn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 48px; min-width: 48px; box-sizing: border-box; padding: 12px; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--app-card-bg); font: inherit; cursor: pointer; transition: background-color .2s ease-in, transform .12s; }
    .qbtn svg { width: 24px; height: 24px; flex-shrink: 0; }
    .qbtn .lbl { display: none; padding: 0 2px; font-size: 18px; font-weight: 600; line-height: 27px; color: var(--ink-2); }
    @media (hover: hover) { .qbtn:hover { background: var(--app-bg); } }
    .qbtn:active { transform: scale(.96); }
    .qbtn.add { border-color: transparent; background: var(--pos); color: #fff; }
    .qbtn.add mat-icon { font-size: 26px; width: 26px; height: 26px; }
    @media (hover: hover) { .qbtn.add:hover { background: color-mix(in srgb, var(--pos) 85%, #000); } }
    /* com espaço, os atalhos mostram o nome (a outra aplicação só os reduz a ícone quando não cabem numa linha) */
    @container (min-width: 1040px) { .qbtn:not(.add) { padding: 10px 16px; } .qbtn .lbl { display: inline; } }
    /* blocos (widgets) */
    .wide .card.w { padding: 0; }
    .w-head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 40px 40px 0; }
    .wide .w-head h2 { font-size: 18px; font-weight: 400; margin: 0; color: var(--ink); }
    .chev-btn { width: 32px; height: 32px; border: none; background: none; border-radius: 10px; display: grid; place-items: center; cursor: pointer; color: var(--ink); }
    @media (hover: hover) { .chev-btn:hover { background: var(--app-bg); } }
    .chev-btn .chev.closed { transform: rotate(180deg); }
    .w-body { padding: 24px 40px 40px; }
    .w-foot { display: flex; align-items: center; gap: 12px; margin-top: 24px; }
    .w-foot.end { justify-content: flex-end; } .w-foot.center { justify-content: center; } .w-foot.between { justify-content: space-between; }
    .btn-out { display: inline-flex; align-items: center; gap: 4px; height: 40px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--app-card-bg); color: var(--ink-2); font: inherit; font-size: 15px; font-weight: 600; text-decoration: none; cursor: pointer; transition: background-color .15s; }
    .btn-out mat-icon { font-size: 20px; width: 20px; height: 20px; }
    @media (hover: hover) { .btn-out:hover { background: var(--app-bg); } }
    .btn-out .chev.up { transform: rotate(180deg); }
    .btn-soft { display: inline-flex; align-items: center; gap: 6px; height: 40px; padding: 0 14px; border-radius: 12px; background: var(--nav-active-bg); color: var(--pos); font-size: 15px; font-weight: 600; text-decoration: none; transition: filter .15s; }
    .btn-soft mat-icon { font-size: 20px; width: 20px; height: 20px; }
    @media (hover: hover) { .btn-soft:hover { filter: brightness(.97); } }
    .wide .empty { padding: 16px 0 0; color: var(--ink-soft); }
    /* maiores gastos (10/11): lista à esquerda e anel de 264px à direita, metade para cada; num bloco estreito o anel vai para cima */
    .wide .card.w { container-type: inline-size; }
    .top { display: flex; flex-direction: column-reverse; gap: 32px; padding-top: 20px; }
    .wide .donut { display: flex; justify-content: center; align-items: center; }
    @container (min-width: 640px) { .top { flex-direction: row; } .top > * { flex: 1 1 0; min-width: 0; } }
    .tlist { display: flex; flex-direction: column; gap: 12px; }
    .trow { display: flex; align-items: flex-start; gap: 16px; min-height: 52px; text-decoration: none; color: inherit; border-radius: 12px; }
    .trow app-icon-badge { flex-shrink: 0; }
    .tname { flex: 1; min-width: 0; font-size: 16px; font-weight: 400; line-height: 24px; color: var(--ink-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    @media (hover: hover) { .trow:hover .tname { color: var(--ink); } }
    .tval { display: flex; flex-direction: column; align-items: flex-end; }
    .tval b { font-size: 14px; font-weight: 500; line-height: 21px; color: var(--ink-2); white-space: nowrap; }
    .tval small { font-size: 14px; font-weight: 400; line-height: 21px; color: var(--ink-soft); }
    .wide .w-body > .w-foot.end { margin-top: 32px; }
    /* saldo geral + contas */
    .wide .accounts .total { border-left: 3px solid var(--pos); padding: 2px 0 2px 16px; margin-bottom: 32px; gap: 2px; }
    .wide .accounts .total .muted { font-size: 14px; font-weight: 400; color: var(--ink-soft); }
    .wide .accounts .total b { font-size: 20px; font-weight: 600; color: var(--ink); }
    .wide .accounts .total b.expense { color: var(--neg); }
    .wide .accounts .total small { font-size: 14px; font-weight: 400; color: var(--ink-soft); margin-right: 6px; }
    .wide .accounts .rows { gap: 8px; }
    .wide .accounts .row { padding: 6px 8px; margin: 0 -8px; gap: 16px; border-radius: 12px; min-height: 0; }
    @media (hover: hover) { .wide .accounts .row:hover { background: var(--app-bg); } }
    .wide .accounts .row .title { font-size: 16px; font-weight: 500; color: var(--ink-2); }
    .wide .accounts .row .sub { font-size: 14px; font-weight: 400; color: var(--ink-soft); }
    .wide .amount.acc { color: var(--bal); font-size: 16px; font-weight: 500; }
    .wide .amount.acc.expense { color: var(--neg); }
    /* despesas a pagar / receitas a receber */
    .wide .band { display: flex; align-items: center; justify-content: center; gap: 8px; height: 56px; box-sizing: border-box; padding: 0; margin: 0 0 12px; border-radius: 24px; background: var(--app-bg); color: var(--ink-2); font-size: 16px; font-weight: 600; }
    .wide .band mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .wide .band.today { background: color-mix(in srgb, var(--neg) 10%, transparent); color: var(--neg); }
    .wide .rows + .band { margin-top: 20px; }
    .wide .rows.lined { gap: 4px; }
    .wide .pend { gap: 16px; padding: 6px 8px !important; margin: 0 -8px; border-radius: 12px; min-height: 0; }
    @media (hover: hover) { .wide .pend:hover { background: var(--app-bg); } }
    .wide .pend .title { font-size: 16px; font-weight: 500; color: var(--ink); }
    .wide .pend .sub { font-size: 14px; font-weight: 400; color: var(--ink-soft); }
    .wide .pend .sub b { font-weight: 600; color: var(--ink-2); }
    .wide .pend .amount { font-size: 16px; font-weight: 500; color: var(--ink-soft); }
    .wide .pend .paid { --mat-icon-button-state-layer-size: 32px; width: 32px; height: 32px; padding: 6px; color: var(--ink-soft); opacity: 1; }
    .wide .pend .paid mat-icon { font-size: 20px; width: 20px; height: 20px; }
    .kpi span, .kpi b { white-space: nowrap; }
    /* ecrãs mais estreitos (computador pequeno, 10/11): blocos numa só coluna e cartão de resumo mais compacto */
    @media (max-width: 1199px) {
      .wide .grid-2 { grid-template-columns: 1fr; }
      .wide .card.summary { padding: 24px; gap: 12px; flex-wrap: wrap; }
      .qa { gap: 10px; }
      .welcome { padding: 16px 24px; }
    }
    /* aviso de hoje */
    .wide .due { margin-bottom: 20px; padding: 16px 24px; border-left: none; }
    .wide .due-icon { background: color-mix(in srgb, var(--warn, #f6a351) 22%, transparent); color: #b4610e; }
    /* telemóvel (22/10): letra 1–2px mais pequena (gerado a partir dos tamanhos acima) */
    @media (max-width: 899px) { .greet h1 { font-size: 20px; } .due-text b { font-size: 13px; } .due-text .muted { font-size: 12px; } .total b { font-size: 20px; } .band { font-size: 13px; } .greet .muted { font-size: 15px; } .total .muted { font-size: 13px; } .accounts h2 { font-size: 15px; } .accounts .row .title { font-size: 14px; } .accounts .row .sub { font-size: 13px; } .amount.acc { font-size: 14px; } .wide .card h2 { font-size: 16px; } .hello { font-size: 13px; } .name { font-size: 14.5px; } .kpis span { font-size: 13px; } .kpis b { font-size: 15px; } .act { font-size: 14px; } .act.ghost { font-size: 13px; } .wide .top .row .title { font-size: 12.5px; } .wide .top .row .amount { font-size: 12.5px; } .wide .accounts .total .muted { font-size: 13px; } .wide .accounts .total b { font-size: 17px; } .wide .accounts .total small { font-size: 13px; } .wide .accounts .row .title { font-size: 14px; } .wide .accounts .row .sub { font-size: 13px; } .wide .amount.acc { font-size: 16px; } .wide .band { font-size: 13px; } .wide .pend .title { font-size: 12.5px; } .wide .pend .sub { font-size: 11px; } .wide .pend .amount { font-size: 12.5px; } }
  `],
})
export class DashboardPage {
  readonly data = inject(DataService);
  private readonly auth = inject(AuthService);
  private readonly ui = inject(UiService);
  private readonly dialog = inject(MatDialog);
  private readonly bp = inject(BreakpointObserver);

  /** No telemóvel a visão geral mostra só saudação, aviso, saldo geral e contas. */
  readonly isSmall = toSignal(this.bp.observe('(max-width: 899px)').pipe(map((r) => r.matches)), { initialValue: false });

  readonly month = signal(currentMonth());
  readonly today = todayIso();
  readonly tomorrow = addDays(this.today, 1);
  private readonly txs = signal<Transaction[]>([]);
  readonly pending = signal<Transaction[]>([]);
  readonly pendingPay = computed(() => this.pending().filter((t) => t.kind !== 'income').slice(0, 12));
  readonly pendingRecv = computed(() => this.pending().filter((t) => t.kind === 'income').slice(0, 12));
  readonly due = signal<Transaction[]>([]);
  readonly dueOpen = signal(false);

  readonly totals = computed(() => {
    let income = 0, expense = 0;
    for (const t of this.txs()) { if (isAdjustment(t)) continue; if (t.kind === 'income') income += t.amount; else if (t.kind === 'expense') expense += t.amount; }
    return { income, expense };
  });

  readonly byCategory = computed(() => {
    const m = new Map<string, number>();
    for (const t of this.txs()) if (t.kind === 'expense' && !isAdjustment(t)) { const id = this.data.rootOf(t.category_id)?.id ?? ''; m.set(id, (m.get(id) ?? 0) + t.amount); }
    return m;
  });

  readonly slices = computed<(DonutSlice & { icon: string })[]>(() =>
    [...this.byCategory().entries()]
      .map(([id, value]) => {
        const c = this.data.categoryMap().get(id);
        return { id: id || 'none', label: c?.name ?? 'Sem categoria', value, color: c?.color ?? '#90a4ae', icon: c?.icon ?? 'label' };
      })
      .sort((a, b) => b.value - a.value),
  );
  readonly topCategories = computed(() => this.slices().slice(0, 5));

  readonly dueTitle = computed(() => {
    const list = this.due();
    const pay = list.filter((t) => t.kind !== 'income').length, recv = list.filter((t) => t.kind === 'income').length;
    const parts = [];
    if (pay) parts.push(`${pay} conta${pay > 1 ? 's' : ''} a pagar`);
    if (recv) parts.push(`${recv} conta${recv > 1 ? 's' : ''} a receber`);
    return `Tens ${parts.join(' e ')}`;
  });
  readonly dueSubtitle = computed(() => {
    const list = this.due();
    const pay = list.filter((t) => t.kind !== 'income').reduce((s, t) => s + t.amount, 0);
    const recv = list.filter((t) => t.kind === 'income').reduce((s, t) => s + t.amount, 0);
    const overdue = list.filter((t) => t.date < this.today).length;
    const parts = [];
    if (pay) parts.push(`a pagar ${formatMoney(pay)}`);
    if (recv) parts.push(`a receber ${formatMoney(recv)}`);
    return `Hoje: ${parts.join(' · ')}${overdue ? ` · ${overdue} em atraso` : ''}`;
  });

  constructor() {
    effect(() => {
      const month = this.month();
      this.data.version();
      untracked(() => this.load(month));
    });
  }

  private async load(month: string) {
    const { start, end } = monthRange(month);
    // Já lido antes? mostra logo e atualiza por trás (21/10)
    const cTx = this.data.peekTransactions(start, end), cPend = this.data.peekPending('1900-01-01', addDays(this.today, 30));
    if (cTx) this.txs.set(cTx);
    if (cPend) this.applyPending(cPend);
    try {
      await this.data.generateRecurrences(end);
      const [txs, pending] = await Promise.all([
        this.data.listTransactions(start, end),
        this.data.listPending('1900-01-01', addDays(this.today, 30)),
      ]);
      this.txs.set(txs);
      this.applyPending(pending);
    } catch (e) { this.ui.error(e); }
  }

  private applyPending(pending: Transaction[]) {
    const nonTransfer = pending.filter((t) => t.kind !== 'transfer');
    this.due.set(nonTransfer.filter((t) => t.date <= this.today));
    this.pending.set(nonTransfer.filter((t) => t.date >= this.today));
  }

  readonly theme = inject(ThemeService);
  /** Esconder valores (olho do cartão de resumo, computador); lembra-se neste browser. */
  readonly hidden = signal(readFlag('mf-hide-values'));
  /** Categoria sob o rato na lista dos maiores gastos (realça a fatia no anel). */
  readonly hover = signal<string | null>(null);
  /** Blocos recolhidos e listas expandidas ("Ver mais") na Visão geral do computador. */
  readonly closed = signal(new Set<string>());
  readonly expanded = signal(new Set<string>());
  toggleHidden() { this.hidden.update((v) => !v); try { localStorage.setItem('mf-hide-values', this.hidden() ? '1' : '0'); } catch { /* ignore */ } }
  toggle(key: string) { this.closed.update((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; }); }
  toggleMore(key: string) { this.expanded.update((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n; }); }
  limit(list: Transaction[], key: string) { return this.isSmall() || this.expanded().has(key) ? list : list.slice(0, 4); }
  /** "1 Nov - 30 Nov" */
  periodLabel() {
    const { start, end } = monthRange(this.month());
    const f = (iso: string) => `${Number(iso.slice(8, 10))} ${MON[Number(iso.slice(5, 7)) - 1]}`;
    return `${f(start)} - ${f(end)}`;
  }
  /** Primeiro nome (barra de boas-vindas do computador). */
  shortName() { return this.firstName().split(' ')[0]; }
  pct0(v: number) { const t = this.totals().expense; return t ? Math.round(100 * v / t) + '%' : ''; }
  greeting() { const h = new Date().getHours(); return h < 12 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite'; }
  /** Nome completo definido em "O meu nome"; senão o nome da conta Google; senão a parte do email. */
  firstName() {
    const name = this.data.displayName() || this.auth.displayName();
    return name.includes('@') ? name.split('@')[0] : name || 'Olá';
  }
  typeLabel(t: AccountType) { return ACCOUNT_TYPES.find((x) => x.id === t)?.label ?? ''; }
  /** Valor sem o símbolo (o € aparece à parte, mais pequeno, no saldo geral). */
  num(v: number) { return (v < 0 ? '-' : '') + formatMoney(Math.abs(v)).replace('€', '').trim(); }
  balance(id: string) { return this.data.balances()[id] ?? 0; }
  pct(v: number) { const t = this.totals().expense; return t ? (100 * v / t).toFixed(2).replace('.', ',') + '%' : ''; }
  fmtDay(iso: string) { return DAY_FMT.format(fromIso(iso)); }
  dueLabel(iso: string) { return iso === this.today ? 'Hoje' : `${this.fmtDay(iso)} · em atraso`; }
  accName(t: Transaction) { return this.data.accountMap().get(t.account_id)?.name ?? ''; }
  iconOf(t: Transaction) { return this.data.categoryMap().get(t.category_id ?? '')?.icon ?? (t.kind === 'income' ? 'call_received' : 'call_made'); }
  colorOf(t: Transaction) { return this.data.categoryMap().get(t.category_id ?? '')?.color ?? (t.kind === 'income' ? '#1eb980' : '#e5484d'); }
  dueOf(list: Transaction[]) { return list.filter((t) => t.date <= this.today); }
  nextOf(list: Transaction[]) { return list.filter((t) => t.date > this.today); }

  add(kind?: 'expense' | 'income' | 'transfer') { openTransactionDialog(this.dialog, kind ? { kind } : {}); }
  edit(t: Transaction) { openTransactionDialog(this.dialog, { transaction: t }); }
  async pay(t: Transaction, ev: Event) {
    ev.stopPropagation();
    // otimista (21/10): sai logo das listas
    this.due.update((l) => l.filter((x) => x.id !== t.id));
    this.pending.update((l) => l.filter((x) => x.id !== t.id));
    try { await this.data.setPaid(t.id, true, t); } catch (e) { this.ui.error(e); }
  }
}
