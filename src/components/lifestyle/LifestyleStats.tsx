import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import {
  Flame,
  TrendingUp,
  TrendingDown,
  Award,
  Sparkles,
  BarChart2,
  Calendar,
  Layers,
} from 'lucide-react';
import {
  calculateProductivityRating,
  calculateWeeklyReview,
  getActiveDayStreak,
  getDayScore,
  getHabitCreditOnDate,
  getHabitStreak,
  isHabitScheduledOnDate,
  Habit,
} from '../../lib/habitScoring';
import { addDays, compareDates, formatDisplayDate, getWeekday } from '../../lib/dateUtils';
import { useLifestyle } from '../../lib/useLifestyle';

interface LifestyleStatsProps {
  userId: string;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const LifestyleStats: React.FC<LifestyleStatsProps> = ({ userId }) => {
  const { state, scoringContext } = useLifestyle(userId);
  const { today } = state;

  const [ratingWindow, setRatingWindow] = useState<7 | 30 | 90>(30);

  // 1. Productivity Rating & Breakdown
  const ratingData = calculateProductivityRating(today, ratingWindow, scoringContext);
  const earliestHabitDate =
    state.habits.length > 0
      ? state.habits.reduce(
          (earliest, h) => (compareDates(h.start_date, earliest) < 0 ? h.start_date : earliest),
          today
        )
      : today;
  const activeStreaks = getActiveDayStreak(today, earliestHabitDate, scoringContext);

  // 2. Weekly Review (Last 7d vs Previous 7d)
  const weeklyReview = calculateWeeklyReview(today, scoringContext);

  // 3. 365-day Heatmap Data
  // 52 weeks * 7 days = 364 days back + today = 365 days
  const heatmapStartDate = addDays(today, -364);
  const heatmapDays: Array<{
    date: string;
    dayNum: number;
    weekday: number;
    score: number | null;
  }> = [];

  let d = heatmapStartDate;
  while (compareDates(d, today) <= 0) {
    const score = getDayScore(d, scoringContext);
    const [y, m, day] = d.split('-').map(Number);
    heatmapDays.push({
      date: d,
      dayNum: day,
      weekday: getWeekday(d),
      score,
    });
    d = addDays(d, 1);
  }

  // Group into weeks (columns of 7 days)
  const weeks: Array<typeof heatmapDays> = [];
  let currentWeek: typeof heatmapDays = [];
  // Align first day to its weekday
  const firstWd = heatmapDays[0].weekday;
  for (let i = 0; i < firstWd; i++) {
    currentWeek.push({
      date: '',
      dayNum: 0,
      weekday: i,
      score: null,
    });
  }
  for (const dayItem of heatmapDays) {
    currentWeek.push(dayItem);
    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }
  }
  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  // 4. Weekday Average Bar Chart Data
  // Calculate average % for each weekday in the selected rating window
  const windowStartDate = addDays(today, -(ratingWindow - 1));
  const weekdayStats = [0, 1, 2, 3, 4, 5, 6].map((wd) => {
    let sum = 0;
    let count = 0;
    let cur = windowStartDate;
    while (compareDates(cur, today) <= 0) {
      if (getWeekday(cur) === wd) {
        const score = getDayScore(cur, scoringContext);
        if (score !== null) {
          sum += score;
          count++;
        }
      }
      cur = addDays(cur, 1);
    }
    const avg = count > 0 ? Math.round((sum / count) * 100) : 0;
    return {
      day: WEEKDAY_NAMES[wd],
      avg,
      count,
    };
  });

  // 5. Per-Habit Completion Rate in Window
  const habitStats = state.habits
    .filter((h) => !h.archived_on)
    .map((habit) => {
      let scheduledCount = 0;
      let completedCount = 0;
      let cur = windowStartDate;
      while (compareDates(cur, today) <= 0) {
        if (isHabitScheduledOnDate(habit, cur, scoringContext)) {
          scheduledCount++;
          if (getHabitCreditOnDate(habit, cur, scoringContext) >= 0.999) {
            completedCount++;
          }
        }
        cur = addDays(cur, 1);
      }
      const rate = scheduledCount > 0 ? Math.round((completedCount / scheduledCount) * 100) : 0;
      const streak = getHabitStreak(habit, today, scoringContext);
      return {
        habit,
        scheduledCount,
        completedCount,
        rate,
        streak,
      };
    })
    .sort((a, b) => b.rate - a.rate);

  // Category breakdown
  const categoryMap: Record<string, { totalRate: number; count: number }> = {};
  for (const hs of habitStats) {
    const cat = hs.habit.category?.trim() || 'General';
    if (!categoryMap[cat]) {
      categoryMap[cat] = { totalRate: 0, count: 0 };
    }
    categoryMap[cat].totalRate += hs.rate;
    categoryMap[cat].count++;
  }
  const categoryStats = Object.entries(categoryMap).map(([category, data]) => ({
    category,
    avgRate: Math.round(data.totalRate / data.count),
    habitsCount: data.count,
  }));

  return (
    <div className="space-y-6">
      {/* 1. Rating Card with Window Selector & Breakdown */}
      <div className="p-6 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base md:text-lg font-bold text-gray-800 font-['Fredoka'] flex items-center gap-2">
              <Sparkles size={18} className="text-emerald-600" />
              Productivity Rating
            </h2>
            <p className="text-xs text-gray-500">
              Balanced score combining average completion rate (70%) and active-day consistency (30%)
            </p>
          </div>

          {/* Window Selector */}
          <div className="flex items-center gap-1 p-1 rounded-2xl bg-gray-100/80 self-start sm:self-center">
            {([7, 30, 90] as const).map((w) => (
              <button
                key={w}
                type="button"
                onClick={() => setRatingWindow(w)}
                className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                  ratingWindow === w
                    ? 'bg-white text-gray-800 shadow-sm'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {w}d
              </button>
            ))}
          </div>
        </div>

        {/* Rating Score & Key Metrics */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {/* Main Score */}
          <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/60 flex flex-col justify-center items-center text-center sm:col-span-2 lg:col-span-1">
            <span className="text-xs font-semibold text-emerald-800/80 uppercase tracking-wider">
              {ratingWindow}-Day Rating
            </span>
            <div className="text-3xl font-bold text-emerald-950 font-['Fredoka'] my-1">
              {ratingData.rating !== null ? ratingData.rating : '—'}
            </div>
            <span className="text-[11px] text-emerald-800/70 font-medium">
              {ratingData.rating !== null
                ? 'Out of 100'
                : 'Not enough data yet (need 7+ scored days)'}
            </span>
          </div>

          {/* Metric 1: Avg Completion */}
          <div className="p-4 rounded-2xl bg-white/80 border border-gray-100 flex flex-col justify-center">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Average Completion
            </span>
            <span className="text-xl font-bold text-gray-800 font-['Fredoka'] mt-1">
              {Math.round(ratingData.avgDayPercent * 100)}%
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5">Over all scored days</span>
          </div>

          {/* Metric 2: Active Day Share */}
          <div className="p-4 rounded-2xl bg-white/80 border border-gray-100 flex flex-col justify-center">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Active-Day Share
            </span>
            <span className="text-xl font-bold text-gray-800 font-['Fredoka'] mt-1">
              {Math.round(ratingData.activeDayShare * 100)}%
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5">Days with ≥50% completed</span>
          </div>

          {/* Metric 3: Active-Day Streak */}
          <div className="p-4 rounded-2xl bg-white/80 border border-gray-100 flex flex-col justify-center">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Active Streak
            </span>
            <span className="text-xl font-bold text-amber-600 font-['Fredoka'] mt-1 flex items-center gap-1">
              <Flame size={18} className="fill-amber-500" />
              {activeStreaks.currentStreak}d
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5">Consecutive ≥50% days</span>
          </div>

          {/* Metric 4: Best Streak */}
          <div className="p-4 rounded-2xl bg-white/80 border border-gray-100 flex flex-col justify-center">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Best Active Streak
            </span>
            <span className="text-xl font-bold text-purple-600 font-['Fredoka'] mt-1 flex items-center gap-1">
              <Award size={18} />
              {activeStreaks.bestStreak}d
            </span>
            <span className="text-[10px] text-gray-400 mt-0.5">All-time record</span>
          </div>
        </div>
      </div>

      {/* 2. Last 7 Days vs Previous 7 Days Review Card */}
      <div className="p-6 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-gray-800 font-['Fredoka'] flex items-center gap-2">
          <span>📊</span>
          Weekly Review (Last 7 Days vs Previous 7)
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Average & Change */}
          <div className="p-4 rounded-2xl bg-white/80 border border-gray-100">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Weekly Average
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold text-gray-800 font-['Fredoka']">
                {Math.round(weeklyReview.currentAverage * 100)}%
              </span>
              <span
                className={`text-xs font-bold flex items-center gap-0.5 ${
                  weeklyReview.change >= 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {weeklyReview.change >= 0 ? <TrendingUp size={13} /> : <TrendingDown size={13} />}
                {weeklyReview.change >= 0 ? '+' : ''}
                {Math.round(weeklyReview.change * 100)}%
              </span>
            </div>
            <span className="text-[10px] text-gray-400 mt-0.5 block">
              Previous week: {Math.round(weeklyReview.previousAverage * 100)}%
            </span>
          </div>

          {/* Perfect Days */}
          <div className="p-4 rounded-2xl bg-white/80 border border-gray-100">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Perfect Days
            </span>
            <div className="text-2xl font-bold text-gray-800 font-['Fredoka'] mt-1">
              {weeklyReview.perfectDaysCount} of 7
            </div>
            <span className="text-[10px] text-gray-400 mt-0.5 block">100% completed habit days</span>
          </div>

          {/* Best Weekday */}
          <div className="p-4 rounded-2xl bg-white/80 border border-gray-100">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Best Day of Week
            </span>
            <div className="text-2xl font-bold text-emerald-700 font-['Fredoka'] mt-1">
              {weeklyReview.bestWeekday !== null ? WEEKDAY_NAMES[weeklyReview.bestWeekday] : '—'}
            </div>
            <span className="text-[10px] text-gray-400 mt-0.5 block">Highest completion rate</span>
          </div>

          {/* Habit Needing Love */}
          <div className="p-4 rounded-2xl bg-white/80 border border-gray-100">
            <span className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              Focus Habit
            </span>
            <div className="text-sm font-bold text-gray-800 truncate mt-1">
              {weeklyReview.weakestHabit
                ? weeklyReview.weakestHabit.habit.name
                : 'All doing great!'}
            </div>
            <span className="text-[10px] text-gray-400 mt-0.5 block">
              {weeklyReview.weakestHabit
                ? `${Math.round(weeklyReview.weakestHabit.completionRate * 100)}% completion in week`
                : '≥3 days scheduled'}
            </span>
          </div>
        </div>
      </div>

      {/* 3. 365-day Day % Heatmap */}
      <div className="p-6 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm space-y-4 overflow-hidden">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-gray-800 font-['Fredoka'] flex items-center gap-2">
            <Calendar size={18} className="text-emerald-600" />
            365-Day Activity Heatmap
          </h3>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
            <span>Less</span>
            <div className="w-2.5 h-2.5 rounded-sm bg-gray-200" />
            <div className="w-2.5 h-2.5 rounded-sm bg-amber-200" />
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-300" />
            <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span>More</span>
          </div>
        </div>

        {/* Scrollable Heatmap Grid */}
        <div className="overflow-x-auto pb-2">
          <div className="inline-flex gap-1">
            {weeks.map((week, wIdx) => (
              <div key={wIdx} className="flex flex-col gap-1">
                {week.map((item, dIdx) => {
                  if (!item.date) {
                    return <div key={dIdx} className="w-3 h-3 rounded-sm opacity-0" />;
                  }

                  let colorClass = 'bg-gray-100 border-gray-200';
                  if (item.score !== null) {
                    if (item.score >= 0.999) {
                      colorClass = 'bg-emerald-500 border-emerald-600';
                    } else if (item.score >= 0.5) {
                      colorClass = 'bg-emerald-300 border-emerald-400';
                    } else if (item.score > 0) {
                      colorClass = 'bg-amber-200 border-amber-300';
                    } else {
                      colorClass = 'bg-rose-100 border-rose-200';
                    }
                  }

                  const titleText = `${item.date}: ${
                    item.score !== null ? `${Math.round(item.score * 100)}% complete` : 'No habits scheduled'
                  }`;

                  return (
                    <div
                      key={item.date}
                      title={titleText}
                      className={`w-3 h-3 rounded-sm border cursor-pointer transition-transform hover:scale-125 ${colorClass}`}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 4. Weekday Average Bar Chart & Category Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Weekday Bar Chart */}
        <div className="p-6 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-gray-800 font-['Fredoka'] flex items-center gap-2">
            <BarChart2 size={18} className="text-emerald-600" />
            Average Completion by Weekday
          </h3>
          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekdayStats}>
                <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                <YAxis unit="%" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <RechartsTooltip
                  formatter={(val: any) => [`${val}%`, 'Average Completion']}
                  contentStyle={{
                    borderRadius: '1rem',
                    background: 'rgba(255, 255, 255, 0.95)',
                    border: '1px solid rgba(0,0,0,0.08)',
                    fontSize: '12px',
                  }}
                />
                <Bar dataKey="avg" radius={[8, 8, 0, 0]}>
                  {weekdayStats.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.avg >= 70 ? '#10B981' : entry.avg >= 40 ? '#34D399' : '#CBD5E1'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Category Breakdown */}
        <div className="p-6 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-gray-800 font-['Fredoka'] flex items-center gap-2">
            <Layers size={18} className="text-emerald-600" />
            Category Performance
          </h3>

          <div className="space-y-3">
            {categoryStats.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No categories tracked yet.</p>
            ) : (
              categoryStats.map((cs) => (
                <div key={cs.category} className="space-y-1">
                  <div className="flex justify-between text-xs font-semibold text-gray-700">
                    <span>
                      {cs.category} ({cs.habitsCount})
                    </span>
                    <span>{cs.avgRate}%</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${cs.avgRate}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 5. Habit Completion Table */}
      <div className="p-6 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm space-y-4">
        <h3 className="text-base font-bold text-gray-800 font-['Fredoka']">
          Habit Performance Summary
        </h3>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-100 text-gray-400 uppercase tracking-wider text-[10px]">
                <th className="pb-3 font-bold">Habit</th>
                <th className="pb-3 font-bold">Category</th>
                <th className="pb-3 font-bold">Completion Rate</th>
                <th className="pb-3 font-bold">Current Streak</th>
                <th className="pb-3 font-bold">Best Streak</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {habitStats.map((hs) => (
                <tr key={hs.habit.id} className="hover:bg-white/50">
                  <td className="py-3 font-semibold text-gray-800 flex items-center gap-2">
                    {hs.habit.icon && <span>{hs.habit.icon}</span>}
                    {hs.habit.name}
                  </td>
                  <td className="py-3 text-gray-500">{hs.habit.category || 'General'}</td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-700 w-8">{hs.rate}%</span>
                      <div className="w-20 bg-gray-100 rounded-full h-1.5 overflow-hidden hidden sm:block">
                        <div
                          className="bg-emerald-500 h-full rounded-full"
                          style={{ width: `${hs.rate}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="py-3 text-amber-700 font-bold">
                    {hs.streak.currentStreak > 0 ? `🔥 ${hs.streak.currentStreak}d` : '—'}
                  </td>
                  <td className="py-3 text-purple-700 font-bold">
                    {hs.streak.bestStreak > 0 ? `🏆 ${hs.streak.bestStreak}d` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
