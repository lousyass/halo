import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus,
  Pencil,
  Archive,
  Trash2,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Flame,
  Award,
  Calendar,
  X,
  Link as LinkIcon,
} from 'lucide-react';
import {
  Goal,
  Habit,
  calculateGoalProgress,
  getHabitStreak,
} from '../../lib/habitScoring';
import { formatDisplayDate } from '../../lib/dateUtils';
import { useLifestyle } from '../../lib/useLifestyle';

interface LifestyleGoalsProps {
  userId: string;
}

export const LifestyleGoals: React.FC<LifestyleGoalsProps> = ({ userId }) => {
  const { state, scoringContext, store } = useLifestyle(userId);
  const { today } = state;

  const [modalOpen, setModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetCount, setTargetCount] = useState<string>('');
  const [deadline, setDeadline] = useState('');

  // Add Habit to Goal Picker Modal
  const [assignHabitGoalId, setAssignHabitGoalId] = useState<string | null>(null);

  // Collapsed Sections
  const [achievedExpanded, setAchievedExpanded] = useState(false);

  // Separate active goals vs achieved / archived goals
  const activeGoals = state.goals.filter((g) => !g.achieved_on && !g.archived_on);
  const inactiveGoals = state.goals.filter((g) => !!g.achieved_on || !!g.archived_on);

  // Habits with no goal
  const unassignedHabits = state.habits.filter((h) => !h.goal_id && !h.archived_on);

  const openCreateModal = () => {
    setEditingGoal(null);
    setTitle('');
    setDescription('');
    setTargetCount('');
    setDeadline('');
    setModalOpen(true);
  };

  const openEditModal = (goal: Goal) => {
    setEditingGoal(goal);
    setTitle(goal.title);
    setDescription(goal.description || '');
    setTargetCount(goal.target_count ? String(goal.target_count) : '');
    setDeadline(goal.deadline || '');
    setModalOpen(true);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const parsedTarget = targetCount ? parseInt(targetCount, 10) : null;

    if (editingGoal) {
      await store.updateGoal(editingGoal.id, {
        title,
        description: description || null,
        target_count: parsedTarget,
        deadline: deadline || null,
      });
    } else {
      await store.createGoal({
        title,
        description: description || null,
        target_count: parsedTarget,
        deadline: deadline || null,
      });
    }

    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* 1. Header */}
      <div className="p-4 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-base md:text-lg font-bold text-gray-800 font-['Fredoka']">
            Goals & Habit Tree
          </h2>
          <p className="text-xs text-gray-500">
            {activeGoals.length} active goals • Connect daily habits to long-term targets
          </p>
        </div>

        <button
          onClick={openCreateModal}
          className="flex items-center gap-1.5 px-4 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shadow-sm transition-colors"
        >
          <Plus size={15} />
          <span>New Goal</span>
        </button>
      </div>

      {/* 2. Goals Tree */}
      <div className="space-y-6">
        {activeGoals.length === 0 ? (
          <div className="p-8 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm text-center">
            <p className="text-sm text-gray-500 mb-3">No active goals set yet.</p>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 rounded-2xl bg-emerald-600 text-white text-xs font-semibold"
            >
              Create your first goal
            </button>
          </div>
        ) : (
          activeGoals.map((goal) => {
            const progress = calculateGoalProgress(goal, today, scoringContext);
            const linkedHabits = state.habits.filter(
              (h) => h.goal_id === goal.id && !h.archived_on
            );

            // Ring SVG values
            const radius = 18;
            const circumference = 2 * Math.PI * radius;
            const strokeOffset = circumference - (progress.percentage / 100) * circumference;

            return (
              <div
                key={goal.id}
                className="p-5 rounded-3xl bg-white/80 backdrop-blur-md border border-white/60 shadow-sm space-y-4"
              >
                {/* Level 1: Goal Root Node */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-gray-100">
                  <div className="flex items-start gap-3">
                    {/* Goal Progress Ring */}
                    <div className="relative w-12 h-12 shrink-0 flex items-center justify-center">
                      <svg className="w-full h-full -rotate-90" viewBox="0 0 44 44">
                        <circle
                          cx="22"
                          cy="22"
                          r={radius}
                          className="stroke-gray-200"
                          strokeWidth="4"
                          fill="transparent"
                        />
                        <motion.circle
                          cx="22"
                          cy="22"
                          r={radius}
                          className="stroke-emerald-500"
                          strokeWidth="4"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeOffset}
                          strokeLinecap="round"
                          fill="transparent"
                          animate={{ strokeDashoffset: strokeOffset }}
                          transition={{ duration: 0.4 }}
                        />
                      </svg>
                      <span className="absolute text-[10px] font-bold text-gray-700">
                        {progress.percentage}%
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <h3 className="text-base font-bold text-gray-800 font-['Fredoka']">
                        {goal.title}
                      </h3>
                      {goal.description && (
                        <p className="text-xs text-gray-500">{goal.description}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500 pt-1">
                        <span>
                          {goal.target_count
                            ? `${progress.completedHabitDays} of ${goal.target_count} habit-days done`
                            : `${progress.percentage}% completion rate`}
                        </span>
                        {goal.deadline && (
                          <span className="flex items-center gap-1 text-amber-700 font-medium">
                            <Calendar size={12} />
                            Target: {formatDisplayDate(goal.deadline)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Goal Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                    {/* Target Reached prompt */}
                    {progress.targetReached && !goal.achieved_on && (
                      <button
                        onClick={() => store.markGoalAchieved(goal.id)}
                        className="px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all"
                      >
                        <Award size={14} className="text-amber-600" />
                        <span>Target reached — Mark achieved!</span>
                      </button>
                    )}

                    <button
                      onClick={() => setAssignHabitGoalId(goal.id)}
                      className="px-2.5 py-1.5 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 text-xs font-semibold flex items-center gap-1 transition-colors"
                      title="Link a habit"
                    >
                      <LinkIcon size={13} />
                      <span>Link Habit</span>
                    </button>

                    <button
                      onClick={() => openEditModal(goal)}
                      className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500"
                      title="Edit goal"
                    >
                      <Pencil size={15} />
                    </button>

                    <button
                      onClick={() => store.archiveGoal(goal.id)}
                      className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-500"
                      title="Archive goal"
                    >
                      <Archive size={15} />
                    </button>

                    <button
                      onClick={() => store.deleteGoalPermanently(goal.id)}
                      className="p-1.5 rounded-xl hover:bg-rose-50 text-gray-400 hover:text-rose-600"
                      title="Delete goal"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Level 2: Linked Habits (Tree Lines via SVG / CSS) */}
                <div className="pl-6 relative">
                  {/* Vertical connecting line */}
                  {linkedHabits.length > 0 && (
                    <div className="absolute left-6 top-0 bottom-4 w-0.5 bg-emerald-200/80 -translate-x-1/2" />
                  )}

                  {linkedHabits.length === 0 ? (
                    <p className="text-xs text-gray-400 italic py-2">
                      No habits linked to this goal yet. Click "Link Habit" above to connect one!
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {linkedHabits.map((habit) => {
                        const streak = getHabitStreak(habit, today, scoringContext);

                        return (
                          <div
                            key={habit.id}
                            className="relative flex items-center justify-between p-3 rounded-2xl bg-white/70 border border-gray-100 shadow-sm pl-4 ml-3"
                          >
                            {/* Horizontal connector line from vertical stem */}
                            <div className="absolute -left-3 top-1/2 w-3 h-0.5 bg-emerald-200/80 -translate-y-1/2" />

                            <div className="flex items-center gap-2.5">
                              {habit.icon && <span className="text-base">{habit.icon}</span>}
                              <div>
                                <h4 className="text-xs md:text-sm font-bold text-gray-800">
                                  {habit.name}
                                </h4>
                                {habit.category && (
                                  <span className="text-[10px] text-gray-400">
                                    {habit.category}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              {streak.currentStreak > 0 && (
                                <span className="flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/60">
                                  <Flame size={12} className="text-amber-500 fill-amber-500" />
                                  {streak.currentStreak}d
                                </span>
                              )}

                              <button
                                onClick={() => store.linkHabitToGoal(habit.id, null)}
                                className="text-[10px] text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg hover:bg-gray-100"
                                title="Unlink habit from goal"
                              >
                                Unlink
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. Unassigned Habits Group */}
      {unassignedHabits.length > 0 && (
        <div className="p-5 rounded-3xl bg-white/60 backdrop-blur-md border border-white/60 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Unassigned Habits ({unassignedHabits.length})
            </h3>
            <span className="text-[11px] text-gray-400">
              Not currently tied to a specific goal
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {unassignedHabits.map((habit) => (
              <div
                key={habit.id}
                className="p-3 rounded-2xl bg-white/80 border border-gray-100 flex items-center justify-between"
              >
                <div className="flex items-center gap-2 truncate">
                  {habit.icon && <span>{habit.icon}</span>}
                  <span className="text-xs font-bold text-gray-700 truncate">{habit.name}</span>
                </div>

                {activeGoals.length > 0 && (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) {
                        store.linkHabitToGoal(habit.id, e.target.value);
                      }
                    }}
                    className="text-[10px] font-semibold p-1 rounded-lg border border-gray-200 bg-gray-50 text-gray-600"
                  >
                    <option value="" disabled>
                      + Link to Goal
                    </option>
                    {activeGoals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. Collapsible Achieved & Archived Goals */}
      {inactiveGoals.length > 0 && (
        <div className="p-4 rounded-3xl bg-white/50 backdrop-blur-md border border-white/60 shadow-sm space-y-3">
          <button
            onClick={() => setAchievedExpanded(!achievedExpanded)}
            className="flex items-center justify-between w-full text-xs font-bold text-gray-500 uppercase tracking-wider"
          >
            <span>Achieved & Archived Goals ({inactiveGoals.length})</span>
            {achievedExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>

          {achievedExpanded && (
            <div className="space-y-2 pt-2 border-t border-gray-100">
              {inactiveGoals.map((g) => (
                <div
                  key={g.id}
                  className="p-3.5 rounded-2xl bg-white/70 border border-gray-100 flex items-center justify-between"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800">{g.title}</span>
                      {g.achieved_on && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 size={11} /> Achieved ({g.achieved_on})
                        </span>
                      )}
                      {g.archived_on && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-600">
                          Archived
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    onClick={() => store.deleteGoalPermanently(g.id)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600"
                    title="Delete permanently"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── CREATE / EDIT GOAL MODAL ── */}
      <AnimatePresence>
        {modalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl bg-white p-6 shadow-xl border border-gray-100 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <h3 className="text-base font-bold text-gray-800 font-['Fredoka']">
                  {editingGoal ? 'Edit Goal' : 'Create New Goal'}
                </h3>
                <button
                  onClick={() => setModalOpen(false)}
                  className="p-1.5 rounded-xl hover:bg-gray-100 text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveGoal} className="space-y-3.5">
                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                    Goal Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Build Consistent Running Habit, Finish French A1"
                    className="w-full px-3.5 py-2.5 rounded-2xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    rows={2}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Why this goal matters..."
                    className="w-full px-3.5 py-2 rounded-2xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                    Target Count (optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={targetCount}
                    onChange={(e) => setTargetCount(e.target.value)}
                    placeholder="e.g. 30 completed habit-days"
                    className="w-full px-3.5 py-2 rounded-2xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <p className="text-[10px] text-gray-400 mt-1">
                    Total completed habit-days across linked habits to achieve the goal.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wider block mb-1">
                    Target Deadline (optional)
                  </label>
                  <input
                    type="date"
                    value={deadline}
                    min={today}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-2xl border border-gray-200 text-xs"
                  />
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
                    {editingGoal ? 'Save Changes' : 'Create Goal'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ── LINK HABIT MODAL ── */}
      <AnimatePresence>
        {assignHabitGoalId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-xl border border-gray-100 space-y-4"
            >
              <div className="flex items-center justify-between pb-2 border-b border-gray-100">
                <h3 className="text-sm font-bold text-gray-800 font-['Fredoka']">
                  Link Habit to Goal
                </h3>
                <button
                  onClick={() => setAssignHabitGoalId(null)}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  <X size={15} />
                </button>
              </div>

              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {state.habits
                  .filter((h) => !h.archived_on)
                  .map((h) => {
                    const isAlreadyLinked = h.goal_id === assignHabitGoalId;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={async () => {
                          await store.linkHabitToGoal(
                            h.id,
                            isAlreadyLinked ? null : assignHabitGoalId
                          );
                          setAssignHabitGoalId(null);
                        }}
                        className={`w-full p-2.5 rounded-xl text-left text-xs font-semibold flex items-center justify-between transition-colors ${
                          isAlreadyLinked
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'hover:bg-gray-50 text-gray-700'
                        }`}
                      >
                        <span className="truncate">
                          {h.icon && `${h.icon} `}
                          {h.name}
                        </span>
                        {isAlreadyLinked ? (
                          <span className="text-[10px] text-emerald-600 font-bold">Linked ✓</span>
                        ) : (
                          <span className="text-[10px] text-gray-400">Select</span>
                        )}
                      </button>
                    );
                  })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
