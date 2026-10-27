import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Pencil,
  Pause,
  Play,
  Archive,
  Trash2,
  ChevronDown,
  ChevronRight,
  Flame,
  Info,
  X,
  Check,
} from 'lucide-react';
import {
  Habit,
  HabitItem,
  getHabitStreak,
  getScheduleInForce,
  isHabitPausedOnDate,
} from '../../lib/habitScoring';
import { addDays, compareDates } from '../../lib/dateUtils';
import { useLifestyle } from '../../lib/useLifestyle';

interface LifestyleHabitsProps {
  userId: string;
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PRESET_EMOJIS = ['🌱', '💧', '🏃', '📚', '🧘', '🍵', '🧹', '🎨', '✍️', '🛌', '💪', '🍎'];
const PRESET_COLORS = [
  '#10B981', // Emerald
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#14B8A6', // Teal
  '#6366F1', // Indigo
];

export const LifestyleHabits: React.FC<LifestyleHabitsProps> = ({ userId }) => {
  const { state, scoringContext, store } = useLifestyle(userId);
  const { today } = state;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState(PRESET_EMOJIS[0]);
  const [goalId, setGoalId] = useState<string>('');
  const [selectedWeekdays, setSelectedWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [routineItems, setRoutineItems] = useState<
    Array<{ id?: string; title: string; weekdays: number[] | null }>
  >([]);
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemWeekdays, setNewItemWeekdays] = useState<number[] | null>(null);

  // Pause Modal
  const [pauseModalHabit, setPauseModalHabit] = useState<Habit | null>(null);
  const [pauseStartDate, setPauseStartDate] = useState(today);
  const [pauseEndDate, setPauseEndDate] = useState('');

  // Delete Confirm Modal
  const [deleteConfirmHabit, setDeleteConfirmHabit] = useState<Habit | null>(null);

  // Collapsed Sections
  const [archivedExpanded, setArchivedExpanded] = useState(false);

  // Active vs Archived habits
  const activeHabits = state.habits.filter((h) => !h.archived_on);
  const archivedHabits = state.habits.filter((h) => !!h.archived_on);

  // Past categories for autocomplete
  const existingCategories = Array.from(
    new Set(state.habits.map((h) => h.category?.trim()).filter(Boolean))
  ) as string[];

  const openCreateModal = () => {
    setEditingHabit(null);
    setName('');
    setCategory('');
    setColor(PRESET_COLORS[0]);
    setIcon(PRESET_EMOJIS[0]);
    setGoalId('');
    setSelectedWeekdays([0, 1, 2, 3, 4, 5, 6]);
    setRoutineItems([]);
    setNewItemTitle('');
    setNewItemWeekdays(null);
    setModalOpen(true);
  };

  const openEditModal = (habit: Habit) => {
    setEditingHabit(habit);
    setName(habit.name);
    setCategory(habit.category || '');
    setColor(habit.color || PRESET_COLORS[0]);
    setIcon(habit.icon || PRESET_EMOJIS[0]);
    setGoalId(habit.goal_id || '');

    // Current schedule in force
    const sched = getScheduleInForce(state.schedules, habit.id, today);
    setSelectedWeekdays(sched);

    // Active items for this habit
    const items = state.items
      .filter((i) => i.habit_id === habit.id && !i.archived_on)
      .map((i) => ({
        id: i.id,
        title: i.title,
        weekdays: i.weekdays ? [...i.weekdays] : null,
      }));
    setRoutineItems(items);
    setNewItemTitle('');
    setNewItemWeekdays(null);
    setModalOpen(true);
  };

  const toggleWeekday = (wd: number) => {
    if (selectedWeekdays.includes(wd)) {
      if (selectedWeekdays.length === 1) return; // at least 1 weekday required
      setSelectedWeekdays(selectedWeekdays.filter((d) => d !== wd));
    } else {
      setSelectedWeekdays([...selectedWeekdays, wd].sort());
    }
  };

  const selectAllWeekdays = () => {
    setSelectedWeekdays([0, 1, 2, 3, 4, 5, 6]);
  };

  const addRoutineItem = () => {
    if (!newItemTitle.trim()) return;
    setRoutineItems([
      ...routineItems,
      {
        title: newItemTitle.trim(),
        weekdays: newItemWeekdays,
      },
    ]);
    setNewItemTitle('');
    setNewItemWeekdays(null);
  };

  const removeRoutineItem = (index: number) => {
    setRoutineItems(routineItems.filter((_, i) => i !== index));
  };

  const handleSaveHabit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    if (editingHabit) {
      await store.updateHabit(editingHabit.id, {
        name,
        category: category || null,
        color,
        icon,
        goal_id: goalId || null,
        weekdays: selectedWeekdays,
        items: routineItems,
      });
    } else {
      await store.createHabit({
        name,
        category: category || null,
        color,
        icon,
        goal_id: goalId || null,
        weekdays: selectedWeekdays,
        items: routineItems,
      });
    }

    setModalOpen(false);
  };

  const handleSavePause = async () => {
    if (!pauseModalHabit) return;
    await store.pauseHabit(pauseModalHabit.id, pauseStartDate, pauseEndDate || null);
    setPauseModalHabit(null);
  };

  const handleDeletePermanently = async () => {
    if (!deleteConfirmHabit) return;
    await store.deleteHabitPermanently(deleteConfirmHabit.id);
    setDeleteConfirmHabit(null);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Add Button */}
      <div className="p-4 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-base md:text-lg font-bold text-gray-800 font-['Fredoka']">
            Manage Habits
          </h2>
          <p className="text-xs text-gray-500">
            {activeHabits.length} active habits • Configure schedules, routines, and pauses
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus size={15} />
          <span>New Habit</span>
        </button>
      </div>

      {/* 2. Active Habits List */}
      <div className="space-y-3">
        {activeHabits.length === 0 ? (
          <div className="p-8 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm text-center">
            <p className="text-sm text-gray-500 mb-3">No active habits yet.</p>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 rounded-2xl bg-emerald-600 text-white text-xs font-semibold"
            >
              Create your first habit
            </button>
          </div>
        ) : (
          activeHabits.map((habit) => {
            const streak = getHabitStreak(habit, today, scoringContext);
            const isPaused = isHabitPausedOnDate(state.pauses, habit.id, today);
            const schedule = getScheduleInForce(state.schedules, habit.id, today);
            const items = state.items.filter((i) => i.habit_id === habit.id && !i.archived_on);
            const linkedGoal = state.goals.find((g) => g.id === habit.goal_id);

            return (
              <div
                key={habit.id}
                className="p-4 rounded-3xl bg-white/80 backdrop-blur-md border border-white/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    {habit.icon && <span className="text-lg">{habit.icon}</span>}
                    <h3 className="text-sm md:text-base font-bold text-gray-800 truncate font-['Fredoka']">
                      {habit.name}
                    </h3>
                    {habit.category && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                        {habit.category}
                      </span>
                    )}
                    {isPaused && (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                        Paused
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {/* Days schedule */}
                    <span>
                      {schedule.length === 7
                        ? 'Every day'
                        : schedule.map((d) => WEEKDAY_NAMES[d]).join(', ')}
                    </span>

                    {/* Routine items count */}
                    {items.length > 0 && (
                      <span>• {items.length} routine {items.length === 1 ? 'item' : 'items'}</span>
                    )}

                    {/* Linked goal */}
                    {linkedGoal && (
                      <span className="text-emerald-700 font-medium">
                        • Goal: {linkedGoal.title}
                      </span>
                    )}

                    {/* Streak */}
                    {streak.currentStreak > 0 && (
                      <span className="inline-flex items-center gap-1 font-bold text-amber-700">
                        <Flame size={12} className="text-amber-500 fill-amber-500" />
                        {streak.currentStreak} day streak
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 shrink-0 self-end md:self-center">
                  {/* Pause / Resume */}
                  {isPaused ? (
                    <button
                      onClick={() => store.resumeHabit(habit.id)}
                      className="p-2 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Resume habit"
                    >
                      <Play size={14} />
                      <span className="hidden sm:inline">Resume</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setPauseModalHabit(habit);
                        setPauseStartDate(today);
                        setPauseEndDate('');
                      }}
                      className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Pause habit"
                    >
                      <Pause size={14} />
                      <span className="hidden sm:inline">Pause</span>
                    </button>
                  )}

                  {/* Edit */}
                  <button
                    onClick={() => openEditModal(habit)}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
                    title="Edit habit"
                  >
                    <Pencil size={15} />
                  </button>

                  {/* Archive */}
                  <button
                    onClick={() => store.archiveHabit(habit.id)}
                    className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 transition-colors"
                    title="Archive habit"
                  >
                    <Archive size={15} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => setDeleteConfirmHabit(habit)}
                    className="p-2 rounded-xl hover:bg-rose-50 text-gray-400 hover:text-rose-600 transition-colors"
                    title="Delete permanently"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. Collapsible Archived Habits */}
      {archivedHabits.length > 0 && (
        <div className="p-4 rounded-3xl bg-white/50 backdrop-blur-md border border-white/60 shadow-sm space-y-3">
          <button
            onClick={() => setArchivedExpanded(!archivedExpanded)}
            className="flex items-center justify-between w-full text-xs font-bold text-gray-500 uppercase tracking-wider"
          >
            <span>Archived Habits ({archivedHabits.length})</span>
            {archivedExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {archivedExpanded && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              {archivedHabits.map((habit) => (
                <div
                  key={habit.id}
                  className="p-3 rounded-2xl bg-white/70 border border-gray-100 flex items-center justify-between"
                >
                  <div className="flex items-center gap-2 text-xs text-gray-600">
                    {habit.icon && <span>{habit.icon}</span>}
                    <span className="font-semibold">{habit.name}</span>
                    <span className="text-[10px] text-gray-400">
                      (Archived on {habit.archived_on})
                    </span>
                  </div>

                  <button
                    onClick={() => setDeleteConfirmHabit(habit)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 hover:bg-rose-50"
                    title="Delete permanently"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CREATE / EDIT HABIT MODAL ── */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white p-6 shadow-xl border border-gray-100 space-y-5"
            >
              <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-800 font-['Fredoka']">
                  {editingHabit ? 'Edit Habit' : 'Create New Habit'}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Versioning notice if editing */}
              {editingHabit && (
                <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/60 text-xs text-amber-800 flex items-center gap-2">
                  <Info size={15} className="shrink-0 text-amber-600" />
                  <span>
                    Schedule weekday changes take effect from <strong>tomorrow</strong> to protect
                    today's active checklist.
                  </span>
                </div>
              )}

              <form onSubmit={handleSaveHabit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                    Habit Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Morning Meditation, Read 20 pages"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                {/* Category with suggestions */}
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                    Category (optional)
                  </label>
                  <input
                    type="text"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Health, Mindfulness, Study"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  {existingCategories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      {existingCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCategory(cat)}
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Icon & Color */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                      Icon
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl border border-gray-100 bg-gray-50/50">
                      {PRESET_EMOJIS.map((em) => (
                        <button
                          key={em}
                          type="button"
                          onClick={() => setIcon(em)}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-sm ${
                            icon === em ? 'bg-white shadow-sm ring-2 ring-emerald-500' : 'hover:bg-white/60'
                          }`}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                      Color
                    </label>
                    <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl border border-gray-100 bg-gray-50/50">
                      {PRESET_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => setColor(c)}
                          style={{ backgroundColor: c }}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                            color === c ? 'ring-2 ring-black/40 scale-105' : 'hover:opacity-80'
                          }`}
                        >
                          {color === c && <Check size={12} className="text-white" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Weekdays Schedule Picker */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-gray-600 uppercase tracking-wider">
                      Schedule Days *
                    </label>
                    <button
                      type="button"
                      onClick={selectAllWeekdays}
                      className="text-[11px] font-bold text-emerald-600 hover:underline"
                    >
                      Every day
                    </button>
                  </div>
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAY_NAMES.map((d, idx) => {
                      const isSelected = selectedWeekdays.includes(idx);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleWeekday(idx)}
                          className={`py-2 rounded-xl text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Optional Goal Link */}
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                    Linked Goal (optional)
                  </label>
                  <select
                    value={goalId}
                    onChange={(e) => setGoalId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 bg-white"
                  >
                    <option value="">No goal (Unassigned)</option>
                    {state.goals
                      .filter((g) => !g.archived_on)
                      .map((g) => (
                        <option key={g.id} value={g.id}>
                          {g.title}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Routine Items */}
                <div className="pt-2 border-t border-gray-100 space-y-2">
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block">
                    Routine Items (optional sub-tasks)
                  </label>

                  {routineItems.map((item, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-2.5 rounded-xl bg-gray-50 border border-gray-200/70 text-xs"
                    >
                      <div>
                        <span className="font-semibold text-gray-800">{item.title}</span>
                        {item.weekdays && (
                          <span className="text-[10px] text-gray-500 block">
                            Only on {item.weekdays.map((w) => WEEKDAY_NAMES[w]).join(', ')}
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => removeRoutineItem(idx)}
                        className="text-gray-400 hover:text-rose-600"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  {/* Add routine item inputs */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      placeholder="Add sub-item (e.g. Warm up)"
                      className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                    <button
                      type="button"
                      onClick={addRoutineItem}
                      className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                  <button
                    type="button"
                    onClick={() => setModalOpen(false)}
                    className="px-4 py-2 rounded-2xl text-xs font-semibold text-gray-500 hover:bg-gray-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm"
                  >
                    {editingHabit ? 'Save Changes' : 'Create Habit'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── PAUSE MODAL ── */}
      <AnimatePresence>
        {pauseModalHabit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl border border-gray-100 space-y-4"
            >
              <h3 className="text-base font-bold text-gray-800 font-['Fredoka']">
                Pause Habit: {pauseModalHabit.name}
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Pausing a habit temporarily excludes it from your daily checklist and stats.
                Your streaks are safely preserved!
              </p>

              <div className="space-y-3">
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                    Start Pause Date
                  </label>
                  <input
                    type="date"
                    value={pauseStartDate}
                    onChange={(e) => setPauseStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                    End Date (optional: leave empty to pause indefinitely)
                  </label>
                  <input
                    type="date"
                    value={pauseEndDate}
                    min={pauseStartDate}
                    onChange={(e) => setPauseEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setPauseModalHabit(null)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSavePause}
                  className="px-5 py-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold shadow-sm"
                >
                  Confirm Pause
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── DELETE PERMANENTLY CONFIRM MODAL ── */}
      <AnimatePresence>
        {deleteConfirmHabit && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-xl border border-gray-100 space-y-4"
            >
              <h3 className="text-base font-bold text-rose-600 font-['Fredoka']">
                Delete Habit Permanently?
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                Are you sure you want to delete <strong>{deleteConfirmHabit.name}</strong>?
                This action cannot be undone and will permanently remove all past completions and schedule history.
              </p>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeleteConfirmHabit(null)}
                  className="px-4 py-2 rounded-2xl text-xs font-semibold text-gray-500 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDeletePermanently}
                  className="px-4 py-2 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-sm"
                >
                  Delete Permanently
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
