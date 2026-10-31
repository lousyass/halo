import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Calendar as CalendarIcon,
  X,
  SkipForward,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import {
  getDayScore,
  getHabitCreditOnDate,
  getScheduledItemsForHabit,
  isHabitScheduledOnDate,
  Habit,
} from '../../lib/habitScoring';
import {
  formatCurrency,
  MoneyTransaction,
} from '../../lib/moneyScoring';
import { compareDates, formatDisplayDate } from '../../lib/dateUtils';
import { CalendarBackdrop } from '../common/CalendarBackdrop';
import { InlineCategoryCreator } from './InlineCategoryCreator';
import { useLifestyle } from '../../lib/useLifestyle';

interface LifestyleCalendarProps {
  userId: string;
  theme?: string;
  visualSettings?: any;
}

export const LifestyleCalendar: React.FC<LifestyleCalendarProps> = ({
  userId,
  theme = 'bloom',
  visualSettings,
}) => {
  const { state, scoringContext, store } = useLifestyle(userId);
  const { today, currency, weekStartsOn, transactions, categories } = state;

  const [currentYear, setCurrentYear] = useState(() => {
    const [y] = today.split('-').map(Number);
    return y;
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const [, m] = today.split('-').map(Number);
    return m - 1; // 0-indexed
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(today);

  // Quick transaction modal from Calendar
  const [quickTxnModalOpen, setQuickTxnModalOpen] = useState(false);
  const [quickTxnAmount, setQuickTxnAmount] = useState('');
  const [quickTxnType, setQuickTxnType] = useState<'expense' | 'income'>('expense');
  const [quickTxnCategoryId, setQuickTxnCategoryId] = useState('');
  const [quickTxnNote, setQuickTxnNote] = useState('');
  const [quickTxnDate, setQuickTxnDate] = useState(today);
  const [showInlineCatCreator, setShowInlineCatCreator] = useState(false);
  const [categoryNotice, setCategoryNotice] = useState('');

  const isCustomVisual = visualSettings?.mode === 'custom' && visualSettings?.calendar !== false;

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const jumpToToday = () => {
    const [y, m] = today.split('-').map(Number);
    setCurrentYear(y);
    setCurrentMonth(m - 1);
    setSelectedDate(today);
  };

  // Weekday column headers based on weekStartsOn preference (0 = Sunday, 1 = Monday)
  const weekdayNames = weekStartsOn === 1
    ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // Month grid generation
  let startWeekday = new Date(Date.UTC(currentYear, currentMonth, 1)).getUTCDay();
  if (weekStartsOn === 1) {
    startWeekday = (startWeekday + 6) % 7;
  }

  const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthName = new Date(Date.UTC(currentYear, currentMonth, 1)).toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });

  // Category Map
  const categoryMap = useMemo(() => {
    const m = new Map<string, any>();
    for (const c of categories) m.set(c.id, c);
    return m;
  }, [categories]);

  // Spending map for current month
  const { dailyExpensesMap, monthTotalExpense } = useMemo(() => {
    const map = new Map<string, number>();
    let total = 0;

    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    for (const t of transactions) {
      if (t.type === 'expense' && t.txn_date.startsWith(monthPrefix)) {
        const cur = (map.get(t.txn_date) || 0) + Number(t.amount);
        map.set(t.txn_date, cur);
        total += Number(t.amount);
      }
    }
    return { dailyExpensesMap: map, monthTotalExpense: total };
  }, [transactions, currentYear, currentMonth]);

  // Selected date info
  const isSelectedDateFuture = selectedDate ? compareDates(selectedDate, today) > 0 : false;
  const habitsOnSelectedDate = selectedDate
    ? state.habits.filter((h) => isHabitScheduledOnDate(h, selectedDate, scoringContext))
    : [];
  const selectedDateScore = selectedDate ? getDayScore(selectedDate, scoringContext) : null;

  // Selected date transactions
  const txnsOnSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return transactions.filter((t) => t.txn_date === selectedDate);
  }, [transactions, selectedDate]);

  const selectedDateExpenseTotal = useMemo(() => {
    return txnsOnSelectedDate
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [txnsOnSelectedDate]);

  const selectedDateIncomeTotal = useMemo(() => {
    return txnsOnSelectedDate
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
  }, [txnsOnSelectedDate]);

  const handleOpenAddTxnForDate = (date: string) => {
    setQuickTxnDate(date);
    setQuickTxnAmount('');
    setQuickTxnType('expense');
    setQuickTxnNote('');
    setShowInlineCatCreator(false);
    setCategoryNotice('');
    const activeCats = categories.filter((c) => !c.archived && c.kind === 'expense');
    setQuickTxnCategoryId(activeCats.length > 0 ? activeCats[0].id : '');
    setQuickTxnModalOpen(true);
  };

  const handleSaveQuickTxn = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseFloat(quickTxnAmount);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || !quickTxnCategoryId) return;

    try {
      await store.createTransaction({
        type: quickTxnType,
        amount: parsedAmount,
        category_id: quickTxnCategoryId,
        txn_date: quickTxnDate,
        note: quickTxnNote,
      });
      setQuickTxnModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Failed to save transaction');
    }
  };

  const eligibleCategoriesForTxn = useMemo(() => {
    return categories.filter((c) => !c.archived && c.kind === quickTxnType);
  }, [categories, quickTxnType]);

  return (
    <div className="space-y-6">
      {/* 1. Month Navigation Header */}
      <div className="p-4 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon size={18} className="text-emerald-600" />
            <h2 className="text-base md:text-lg font-bold text-gray-800 font-['Fredoka']">
              {monthName} {currentYear}
            </h2>
          </div>

          {monthTotalExpense > 0 && (
            <span className="text-xs font-mono font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-100 shadow-2xs">
              Month Spent: {formatCurrency(monthTotalExpense, currency, { compact: true })}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={jumpToToday}
              className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors cursor-pointer"
            >
              Today
            </button>
            <button
              type="button"
              onClick={prevMonth}
              className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
              title="Previous month"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={nextMonth}
              className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors cursor-pointer"
              title="Next month"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* 2. Combined Calendar Grid with Shared Backdrop */}
      <div className="relative overflow-hidden rounded-3xl p-4 bg-white/70 backdrop-blur-md border border-white/60 shadow-sm">
        {/* Shared Calendar Backdrop matching Academics */}
        <CalendarBackdrop monthIndex={currentMonth} theme={theme} isCustomVisual={isCustomVisual} />

        <div className="relative z-10 space-y-2">
          {/* Weekday headers */}
          <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2 text-center text-xs font-bold text-gray-600 uppercase tracking-wider drop-shadow-2xs">
            {weekdayNames.map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          {/* Days grid */}
          <div className="grid grid-cols-7 gap-1 md:gap-2">
            {cells.map((dayNum, idx) => {
              if (dayNum === null) {
                return <div key={`empty-${idx}`} className="min-h-[72px] md:min-h-[88px] rounded-2xl bg-black/[0.02]" />;
              }

              const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(
                dayNum
              ).padStart(2, '0')}`;
              const isToday = dateStr === today;
              const isFuture = compareDates(dateStr, today) > 0;
              const isSelected = selectedDate === dateStr;

              const score = getDayScore(dateStr, scoringContext);
              const dayExpense = dailyExpensesMap.get(dateStr) || 0;

              // Shading logic
              let bgClass = 'bg-white/60 hover:bg-white/85 border-white/70';
              if (isFuture) {
                bgClass = 'bg-gray-50/40 text-gray-400 opacity-60 border-white/40';
              } else if (score !== null && score > 0) {
                const pct = Math.round(score * 100);
                if (pct === 100) {
                  bgClass = 'bg-emerald-100/70 border-emerald-200/80 text-emerald-950';
                } else if (pct >= 50) {
                  bgClass = 'bg-emerald-50/70 border-emerald-200/60 text-emerald-900';
                } else {
                  bgClass = 'bg-amber-50/70 border-amber-200/60 text-amber-900';
                }
              } else if (dayExpense > 0) {
                bgClass = 'bg-rose-50/60 border-rose-200/60 text-rose-950';
              }

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className={`min-h-[72px] md:min-h-[88px] p-1.5 md:p-2 rounded-2xl border text-left flex flex-col justify-between transition-all relative overflow-hidden backdrop-blur-2xs cursor-pointer ${
                    isSelected
                      ? 'ring-2 ring-emerald-500 shadow-md border-transparent bg-white/95'
                      : isToday
                      ? 'border-2 border-emerald-400 bg-white/90 shadow-xs'
                      : bgClass
                  }`}
                >
                  {/* Top row: day number + habit score % */}
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs md:text-sm font-bold ${
                        isToday
                          ? 'w-5 h-5 md:w-6 md:h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center -ml-0.5 shadow-2xs'
                          : 'text-gray-800 drop-shadow-2xs'
                      }`}
                    >
                      {dayNum}
                    </span>

                    {score !== null && !isFuture && (
                      <span className="text-[9px] md:text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-100/80 text-emerald-800 drop-shadow-2xs">
                        {Math.round(score * 100)}%
                      </span>
                    )}
                  </div>

                  {/* Middle / Bottom row: progress bar & spending amount */}
                  <div className="space-y-1 w-full mt-auto">
                    {/* Habit completion progress bar */}
                    {score !== null && !isFuture && (
                      <div className="w-full bg-black/10 rounded-full h-1 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full transition-all"
                          style={{ width: `${Math.round(score * 100)}%` }}
                        />
                      </div>
                    )}

                    {/* Day expense total */}
                    {dayExpense > 0 && (
                      <div className="flex items-center justify-end">
                        {/* Compact text on sm+ */}
                        <span className="hidden sm:inline text-[9px] md:text-[10px] font-mono font-bold text-rose-700 bg-rose-100/80 px-1 py-0.2 rounded truncate">
                          {formatCurrency(dayExpense, currency, { compact: true })}
                        </span>
                        {/* Dot on narrow screens */}
                        <span
                          className="sm:hidden w-2 h-2 rounded-full bg-rose-500 shrink-0"
                          title={`Spent ${formatCurrency(dayExpense, currency)}`}
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Day Detail Panel (Shows BOTH Habits and Transactions) */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="p-5 rounded-3xl bg-white/85 backdrop-blur-md border border-white/60 shadow-sm space-y-5"
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <div>
                <h3 className="text-sm md:text-base font-bold text-gray-800 font-['Fredoka'] flex items-center gap-2">
                  <span>📅</span>
                  {formatDisplayDate(selectedDate)}
                  {selectedDate === today && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                      Today
                    </span>
                  )}
                  {isSelectedDateFuture && (
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      Future
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {habitsOnSelectedDate.length} habits scheduled
                  {selectedDateScore !== null && ` • ${Math.round(selectedDateScore * 100)}% completed`}
                  {' • '}
                  Total Spent: <span className="font-bold text-rose-600 font-mono">{formatCurrency(selectedDateExpenseTotal, currency)}</span>
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenAddTxnForDate(selectedDate)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all cursor-pointer"
                >
                  <Plus size={13} />
                  Add Transaction
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Split Grid: Habits on Left, Transactions on Right */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* ── HABITS SECTION ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                  <h4 className="text-xs font-bold text-gray-700 font-['Fredoka'] uppercase tracking-wider flex items-center gap-1.5">
                    <span>🌱</span> Habits
                  </h4>
                  <span className="text-[11px] text-gray-400 font-medium">
                    {habitsOnSelectedDate.length} scheduled
                  </span>
                </div>

                {habitsOnSelectedDate.length === 0 ? (
                  <div className="py-6 text-center text-xs text-gray-400 bg-gray-50/50 rounded-2xl border border-gray-100">
                    No habits were scheduled on this date.
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                    {habitsOnSelectedDate.map((habit) => {
                      const credit = getHabitCreditOnDate(habit, selectedDate, scoringContext);
                      const isDone = credit >= 0.999;
                      const scheduledItems = getScheduledItemsForHabit(
                        state.items,
                        habit.id,
                        selectedDate
                      );

                      return (
                        <div
                          key={habit.id}
                          className={`p-3 rounded-2xl border transition-all ${
                            isDone
                              ? 'bg-emerald-50/50 border-emerald-200'
                              : 'bg-white/60 border-gray-100'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <button
                              type="button"
                              disabled={isSelectedDateFuture}
                              onClick={() => store.toggleHabit(habit.id, selectedDate)}
                              className={`w-5 h-5 rounded-lg flex items-center justify-center transition-all ${
                                isSelectedDateFuture
                                  ? 'cursor-not-allowed opacity-50 border border-gray-300'
                                  : isDone
                                  ? 'bg-emerald-500 text-white cursor-pointer'
                                  : credit > 0
                                  ? 'border-2 border-emerald-400 bg-emerald-50 text-emerald-600 cursor-pointer'
                                  : 'border-2 border-gray-300 hover:border-gray-400 bg-white cursor-pointer'
                              }`}
                            >
                              {isDone ? (
                                <Check size={12} strokeWidth={3} />
                              ) : credit > 0 ? (
                                <span className="text-[9px] font-bold">
                                  {Math.round(credit * 100)}%
                                </span>
                              ) : null}
                            </button>

                            <div className="flex-1 min-w-0">
                              <span
                                className={`text-xs md:text-sm font-semibold truncate block ${
                                  isDone ? 'line-through text-gray-400' : 'text-gray-800'
                                }`}
                              >
                                {habit.icon && `${habit.icon} `}
                                {habit.name}
                              </span>
                            </div>

                            {!isSelectedDateFuture && (
                              <button
                                type="button"
                                onClick={() => store.skipHabit(habit.id, selectedDate)}
                                title="Toggle skip"
                                className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 cursor-pointer"
                              >
                                <SkipForward size={13} />
                              </button>
                            )}
                          </div>

                          {scheduledItems.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-gray-100 pl-7 space-y-1.5">
                              {scheduledItems.map((item) => {
                                const itemDone = state.completions.some(
                                  (c) =>
                                    c.item_id === item.id &&
                                    c.log_date === selectedDate &&
                                    c.status === 'done'
                                );
                                return (
                                  <div key={item.id} className="flex items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={isSelectedDateFuture}
                                      onClick={() =>
                                        store.toggleItem(habit.id, item.id, selectedDate)
                                      }
                                      className={`w-3.5 h-3.5 rounded flex items-center justify-center ${
                                        isSelectedDateFuture
                                          ? 'cursor-not-allowed opacity-50 border border-gray-300'
                                          : itemDone
                                          ? 'bg-emerald-500 text-white cursor-pointer'
                                          : 'border border-gray-300 bg-white cursor-pointer'
                                      }`}
                                    >
                                      {itemDone && <Check size={9} strokeWidth={3} />}
                                    </button>
                                    <span
                                      className={`text-xs ${
                                        itemDone ? 'line-through text-gray-400' : 'text-gray-700'
                                      }`}
                                    >
                                      {item.title}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* ── TRANSACTIONS SECTION ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between pb-1 border-b border-gray-100">
                  <h4 className="text-xs font-bold text-gray-700 font-['Fredoka'] uppercase tracking-wider flex items-center gap-1.5">
                    <span>💳</span> Transactions
                  </h4>
                  <span className="text-[11px] font-mono font-bold text-rose-600">
                    Total: {formatCurrency(selectedDateExpenseTotal, currency)}
                  </span>
                </div>

                {txnsOnSelectedDate.length === 0 ? (
                  <div className="py-8 text-center space-y-2 bg-gray-50/50 rounded-2xl border border-gray-100">
                    <p className="text-xs text-gray-400">No transactions recorded for this day.</p>
                    <button
                      type="button"
                      onClick={() => handleOpenAddTxnForDate(selectedDate)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all cursor-pointer"
                    >
                      <Plus size={13} />
                      Add Transaction
                    </button>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 rounded-2xl bg-white/70 border border-gray-100 overflow-hidden max-h-[400px] overflow-y-auto">
                    {txnsOnSelectedDate.map((txn) => {
                      const cat = categoryMap.get(txn.category_id);
                      const isExpense = txn.type === 'expense';

                      return (
                        <div
                          key={txn.id}
                          className="flex items-center justify-between p-3 hover:bg-white transition-colors"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-2xs shrink-0"
                              style={{ backgroundColor: `${cat?.color || '#94a3b8'}20` }}
                            >
                              {cat?.icon || '📦'}
                            </div>
                            <div className="min-w-0">
                              <span className="text-xs font-bold text-gray-900 block truncate">
                                {cat?.name || 'Uncategorized'}
                              </span>
                              {txn.note && (
                                <p className="text-[11px] text-gray-500 truncate">{txn.note}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <span
                              className={`text-xs font-bold font-mono ${
                                isExpense ? 'text-gray-900' : 'text-emerald-600'
                              }`}
                            >
                              {isExpense ? '-' : '+'}
                              {formatCurrency(Number(txn.amount), currency)}
                            </span>

                            <button
                              type="button"
                              onClick={() => store.deleteTransaction(txn.id)}
                              className="p-1 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Delete"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Add Transaction Modal with Part 4 New Category Creator */}
      <AnimatePresence>
        {quickTxnModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100 p-5 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                <h4 className="font-bold text-sm text-gray-900 font-['Fredoka']">
                  Add Transaction ({quickTxnDate})
                </h4>
                <button
                  type="button"
                  onClick={() => setQuickTxnModalOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveQuickTxn} className="space-y-3">
                <div className="flex bg-gray-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setQuickTxnType('expense');
                      const cats = categories.filter((c) => !c.archived && c.kind === 'expense');
                      setQuickTxnCategoryId(cats.length > 0 ? cats[0].id : '');
                    }}
                    className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      quickTxnType === 'expense' ? 'bg-white text-gray-900 shadow-xs' : 'text-gray-600'
                    }`}
                  >
                    Expense
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setQuickTxnType('income');
                      const cats = categories.filter((c) => !c.archived && c.kind === 'income');
                      setQuickTxnCategoryId(cats.length > 0 ? cats[0].id : '');
                    }}
                    className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                      quickTxnType === 'income' ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-600'
                    }`}
                  >
                    Income
                  </button>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">
                    Amount ({currency || 'USD'})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    placeholder="0.00"
                    value={quickTxnAmount}
                    onChange={(e) => setQuickTxnAmount(e.target.value)}
                    className="w-full text-xl font-bold font-mono p-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    autoFocus
                  />
                </div>

                {/* Category with + New category button */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-gray-700">Category</label>
                    <button
                      type="button"
                      onClick={() => setShowInlineCatCreator(!showInlineCatCreator)}
                      className="text-xs font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-0.5 cursor-pointer"
                    >
                      <Plus size={12} />
                      New category
                    </button>
                  </div>

                  {categoryNotice && (
                    <div className="text-[11px] text-emerald-700 bg-emerald-50 p-1.5 rounded-lg mb-1.5 flex items-center gap-1">
                      <Check size={12} />
                      {categoryNotice}
                    </div>
                  )}

                  {/* Inline Category Creator */}
                  <InlineCategoryCreator
                    isOpen={showInlineCatCreator}
                    onClose={() => setShowInlineCatCreator(false)}
                    kind={quickTxnType}
                    existingCategories={categories}
                    onSelectCategory={(id, notice) => {
                      setQuickTxnCategoryId(id);
                      if (notice) setCategoryNotice(notice);
                      setTimeout(() => setCategoryNotice(''), 3500);
                    }}
                    createCategory={(params) => store.createCategory(params)}
                  />

                  {eligibleCategoriesForTxn.length === 0 ? (
                    <div className="text-xs text-rose-600 p-2 bg-rose-50 rounded-xl">
                      No active {quickTxnType} categories available. Click "+ New category" above to create one.
                    </div>
                  ) : (
                    <select
                      value={quickTxnCategoryId}
                      onChange={(e) => setQuickTxnCategoryId(e.target.value)}
                      className="w-full p-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500"
                    >
                      {eligibleCategoriesForTxn.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon || '📦'} {c.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Note (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Lunch with friend"
                    value={quickTxnNote}
                    onChange={(e) => setQuickTxnNote(e.target.value)}
                    className="w-full p-2 rounded-xl border border-gray-200 text-xs text-gray-800 focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setQuickTxnModalOpen(false)}
                    className="px-3.5 py-2 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={eligibleCategoriesForTxn.length === 0}
                    className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    Save
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
