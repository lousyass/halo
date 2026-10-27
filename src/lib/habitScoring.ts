/**
 * Pure scoring module for Halo Lifestyle Mode.
 * All habit math, credits, streaks, ratings, and goal progress live here.
 * Implements Section 4 of the spec.
 */

import { addDays, compareDates, getWeekday, isSameOrBefore } from './dateUtils';

export interface Goal {
  id: string;
  user_id?: string;
  title: string;
  description?: string | null;
  target_count?: number | null;
  deadline?: string | null;
  start_date: string;
  achieved_on?: string | null;
  archived_on?: string | null;
  created_at?: string;
}

export interface Habit {
  id: string;
  user_id?: string;
  name: string;
  category?: string | null;
  color?: string | null;
  icon?: string | null;
  goal_id?: string | null;
  start_date: string;
  archived_on?: string | null;
  sort_order: number;
  created_at?: string;
}

export interface HabitSchedule {
  id?: string;
  habit_id: string;
  effective_from: string;
  weekdays: number[]; // 0 = Sun, 1 = Mon, ..., 6 = Sat
}

export interface HabitItem {
  id: string;
  habit_id: string;
  title: string;
  weekdays?: number[] | null;
  start_date: string;
  archived_on?: string | null;
  sort_order: number;
}

export interface HabitCompletion {
  id?: string;
  habit_id: string;
  item_id?: string | null;
  log_date: string;
  status: 'done' | 'skipped';
}

export interface HabitPause {
  id?: string;
  habit_id: string;
  start_date: string;
  end_date?: string | null;
}

export interface ScoringContext {
  habits: Habit[];
  schedules: HabitSchedule[];
  items: HabitItem[];
  completions: HabitCompletion[];
  pauses: HabitPause[];
}

/**
 * Gets the schedule version in force for a habit on date D.
 * The row for habit_id with the greatest effective_from <= D.
 * Fallback to all 7 days if none found.
 */
export function getScheduleInForce(
  schedules: HabitSchedule[],
  habitId: string,
  date: string
): number[] {
  const habitSchedules = schedules
    .filter((s) => s.habit_id === habitId && compareDates(s.effective_from, date) <= 0)
    .sort((a, b) => compareDates(b.effective_from, a.effective_from));

  if (habitSchedules.length > 0) {
    return habitSchedules[0].weekdays;
  }
  return [0, 1, 2, 3, 4, 5, 6];
}

/**
 * Checks if a habit is covered by a pause on date D.
 */
export function isHabitPausedOnDate(
  pauses: HabitPause[],
  habitId: string,
  date: string
): boolean {
  return pauses.some(
    (p) =>
      p.habit_id === habitId &&
      compareDates(p.start_date, date) <= 0 &&
      (!p.end_date || compareDates(date, p.end_date) <= 0)
  );
}

/**
 * Checks if a habit has a habit-level 'skipped' completion on date D.
 */
export function isHabitSkippedOnDate(
  completions: HabitCompletion[],
  habitId: string,
  date: string
): boolean {
  return completions.some(
    (c) =>
      c.habit_id === habitId &&
      !c.item_id &&
      c.log_date === date &&
      c.status === 'skipped'
  );
}

/**
 * Checks if habit H is scheduled on date D according to Section 4:
 * H.start_date <= D,
 * H.archived_on is null or D < H.archived_on,
 * weekday of D is in schedule version in force on D,
 * no pause covers D,
 * H has no habit-level 'skipped' row on D.
 */
export function isHabitScheduledOnDate(
  habit: Habit,
  date: string,
  ctx: ScoringContext
): boolean {
  if (compareDates(habit.start_date, date) > 0) {
    return false;
  }
  if (habit.archived_on && compareDates(date, habit.archived_on) >= 0) {
    return false;
  }
  if (isHabitPausedOnDate(ctx.pauses, habit.id, date)) {
    return false;
  }
  if (isHabitSkippedOnDate(ctx.completions, habit.id, date)) {
    return false;
  }
  const weekdaysInForce = getScheduleInForce(ctx.schedules, habit.id, date);
  const weekday = getWeekday(date);
  return weekdaysInForce.includes(weekday);
}

/**
 * Returns routine items inside habit H that are scheduled on date D:
 * item.start_date <= D,
 * item.archived_on is null or D < item.archived_on,
 * item.weekdays is null or contains weekday of D.
 */
export function getScheduledItemsForHabit(
  items: HabitItem[],
  habitId: string,
  date: string
): HabitItem[] {
  const weekday = getWeekday(date);
  return items.filter(
    (item) =>
      item.habit_id === habitId &&
      compareDates(item.start_date, date) <= 0 &&
      (!item.archived_on || compareDates(date, item.archived_on) < 0) &&
      (!item.weekdays || item.weekdays.includes(weekday))
  );
}

/**
 * Credit of H on date D (0 to 1):
 * - If H has scheduled items on D: done scheduled items / scheduled items.
 * - If H has items defined but none are scheduled on D, or H has no items:
 *   1 if a habit-level done row exists on D, else 0.
 */
export function getHabitCreditOnDate(
  habit: Habit,
  date: string,
  ctx: ScoringContext
): number {
  if (!isHabitScheduledOnDate(habit, date, ctx)) {
    return 0;
  }

  const scheduledItems = getScheduledItemsForHabit(ctx.items, habit.id, date);

  if (scheduledItems.length > 0) {
    let doneCount = 0;
    for (const item of scheduledItems) {
      const isDone = ctx.completions.some(
        (c) =>
          c.item_id === item.id &&
          c.log_date === date &&
          c.status === 'done'
      );
      if (isDone) {
        doneCount++;
      }
    }
    return doneCount / scheduledItems.length;
  }

  // No scheduled items for this date, or no items at all:
  // Habit-level done row check
  const hasHabitDone = ctx.completions.some(
    (c) =>
      c.habit_id === habit.id &&
      !c.item_id &&
      c.log_date === date &&
      c.status === 'done'
  );
  return hasHabitDone ? 1 : 0;
}

/**
 * Day % for date D = mean of credits over habits scheduled on D.
 * If no habit is scheduled, D has no score (returns null).
 */
export function getDayScore(date: string, ctx: ScoringContext): number | null {
  const scheduledHabits = ctx.habits.filter((h) =>
    isHabitScheduledOnDate(h, date, ctx)
  );

  if (scheduledHabits.length === 0) {
    return null;
  }

  let totalCredit = 0;
  for (const habit of scheduledHabits) {
    totalCredit += getHabitCreditOnDate(habit, date, ctx);
  }
  return totalCredit / scheduledHabits.length;
}

/**
 * Per-habit streak calculation:
 * Walk back over days the habit was scheduled; skipped and paused days neither break
 * nor extend the streak; unscheduled weekdays are ignored; a day counts when credit is 1.
 * Today only counts once completed, and an unfinished today does not break the streak
 * (the streak is shown through yesterday until today ends).
 * Also computes best streak over the habit's lifetime up to today.
 */
export function getHabitStreak(
  habit: Habit,
  today: string,
  ctx: ScoringContext
): { currentStreak: number; bestStreak: number } {
  // If habit starts in the future, streaks are 0
  if (compareDates(habit.start_date, today) > 0) {
    return { currentStreak: 0, bestStreak: 0 };
  }

  // 1. Current streak
  let currentStreak = 0;
  let startCheckDate = today;

  // Check today first
  const weekdayInForceToday = getScheduleInForce(ctx.schedules, habit.id, today);
  const weekdayToday = getWeekday(today);
  const isWeekdayScheduledToday = weekdayInForceToday.includes(weekdayToday);
  const isPausedToday = isHabitPausedOnDate(ctx.pauses, habit.id, today);
  const isSkippedToday = isHabitSkippedOnDate(ctx.completions, habit.id, today);

  if (isWeekdayScheduledToday && !isPausedToday && !isSkippedToday) {
    const todayCredit = getHabitCreditOnDate(habit, today, ctx);
    if (todayCredit === 1) {
      currentStreak = 1;
    }
    // Unfinished today does not break the streak - we step back to yesterday
  }

  let d = addDays(today, -1);
  while (compareDates(d, habit.start_date) >= 0) {
    const isPaused = isHabitPausedOnDate(ctx.pauses, habit.id, d);
    const isSkipped = isHabitSkippedOnDate(ctx.completions, habit.id, d);

    // Skipped and paused days neither break nor extend the streak
    if (isPaused || isSkipped) {
      d = addDays(d, -1);
      continue;
    }

    const weekdaysInForce = getScheduleInForce(ctx.schedules, habit.id, d);
    const weekday = getWeekday(d);
    // Unscheduled weekdays are ignored
    if (!weekdaysInForce.includes(weekday)) {
      d = addDays(d, -1);
      continue;
    }

    // It was a scheduled day: check credit
    const credit = getHabitCreditOnDate(habit, d, ctx);
    if (credit === 1) {
      currentStreak++;
      d = addDays(d, -1);
    } else {
      // Streak broken
      break;
    }
  }

  // 2. Best streak over habit lifetime from start_date to today
  let bestStreak = 0;
  let runningStreak = 0;
  let curr = habit.start_date;

  while (compareDates(curr, today) <= 0) {
    const isToday = curr === today;
    const isPaused = isHabitPausedOnDate(ctx.pauses, habit.id, curr);
    const isSkipped = isHabitSkippedOnDate(ctx.completions, habit.id, curr);

    if (isPaused || isSkipped) {
      curr = addDays(curr, 1);
      continue;
    }

    const weekdaysInForce = getScheduleInForce(ctx.schedules, habit.id, curr);
    const weekday = getWeekday(curr);
    if (!weekdaysInForce.includes(weekday)) {
      curr = addDays(curr, 1);
      continue;
    }

    const credit = getHabitCreditOnDate(habit, curr, ctx);
    if (credit === 1) {
      runningStreak++;
      if (runningStreak > bestStreak) {
        bestStreak = runningStreak;
      }
    } else {
      if (!isToday) {
        runningStreak = 0;
      }
    }
    curr = addDays(curr, 1);
  }

  if (currentStreak > bestStreak) {
    bestStreak = currentStreak;
  }

  return { currentStreak, bestStreak };
}

/**
 * Active-day streak (overall):
 * Consecutive scored days with day % >= 50%.
 * Same today rule: today only counts if >= 50%; unfinished today does not break streak.
 */
export function getActiveDayStreak(
  today: string,
  earliestDate: string,
  ctx: ScoringContext
): { currentStreak: number; bestStreak: number } {
  let currentStreak = 0;

  // Check today
  const todayScore = getDayScore(today, ctx);
  if (todayScore !== null && todayScore >= 0.5) {
    currentStreak = 1;
  }

  // Walk back from yesterday
  let d = addDays(today, -1);
  while (compareDates(d, earliestDate) >= 0) {
    const score = getDayScore(d, ctx);
    if (score === null) {
      // Unscored day is ignored
      d = addDays(d, -1);
      continue;
    }

    if (score >= 0.5) {
      currentStreak++;
      d = addDays(d, -1);
    } else {
      break;
    }
  }

  // Best streak
  let bestStreak = 0;
  let running = 0;
  let curr = earliestDate;

  while (compareDates(curr, today) <= 0) {
    const isToday = curr === today;
    const score = getDayScore(curr, ctx);

    if (score === null) {
      curr = addDays(curr, 1);
      continue;
    }

    if (score >= 0.5) {
      running++;
      if (running > bestStreak) {
        bestStreak = running;
      }
    } else {
      if (!isToday) {
        running = 0;
      }
    }
    curr = addDays(curr, 1);
  }

  if (currentStreak > bestStreak) {
    bestStreak = currentStreak;
  }

  return { currentStreak, bestStreak };
}

export interface ProductivityRating {
  rating: number | null; // null if fewer than 7 scored days
  avgDayPercent: number; // 0 to 1
  activeDayShare: number; // 0 to 1
  scoredDaysCount: number;
  totalDaysInWindow: number;
}

/**
 * Productivity rating over a selectable window (7 / 30 / 90 days, default 30):
 * rating = round(100 * (0.7 * avgDayPercent + 0.3 * activeDayShare))
 * With fewer than 7 scored days show "Not enough data yet" (rating: null).
 */
export function calculateProductivityRating(
  today: string,
  windowDays: 7 | 30 | 90,
  ctx: ScoringContext
): ProductivityRating {
  const startDate = addDays(today, -(windowDays - 1));
  const scoredDays: number[] = [];

  let curr = startDate;
  while (compareDates(curr, today) <= 0) {
    const score = getDayScore(curr, ctx);
    if (score !== null) {
      scoredDays.push(score);
    }
    curr = addDays(curr, 1);
  }

  if (scoredDays.length < 7) {
    const sum = scoredDays.reduce((a, b) => a + b, 0);
    const avg = scoredDays.length > 0 ? sum / scoredDays.length : 0;
    const active = scoredDays.filter((s) => s >= 0.5).length;
    return {
      rating: null,
      avgDayPercent: avg,
      activeDayShare: scoredDays.length > 0 ? active / scoredDays.length : 0,
      scoredDaysCount: scoredDays.length,
      totalDaysInWindow: windowDays,
    };
  }

  const sum = scoredDays.reduce((a, b) => a + b, 0);
  const avgDayPercent = sum / scoredDays.length;
  const activeDays = scoredDays.filter((s) => s >= 0.5).length;
  const activeDayShare = activeDays / scoredDays.length;

  const rawRating = Math.round(100 * (0.7 * avgDayPercent + 0.3 * activeDayShare));
  const rating = Math.max(0, Math.min(100, rawRating));

  return {
    rating,
    avgDayPercent,
    activeDayShare,
    scoredDaysCount: scoredDays.length,
    totalDaysInWindow: windowDays,
  };
}

export interface GoalProgress {
  completedHabitDays: number;
  scheduledHabitDays: number;
  targetCount: number | null;
  percentage: number;
  targetReached: boolean;
  rate: number;
}

/**
 * Goal progress:
 * The number of habit-days with credit = 1 across the goal's linked habits,
 * from goal.start_date through today (or deadline if earlier), compared to target_count.
 * With no target_count, show the linked habits' overall completion rate over that period.
 */
export function calculateGoalProgress(
  goal: Goal,
  today: string,
  ctx: ScoringContext
): GoalProgress {
  const linkedHabits = ctx.habits.filter((h) => h.goal_id === goal.id);

  if (linkedHabits.length === 0) {
    return {
      completedHabitDays: 0,
      scheduledHabitDays: 0,
      targetCount: goal.target_count ?? null,
      percentage: 0,
      targetReached: false,
      rate: 0,
    };
  }

  // End date is min(today, goal.deadline || today)
  let endDate = today;
  if (goal.deadline && compareDates(goal.deadline, today) < 0) {
    endDate = goal.deadline;
  }

  let completedHabitDays = 0;
  let scheduledHabitDays = 0;

  let curr = goal.start_date;
  while (compareDates(curr, endDate) <= 0) {
    for (const habit of linkedHabits) {
      if (isHabitScheduledOnDate(habit, curr, ctx)) {
        scheduledHabitDays++;
        const credit = getHabitCreditOnDate(habit, curr, ctx);
        if (credit === 1) {
          completedHabitDays++;
        }
      }
    }
    curr = addDays(curr, 1);
  }

  if (goal.target_count && goal.target_count > 0) {
    const percentage = Math.min(
      100,
      Math.round((completedHabitDays / goal.target_count) * 100)
    );
    const targetReached = completedHabitDays >= goal.target_count;
    const rate = scheduledHabitDays > 0 ? completedHabitDays / scheduledHabitDays : 0;
    return {
      completedHabitDays,
      scheduledHabitDays,
      targetCount: goal.target_count,
      percentage,
      targetReached,
      rate,
    };
  }

  // No target_count: overall completion rate
  const rate = scheduledHabitDays > 0 ? completedHabitDays / scheduledHabitDays : 0;
  const percentage = Math.round(rate * 100);
  return {
    completedHabitDays,
    scheduledHabitDays,
    targetCount: null,
    percentage,
    targetReached: false,
    rate,
  };
}

export interface WeeklyReview {
  currentAverage: number;
  previousAverage: number;
  change: number; // current - previous
  perfectDaysCount: number; // day% === 1.0
  bestWeekday: number | null; // 0-6
  weakestHabit: {
    habit: Habit;
    completionRate: number;
    scheduledDays: number;
  } | null;
}

/**
 * Weekly review: "Last 7 days vs the 7 before"
 * Current: [today - 6, today]
 * Previous: [today - 13, today - 7]
 */
export function calculateWeeklyReview(
  today: string,
  ctx: ScoringContext
): WeeklyReview {
  const currentStart = addDays(today, -6);
  const previousStart = addDays(today, -13);
  const previousEnd = addDays(today, -7);

  // 1. Current 7 days scores
  const currentScores: number[] = [];
  let perfectDaysCount = 0;
  const weekdayTotals: { [key: number]: { sum: number; count: number } } = {};

  let curr = currentStart;
  while (compareDates(curr, today) <= 0) {
    const score = getDayScore(curr, ctx);
    const wd = getWeekday(curr);
    if (score !== null) {
      currentScores.push(score);
      if (score >= 0.999) {
        perfectDaysCount++;
      }
      if (!weekdayTotals[wd]) {
        weekdayTotals[wd] = { sum: 0, count: 0 };
      }
      weekdayTotals[wd].sum += score;
      weekdayTotals[wd].count++;
    }
    curr = addDays(curr, 1);
  }

  const currentAverage =
    currentScores.length > 0
      ? currentScores.reduce((a, b) => a + b, 0) / currentScores.length
      : 0;

  // 2. Previous 7 days scores
  const previousScores: number[] = [];
  curr = previousStart;
  while (compareDates(curr, previousEnd) <= 0) {
    const score = getDayScore(curr, ctx);
    if (score !== null) {
      previousScores.push(score);
    }
    curr = addDays(curr, 1);
  }

  const previousAverage =
    previousScores.length > 0
      ? previousScores.reduce((a, b) => a + b, 0) / previousScores.length
      : 0;

  const change = currentAverage - previousAverage;

  // 3. Best weekday
  let bestWeekday: number | null = null;
  let bestWdAvg = -1;
  for (let wd = 0; wd < 7; wd++) {
    if (weekdayTotals[wd] && weekdayTotals[wd].count > 0) {
      const avg = weekdayTotals[wd].sum / weekdayTotals[wd].count;
      if (avg > bestWdAvg) {
        bestWdAvg = avg;
        bestWeekday = wd;
      }
    }
  }

  // 4. Weakest habit (lowest completion rate among habits with at least 3 scheduled days in current 7 days)
  let weakestHabit: WeeklyReview['weakestHabit'] = null;
  let minRate = 2;

  for (const habit of ctx.habits) {
    let scheduled = 0;
    let completed = 0;
    let c = currentStart;
    while (compareDates(c, today) <= 0) {
      if (isHabitScheduledOnDate(habit, c, ctx)) {
        scheduled++;
        if (getHabitCreditOnDate(habit, c, ctx) === 1) {
          completed++;
        }
      }
      c = addDays(c, 1);
    }

    if (scheduled >= 3) {
      const rate = completed / scheduled;
      if (rate < minRate) {
        minRate = rate;
        weakestHabit = {
          habit,
          completionRate: rate,
          scheduledDays: scheduled,
        };
      }
    }
  }

  return {
    currentAverage,
    previousAverage,
    change,
    perfectDaysCount,
    bestWeekday,
    weakestHabit,
  };
}
