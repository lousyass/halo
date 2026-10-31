import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, X, Check, Loader2 } from 'lucide-react';
import { MoneyCategory } from '../../lib/moneyScoring';

const PRESET_COLORS = [
  '#f97316', // Orange
  '#06b6d4', // Cyan
  '#eab308', // Amber
  '#a855f7', // Purple
  '#10b981', // Emerald
  '#ec4899', // Pink
  '#64748b', // Slate
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#14b8a6', // Teal
];

const PRESET_EMOJIS = ['🍔', '🚗', '💡', '🛍️', '💊', '🎬', '📦', '💼', '💵', '🏠', '📚', '☕', '✈️', '🎮', '🌟'];

interface InlineCategoryCreatorProps {
  isOpen: boolean;
  onClose: () => void;
  kind: 'expense' | 'income';
  existingCategories: MoneyCategory[];
  onSelectCategory: (categoryId: string, notice?: string) => void;
  createCategory: (params: {
    name: string;
    kind: 'expense' | 'income';
    color?: string | null;
    icon?: string | null;
  }) => Promise<MoneyCategory>;
}

export const InlineCategoryCreator: React.FC<InlineCategoryCreatorProps> = ({
  isOpen,
  onClose,
  kind,
  existingCategories,
  onSelectCategory,
  createCategory,
}) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('📦');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Please enter a category name');
      return;
    }

    // Check if category with same name (case-insensitive) already exists for this kind
    const existing = existingCategories.find(
      (c) =>
        c.kind === kind &&
        c.name.trim().toLowerCase() === trimmedName.toLowerCase()
    );

    if (existing) {
      onSelectCategory(existing.id, 'Used existing category');
      setName('');
      onClose();
      return;
    }

    setLoading(true);
    try {
      const created = await createCategory({
        name: trimmedName,
        kind,
        color,
        icon,
      });
      onSelectCategory(created.id, 'Created new category');
      setName('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create category');
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className="p-3.5 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 mt-2 mb-2 space-y-3"
    >
      <div className="flex items-center justify-between pb-1 border-b border-emerald-200/50">
        <h4 className="text-xs font-bold text-emerald-900 font-['Fredoka'] flex items-center gap-1.5">
          <Plus size={13} className="text-emerald-700" />
          <span>New {kind === 'expense' ? 'Expense' : 'Income'} Category</span>
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="p-1 text-emerald-700 hover:text-emerald-950 rounded-lg hover:bg-emerald-100 transition-colors"
        >
          <X size={14} />
        </button>
      </div>

      {error && (
        <div className="text-[11px] text-rose-700 bg-rose-100/80 p-2 rounded-xl border border-rose-200">
          {error}
        </div>
      )}

      <div className="space-y-2.5">
        <div>
          <label className="text-[11px] font-bold text-gray-700 block mb-1">
            Category Name
          </label>
          <input
            type="text"
            placeholder="e.g. Coffee & Snacks"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full p-2 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
            autoFocus
          />
        </div>

        {/* Emoji Swatches */}
        <div>
          <label className="text-[11px] font-bold text-gray-700 block mb-1">
            Icon
          </label>
          <div className="flex flex-wrap gap-1">
            {PRESET_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setIcon(e)}
                className={`w-7 h-7 text-sm rounded-lg flex items-center justify-center transition-transform ${
                  icon === e ? 'bg-white shadow-xs ring-2 ring-emerald-500 scale-110' : 'hover:bg-white/60'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        {/* Color Swatches */}
        <div>
          <label className="text-[11px] font-bold text-gray-700 block mb-1">
            Color
          </label>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-5 h-5 rounded-full flex items-center justify-center transition-transform ${
                  color === c ? 'ring-2 ring-emerald-600 scale-110' : 'hover:scale-105'
                }`}
                style={{ backgroundColor: c }}
              >
                {color === c && <Check size={11} className="text-white drop-shadow-xs" strokeWidth={3} />}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-[11px] font-bold text-gray-600 hover:bg-gray-200/50 rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={loading || !name.trim()}
            className="px-4 py-1.5 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 rounded-xl shadow-xs transition-all flex items-center gap-1 cursor-pointer"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            <span>Save Category</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};
