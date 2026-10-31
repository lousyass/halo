/**
 * ThemesSettingsCard.tsx
 * Card rendered in Settings for managing "My themes":
 * Edit, Duplicate, Delete (with confirmation), and Create.
 */

import React, { useState } from 'react';
import {
  Palette,
  Plus,
  Pencil,
  Copy,
  Trash2,
  Check,
  Sun,
  Moon,
  Sparkles,
} from 'lucide-react';
import { CustomThemeRecord, CustomThemeImageRecord } from '../../lib/customThemeTokens';

interface ThemesSettingsCardProps {
  customThemes: CustomThemeRecord[];
  customThemeImages: CustomThemeImageRecord[];
  activeTheme: string;
  onSelectTheme: (themeKey: string) => void;
  onOpenCreate: () => void;
  onOpenEdit: (theme: CustomThemeRecord) => void;
  onDuplicate: (themeId: string) => Promise<void>;
  onDelete: (themeId: string) => Promise<void>;
}

export const ThemesSettingsCard: React.FC<ThemesSettingsCardProps> = ({
  customThemes,
  customThemeImages,
  activeTheme,
  onSelectTheme,
  onOpenCreate,
  onOpenEdit,
  onDuplicate,
  onDelete,
}) => {
  const [themeToDelete, setThemeToDelete] = useState<CustomThemeRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (!themeToDelete) return;
    setDeleting(true);
    try {
      await onDelete(themeToDelete.id);
      setThemeToDelete(null);
    } catch (err: any) {
      alert(err.message || 'Failed to delete theme');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="relative rounded-3xl bg-white/80 shadow-[0_4px_18px_rgba(120,90,130,0.12)] border border-white/60 p-5 space-y-4">
      {/* Tape sticker decoration matching Academics */}
      <div
        className="absolute -top-2 left-6 w-10 h-4 rounded-sm opacity-70 pointer-events-none"
        style={{
          background:
            'repeating-linear-gradient(45deg,rgba(255,255,255,.6),rgba(255,255,255,.6) 4px,rgba(230,200,215,.55) 4px,rgba(230,200,215,.55) 8px)',
          transform: 'rotate(-4deg)',
        }}
      />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-black/5">
        <div>
          <h3
            className="font-bold text-base flex items-center gap-2 font-['Fredoka']"
            style={{ color: '#5B4B6D' }}
          >
            <span>🎨</span> Custom Themes
          </h3>
          <p className="text-xs text-gray-500">
            Design your own personalized themes and visual aesthetics.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500">
            {customThemes.length} / 5 themes
          </span>
          <button
            type="button"
            onClick={onOpenCreate}
            disabled={customThemes.length >= 5}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 shadow-xs transition-all cursor-pointer"
          >
            <Plus size={13} />
            <span>New Theme</span>
          </button>
        </div>
      </div>

      {customThemes.length === 0 ? (
        <div className="py-8 text-center space-y-2 bg-gray-50/60 rounded-2xl border border-gray-100">
          <div className="w-10 h-10 mx-auto rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center text-lg">
            ✨
          </div>
          <p className="text-xs font-semibold text-gray-700">No custom themes created yet</p>
          <p className="text-[11px] text-gray-500 max-w-xs mx-auto">
            Click "+ New Theme" to choose your custom colors, light or dark mode, and decorative images.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-2xl bg-white/70 border border-gray-100 overflow-hidden">
          {customThemes.map((theme) => {
            const isCurrent = activeTheme === `custom:${theme.id}`;
            const imagesForTheme = customThemeImages.filter((i) => i.theme_id === theme.id);

            return (
              <div
                key={theme.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 gap-3 hover:bg-white/90 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {/* Swatch preview */}
                  <div className="flex items-center -space-x-2 shrink-0">
                    <span
                      className="w-7 h-7 rounded-full shadow-2xs border-2 border-white"
                      style={{ backgroundColor: theme.primary_color }}
                      title={`Primary: ${theme.primary_color}`}
                    />
                    <span
                      className="w-7 h-7 rounded-full shadow-2xs border-2 border-white"
                      style={{ backgroundColor: theme.background_color }}
                      title={`Background: ${theme.background_color}`}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-gray-800 truncate">
                        {theme.name}
                      </h4>
                      {isCurrent && (
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-gray-500 flex items-center gap-2 mt-0.5">
                      <span className="flex items-center gap-1 font-medium capitalize">
                        {theme.mode === 'dark' ? <Moon size={11} className="text-indigo-400" /> : <Sun size={11} className="text-amber-500" />}
                        {theme.mode}
                      </span>
                      <span>•</span>
                      <span>{imagesForTheme.length} decorative {imagesForTheme.length === 1 ? 'image' : 'images'}</span>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
                  {!isCurrent ? (
                    <button
                      type="button"
                      onClick={() => onSelectTheme(`custom:${theme.id}`)}
                      className="px-2.5 py-1 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors cursor-pointer"
                    >
                      Apply
                    </button>
                  ) : (
                    <span className="px-2.5 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg flex items-center gap-1">
                      <Check size={12} />
                      Applied
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => onOpenEdit(theme)}
                    className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                    title="Edit theme"
                  >
                    <Pencil size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => onDuplicate(theme.id)}
                    disabled={customThemes.length >= 5}
                    className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 disabled:opacity-40 rounded-lg transition-colors cursor-pointer"
                    title="Duplicate theme"
                  >
                    <Copy size={14} />
                  </button>

                  <button
                    type="button"
                    onClick={() => setThemeToDelete(theme)}
                    className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                    title="Delete theme"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {themeToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-2xs">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-100 p-5 space-y-4">
            <h4 className="font-bold text-sm text-gray-900 font-['Fredoka']">
              Delete Theme "{themeToDelete.name}"?
            </h4>
            <p className="text-xs text-gray-600 leading-relaxed">
              Are you sure you want to delete this custom theme and all its uploaded images? If this theme is currently active, Halo will revert to Blush Bloom.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setThemeToDelete(null)}
                disabled={deleting}
                className="px-3 py-1.5 text-xs font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="px-4 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 disabled:opacity-50 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                {deleting ? 'Deleting...' : 'Delete Theme'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
