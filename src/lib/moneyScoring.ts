/**
 * Pure scoring and computation module for Halo Lifestyle Mode Phase 2 (Money).
 * Handles budget carry-forward, weekly pro-rating, period totals, category grouping,
 * and top expenses without side effects or UI dependencies.
 */

import { addDays, diffDays, compareDates } from './dateUtils';

export interface MoneyCategory {
  id: string;
  user_id: string;
  name: string;
  kind: 'expense' | 'income';
  color?: string | null;
  icon?: string | null;
  archived: boolean;
  created_at?: string;
}

export interface MoneyTransaction {
  id: string;
  user_id: string;
  type: 'expense' | 'income';
  amount: number;
  category_id: string;
  txn_date: string; // YYYY-MM-DD
  note?: string | null;
  created_at?: string;
}

export interface MoneyBudget {
  id: string;
  user_id: string;
  effective_month: string; // YYYY-MM-01
  category_id?: string | null; // null = overall monthly budget
  amount: number;
}

export interface PeriodTotals {
  totalSpent: number;
  totalIncome: number;
  net: number; // income - spent
  dailyAverage: number;
  daysInPeriod: number;
}

export interface CategorySpending {
  categoryId: string;
  categoryName: string;
  color: string;
  icon: string;
  amount: number;
  percentage: number;
}

export interface DaySpending {
  date: string;
  dayLabel: string;
  amount: number;
}

export interface MonthSpending {
  monthKey: string; // YYYY-MM
  label: string; // e.g. "Oct 26"
  totalSpent: number;
  totalIncome: number;
}

/**
 * Normalizes any date string or month string (YYYY-MM or YYYY-MM-DD) to the first day of that month (YYYY-MM-01).
 */
export function normalizeToMonthStart(dateOrMonthStr: string): string {
  const parts = dateOrMonthStr.slice(0, 7).split('-');
  return `${parts[0]}-${parts[1].padStart(2, '0')}-01`;
}

/**
 * Returns number of days in the given month (1-based month).
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Returns number of days in the month of a date string (YYYY-MM or YYYY-MM-DD).
 */
export function getDaysInDateMonth(dateStr: string): number {
  const [y, m] = dateStr.slice(0, 7).split('-').map(Number);
  return getDaysInMonth(y, m);
}

/**
 * Resolves the budget in force for a given month and category.
 * Follows the effective-from pattern: row with greatest effective_month <= targetMonth.
 * Setting categoryId = null (or undefined) retrieves the overall monthly budget.
 */
export function getBudgetInForce(
  budgets: MoneyBudget[],
  targetMonthStr: string,
  categoryId?: string | null
): MoneyBudget | null {
  const normalizedTarget = normalizeToMonthStart(targetMonthStr);
  const targetCatId = categoryId || null;

  const matching = budgets.filter((b) => {
    const bCatId = b.category_id || null;
    if (bCatId !== targetCatId) return false;
    const bMonth = normalizeToMonthStart(b.effective_month);
    return compareDates(bMonth, normalizedTarget) <= 0;
  });

  if (matching.length === 0) return null;

  // Sort descending by effective_month
  matching.sort((a, b) => compareDates(normalizeToMonthStart(b.effective_month), normalizeToMonthStart(a.effective_month)));

  return matching[0];
}

/**
 * Pro-rates a monthly budget for a 7-day week:
 * weekly = monthly * 7 / days_in_month
 */
export function proRateWeeklyBudget(monthlyAmount: number, daysInMonth: number): number {
  if (daysInMonth <= 0 || monthlyAmount <= 0) return 0;
  return Number(((monthlyAmount * 7) / daysInMonth).toFixed(2));
}

/**
 * Calculates totals for a given date range [startDate, endDate] inclusive.
 */
export function getPeriodTotals(
  transactions: MoneyTransaction[],
  startDate: string,
  endDate: string
): PeriodTotals {
  let totalSpent = 0;
  let totalIncome = 0;

  const txnsInRange = transactions.filter(
    (t) => compareDates(t.txn_date, startDate) >= 0 && compareDates(t.txn_date, endDate) <= 0
  );

  for (const t of txnsInRange) {
    const amt = Number(t.amount) || 0;
    if (t.type === 'expense') {
      totalSpent += amt;
    } else if (t.type === 'income') {
      totalIncome += amt;
    }
  }

  const days = Math.max(1, diffDays(startDate, endDate) + 1);
  const dailyAverage = Number((totalSpent / days).toFixed(2));
  const net = Number((totalIncome - totalSpent).toFixed(2));

  return {
    totalSpent: Number(totalSpent.toFixed(2)),
    totalIncome: Number(totalIncome.toFixed(2)),
    net,
    dailyAverage,
    daysInPeriod: days,
  };
}

/**
 * Calculates percentage change between current period and previous period:
 * ((current - previous) / previous) * 100
 * Returns null if previous was 0 and current > 0.
 */
export function calculatePctChange(current: number, previous: number): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

/**
 * Computes expense spending grouped by category in date range [startDate, endDate].
 */
export function getSpendingByCategory(
  transactions: MoneyTransaction[],
  categories: MoneyCategory[],
  startDate: string,
  endDate: string
): CategorySpending[] {
  const catMap = new Map<string, MoneyCategory>();
  for (const c of categories) {
    catMap.set(c.id, c);
  }

  const expenseTotals = new Map<string, number>();
  let totalSpent = 0;

  for (const t of transactions) {
    if (t.type === 'expense' && compareDates(t.txn_date, startDate) >= 0 && compareDates(t.txn_date, endDate) <= 0) {
      const amt = Number(t.amount) || 0;
      totalSpent += amt;
      const cur = expenseTotals.get(t.category_id) || 0;
      expenseTotals.set(t.category_id, cur + amt);
    }
  }

  const result: CategorySpending[] = [];
  for (const [catId, amount] of expenseTotals.entries()) {
    const cat = catMap.get(catId);
    const percentage = totalSpent > 0 ? Number(((amount / totalSpent) * 100).toFixed(1)) : 0;
    result.push({
      categoryId: catId,
      categoryName: cat?.name || 'Uncategorized',
      color: cat?.color || '#94a3b8',
      icon: cat?.icon || '📦',
      amount: Number(amount.toFixed(2)),
      percentage,
    });
  }

  // Sort descending by amount
  result.sort((a, b) => b.amount - a.amount);
  return result;
}

/**
 * Computes daily spending array for every day between startDate and endDate.
 */
export function getDailySpending(
  transactions: MoneyTransaction[],
  startDate: string,
  endDate: string
): DaySpending[] {
  const dayTotals = new Map<string, number>();
  for (const t of transactions) {
    if (t.type === 'expense' && compareDates(t.txn_date, startDate) >= 0 && compareDates(t.txn_date, endDate) <= 0) {
      const amt = Number(t.amount) || 0;
      dayTotals.set(t.txn_date, (dayTotals.get(t.txn_date) || 0) + amt);
    }
  }

  const daysCount = Math.max(1, diffDays(startDate, endDate) + 1);
  const result: DaySpending[] = [];

  for (let i = 0; i < daysCount; i++) {
    const curDate = addDays(startDate, i);
    const amt = dayTotals.get(curDate) || 0;
    const [y, m, d] = curDate.split('-').map(Number);
    const dateObj = new Date(Date.UTC(y, m - 1, d));
    const dayLabel = dateObj.toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'narrow' }) + ' ' + d;

    result.push({
      date: curDate,
      dayLabel,
      amount: Number(amt.toFixed(2)),
    });
  }

  return result;
}

/**
 * Returns the top N largest expense transactions in the period.
 */
export function getTopExpenses(
  transactions: MoneyTransaction[],
  startDate: string,
  endDate: string,
  limit: number = 5
): MoneyTransaction[] {
  const expenses = transactions.filter(
    (t) => t.type === 'expense' && compareDates(t.txn_date, startDate) >= 0 && compareDates(t.txn_date, endDate) <= 0
  );

  expenses.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
  return expenses.slice(0, limit);
}

/**
 * Computes monthly totals for the last N months ending at currentMonth (YYYY-MM).
 */
export function getLastNMonthsSpending(
  transactions: MoneyTransaction[],
  currentMonthStr: string, // YYYY-MM
  monthCount: number = 6
): MonthSpending[] {
  const [startYear, startMonth] = currentMonthStr.slice(0, 7).split('-').map(Number);
  const result: MonthSpending[] = [];

  for (let offset = monthCount - 1; offset >= 0; offset--) {
    // Subtract offset months
    let y = startYear;
    let m = startMonth - offset;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }

    const monthKey = `${y}-${String(m).padStart(2, '0')}`;
    const dateObj = new Date(Date.UTC(y, m - 1, 1));
    const label = dateObj.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short' });

    const daysInM = getDaysInMonth(y, m);
    const mStart = `${monthKey}-01`;
    const mEnd = `${monthKey}-${String(daysInM).padStart(2, '0')}`;

    let totalSpent = 0;
    let totalIncome = 0;

    for (const t of transactions) {
      if (compareDates(t.txn_date, mStart) >= 0 && compareDates(t.txn_date, mEnd) <= 0) {
        const amt = Number(t.amount) || 0;
        if (t.type === 'expense') totalSpent += amt;
        else if (t.type === 'income') totalIncome += amt;
      }
    }

    result.push({
      monthKey,
      label,
      totalSpent: Number(totalSpent.toFixed(2)),
      totalIncome: Number(totalIncome.toFixed(2)),
    });
  }

  return result;
}

/**
 * Standard starter categories recommended in Section 7.
 */
export const STARTER_CATEGORIES = [
  // Expenses
  { name: 'Food', kind: 'expense' as const, icon: '🍔', color: '#f97316' },
  { name: 'Transport', kind: 'expense' as const, icon: '🚗', color: '#06b6d4' },
  { name: 'Bills', kind: 'expense' as const, icon: '💡', color: '#eab308' },
  { name: 'Shopping', kind: 'expense' as const, icon: '🛍️', color: '#a855f7' },
  { name: 'Health', kind: 'expense' as const, icon: '💊', color: '#10b981' },
  { name: 'Fun', kind: 'expense' as const, icon: '🎬', color: '#ec4899' },
  { name: 'Other', kind: 'expense' as const, icon: '📦', color: '#64748b' },
  // Income
  { name: 'Salary', kind: 'income' as const, icon: '💼', color: '#10b981' },
  { name: 'Other Income', kind: 'income' as const, icon: '💵', color: '#14b8a6' },
];

/**
 * Formats a currency amount with the specified ISO currency code.
 */
export function formatCurrency(
  amount: number,
  currencyCode?: string | null,
  options?: { compact?: boolean }
): string {
  const code = currencyCode?.trim() || 'USD';
  try {
    if (options?.compact) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: code,
        notation: 'compact',
        maximumFractionDigits: 1,
      }).format(amount);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Fallback if currency code is not supported by Intl
    const formatted = options?.compact && Math.abs(amount) >= 1000
      ? (amount / 1000).toFixed(1) + 'k'
      : amount.toFixed(2);
    return `${code} ${formatted}`;
  }
}
