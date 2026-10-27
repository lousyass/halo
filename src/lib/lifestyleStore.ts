/**
 * Centralized, reactive data store for Halo Lifestyle Mode.
 * Ensures all views (Today, Calendar, Habits, Goals, Stats) share a single source of truth.
 * Implements Section 2.5 (shared store, immediate mutations, background revalidation).
 */

import { supabase } from './supabase';
import {
  Goal,
  Habit,
  HabitSchedule,
  HabitItem,
  HabitCompletion,
  HabitPause,
  ScoringContext,
} from './habitScoring';
import { addDays, compareDates, todayInTimezone } from './dateUtils';
import { fetchPaginated } from './paginationHelper';
import {
  MoneyCategory,
  MoneyTransaction,
  MoneyBudget,
  STARTER_CATEGORIES,
  normalizeToMonthStart,
} from './moneyScoring';

export interface LifestyleState {
  userId: string | null;
  timezone: string;
  today: string;
  goals: Goal[];
  habits: Habit[];
  schedules: HabitSchedule[];
  items: HabitItem[];
  completions: HabitCompletion[];
  pauses: HabitPause[];
  categories: MoneyCategory[];
  transactions: MoneyTransaction[];
  budgets: MoneyBudget[];
  currency: string | null;
  weekStartsOn: number;
  loading: boolean;
  revalidating: boolean;
  error: string | null;
}

type Listener = () => void;

class LifestyleStore {
  private state: LifestyleState = {
    userId: null,
    timezone: 'Asia/Manila',
    today: todayInTimezone('Asia/Manila'),
    goals: [],
    habits: [],
    schedules: [],
    items: [],
    completions: [],
    pauses: [],
    categories: [],
    transactions: [],
    budgets: [],
    currency: null,
    weekStartsOn: 0,
    loading: false,
    revalidating: false,
    error: null,
  };

  private listeners = new Set<Listener>();
  private inFlightToggles = new Set<string>();
  private midnightTimer: any = null;

  constructor() {
    this.setupMidnightRollover();
  }

  public getState(): LifestyleState {
    return this.state;
  }

  public getScoringContext(): ScoringContext {
    return {
      habits: this.state.habits,
      schedules: this.state.schedules,
      items: this.state.items,
      completions: this.state.completions,
      pauses: this.state.pauses,
    };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) {
      listener();
    }
  }

  /**
   * Midnight rollover detector (~60s interval + visibilitychange)
   */
  private setupMidnightRollover() {
    const checkRollover = () => {
      const currentToday = todayInTimezone(this.state.timezone);
      if (currentToday !== this.state.today) {
        this.state = {
          ...this.state,
          today: currentToday,
        };
        this.notify();
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkRollover();
          if (this.state.userId) {
            this.revalidate();
          }
        }
      });
      window.addEventListener('focus', () => {
        checkRollover();
        if (this.state.userId) {
          this.revalidate();
        }
      });

      this.midnightTimer = setInterval(checkRollover, 60000);
    }
  }

  /**
   * Loads all lifestyle data for a given user.
   */
  public async loadAll(userId: string) {
    if (!userId) return;

    const isInitial = !this.state.userId || this.state.userId !== userId;
    this.state = {
      ...this.state,
      userId,
      loading: isInitial,
      revalidating: !isInitial,
      error: null,
    };
    this.notify();

    try {
      // 1. Fetch user timezone from profiles
      let tz = 'Asia/Manila';
      const { data: profile } = await supabase
        .from('profiles')
        .select('timezone, preferences')
        .eq('id', userId)
        .maybeSingle();

      if (profile?.timezone) {
        tz = profile.timezone;
      }
      const localToday = todayInTimezone(tz);
      const userCurrency = (profile?.preferences as any)?.currency || null;
      const userWeekStartsOn = (profile?.preferences as any)?.week_starts_on === 1 ? 1 : 0;

      // 2. Fetch all collections in parallel
      const [
        goalsRes,
        habitsRes,
        schedulesRes,
        itemsRes,
        pausesRes,
        completionsData,
        categoriesRes,
        transactionsData,
        budgetsRes,
      ] = await Promise.all([
        supabase.from('goals').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('habits').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
        supabase.from('habit_schedules').select('*').eq('user_id', userId),
        supabase.from('habit_items').select('*').eq('user_id', userId).order('sort_order', { ascending: true }),
        supabase.from('habit_pauses').select('*').eq('user_id', userId),
        // completions can exceed 1000 rows -> paginate past 1000
        fetchPaginated<HabitCompletion>(async (from, to) =>
          await supabase
            .from('habit_completions')
            .select('*')
            .eq('user_id', userId)
            .range(from, to)
        ),
        // Phase 2 money data
        supabase.from('money_categories').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        // transactions can exceed 1000 rows -> paginate past 1000
        fetchPaginated<MoneyTransaction>(async (from, to) =>
          await supabase
            .from('money_transactions')
            .select('*')
            .eq('user_id', userId)
            .order('txn_date', { ascending: false })
            .range(from, to)
        ),
        supabase.from('money_budgets').select('*').eq('user_id', userId),
      ]);

      if (goalsRes.error) throw goalsRes.error;
      if (habitsRes.error) throw habitsRes.error;
      if (schedulesRes.error) throw schedulesRes.error;
      if (itemsRes.error) throw itemsRes.error;
      if (pausesRes.error) throw pausesRes.error;
      if (categoriesRes.error) throw categoriesRes.error;
      if (budgetsRes.error) throw budgetsRes.error;

      this.state = {
        ...this.state,
        userId,
        timezone: tz,
        today: localToday,
        currency: userCurrency,
        weekStartsOn: userWeekStartsOn,
        goals: goalsRes.data || [],
        habits: habitsRes.data || [],
        schedules: schedulesRes.data || [],
        items: itemsRes.data || [],
        pauses: pausesRes.data || [],
        completions: completionsData || [],
        categories: categoriesRes.data || [],
        transactions: transactionsData || [],
        budgets: budgetsRes.data || [],
        loading: false,
        revalidating: false,
        error: null,
      };
      this.notify();
    } catch (err: any) {
      this.state = {
        ...this.state,
        loading: false,
        revalidating: false,
        error: err.message || 'Failed to load lifestyle data',
      };
      this.notify();
    }
  }

  public async revalidate() {
    if (!this.state.userId) return;
    await this.loadAll(this.state.userId);
  }

  // ──────────────────────── MUTATIONS ────────────────────────

  /**
   * Toggles completion for a habit on a given date.
   * If habit has scheduled items: marks all scheduled items done (or untoggles if all were done).
   * If habit has no scheduled items: toggles habit-level completion row.
   * Optimistic UI with rollback and idempotency guard.
   */
  public async toggleHabit(habitId: string, date: string) {
    const key = `habit-${habitId}-${date}`;
    if (this.inFlightToggles.has(key)) return;
    this.inFlightToggles.add(key);

    const prevCompletions = [...this.state.completions];
    const habit = this.state.habits.find((h) => h.id === habitId);
    if (!habit || !this.state.userId) {
      this.inFlightToggles.delete(key);
      return;
    }

    const scheduledItems = this.state.items.filter((item) => {
      if (item.habit_id !== habitId) return false;
      if (compareDates(item.start_date, date) > 0) return false;
      if (item.archived_on && compareDates(date, item.archived_on) >= 0) return false;
      if (item.weekdays && !item.weekdays.includes(new Date(date).getUTCDay())) {
        // getWeekday
        const [y, m, d] = date.split('-').map(Number);
        const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
        if (!item.weekdays.includes(wd)) return false;
      }
      return true;
    });

    try {
      if (scheduledItems.length > 0) {
        // Check if all scheduled items are done
        const allDone = scheduledItems.every((item) =>
          prevCompletions.some(
            (c) => c.item_id === item.id && c.log_date === date && c.status === 'done'
          )
        );

        if (allDone) {
          // Untoggle all scheduled items
          const nextCompletions = prevCompletions.filter(
            (c) =>
              !(
                c.habit_id === habitId &&
                c.log_date === date &&
                scheduledItems.some((si) => si.id === c.item_id)
              )
          );
          this.state = { ...this.state, completions: nextCompletions };
          this.notify();

          const itemIds = scheduledItems.map((si) => si.id);
          const { error } = await supabase
            .from('habit_completions')
            .delete()
            .eq('habit_id', habitId)
            .eq('log_date', date)
            .in('item_id', itemIds);
          if (error) throw error;
        } else {
          // Mark all scheduled items done
          const newRows: HabitCompletion[] = scheduledItems.map((si) => ({
            habit_id: habitId,
            item_id: si.id,
            log_date: date,
            status: 'done',
          }));

          // Remove any existing rows for these items and append new done
          const filtered = prevCompletions.filter(
            (c) =>
              !(
                c.habit_id === habitId &&
                c.log_date === date &&
                scheduledItems.some((si) => si.id === c.item_id)
              )
          );
          this.state = { ...this.state, completions: [...filtered, ...newRows] };
          this.notify();

          // Upsert to Supabase
          const rowsToInsert = scheduledItems.map((si) => ({
            user_id: this.state.userId,
            habit_id: habitId,
            item_id: si.id,
            log_date: date,
            status: 'done',
          }));
          const { error } = await supabase
            .from('habit_completions')
            .upsert(rowsToInsert, { onConflict: 'item_id,log_date' });
          if (error) throw error;
        }
      } else {
        // Habit-level toggle
        const existingDone = prevCompletions.find(
          (c) => !c.item_id && c.habit_id === habitId && c.log_date === date && c.status === 'done'
        );

        if (existingDone) {
          // Untoggle
          const nextCompletions = prevCompletions.filter(
            (c) => !(!c.item_id && c.habit_id === habitId && c.log_date === date)
          );
          this.state = { ...this.state, completions: nextCompletions };
          this.notify();

          const { error } = await supabase
            .from('habit_completions')
            .delete()
            .eq('habit_id', habitId)
            .is('item_id', null)
            .eq('log_date', date);
          if (error) throw error;
        } else {
          // Toggle done (also clears any 'skipped' row on same date)
          const nextCompletions = prevCompletions.filter(
            (c) => !(!c.item_id && c.habit_id === habitId && c.log_date === date)
          );
          nextCompletions.push({
            habit_id: habitId,
            item_id: null,
            log_date: date,
            status: 'done',
          });
          this.state = { ...this.state, completions: nextCompletions };
          this.notify();

          const { error } = await supabase
            .from('habit_completions')
            .upsert(
              {
                user_id: this.state.userId,
                habit_id: habitId,
                item_id: null,
                log_date: date,
                status: 'done',
              },
              { onConflict: 'habit_id,log_date' }
            );
          if (error) throw error;
        }
      }
    } catch (err: any) {
      // Rollback on error
      this.state = { ...this.state, completions: prevCompletions, error: err.message };
      this.notify();
    } finally {
      this.inFlightToggles.delete(key);
    }
  }

  /**
   * Toggles an individual routine item.
   */
  public async toggleItem(habitId: string, itemId: string, date: string) {
    const key = `item-${itemId}-${date}`;
    if (this.inFlightToggles.has(key)) return;
    this.inFlightToggles.add(key);

    const prevCompletions = [...this.state.completions];
    const isDone = prevCompletions.some(
      (c) => c.item_id === itemId && c.log_date === date && c.status === 'done'
    );

    try {
      if (isDone) {
        const nextCompletions = prevCompletions.filter(
          (c) => !(c.item_id === itemId && c.log_date === date)
        );
        this.state = { ...this.state, completions: nextCompletions };
        this.notify();

        const { error } = await supabase
          .from('habit_completions')
          .delete()
          .eq('item_id', itemId)
          .eq('log_date', date);
        if (error) throw error;
      } else {
        const nextCompletions = prevCompletions.filter(
          (c) => !(c.item_id === itemId && c.log_date === date)
        );
        nextCompletions.push({
          habit_id: habitId,
          item_id: itemId,
          log_date: date,
          status: 'done',
        });
        this.state = { ...this.state, completions: nextCompletions };
        this.notify();

        const { error } = await supabase
          .from('habit_completions')
          .upsert(
            {
              user_id: this.state.userId,
              habit_id: habitId,
              item_id: itemId,
              log_date: date,
              status: 'done',
            },
            { onConflict: 'item_id,log_date' }
          );
        if (error) throw error;
      }
    } catch (err: any) {
      this.state = { ...this.state, completions: prevCompletions, error: err.message };
      this.notify();
    } finally {
      this.inFlightToggles.delete(key);
    }
  }

  /**
   * Skips a habit on a date (or unskips if already skipped).
   */
  public async skipHabit(habitId: string, date: string) {
    const key = `skip-${habitId}-${date}`;
    if (this.inFlightToggles.has(key)) return;
    this.inFlightToggles.add(key);

    const prevCompletions = [...this.state.completions];
    const isSkipped = prevCompletions.some(
      (c) => !c.item_id && c.habit_id === habitId && c.log_date === date && c.status === 'skipped'
    );

    try {
      if (isSkipped) {
        const nextCompletions = prevCompletions.filter(
          (c) => !(!c.item_id && c.habit_id === habitId && c.log_date === date && c.status === 'skipped')
        );
        this.state = { ...this.state, completions: nextCompletions };
        this.notify();

        const { error } = await supabase
          .from('habit_completions')
          .delete()
          .eq('habit_id', habitId)
          .is('item_id', null)
          .eq('log_date', date)
          .eq('status', 'skipped');
        if (error) throw error;
      } else {
        // Remove any done rows and insert skipped
        const nextCompletions = prevCompletions.filter(
          (c) => !(c.habit_id === habitId && c.log_date === date)
        );
        nextCompletions.push({
          habit_id: habitId,
          item_id: null,
          log_date: date,
          status: 'skipped',
        });
        this.state = { ...this.state, completions: nextCompletions };
        this.notify();

        // Delete any item completions for that day
        await supabase
          .from('habit_completions')
          .delete()
          .eq('habit_id', habitId)
          .eq('log_date', date);

        const { error } = await supabase
          .from('habit_completions')
          .insert({
            user_id: this.state.userId,
            habit_id: habitId,
            item_id: null,
            log_date: date,
            status: 'skipped',
          });
        if (error) throw error;
      }
    } catch (err: any) {
      this.state = { ...this.state, completions: prevCompletions, error: err.message };
      this.notify();
    } finally {
      this.inFlightToggles.delete(key);
    }
  }

  /**
   * Creates a habit with schedule and optional routine items.
   */
  public async createHabit(params: {
    name: string;
    category?: string | null;
    color?: string | null;
    icon?: string | null;
    goal_id?: string | null;
    weekdays: number[];
    items?: Array<{ title: string; weekdays?: number[] | null }>;
  }): Promise<Habit> {
    if (!this.state.userId) throw new Error('Not authenticated');

    const startDate = this.state.today;
    const { data: habitRow, error: habitErr } = await supabase
      .from('habits')
      .insert({
        user_id: this.state.userId,
        name: params.name.trim(),
        category: params.category?.trim() || null,
        color: params.color || null,
        icon: params.icon || null,
        goal_id: params.goal_id || null,
        start_date: startDate,
        sort_order: this.state.habits.length,
      })
      .select()
      .single();

    if (habitErr) throw habitErr;

    // Create schedule
    const { data: schedRow, error: schedErr } = await supabase
      .from('habit_schedules')
      .insert({
        user_id: this.state.userId,
        habit_id: habitRow.id,
        effective_from: startDate,
        weekdays: params.weekdays,
      })
      .select()
      .single();

    if (schedErr) throw schedErr;

    // Create items if any
    let itemRows: HabitItem[] = [];
    if (params.items && params.items.length > 0) {
      const itemsToInsert = params.items.map((it, idx) => ({
        user_id: this.state.userId,
        habit_id: habitRow.id,
        title: it.title.trim(),
        weekdays: it.weekdays || null,
        start_date: startDate,
        sort_order: idx,
      }));
      const { data: insertedItems, error: itemsErr } = await supabase
        .from('habit_items')
        .insert(itemsToInsert)
        .select();
      if (itemsErr) throw itemsErr;
      itemRows = insertedItems || [];
    }

    this.state = {
      ...this.state,
      habits: [...this.state.habits, habitRow],
      schedules: [...this.state.schedules, schedRow],
      items: [...this.state.items, ...itemRows],
    };
    this.notify();

    return habitRow;
  }

  /**
   * Updates an existing habit.
   * Follows Section 3:
   * - Editing weekdays inserts a new version effective tomorrow, except when the habit's
   *   only version has effective_from = today, in which case edit in place.
   * - Changing item weekdays archives old row (archived_on = tomorrow) and inserts new row (start_date = tomorrow).
   */
  public async updateHabit(
    habitId: string,
    params: {
      name: string;
      category?: string | null;
      color?: string | null;
      icon?: string | null;
      goal_id?: string | null;
      weekdays: number[];
      items: Array<{ id?: string; title: string; weekdays?: number[] | null }>;
    }
  ) {
    if (!this.state.userId) throw new Error('Not authenticated');

    const tomorrow = addDays(this.state.today, 1);

    // 1. Update basic habit info
    const { data: updatedHabit, error: hErr } = await supabase
      .from('habits')
      .update({
        name: params.name.trim(),
        category: params.category?.trim() || null,
        color: params.color || null,
        icon: params.icon || null,
        goal_id: params.goal_id || null,
      })
      .eq('id', habitId)
      .select()
      .single();

    if (hErr) throw hErr;

    // 2. Schedule versioning
    const existingSchedules = this.state.schedules.filter((s) => s.habit_id === habitId);
    let nextSchedules = [...this.state.schedules];

    const currentScheduleInForce = existingSchedules
      .filter((s) => compareDates(s.effective_from, this.state.today) <= 0)
      .sort((a, b) => compareDates(b.effective_from, a.effective_from))[0];

    const weekdaysChanged =
      !currentScheduleInForce ||
      currentScheduleInForce.weekdays.length !== params.weekdays.length ||
      !params.weekdays.every((wd) => currentScheduleInForce.weekdays.includes(wd));

    if (weekdaysChanged) {
      if (existingSchedules.length === 1 && existingSchedules[0].effective_from === this.state.today) {
        // Edit in place
        const { data: updatedSched, error: sErr } = await supabase
          .from('habit_schedules')
          .update({ weekdays: params.weekdays })
          .eq('id', existingSchedules[0].id)
          .select()
          .single();
        if (sErr) throw sErr;
        nextSchedules = nextSchedules.map((s) => (s.id === updatedSched.id ? updatedSched : s));
      } else {
        // Insert new version effective tomorrow (or update tomorrow's if already exists)
        const tomorrowSched = existingSchedules.find((s) => s.effective_from === tomorrow);
        if (tomorrowSched) {
          const { data: updatedSched, error: sErr } = await supabase
            .from('habit_schedules')
            .update({ weekdays: params.weekdays })
            .eq('id', tomorrowSched.id)
            .select()
            .single();
          if (sErr) throw sErr;
          nextSchedules = nextSchedules.map((s) => (s.id === updatedSched.id ? updatedSched : s));
        } else {
          const { data: newSched, error: sErr } = await supabase
            .from('habit_schedules')
            .insert({
              user_id: this.state.userId,
              habit_id: habitId,
              effective_from: tomorrow,
              weekdays: params.weekdays,
            })
            .select()
            .single();
          if (sErr) throw sErr;
          nextSchedules.push(newSched);
        }
      }
    }

    // 3. Routine items update (immutable weekdays: archive + insert new)
    const existingItems = this.state.items.filter((i) => i.habit_id === habitId && !i.archived_on);
    let nextItems = [...this.state.items];

    const keptItemIds = new Set<string>();

    for (let idx = 0; idx < params.items.length; idx++) {
      const it = params.items[idx];
      if (it.id) {
        keptItemIds.add(it.id);
        const existing = existingItems.find((e) => e.id === it.id);
        if (existing) {
          const weekdaysChanged =
            JSON.stringify(existing.weekdays?.sort() || null) !==
            JSON.stringify(it.weekdays?.sort() || null);

          if (weekdaysChanged) {
            // Archive old row tomorrow, insert new row tomorrow
            await supabase
              .from('habit_items')
              .update({ archived_on: tomorrow })
              .eq('id', existing.id);

            const { data: newItem, error: niErr } = await supabase
              .from('habit_items')
              .insert({
                user_id: this.state.userId,
                habit_id: habitId,
                title: it.title.trim(),
                weekdays: it.weekdays || null,
                start_date: tomorrow,
                sort_order: idx,
              })
              .select()
              .single();
            if (niErr) throw niErr;

            nextItems = nextItems.map((i) =>
              i.id === existing.id ? { ...i, archived_on: tomorrow } : i
            );
            nextItems.push(newItem);
          } else {
            // Title or sort order edit in place
            const { data: updatedItem, error: uiErr } = await supabase
              .from('habit_items')
              .update({
                title: it.title.trim(),
                sort_order: idx,
              })
              .eq('id', existing.id)
              .select()
              .single();
            if (uiErr) throw uiErr;
            nextItems = nextItems.map((i) => (i.id === updatedItem.id ? updatedItem : i));
          }
        }
      } else {
        // Newly added item
        const { data: newItem, error: niErr } = await supabase
          .from('habit_items')
          .insert({
            user_id: this.state.userId,
            habit_id: habitId,
            title: it.title.trim(),
            weekdays: it.weekdays || null,
            start_date: this.state.today,
            sort_order: idx,
          })
          .select()
          .single();
        if (niErr) throw niErr;
        nextItems.push(newItem);
      }
    }

    // Removed items -> archive them
    for (const existing of existingItems) {
      if (!keptItemIds.has(existing.id)) {
        await supabase
          .from('habit_items')
          .update({ archived_on: tomorrow })
          .eq('id', existing.id);
        nextItems = nextItems.map((i) =>
          i.id === existing.id ? { ...i, archived_on: tomorrow } : i
        );
      }
    }

    this.state = {
      ...this.state,
      habits: this.state.habits.map((h) => (h.id === habitId ? updatedHabit : h)),
      schedules: nextSchedules,
      items: nextItems,
    };
    this.notify();
  }

  /**
   * Archives a habit.
   */
  public async archiveHabit(habitId: string) {
    const today = this.state.today;
    const { error } = await supabase
      .from('habits')
      .update({ archived_on: today })
      .eq('id', habitId);

    if (error) throw error;

    this.state = {
      ...this.state,
      habits: this.state.habits.map((h) =>
        h.id === habitId ? { ...h, archived_on: today } : h
      ),
    };
    this.notify();
  }

  /**
   * Permanently deletes a habit (cascades schedules, items, pauses, completions in DB).
   * Immediately clears from all views.
   */
  public async deleteHabitPermanently(habitId: string) {
    const { error } = await supabase.from('habits').delete().eq('id', habitId);
    if (error) throw error;

    this.state = {
      ...this.state,
      habits: this.state.habits.filter((h) => h.id !== habitId),
      schedules: this.state.schedules.filter((s) => s.habit_id !== habitId),
      items: this.state.items.filter((i) => i.habit_id !== habitId),
      pauses: this.state.pauses.filter((p) => p.habit_id !== habitId),
      completions: this.state.completions.filter((c) => c.habit_id !== habitId),
    };
    this.notify();
  }

  /**
   * Pauses a habit starting on startDate with optional endDate.
   */
  public async pauseHabit(habitId: string, startDate: string, endDate?: string | null) {
    if (!this.state.userId) throw new Error('Not authenticated');

    const { data: pauseRow, error } = await supabase
      .from('habit_pauses')
      .insert({
        user_id: this.state.userId,
        habit_id: habitId,
        start_date: startDate,
        end_date: endDate || null,
      })
      .select()
      .single();

    if (error) throw error;

    this.state = {
      ...this.state,
      pauses: [...this.state.pauses, pauseRow],
    };
    this.notify();
  }

  /**
   * Resumes a paused habit today.
   */
  public async resumeHabit(habitId: string) {
    const today = this.state.today;
    const yesterday = addDays(today, -1);

    // Active pauses where end_date is null or >= today
    const activePauses = this.state.pauses.filter(
      (p) =>
        p.habit_id === habitId &&
        compareDates(p.start_date, today) <= 0 &&
        (!p.end_date || compareDates(today, p.end_date) <= 0)
    );

    for (const p of activePauses) {
      const newEnd = compareDates(p.start_date, yesterday) <= 0 ? yesterday : p.start_date;
      await supabase
        .from('habit_pauses')
        .update({ end_date: newEnd })
        .eq('id', p.id);
    }

    this.state = {
      ...this.state,
      pauses: this.state.pauses.map((p) => {
        if (activePauses.some((ap) => ap.id === p.id)) {
          const newEnd = compareDates(p.start_date, yesterday) <= 0 ? yesterday : p.start_date;
          return { ...p, end_date: newEnd };
        }
        return p;
      }),
    };
    this.notify();
  }

  // ──────────────────────── GOALS ────────────────────────

  public async createGoal(params: {
    title: string;
    description?: string | null;
    target_count?: number | null;
    deadline?: string | null;
    start_date?: string;
  }): Promise<Goal> {
    if (!this.state.userId) throw new Error('Not authenticated');

    const startDate = params.start_date || this.state.today;
    const { data, error } = await supabase
      .from('goals')
      .insert({
        user_id: this.state.userId,
        title: params.title.trim(),
        description: params.description?.trim() || null,
        target_count: params.target_count && params.target_count > 0 ? params.target_count : null,
        deadline: params.deadline || null,
        start_date: startDate,
      })
      .select()
      .single();

    if (error) throw error;

    this.state = {
      ...this.state,
      goals: [data, ...this.state.goals],
    };
    this.notify();
    return data;
  }

  public async updateGoal(
    goalId: string,
    params: {
      title: string;
      description?: string | null;
      target_count?: number | null;
      deadline?: string | null;
    }
  ) {
    const { data, error } = await supabase
      .from('goals')
      .update({
        title: params.title.trim(),
        description: params.description?.trim() || null,
        target_count: params.target_count && params.target_count > 0 ? params.target_count : null,
        deadline: params.deadline || null,
      })
      .eq('id', goalId)
      .select()
      .single();

    if (error) throw error;

    this.state = {
      ...this.state,
      goals: this.state.goals.map((g) => (g.id === goalId ? data : g)),
    };
    this.notify();
  }

  public async markGoalAchieved(goalId: string) {
    const today = this.state.today;
    const { data, error } = await supabase
      .from('goals')
      .update({ achieved_on: today })
      .eq('id', goalId)
      .select()
      .single();

    if (error) throw error;

    this.state = {
      ...this.state,
      goals: this.state.goals.map((g) => (g.id === goalId ? data : g)),
    };
    this.notify();
  }

  public async archiveGoal(goalId: string) {
    const today = this.state.today;
    const { data, error } = await supabase
      .from('goals')
      .update({ archived_on: today })
      .eq('id', goalId)
      .select()
      .single();

    if (error) throw error;

    this.state = {
      ...this.state,
      goals: this.state.goals.map((g) => (g.id === goalId ? data : g)),
    };
    this.notify();
  }

  public async deleteGoalPermanently(goalId: string) {
    const { error } = await supabase.from('goals').delete().eq('id', goalId);
    if (error) throw error;

    this.state = {
      ...this.state,
      goals: this.state.goals.filter((g) => g.id !== goalId),
      // In DB, habits.goal_id is set to null on delete
      habits: this.state.habits.map((h) => (h.goal_id === goalId ? { ...h, goal_id: null } : h)),
    };
    this.notify();
  }

  public async linkHabitToGoal(habitId: string, goalId: string | null) {
    const { error } = await supabase
      .from('habits')
      .update({ goal_id: goalId })
      .eq('id', habitId);

    if (error) throw error;

    this.state = {
      ...this.state,
      habits: this.state.habits.map((h) =>
        h.id === habitId ? { ...h, goal_id: goalId } : h
      ),
    };
    this.notify();
  }

  // ──────────────────────── MONEY MUTATIONS (PHASE 2) ────────────────────────

  public async createCategory(params: {
    name: string;
    kind: 'expense' | 'income';
    color?: string | null;
    icon?: string | null;
  }): Promise<MoneyCategory> {
    if (!this.state.userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('money_categories')
      .insert({
        user_id: this.state.userId,
        name: params.name.trim(),
        kind: params.kind,
        color: params.color || null,
        icon: params.icon || null,
      })
      .select()
      .single();

    if (error) throw error;

    this.state = {
      ...this.state,
      categories: [...this.state.categories, data],
    };
    this.notify();
    return data;
  }

  public async updateCategory(
    id: string,
    params: {
      name: string;
      color?: string | null;
      icon?: string | null;
    }
  ) {
    const { data, error } = await supabase
      .from('money_categories')
      .update({
        name: params.name.trim(),
        color: params.color || null,
        icon: params.icon || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    this.state = {
      ...this.state,
      categories: this.state.categories.map((c) => (c.id === id ? data : c)),
    };
    this.notify();
  }

  public async archiveCategory(id: string) {
    const { data, error } = await supabase
      .from('money_categories')
      .update({ archived: true })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    this.state = {
      ...this.state,
      categories: this.state.categories.map((c) => (c.id === id ? data : c)),
    };
    this.notify();
  }

  public async addStarterCategories() {
    if (!this.state.userId) throw new Error('Not authenticated');

    const rowsToInsert = STARTER_CATEGORIES.map((c) => ({
      user_id: this.state.userId,
      name: c.name,
      kind: c.kind,
      icon: c.icon,
      color: c.color,
    }));

    const { data, error } = await supabase
      .from('money_categories')
      .insert(rowsToInsert)
      .select();

    if (error) throw error;

    this.state = {
      ...this.state,
      categories: [...this.state.categories, ...(data || [])],
    };
    this.notify();
  }

  public async createTransaction(params: {
    type: 'expense' | 'income';
    amount: number;
    category_id: string;
    txn_date: string;
    note?: string | null;
  }): Promise<MoneyTransaction> {
    if (!this.state.userId) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('money_transactions')
      .insert({
        user_id: this.state.userId,
        type: params.type,
        amount: params.amount,
        category_id: params.category_id,
        txn_date: params.txn_date,
        note: params.note?.trim() || null,
      })
      .select()
      .single();

    if (error) throw error;

    const nextTxns = [data, ...this.state.transactions];
    nextTxns.sort((a, b) => compareDates(b.txn_date, a.txn_date));

    this.state = {
      ...this.state,
      transactions: nextTxns,
    };
    this.notify();
    return data;
  }

  public async updateTransaction(
    id: string,
    params: {
      type: 'expense' | 'income';
      amount: number;
      category_id: string;
      txn_date: string;
      note?: string | null;
    }
  ) {
    const { data, error } = await supabase
      .from('money_transactions')
      .update({
        type: params.type,
        amount: params.amount,
        category_id: params.category_id,
        txn_date: params.txn_date,
        note: params.note?.trim() || null,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    const nextTxns = this.state.transactions.map((t) => (t.id === id ? data : t));
    nextTxns.sort((a, b) => compareDates(b.txn_date, a.txn_date));

    this.state = {
      ...this.state,
      transactions: nextTxns,
    };
    this.notify();
  }

  public async deleteTransaction(id: string) {
    const { error } = await supabase.from('money_transactions').delete().eq('id', id);
    if (error) throw error;

    this.state = {
      ...this.state,
      transactions: this.state.transactions.filter((t) => t.id !== id),
    };
    this.notify();
  }

  public async setBudget(params: {
    effective_month: string;
    category_id?: string | null;
    amount: number;
  }): Promise<MoneyBudget> {
    if (!this.state.userId) throw new Error('Not authenticated');

    const monthStart = normalizeToMonthStart(params.effective_month);
    const catId = params.category_id || null;

    const existing = this.state.budgets.find(
      (b) => normalizeToMonthStart(b.effective_month) === monthStart && (b.category_id || null) === catId
    );

    let resultBudget: MoneyBudget;

    if (existing) {
      const { data, error } = await supabase
        .from('money_budgets')
        .update({ amount: params.amount })
        .eq('id', existing.id)
        .select()
        .single();

      if (error) throw error;
      resultBudget = data;

      this.state = {
        ...this.state,
        budgets: this.state.budgets.map((b) => (b.id === existing.id ? data : b)),
      };
    } else {
      const { data, error } = await supabase
        .from('money_budgets')
        .insert({
          user_id: this.state.userId,
          effective_month: monthStart,
          category_id: catId,
          amount: params.amount,
        })
        .select()
        .single();

      if (error) throw error;
      resultBudget = data;

      this.state = {
        ...this.state,
        budgets: [...this.state.budgets, data],
      };
    }

    this.notify();
    return resultBudget;
  }

  public async updateLifestylePreferences(params: {
    currency?: string;
    week_starts_on?: number;
  }) {
    if (!this.state.userId) throw new Error('Not authenticated');

    // Rule 2.10: profiles.preferences is shared jsonb - must merge, never overwrite
    const { data: prof, error: readErr } = await supabase
      .from('profiles')
      .select('preferences')
      .eq('id', this.state.userId)
      .maybeSingle();

    if (readErr) throw readErr;

    const currentPrefs = (prof?.preferences as Record<string, any>) || {};
    const nextPrefs = {
      ...currentPrefs,
      ...(params.currency !== undefined ? { currency: params.currency } : {}),
      ...(params.week_starts_on !== undefined ? { week_starts_on: params.week_starts_on } : {}),
    };

    const { error: updateErr } = await supabase
      .from('profiles')
      .update({ preferences: nextPrefs })
      .eq('id', this.state.userId);

    if (updateErr) throw updateErr;

    this.state = {
      ...this.state,
      currency: params.currency !== undefined ? params.currency : this.state.currency,
      weekStartsOn: params.week_starts_on !== undefined ? params.week_starts_on : this.state.weekStartsOn,
    };
    this.notify();
  }
}

export const lifestyleStore = new LifestyleStore();
