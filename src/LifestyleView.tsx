import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckSquare,
  CalendarDays,
  ListTodo,
  Target,
  BarChart3,
  Loader2,
} from 'lucide-react';
import { LifestyleToday } from './components/lifestyle/LifestyleToday';
import { LifestyleCalendar } from './components/lifestyle/LifestyleCalendar';
import { LifestyleHabits } from './components/lifestyle/LifestyleHabits';
import { LifestyleGoals } from './components/lifestyle/LifestyleGoals';
import { LifestyleStats } from './components/lifestyle/LifestyleStats';
import { useLifestyle } from './lib/useLifestyle';

export type LifestyleSubTab = 'today' | 'calendar' | 'habits' | 'goals' | 'stats';

interface LifestyleViewProps {
  userId: string;
  session?: any;
  theme?: string;
  visualSettings?: any;
}

export const LifestyleView: React.FC<LifestyleViewProps> = ({
  userId,
  theme,
  visualSettings,
}) => {
  const [activeTab, setActiveTab] = useState<LifestyleSubTab>('today');
  const { state } = useLifestyle(userId);

  const subTabs = [
    { id: 'today' as const, label: 'Today', icon: CheckSquare },
    { id: 'calendar' as const, label: 'Calendar', icon: CalendarDays },
    { id: 'habits' as const, label: 'Habits', icon: ListTodo },
    { id: 'goals' as const, label: 'Goals', icon: Target },
    { id: 'stats' as const, label: 'Stats', icon: BarChart3 },
  ];

  if (state.loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-gray-500">
        <Loader2 className="animate-spin text-emerald-600 mb-3" size={32} />
        <p className="text-sm font-semibold font-['Fredoka']">Loading Lifestyle Mode...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Sub-tabs Navigation Bar ── */}
      <div className="flex items-center justify-between p-1.5 rounded-2xl bg-white/60 backdrop-blur-md border border-white/60 shadow-sm overflow-x-auto no-print">
        <div className="flex items-center gap-1">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'text-emerald-950 font-bold'
                    : 'text-gray-500 hover:text-gray-800 hover:bg-white/40'
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="lifestyle-active-subtab"
                    className="absolute inset-0 bg-white rounded-xl shadow-sm border border-emerald-100"
                    transition={{ type: 'spring', duration: 0.3, bounce: 0.15 }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-1.5">
                  <Icon size={14} className={isActive ? 'text-emerald-600' : 'text-gray-400'} />
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active Tab View ── */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === 'today' && (
            <LifestyleToday
              userId={userId}
              theme={theme}
              onNavigateToHabits={() => setActiveTab('habits')}
            />
          )}

          {activeTab === 'calendar' && (
            <LifestyleCalendar userId={userId} />
          )}

          {activeTab === 'habits' && (
            <LifestyleHabits userId={userId} />
          )}

          {activeTab === 'goals' && (
            <LifestyleGoals userId={userId} />
          )}

          {activeTab === 'stats' && (
            <LifestyleStats userId={userId} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default LifestyleView;
