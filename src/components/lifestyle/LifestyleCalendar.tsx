import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Calendar as CalendarIcon,
  X,
  SkipForward,
  DollarSign,
  Plus,
  Trash2,
  Pencil,
  TrendingDown,
  TrendingUp,
  Flame,
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
import { useLifestyle } from '../../lib/useLifestyle';

interface LifestyleCalendarProps {
  userId: string;
}

export const LifestyleCalendar: React.FC<LifestyleCalendarProps> = ({ userId }) => {
  const { state, scoringContext, store } = useLifestyle(userId);
  const { today, currency, weekStartsOn, transactions, categories } = state;

  // Layer toggle: 'habits' | 'spending'
  const [activeLayer, setActiveLayer] = useState<'habits' | 'spending'>('habits');

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
  const { dailyExpensesMap, maxDailyExpense, monthTotalExpense } = useMemo(() => {
    const map = new Map<string, number>();
    let max = 0;
    let total = 0;

    const monthPrefix = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    for (const t of transactions) {
      if (t.type === 'expense' && t.txn_date.startsWith(monthPrefix)) {
        const cur = (map.get(t.txn_date) || 0) + Number(t.amount);
        map.set(t.txn_date, cur);
        if (cur > max) max = cur;
        total += Number(t.amount);
      }
    }
    return { dailyExpensesMap: map, maxDailyExpense: max || 1, monthTotalExpense: total };
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

  return (
    <div className="space-y-6">
      {/* 1. Month Navigation Header & Layer Switch */}
      <div className="p-4 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <CalendarIcon size={18} className="text-emerald-600" />
            <h2 className="text-base md:text-lg font-bold text-gray-800 font-['Fredoka']">
              {monthName} {currentYear}
            </h2>
          </div>

          {/* Layer Switch: Habits | Spending */}
          <div className="flex bg-gray-100/90 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveLayer('habits')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeLayer === 'habits'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <span>🌱</span>
              Habits
            </button>
            <button
              type="button"
              onClick={() => setActiveLayer('spending')}
              className={`flex items-center gap-1 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeLayer === 'spending'
                  ? 'bg-white text-emerald-950 shadow-xs'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <span>💳</span>
              Spending
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          {activeLayer === 'spending' && (
            <span className="text-xs font-mono font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-xl border border-rose-100">
              Month: {formatCurrency(monthTotalExpense, currency, { compact: true })}
            </span>
          )}

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

      {/* 2. Calendar Grid */}
      <div className="p-4 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
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
              return <div key={`empty-${idx}`} className="h-16 md:h-20 rounded-2xl" />;
            }

            const dateStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(
              dayNum
            ).padStart(2, '0')}`;
            const isToday = dateStr === today;
            const isFuture = compareDates(dateStr, today) > 0;
            const isSelected = selectedDate === dateStr;

            // ── HABITS LAYER STYLING ──
            if (activeLayer === 'habits') {
              const score = getDayScore(dateStr, scoringContext);
              let bgClass = 'bg-white/40 hover:bg-white/70';
              let textColor = 'text-gray-700';
              let scoreBadge = null;

              if (isFuture) {
                bgClass = 'bg-gray-50/40 text-gray-400 opacity-60';
              } else if (score !== null) {
                const pct = Math.round(score * 100);
                scoreBadge = `${pct}%`;
                if (pct === 100) {
                  bgClass = 'bg-emerald-200/70 border-emerald-300 text-emerald-950 font-semibold';
                } else if (pct >= 50) {
                  bgClass = 'bg-emerald-100/60 border-emerald-200 text-emerald-900';
                } else if (pct > 0) {
                  bgClass = 'bg-amber-100/50 border-amber-200 text-amber-900';
                } else {
                  bgClass = 'bg-rose-50/50 border-rose-100 text-rose-900';
                }
              }

              return (
                <button
                  key={dateStr}
                  type="button"
                  onClick={() => setSelectedDate(dateStr)}
                  className={`h-16 md:h-20 p-1.5 md:p-2 rounded-2xl border text-left flex flex-col justify-between transition-all relative overflow-hidden ${bgClass} ${
                    isSelected ? 'ring-2 ring-emerald-500 shadow-md border-transparent' : 'border-black/5'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span
                      className={`text-xs md:text-sm font-bold ${
                        isToday
                          ? 'w-5 h-5 md:w-6 md:h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center -ml-0.5'
                          : textColor
                      }`}
                    >
                      {dayNum}
                    </span>
                    {scoreBadge && (
                      <span className="text-[9px] md:text-[10px] font-bold opacity-80">
                        {scoreBadge}
                      </span>
                    )}
                  </div>

                  {score !== null && !isFuture && (
                    <div className="w-full bg-black/5 rounded-full h-1 overflow-hidden mt-auto">
                      <div
                        className="bg-emerald-500 h-full rounded-full"
                        style={{ width: `${Math.round(score * 100)}%` }}
                      />
                    </div>
                  )}
                </button>
              );
            }

            // ── SPENDING LAYER STYLING ──
            const dayExpense = dailyExpensesMap.get(dateStr) || 0;
            let bgClass = 'bg-white/40 hover:bg-white/70';
            let textColor = 'text-gray-700';

            if (dayExpense > 0) {
              const intensity = dayExpense / maxDailyExpense;
              if (intensity > 0.75) {
                bgClass = 'bg-rose-300/80 border-rose-400 text-rose-950 font-bold';
              } else if (intensity > 0.5) {
                bgClass = 'bg-rose-200/70 border-rose-300 text-rose-950 font-semibold';
              } else if (intensity > 0.25) {
                bgClass = 'bg-rose-100/70 border-rose-200 text-rose-900';
              } else {
                bgClass = 'bg-rose-50/60 border-rose-100 text-rose-900';
              }
            } else if (isFuture) {
              bgClass = 'bg-gray-50/40 text-gray-400 opacity-60';
            }

            return (
              <button
                key={dateStr}
                type="button"
                onClick={() => setSelectedDate(dateStr)}
                className={`h-16 md:h-20 p-1.5 md:p-2 rounded-2xl border text-left flex flex-col justify-between transition-all relative overflow-hidden ${bgClass} ${
                  isSelected ? 'ring-2 ring-emerald-500 shadow-md border-transparent' : 'border-black/5'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs md:text-sm font-bold ${
                      isToday
                        ? 'w-5 h-5 md:w-6 md:h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center -ml-0.5'
                        : textColor
                    }`}
                  >
                    {dayNum}
                  </span>
                </div>

                {dayExpense > 0 && (
                  <div className="mt-auto">
                    <span className="text-[10px] md:text-xs font-mono font-bold block truncate">
                      {formatCurrency(dayExpense, currency, { compact: true })}
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Day Detail Panel */}
      <AnimatePresence>
        {selectedDate && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="p-5 rounded-3xl bg-white/80 backdrop-blur-md border border-white/60 shadow-sm space-y-4"
          >
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

                {activeLayer === 'habits' ? (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {habitsOnSelectedDate.length} habits scheduled
                    {selectedDateScore !== null && ` • ${Math.round(selectedDateScore * 100)}% completed`}
                  </p>
                ) : (
                  <p className="text-xs text-gray-500 mt-0.5">
                    Total Spent: <span className="font-bold text-rose-600 font-mono">{formatCurrency(selectedDateExpenseTotal, currency)}</span>
                    {selectedDateIncomeTotal > 0 && (
                      <span className="ml-2">
                        • Income: <span className="font-bold text-emerald-600 font-mono">+{formatCurrency(selectedDateIncomeTotal, currency)}</span>
                      </span>
                    )}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {activeLayer === 'spending' && (
                  <button
                    type="button"
                    onClick={() => handleOpenAddTxnForDate(selectedDate)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 shadow-xs transition-all cursor-pointer"
                  >
                    <Plus size={13} />
                    Add
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedDate(null)}
                  className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* ── HABITS LAYER CONTENT ── */}
            {activeLayer === 'habits' && (
              habitsOnSelectedDate.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400">
                  No habits were scheduled on this date.
                </div>
              ) : (
                <div className="space-y-2">
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
                                ? 'bg-emerald-500 text-white'
                                : credit > 0
                                ? 'border-2 border-emerald-400 bg-emerald-50 text-emerald-600'
                                : 'border-2 border-gray-300 hover:border-gray-400 bg-white'
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
                              className="p-1 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
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
                                        ? 'bg-emerald-500 text-white'
                                        : 'border border-gray-300 bg-white'
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
              )
            )}

            {/* ── SPENDING LAYER CONTENT ── */}
            {activeLayer === 'spending' && (
              txnsOnSelectedDate.length === 0 ? (
                <div className="py-8 text-center space-y-2">
                  <p className="text-xs text-gray-400">No transactions recorded for this day.</p>
                  <button
                    type="button"
                    onClick={() => handleOpenAddTxnForDate(selectedDate)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 transition-all cursor-pointer"
                  >
                    <Plus size={13} />
                    Add Transaction on {formatDisplayDate(selectedDate)}
                  </button>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 rounded-2xl bg-white/60 border border-gray-100 overflow-hidden">
                  {txnsOnSelectedDate.map((txn) => {
                    const cat = categoryMap.get(txn.category_id);
                    const isExpense = txn.type === 'expense';

                    return (
                      <div
                        key={txn.id}
                        className="flex items-center justify-between p-3 hover:bg-white/90 transition-colors"
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className="w-8 h-8 rounded-xl flex items-center justify-center text-sm shadow-xs"
                            style={{ backgroundColor: `${cat?.color || '#94a3b8'}20` }}
                          >
                            {cat?.icon || '📦'}
                          </div>
                          <div>
                            <span className="text-xs font-bold text-gray-900 block">
                              {cat?.name || 'Uncategorized'}
                            </span>
                            {txn.note && (
                              <p className="text-[11px] text-gray-500 line-clamp-1">{txn.note}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
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
                            className="p-1 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Add Transaction Modal */}
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
                  className="p-1 text-gray-400 hover:text-gray-600 rounded-lg"
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
                    className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                      quickTxnType === 'expense' ? 'bg-rose-600 text-white shadow-xs' : 'text-gray-600'
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
                    className={`flex-1 py-1 rounded-lg text-xs font-bold transition-all ${
                      quickTxnType === 'income' ? 'bg-emerald-600 text-white shadow-xs' : 'text-gray-600'
                    }`}
                  >
                    Income
                  </button>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Amount</label>
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

                <div>
                  <label className="text-xs font-bold text-gray-700 block mb-1">Category</label>
                  <select
                    value={quickTxnCategoryId}
                    onChange={(e) => setQuickTxnCategoryId(e.target.value)}
                    className="w-full p-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-800 focus:ring-2 focus:ring-emerald-500"
                  >
                    {categories
                      .filter((c) => !c.archived && c.kind === quickTxnType)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.icon || '📦'} {c.name}
                        </option>
                      ))}
                  </select>
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

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setQuickTxnModalOpen(false)}
                    className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs"
                  >
                    Add
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
