import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Flame,
  SkipForward,
  Sparkles,
  CircleAlert,
} from 'lucide-react';
import quotes from '../../data/quotes.json';
import {
  getDayScore,
  getHabitCreditOnDate,
  getHabitStreak,
  getScheduledItemsForHabit,
  isHabitScheduledOnDate,
  Habit,
} from '../../lib/habitScoring';
import { getDecorativeImage } from '../../lib/decorativeImages';
import { useLifestyle } from '../../lib/useLifestyle';

interface LifestyleTodayProps {
  userId: string;
  theme?: string;
  visualSettings?: any;
  onNavigateToHabits?: () => void;
}

export const LifestyleToday: React.FC<LifestyleTodayProps> = ({
  userId,
  theme = 'bloom',
  visualSettings,
  onNavigateToHabits,
}) => {
  const { state, scoringContext, store } = useLifestyle(userId);
  const { today } = state;

  const [expandedHabits, setExpandedHabits] = useState<Record<string, boolean>>({});

  // Deterministic Quote of the day from local date
  const quoteIndex = Math.abs(
    today
      .split('-')
      .reduce((acc, part) => (acc * 31 + parseInt(part, 10)) % quotes.length, 0)
  );
  const quote = quotes[quoteIndex] || quotes[0];

  // Habits scheduled today
  const scheduledHabits = state.habits.filter((h) =>
    isHabitScheduledOnDate(h, today, scoringContext)
  );

  // Group by category
  const categoriesMap = new Map<string, Habit[]>();
  for (const h of scheduledHabits) {
    const cat = h.category?.trim() || 'General';
    if (!categoriesMap.has(cat)) {
      categoriesMap.set(cat, []);
    }
    categoriesMap.get(cat)!.push(h);
  }

  // Today's score and counts
  const dayScore = getDayScore(today, scoringContext);
  const percentage = dayScore !== null ? Math.round(dayScore * 100) : 0;

  let completedHabitsCount = 0;
  for (const h of scheduledHabits) {
    if (getHabitCreditOnDate(h, today, scoringContext) >= 0.999) {
      completedHabitsCount++;
    }
  }

  const toggleExpand = (id: string) => {
    setExpandedHabits((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // SVG Ring calculation
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (percentage / 100) * circumference;

  // Background image for dashboard-style panel in Custom visual mode
  const isCustomMode = visualSettings?.mode === 'custom';
  const dashboardBg = isCustomMode && visualSettings?.dashboard_all_tasks !== false
    ? getDecorativeImage('dashboard-lower', theme, visualSettings?.dashboard_same_image)
    : null;

  return (
    <div className="space-y-6">
      {/* Error Notice */}
      {state.error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <CircleAlert size={16} className="shrink-0 text-rose-500" />
            <span className="font-medium">{state.error}</span>
          </div>
          <button
            type="button"
            onClick={() => store.clearError()}
            className="text-rose-600 hover:text-rose-800 font-bold ml-2 underline cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* 1. Today's Flow Progress Ring Card (Full Width at Top) */}
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full p-5 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm flex items-center justify-around sm:justify-start sm:gap-8"
      >
        <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r={radius}
              className="stroke-gray-200/70"
              strokeWidth="8"
              fill="transparent"
            />
            <motion.circle
              cx="50"
              cy="50"
              r={radius}
              className="stroke-emerald-500"
              strokeWidth="8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              strokeLinecap="round"
              fill="transparent"
              initial={false}
              animate={{ strokeDashoffset: strokeOffset }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
            />
          </svg>
          <div className="absolute flex flex-col items-center justify-center text-center">
            <span className="text-2xl font-bold text-gray-800 font-['Fredoka']">
              {percentage}%
            </span>
            <span className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">
              Done
            </span>
          </div>
        </div>

        <div className="space-y-1">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wider">
            Today's Flow
          </p>
          <h3 className="text-xl font-bold text-gray-800 font-['Fredoka']">
            {completedHabitsCount} of {scheduledHabits.length}
          </h3>
          <p className="text-xs text-gray-500">
            {scheduledHabits.length === 0
              ? 'No habits due'
              : percentage === 100
              ? 'All complete! 🎉'
              : `${scheduledHabits.length - completedHabitsCount} remaining`}
          </p>
        </div>
      </motion.div>

      {/* 2. Scheduled Habits Checklist (Dashboard-style panel like Academics All Tasks) */}
      <div className="relative rounded-3xl bg-white/80 shadow-[0_4px_18px_rgba(120,90,130,0.12)] border border-white/60 p-5 overflow-hidden">
        {/* Tape sticker decoration matching Academics */}
        <div
          className="absolute -top-2 left-6 w-10 h-4 rounded-sm opacity-70 pointer-events-none"
          style={{
            background:
              'repeating-linear-gradient(45deg,rgba(255,255,255,.6),rgba(255,255,255,.6) 4px,rgba(230,200,215,.55) 4px,rgba(230,200,215,.55) 8px)',
            transform: 'rotate(-4deg)',
          }}
        />

        {/* Decorative backdrop when in custom style */}
        {dashboardBg && (
          <div
            className="absolute inset-0 pointer-events-none z-0 bg-cover bg-center rounded-3xl transition-opacity duration-500"
            style={{
              backgroundImage: `url("${dashboardBg}")`,
              opacity: 0.25,
            }}
          />
        )}

        <div className="relative z-10 space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-black/5">
            <h3
              className="font-bold text-base text-gray-800 font-['Fredoka'] flex items-center gap-2"
              style={{ color: '#5B4B6D' }}
            >
              <span>🌱</span> Today's Habits
            </h3>
            <span className="text-xs text-gray-500 font-medium">
              {scheduledHabits.length} scheduled
            </span>
          </div>

          {/* Internal scrollable list with fixed max height */}
          <div className="max-h-[520px] overflow-y-auto pr-1 space-y-4">
            {scheduledHabits.length === 0 ? (
              <div className="p-8 rounded-2xl bg-white/70 backdrop-blur-xs border border-white/60 text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-xl">
                  🌿
                </div>
                <h4 className="text-sm font-bold text-gray-800 mb-1 font-['Fredoka']">
                  Nothing scheduled for today
                </h4>
                <p className="text-xs text-gray-500 max-w-sm mx-auto mb-3">
                  Enjoy your free time, or set up a new habit to start building positive routines!
                </p>
                {onNavigateToHabits && (
                  <button
                    onClick={onNavigateToHabits}
                    className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    Create a Habit
                  </button>
                )}
              </div>
            ) : (
              Array.from(categoriesMap.entries()).map(([category, habits]) => (
                <div key={category} className="space-y-2">
                  <h4 className="text-[11px] font-bold text-gray-500 uppercase tracking-wider px-1">
                    {category}
                  </h4>
                  <div className="space-y-2">
                    {habits.map((habit) => {
                      const credit = getHabitCreditOnDate(habit, today, scoringContext);
                      const isDone = credit >= 0.999;
                      const scheduledItems = getScheduledItemsForHabit(
                        state.items,
                        habit.id,
                        today
                      );
                      const hasItems = scheduledItems.length > 0;
                      const isExpanded = !!expandedHabits[habit.id];
                      const streak = getHabitStreak(habit, today, scoringContext);

                      return (
                        <div
                          key={habit.id}
                          className={`p-3 rounded-2xl bg-white/85 backdrop-blur-xs border transition-all ${
                            isDone
                              ? 'border-emerald-200/80 bg-emerald-50/40'
                              : 'border-white/80 hover:border-gray-200'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            {/* Checkbox */}
                            <button
                              type="button"
                              onClick={() => store.toggleHabit(habit.id, today)}
                              className={`w-6 h-6 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                                isDone
                                  ? 'bg-emerald-500 text-white shadow-xs'
                                  : credit > 0
                                  ? 'border-2 border-emerald-400 bg-emerald-50 text-emerald-600'
                                  : 'border-2 border-gray-300 hover:border-gray-400 bg-white'
                              }`}
                            >
                              {isDone ? (
                                <Check size={14} strokeWidth={3} />
                              ) : credit > 0 ? (
                                <span className="text-[10px] font-bold">
                                  {Math.round(credit * 100)}%
                                </span>
                              ) : null}
                            </button>

                            {/* Habit Icon & Name */}
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              {habit.icon && <span className="text-base">{habit.icon}</span>}
                              <span
                                className={`text-sm font-semibold truncate ${
                                  isDone ? 'line-through text-gray-400' : 'text-gray-800'
                                }`}
                              >
                                {habit.name}
                              </span>

                              {/* Streak Badge */}
                              {streak.currentStreak > 0 && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                                  <Flame size={11} className="text-amber-500 fill-amber-500" />
                                  {streak.currentStreak}
                                </span>
                              )}
                            </div>

                            {/* Routine items toggle button if any */}
                            {hasItems && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(habit.id)}
                                className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500 text-xs flex items-center gap-1 transition-colors cursor-pointer"
                              >
                                <span className="text-[11px] font-medium hidden sm:inline">
                                  {scheduledItems.filter((i) =>
                                    state.completions.some(
                                      (c) =>
                                        c.item_id === i.id &&
                                        c.log_date === today &&
                                        c.status === 'done'
                                    )
                                  ).length}
                                  /{scheduledItems.length}
                                </span>
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            )}

                            {/* Skip Button */}
                            <button
                              type="button"
                              onClick={() => store.skipHabit(habit.id, today)}
                              title="Skip habit for today"
                              className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                            >
                              <SkipForward size={14} />
                            </button>
                          </div>

                          {/* Expandable Routine Items */}
                          <AnimatePresence>
                            {hasItems && isExpanded && (
                              <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mt-3 pt-3 border-t border-gray-100 pl-8 space-y-2 overflow-hidden"
                              >
                                {scheduledItems.map((item) => {
                                  const itemDone = state.completions.some(
                                    (c) =>
                                      c.item_id === item.id &&
                                      c.log_date === today &&
                                      c.status === 'done'
                                  );

                                  return (
                                    <div
                                      key={item.id}
                                      className="flex items-center gap-2.5 py-0.5"
                                    >
                                      <button
                                        type="button"
                                        onClick={() =>
                                          store.toggleItem(habit.id, item.id, today)
                                        }
                                        className={`w-4 h-4 rounded-md flex items-center justify-center transition-all cursor-pointer ${
                                          itemDone
                                            ? 'bg-emerald-500 text-white'
                                            : 'border border-gray-300 hover:border-gray-400 bg-white'
                                        }`}
                                      >
                                        {itemDone && <Check size={10} strokeWidth={3} />}
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
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 3. Daily Inspiration Quote (Moved to the bottom as the last card) */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-5 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm relative overflow-hidden"
      >
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-2xl bg-amber-100/70 text-amber-700 shrink-0">
            <Sparkles size={18} />
          </div>
          <div className="flex-1">
            <p className="text-xs font-semibold tracking-wider uppercase text-amber-700/80 mb-1">
              Daily Inspiration
            </p>
            <p className="text-gray-800 text-sm md:text-base italic font-medium leading-relaxed">
              "{quote.text}"
            </p>
            <p className="text-gray-500 text-xs mt-1 font-semibold">— {quote.author}</p>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
