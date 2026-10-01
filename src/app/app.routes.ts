import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: '',
    canActivate: [authGuard],
    loadComponent: () => import('./layout/shell').then((m) => m.Shell),
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/dashboard/dashboard.page').then((m) => m.DashboardPage) },
      { path: 'movimentos', loadComponent: () => import('./features/transactions/transactions.page').then((m) => m.TransactionsPage) },
      { path: 'lancamentos', redirectTo: 'movimentos' },
      { path: 'relatorios', loadComponent: () => import('./features/reports/reports.page').then((m) => m.ReportsPage) },
      { path: 'contas', loadComponent: () => import('./features/accounts/accounts.page').then((m) => m.AccountsPage) },
      { path: 'recorrencias', loadComponent: () => import('./features/recurrences/recurrences.page').then((m) => m.RecurrencesPage) },
      { path: 'categorias', loadComponent: () => import('./features/categories/categories.page').then((m) => m.CategoriesPage) },
    ],
  },
  { path: '**', redirectTo: '' },
];
