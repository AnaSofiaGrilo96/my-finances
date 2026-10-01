/** Utilitários de datas em formato ISO (YYYY-MM-DD), sem fusos horários. */

export function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayIso(): string {
  return toIso(new Date());
}

/** Início e fim (inclusive) de um mês: month = 'YYYY-MM'. */
export function monthRange(month: string): { start: string; end: string; next: string } {
  const [y, m] = month.split('-').map(Number);
  const start = toIso(new Date(y, m - 1, 1));
  const end = toIso(new Date(y, m, 0));
  const next = toIso(new Date(y, m, 1));
  return { start, end, next };
}

export function currentMonth(): string {
  return todayIso().slice(0, 7);
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

export function shortMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}`;
}

/** Lista de dias ISO entre duas datas (inclusive). */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = [];
  const d = fromIso(start);
  const e = fromIso(end);
  while (d <= e) {
    out.push(toIso(d));
    d.setDate(d.getDate() + 1);
  }
  return out;
}

export function addDays(iso: string, n: number): string {
  const d = fromIso(iso);
  d.setDate(d.getDate() + n);
  return toIso(d);
}

export function addMonthsIso(iso: string, n: number): string {
  const d = fromIso(iso);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toIso(d);
}

/** Mesmo mês de `iso`, com o dia `day` (limitado ao último dia do mês). */
export function withDay(iso: string, day: number): string {
  const d = fromIso(iso);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toIso(d);
}

/** Data da ocorrência n (0 = primeira) de uma recorrência. */
export function occurrenceDate(start: string, frequency: 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'yearly', n: number): string {
  switch (frequency) {
    case 'daily': return addDays(start, n);
    case 'weekly': return addDays(start, 7 * n);
    case 'biweekly': return addDays(start, 14 * n);
    case 'monthly': return addMonthsIso(start, n);
    case 'yearly': return addMonthsIso(start, 12 * n);
  }
}
