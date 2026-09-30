import { Pipe, PipeTransform } from '@angular/core';


/** Formato "1.234,56" (ponto nos milhares, vírgula nos decimais), como na outra aplicação de gestão de finanças. */
export function formatMoney(v: number | null | undefined, symbol = true): string {
  const n = Number(v ?? 0);
  const neg = n < 0;
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const s = `${grouped},${dec}`;
  return (neg ? '-' : '') + (symbol ? `€ ${s}` : s);
}

/** `{{ v | money }}` → "€ 1.234,56"; `{{ v | money:'plain' }}` → "1.234,56"; `'signed'` mostra +/-. */
@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(v: number | null | undefined, mode: 'symbol' | 'plain' | 'signed' = 'symbol'): string {
    const n = Number(v ?? 0);
    if (mode === 'plain') return formatMoney(n, false);
    if (mode === 'signed') return (n > 0 ? '+' : n < 0 ? '−' : '') + formatMoney(Math.abs(n), false);
    return formatMoney(n, true);
  }
}
