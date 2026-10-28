import { describe, it, expect } from 'vitest';
import {
  getBudgetInForce,
  proRateWeeklyBudget,
  getPeriodTotals,
  calculatePctChange,
  getSpendingByCategory,
  getTopExpenses,
  getLastNMonthsSpending,
  formatCurrency,
  MoneyBudget,
  MoneyCategory,
  MoneyTransaction,
} from './moneyScoring';

describe('moneyScoring - Budget Carry-Forward', () => {
  const sampleBudgets: MoneyBudget[] = [
    {
      id: 'b1',
      user_id: 'u1',
      effective_month: '2026-01-01',
      category_id: null, // overall
      amount: 5000,
    },
    {
      id: 'b2',
      user_id: 'u1',
      effective_month: '2026-04-01',
      category_id: null, // overall updated in April
      amount: 6000,
    },
    {
      id: 'b3',
      user_id: 'u1',
      effective_month: '2026-01-01',
      category_id: 'cat-groceries',
      amount: 1200,
    },
    {
      id: 'b4',
      user_id: 'u1',
      effective_month: '2026-03-01',
      category_id: 'cat-groceries',
      amount: 1500,
    },
  ];

  it('budget set in January applies to March if no Feb/Mar override', () => {
    // For overall budget in March: January budget (5000) should be in force
    const budgetMarch = getBudgetInForce(sampleBudgets, '2026-03-01', null);
    expect(budgetMarch).not.toBeNull();
    expect(budgetMarch?.amount).toBe(5000);
    expect(budgetMarch?.id).toBe('b1');
  });

  it('budget set in January is superseded in April by new effective budget', () => {
    const budgetApril = getBudgetInForce(sampleBudgets, '2026-04-01', null);
    expect(budgetApril).not.toBeNull();
    expect(budgetApril?.amount).toBe(6000);
    expect(budgetApril?.id).toBe('b2');

    const budgetMay = getBudgetInForce(sampleBudgets, '2026-05-01', null);
    expect(budgetMay?.amount).toBe(6000);
  });

  it('per-category budget carries forward independently of overall budget', () => {
    // In February: groceries should still be 1200 (from Jan)
    const groceriesFeb = getBudgetInForce(sampleBudgets, '2026-02-15', 'cat-groceries');
    expect(groceriesFeb?.amount).toBe(1200);

    // In March: groceries updated to 1500
    const groceriesMarch = getBudgetInForce(sampleBudgets, '2026-03-10', 'cat-groceries');
    expect(groceriesMarch?.amount).toBe(1500);

    // Unbudgeted category returns null
    const rentBudget = getBudgetInForce(sampleBudgets, '2026-03-01', 'cat-rent');
    expect(rentBudget).toBeNull();
  });

  it('returns null if target month is before any budget was created', () => {
    const budget2025 = getBudgetInForce(sampleBudgets, '2025-12-01', null);
    expect(budget2025).toBeNull();
  });
});

describe('moneyScoring - Weekly Pro-rating', () => {
  it('monthly budget of 3100 BDT in 31-day month pro-rates to 700', () => {
    // Spec requirement test case: 3100 * 7 / 31 = 700
    const weekly = proRateWeeklyBudget(3100, 31);
    expect(weekly).toBe(700);
  });

  it('handles 30-day month correctly', () => {
    // 3000 in 30-day month -> 3000 * 7 / 30 = 700
    expect(proRateWeeklyBudget(3000, 30)).toBe(700);
    // 1500 in 30-day month -> 1500 * 7 / 30 = 350
    expect(proRateWeeklyBudget(1500, 30)).toBe(350);
  });

  it('handles 28-day February correctly', () => {
    // 2800 * 7 / 28 = 700
    expect(proRateWeeklyBudget(2800, 28)).toBe(700);
  });

  it('handles zero or negative values safely', () => {
    expect(proRateWeeklyBudget(0, 31)).toBe(0);
    expect(proRateWeeklyBudget(1000, 0)).toBe(0);
  });
});

describe('moneyScoring - Period Totals & Percent Change', () => {
  const transactions: MoneyTransaction[] = [
    {
      id: 't1',
      user_id: 'u1',
      type: 'expense',
      amount: 100,
      category_id: 'cat-food',
      txn_date: '2026-10-01',
    },
    {
      id: 't2',
      user_id: 'u1',
      type: 'expense',
      amount: 50,
      category_id: 'cat-transport',
      txn_date: '2026-10-05',
    },
    {
      id: 't3',
      user_id: 'u1',
      type: 'income',
      amount: 500,
      category_id: 'cat-salary',
      txn_date: '2026-10-01',
    },
    {
      id: 't4',
      user_id: 'u1',
      type: 'expense',
      amount: 300,
      category_id: 'cat-shopping',
      txn_date: '2026-10-15', // out of range for Oct 1-7
    },
  ];

  it('calculates total spent, total income, net, and daily average over a week', () => {
    const totals = getPeriodTotals(transactions, '2026-10-01', '2026-10-07');
    expect(totals.totalSpent).toBe(150); // 100 + 50
    expect(totals.totalIncome).toBe(500);
    expect(totals.net).toBe(350); // 500 - 150
    expect(totals.daysInPeriod).toBe(7);
    expect(totals.dailyAverage).toBe(21.43); // 150 / 7 = 21.4285...
  });

  it('calculates percentage change correctly', () => {
    expect(calculatePctChange(150, 100)).toBe(50); // +50%
    expect(calculatePctChange(50, 100)).toBe(-50); // -50%
    expect(calculatePctChange(100, 100)).toBe(0);
    expect(calculatePctChange(100, 0)).toBeNull();
    expect(calculatePctChange(0, 0)).toBe(0);
  });
});

describe('moneyScoring - Category Grouping & Top Expenses', () => {
  const categories: MoneyCategory[] = [
    { id: 'cat-food', user_id: 'u1', name: 'Food', kind: 'expense', icon: '🍔', color: '#f97316', archived: false },
    { id: 'cat-transport', user_id: 'u1', name: 'Transport', kind: 'expense', icon: '🚗', color: '#06b6d4', archived: false },
    { id: 'cat-bills', user_id: 'u1', name: 'Bills', kind: 'expense', icon: '💡', color: '#eab308', archived: false },
  ];

  const transactions: MoneyTransaction[] = [
    { id: 't1', user_id: 'u1', type: 'expense', amount: 200, category_id: 'cat-food', txn_date: '2026-10-02' },
    { id: 't2', user_id: 'u1', type: 'expense', amount: 300, category_id: 'cat-bills', txn_date: '2026-10-03' },
    { id: 't3', user_id: 'u1', type: 'expense', amount: 100, category_id: 'cat-food', txn_date: '2026-10-04' },
    { id: 't4', user_id: 'u1', type: 'expense', amount: 50, category_id: 'cat-transport', txn_date: '2026-10-05' },
    { id: 't5', user_id: 'u1', type: 'expense', amount: 500, category_id: 'cat-bills', txn_date: '2026-10-06' },
    { id: 't6', user_id: 'u1', type: 'income', amount: 2000, category_id: 'cat-salary', txn_date: '2026-10-01' },
  ];

  it('groups expenses by category with percentages and sorted descending', () => {
    // Total expenses: Food(300) + Bills(800) + Transport(50) = 1150
    const catSpending = getSpendingByCategory(transactions, categories, '2026-10-01', '2026-10-07');
    expect(catSpending).toHaveLength(3);

    // Bills is highest: 800 (69.6%)
    expect(catSpending[0].categoryName).toBe('Bills');
    expect(catSpending[0].amount).toBe(800);
    expect(catSpending[0].percentage).toBe(69.6);

    // Food is second: 300 (26.1%)
    expect(catSpending[1].categoryName).toBe('Food');
    expect(catSpending[1].amount).toBe(300);
    expect(catSpending[1].percentage).toBe(26.1);

    // Transport is third: 50 (4.3%)
    expect(catSpending[2].categoryName).toBe('Transport');
    expect(catSpending[2].amount).toBe(50);
    expect(catSpending[2].percentage).toBe(4.3);
  });

  it('returns top 5 expenses sorted by amount descending', () => {
    const top = getTopExpenses(transactions, '2026-10-01', '2026-10-07', 5);
    expect(top).toHaveLength(5);
    expect(top[0].amount).toBe(500); // t5
    expect(top[1].amount).toBe(300); // t2
    expect(top[2].amount).toBe(200); // t1
    expect(top[3].amount).toBe(100); // t3
    expect(top[4].amount).toBe(50);  // t4
  });
});

describe('moneyScoring - Monthly History & Currency Formatting', () => {
  const transactions: MoneyTransaction[] = [
    { id: 't1', user_id: 'u1', type: 'expense', amount: 400, category_id: 'c1', txn_date: '2026-08-15' },
    { id: 't2', user_id: 'u1', type: 'expense', amount: 600, category_id: 'c1', txn_date: '2026-09-10' },
    { id: 't3', user_id: 'u1', type: 'expense', amount: 900, category_id: 'c1', txn_date: '2026-10-05' },
    { id: 't4', user_id: 'u1', type: 'income', amount: 1500, category_id: 'c2', txn_date: '2026-10-01' },
  ];

  it('computes last 6 months spending totals', () => {
    const history = getLastNMonthsSpending(transactions, '2026-10', 6);
    expect(history).toHaveLength(6);
    expect(history[5].monthKey).toBe('2026-10');
    expect(history[5].totalSpent).toBe(900);
    expect(history[5].totalIncome).toBe(1500);

    expect(history[4].monthKey).toBe('2026-09');
    expect(history[4].totalSpent).toBe(600);

    expect(history[3].monthKey).toBe('2026-08');
    expect(history[3].totalSpent).toBe(400);

    expect(history[0].monthKey).toBe('2026-05');
    expect(history[0].totalSpent).toBe(0);
  });

  it('formats currency with symbol and compact notation', () => {
    const standardUSD = formatCurrency(1250.5, 'USD');
    expect(standardUSD).toContain('1,250.50');

    const compactUSD = formatCurrency(25000, 'USD', { compact: true });
    expect(compactUSD).toContain('25K');
  });
});
