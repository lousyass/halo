import { describe, it, expect } from 'vitest';
import {
  calculateGoalProgress,
  calculateProductivityRating,
  calculateWeeklyReview,
  getActiveDayStreak,
  getDayScore,
  getHabitCreditOnDate,
  getHabitStreak,
  getScheduleInForce,
  isHabitScheduledOnDate,
  Goal,
  Habit,
  HabitCompletion,
  HabitItem,
  HabitPause,
  HabitSchedule,
  ScoringContext,
} from './habitScoring';
import { addDays, getWeekday } from './dateUtils';

describe('habitScoring', () => {
  const baseHabit: Habit = {
    id: 'habit-1',
    name: 'Workout',
    start_date: '2026-03-01',
    sort_order: 0,
  };

  it('schedule-version change mid-week leaves earlier days unchanged', () => {
    // 2026-03-01 (Sun) to 2026-03-07 (Sat)
    // Version 1 (effective 2026-03-01): Mon, Wed, Fri [1, 3, 5]
    // Version 2 (effective 2026-03-04 Wed): Tue, Thu [2, 4]
    const schedules: HabitSchedule[] = [
      { habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [1, 3, 5] },
      { habit_id: 'habit-1', effective_from: '2026-03-04', weekdays: [2, 4] },
    ];

    // On 2026-03-02 (Mon), schedule in force is version 1 [1, 3, 5] -> scheduled
    expect(getScheduleInForce(schedules, 'habit-1', '2026-03-02')).toEqual([1, 3, 5]);
    expect(isHabitScheduledOnDate(baseHabit, '2026-03-02', {
      habits: [baseHabit],
      schedules,
      items: [],
      completions: [],
      pauses: [],
    })).toBe(true);

    // On 2026-03-03 (Tue), schedule in force is version 1 [1, 3, 5] -> NOT scheduled
    expect(isHabitScheduledOnDate(baseHabit, '2026-03-03', {
      habits: [baseHabit],
      schedules,
      items: [],
      completions: [],
      pauses: [],
    })).toBe(false);

    // On 2026-03-05 (Thu), schedule in force is version 2 [2, 4] -> scheduled
    expect(getScheduleInForce(schedules, 'habit-1', '2026-03-05')).toEqual([2, 4]);
    expect(isHabitScheduledOnDate(baseHabit, '2026-03-05', {
      habits: [baseHabit],
      schedules,
      items: [],
      completions: [],
      pauses: [],
    })).toBe(true);

    // On 2026-03-06 (Fri), schedule in force is version 2 [2, 4] -> NOT scheduled (even though version 1 had Fri)
    expect(isHabitScheduledOnDate(baseHabit, '2026-03-06', {
      habits: [baseHabit],
      schedules,
      items: [],
      completions: [],
      pauses: [],
    })).toBe(false);
  });

  it('habit created mid-month is not scored before start_date', () => {
    const midMonthHabit: Habit = {
      id: 'h-mid',
      name: 'Read',
      start_date: '2026-03-15',
      sort_order: 0,
    };
    const ctx: ScoringContext = {
      habits: [midMonthHabit],
      schedules: [{ habit_id: 'h-mid', effective_from: '2026-03-15', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items: [],
      completions: [],
      pauses: [],
    };

    // Before start_date: not scheduled, day score is null (unscored)
    expect(isHabitScheduledOnDate(midMonthHabit, '2026-03-14', ctx)).toBe(false);
    expect(getDayScore('2026-03-14', ctx)).toBeNull();

    // On/after start_date: scheduled
    expect(isHabitScheduledOnDate(midMonthHabit, '2026-03-15', ctx)).toBe(true);
    expect(getDayScore('2026-03-15', ctx)).toBe(0); // 0 credit because not completed
  });

  it('archived habit keeps history before archived_on and is not scheduled on or after archived_on', () => {
    const archivedHabit: Habit = {
      id: 'h-archived',
      name: 'Journal',
      start_date: '2026-03-01',
      archived_on: '2026-03-10',
      sort_order: 0,
    };
    const completions: HabitCompletion[] = [
      { habit_id: 'h-archived', log_date: '2026-03-05', status: 'done' },
    ];
    const ctx: ScoringContext = {
      habits: [archivedHabit],
      schedules: [{ habit_id: 'h-archived', effective_from: '2026-03-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items: [],
      completions,
      pauses: [],
    };

    // Before archived_on: history kept, scored
    expect(isHabitScheduledOnDate(archivedHabit, '2026-03-05', ctx)).toBe(true);
    expect(getHabitCreditOnDate(archivedHabit, '2026-03-05', ctx)).toBe(1);
    expect(getDayScore('2026-03-05', ctx)).toBe(1);

    // On and after archived_on: not scheduled
    expect(isHabitScheduledOnDate(archivedHabit, '2026-03-10', ctx)).toBe(false);
    expect(isHabitScheduledOnDate(archivedHabit, '2026-03-11', ctx)).toBe(false);
    expect(getDayScore('2026-03-10', ctx)).toBeNull();
  });

  it('pause range excludes days from being scheduled and scored', () => {
    const pauses: HabitPause[] = [
      { habit_id: 'habit-1', start_date: '2026-03-05', end_date: '2026-03-07' },
    ];
    const ctx: ScoringContext = {
      habits: [baseHabit],
      schedules: [{ habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items: [],
      completions: [],
      pauses,
    };

    expect(isHabitScheduledOnDate(baseHabit, '2026-03-04', ctx)).toBe(true);
    expect(isHabitScheduledOnDate(baseHabit, '2026-03-05', ctx)).toBe(false);
    expect(isHabitScheduledOnDate(baseHabit, '2026-03-06', ctx)).toBe(false);
    expect(isHabitScheduledOnDate(baseHabit, '2026-03-07', ctx)).toBe(false);
    expect(isHabitScheduledOnDate(baseHabit, '2026-03-08', ctx)).toBe(true);
  });

  it('skipped day is excluded and does not break a streak', () => {
    // Mon 03-02: Done
    // Tue 03-03: Skipped
    // Wed 03-04: Done
    const completions: HabitCompletion[] = [
      { habit_id: 'habit-1', log_date: '2026-03-02', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-03', status: 'skipped' },
      { habit_id: 'habit-1', log_date: '2026-03-04', status: 'done' },
    ];
    const ctx: ScoringContext = {
      habits: [baseHabit],
      schedules: [{ habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items: [],
      completions,
      pauses: [],
    };

    // Tue 03-03 was skipped -> habit is excluded
    expect(isHabitScheduledOnDate(baseHabit, '2026-03-03', ctx)).toBe(false);

    // Streak on 2026-03-04: 03-04 (done) + 03-03 (skipped: neither breaks nor extends) + 03-02 (done) = 2!
    const { currentStreak, bestStreak } = getHabitStreak(baseHabit, '2026-03-04', ctx);
    expect(currentStreak).toBe(2);
    expect(bestStreak).toBe(2);
  });

  it('item partial credit computes (done scheduled items / scheduled items)', () => {
    const items: HabitItem[] = [
      { id: 'i1', habit_id: 'habit-1', title: 'Cardio', start_date: '2026-03-01', sort_order: 0 },
      { id: 'i2', habit_id: 'habit-1', title: 'Weights', start_date: '2026-03-01', sort_order: 1 },
      { id: 'i3', habit_id: 'habit-1', title: 'Stretch', start_date: '2026-03-01', sort_order: 2 },
    ];
    // Complete 2 of 3 items on 2026-03-02
    const completions: HabitCompletion[] = [
      { habit_id: 'habit-1', item_id: 'i1', log_date: '2026-03-02', status: 'done' },
      { habit_id: 'habit-1', item_id: 'i3', log_date: '2026-03-02', status: 'done' },
    ];
    const ctx: ScoringContext = {
      habits: [baseHabit],
      schedules: [{ habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items,
      completions,
      pauses: [],
    };

    const credit = getHabitCreditOnDate(baseHabit, '2026-03-02', ctx);
    expect(credit).toBeCloseTo(2 / 3, 5);
  });

  it('habit with items but none scheduled falls back to habit-level row', () => {
    // i1 is only scheduled on Mondays [1]
    const items: HabitItem[] = [
      { id: 'i1', habit_id: 'habit-1', title: 'Monday routine', weekdays: [1], start_date: '2026-03-01', sort_order: 0 },
    ];
    // On 2026-03-03 (Tue), i1 is NOT scheduled.
    // Completing habit at habit-level (item_id null) on Tuesday:
    const completions: HabitCompletion[] = [
      { habit_id: 'habit-1', item_id: null, log_date: '2026-03-03', status: 'done' },
    ];
    const ctx: ScoringContext = {
      habits: [baseHabit],
      schedules: [{ habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items,
      completions,
      pauses: [],
    };

    const credit = getHabitCreditOnDate(baseHabit, '2026-03-03', ctx);
    expect(credit).toBe(1);
  });

  it('streak ignores unscheduled weekdays', () => {
    // Habit scheduled on Mon (1), Wed (3), Fri (5)
    // 2026-03-02 (Mon): Done
    // 2026-03-03 (Tue): Unscheduled
    // 2026-03-04 (Wed): Done
    // 2026-03-05 (Thu): Unscheduled
    // 2026-03-06 (Fri): Done
    const schedules: HabitSchedule[] = [
      { habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [1, 3, 5] },
    ];
    const completions: HabitCompletion[] = [
      { habit_id: 'habit-1', log_date: '2026-03-02', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-04', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-06', status: 'done' },
    ];
    const ctx: ScoringContext = {
      habits: [baseHabit],
      schedules,
      items: [],
      completions,
      pauses: [],
    };

    // Check streak on Friday 2026-03-06
    const { currentStreak, bestStreak } = getHabitStreak(baseHabit, '2026-03-06', ctx);
    expect(currentStreak).toBe(3);
    expect(bestStreak).toBe(3);

    // Check streak on Thursday 2026-03-05 (unscheduled today):
    // Unscheduled today -> streak through yesterday (Wed) is 2!
    const thursdayStreak = getHabitStreak(baseHabit, '2026-03-05', ctx);
    expect(thursdayStreak.currentStreak).toBe(2);
  });

  it('unfinished today does not break a streak', () => {
    // Completed yesterday (2026-03-01)
    // Not yet completed today (2026-03-02)
    const completions: HabitCompletion[] = [
      { habit_id: 'habit-1', log_date: '2026-03-01', status: 'done' },
    ];
    const ctx: ScoringContext = {
      habits: [baseHabit],
      schedules: [{ habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items: [],
      completions,
      pauses: [],
    };

    // Unfinished today (2026-03-02) still reports streak = 1 (through yesterday)
    const { currentStreak } = getHabitStreak(baseHabit, '2026-03-02', ctx);
    expect(currentStreak).toBe(1);

    // Once completed today, streak becomes 2
    ctx.completions.push({ habit_id: 'habit-1', log_date: '2026-03-02', status: 'done' });
    const updated = getHabitStreak(baseHabit, '2026-03-02', ctx);
    expect(updated.currentStreak).toBe(2);
  });

  it('rating returns "not enough data" (null) under 7 scored days', () => {
    // Only 4 completed days
    const completions: HabitCompletion[] = [
      { habit_id: 'habit-1', log_date: '2026-03-01', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-02', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-03', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-04', status: 'done' },
    ];
    // Start date 2026-03-01 so 03-01 to 03-04 are the only scored days
    const ctx: ScoringContext = {
      habits: [baseHabit],
      schedules: [{ habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items: [],
      completions,
      pauses: [],
    };

    const rating = calculateProductivityRating('2026-03-04', 30, ctx);
    expect(rating.rating).toBeNull();
    expect(rating.scoredDaysCount).toBe(4);
  });

  it('rating computes accurately when 7 or more scored days exist', () => {
    // 10 scored days, all 100% complete
    const completions: HabitCompletion[] = [];
    for (let i = 1; i <= 10; i++) {
      const d = `2026-03-${String(i).padStart(2, '0')}`;
      completions.push({ habit_id: 'habit-1', log_date: d, status: 'done' });
    }
    const ctx: ScoringContext = {
      habits: [baseHabit],
      schedules: [{ habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items: [],
      completions,
      pauses: [],
    };

    const res = calculateProductivityRating('2026-03-10', 30, ctx);
    expect(res.rating).toBe(100);
    expect(res.avgDayPercent).toBe(1.0);
    expect(res.activeDayShare).toBe(1.0);
  });

  it('goal progress computes completed habit-days and reaches target', () => {
    const goal: Goal = {
      id: 'g1',
      title: 'Run 10 times',
      target_count: 10,
      start_date: '2026-03-01',
    };
    const habitLinked: Habit = {
      ...baseHabit,
      goal_id: 'g1',
    };
    const completions: HabitCompletion[] = [];
    for (let i = 1; i <= 10; i++) {
      completions.push({
        habit_id: 'habit-1',
        log_date: `2026-03-${String(i).padStart(2, '0')}`,
        status: 'done',
      });
    }
    const ctx: ScoringContext = {
      habits: [habitLinked],
      schedules: [{ habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items: [],
      completions,
      pauses: [],
    };

    const progress = calculateGoalProgress(goal, '2026-03-10', ctx);
    expect(progress.completedHabitDays).toBe(10);
    expect(progress.percentage).toBe(100);
    expect(progress.targetReached).toBe(true);
  });

  it('weekly review compares current 7 days vs previous 7 days', () => {
    // Current window: 2026-03-08 to 2026-03-14 (7 days)
    // Previous window: 2026-03-01 to 2026-03-07 (7 days)
    const completions: HabitCompletion[] = [
      // 5 completions in previous week
      { habit_id: 'habit-1', log_date: '2026-03-01', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-02', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-03', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-04', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-05', status: 'done' },
      // 7 completions in current week (perfect)
      { habit_id: 'habit-1', log_date: '2026-03-08', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-09', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-10', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-11', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-12', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-13', status: 'done' },
      { habit_id: 'habit-1', log_date: '2026-03-14', status: 'done' },
    ];
    const ctx: ScoringContext = {
      habits: [baseHabit],
      schedules: [{ habit_id: 'habit-1', effective_from: '2026-03-01', weekdays: [0, 1, 2, 3, 4, 5, 6] }],
      items: [],
      completions,
      pauses: [],
    };

    const review = calculateWeeklyReview('2026-03-14', ctx);
    expect(review.currentAverage).toBe(1.0);
    expect(review.perfectDaysCount).toBe(7);
    expect(review.previousAverage).toBeCloseTo(5 / 7, 5);
    expect(review.change).toBeGreaterThan(0);
  });
});
