import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Check,
  Calendar as CalendarIcon,
  X,
  SkipForward,
  Clock,
} from 'lucide-react';
import {
  getDayScore,
  getHabitCreditOnDate,
  getScheduledItemsForHabit,
  isHabitScheduledOnDate,
  Habit,
} from '../../lib/habitScoring';
import { compareDates, formatDisplayDate } from '../../lib/dateUtils';
import { useLifestyle } from '../../lib/useLifestyle';

interface LifestyleCalendarProps {
  userId: string;
}

export const LifestyleCalendar: React.FC<LifestyleCalendarProps> = ({ userId }) => {
  const { state, scoringContext, store } = useLifestyle(userId);
  const { today } = state;

  const [currentYear, setCurrentYear] = useState(() => {
    const [y] = today.split('-').map(Number);
    return y;
  });
  const [currentMonth, setCurrentMonth] = useState(() => {
    const [, m] = today.split('-').map(Number);
    return m - 1; // 0-indexed
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(today);

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

  // Month grid generation
  const startWeekday = new Date(Date.UTC(currentYear, currentMonth, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const monthName = new Date(Date.UTC(currentYear, currentMonth, 1)).toLocaleDateString('en-US', {
    month: 'long',
    timeZone: 'UTC',
  });

  // Selected date info
  const isSelectedDateFuture = selectedDate ? compareDates(selectedDate, today) > 0 : false;
  const habitsOnSelectedDate = selectedDate
    ? state.habits.filter((h) => isHabitScheduledOnDate(h, selectedDate, scoringContext))
    : [];
  const selectedDateScore = selectedDate ? getDayScore(selectedDate, scoringContext) : null;

  return (
    <div className="space-y-6">
      {/* 1. Month Navigation Header */}
      <div className="p-4 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon size={18} className="text-emerald-600" />
          <h2 className="text-base md:text-lg font-bold text-gray-800 font-['Fredoka']">
            {monthName} {currentYear}
          </h2>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={jumpToToday}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
          >
            Today
          </button>
          <button
            onClick={prevMonth}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
            title="Previous month"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={nextMonth}
            className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
            title="Next month"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* 2. Calendar Grid */}
      <div className="p-4 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm">
        {/* Weekday headers */}
        <div className="grid grid-cols-7 gap-1 md:gap-2 mb-2 text-center text-xs font-bold text-gray-400 uppercase tracking-wider">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
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
            const score = getDayScore(dateStr, scoringContext);

            // Shading style
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

                {/* Subtle indicator bar for completed vs scheduled */}
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
          })}
        </div>
      </div>

      {/* 3. Day Detail / Backfill Panel */}
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
                      Future (Read-only)
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {habitsOnSelectedDate.length} habits scheduled
                  {selectedDateScore !== null && ` • ${Math.round(selectedDateScore * 100)}% completed`}
                </p>
              </div>

              <button
                onClick={() => setSelectedDate(null)}
                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600"
              >
                <X size={16} />
              </button>
            </div>

            {/* Habit list for selected date */}
            {habitsOnSelectedDate.length === 0 ? (
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
                        {/* Checkbox */}
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

                      {/* Items */}
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
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
