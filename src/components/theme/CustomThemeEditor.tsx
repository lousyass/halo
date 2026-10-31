/**
 * CustomThemeEditor.tsx
 * Lazy-loaded editor for creating and modifying custom themes.
 * Includes color plates, 5 image slots with thumbnails, live preview,
 * and WCAG AA contrast indicators.
 */

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  X,
  Plus,
  Upload,
  Trash2,
  AlertTriangle,
  Check,
  Eye,
  Sun,
  Moon,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  CustomThemeRecord,
  CustomThemeImageRecord,
  deriveThemeTokens,
  validateThemeContrast,
  getContrastRatio,
} from '../../lib/customThemeTokens';
import {
  ThemeSlot,
  validateThemeImageInput,
} from '../../lib/customThemeImages';

export interface CustomThemeEditorProps {
  userId: string;
  themeToEdit?: CustomThemeRecord | null;
  existingImages?: CustomThemeImageRecord[];
  onSave: (params: {
    name: string;
    mode: 'light' | 'dark';
    primaryColor: string;
    backgroundColor: string;
    newImages: { slot: ThemeSlot; file: File }[];
    deletedImageIds: string[];
  }) => Promise<void>;
  onClose: () => void;
}

const PRIMARY_SWATCHES = [
  '#ec4899', // Pink
  '#8b5cf6', // Violet
  '#3b82f6', // Blue
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#ef4444', // Rose/Red
  '#06b6d4', // Cyan
  '#6366f1', // Indigo
  '#14b8a6', // Teal
  '#d946ef', // Fuchsia
  '#475569', // Slate
  '#111827', // Black
];

const LIGHT_BG_SWATCHES = [
  '#FDF2F6', // Blush
  '#F3FAF5', // Mint
  '#FFF6E9', // Golden
  '#F6F1FC', // Lilac
  '#F0F7FD', // Baby Blue
  '#F9FAFB', // Cool Gray
  '#FFFBEB', // Warm Sand
  '#FDF4FF', // Soft Pink
];

const DARK_BG_SWATCHES = [
  '#18181b', // Zinc
  '#1e1b2e', // Deep Lilac
  '#131c26', // Midnight Navy
  '#122019', // Dark Pine
  '#231919', // Dark Rose
  '#0f172a', // Slate
  '#1c1917', // Stone
  '#09090b', // Pure Charcoal
];

const SLOTS: { key: ThemeSlot; label: string; maxEdge: number; desc: string }[] = [
  { key: 'background', label: 'Background', maxEdge: 1600, desc: 'Full page wallpaper' },
  { key: 'dashboard', label: 'Dashboard', maxEdge: 1200, desc: 'All tasks & coming soon panels' },
  { key: 'routine', label: 'Routine', maxEdge: 1200, desc: 'Routine & habit cards' },
  { key: 'calendar', label: 'Calendar', maxEdge: 1600, desc: 'Academics & Lifestyle month view' },
  { key: 'diary', label: 'Diary', maxEdge: 1200, desc: 'Memory Wall & Journal backdrop' },
];

export const CustomThemeEditor: React.FC<CustomThemeEditorProps> = ({
  themeToEdit,
  existingImages = [],
  onSave,
  onClose,
}) => {
  const isEditing = !!themeToEdit;

  const [name, setName] = useState(themeToEdit?.name || '');
  const [mode, setMode] = useState<'light' | 'dark'>(themeToEdit?.mode || 'light');
  const [primaryColor, setPrimaryColor] = useState(
    themeToEdit?.primary_color || PRIMARY_SWATCHES[0]
  );
  const [backgroundColor, setBackgroundColor] = useState(
    themeToEdit?.background_color || LIGHT_BG_SWATCHES[0]
  );

  // Images state
  const [deletedImageIds, setDeletedImageIds] = useState<string[]>([]);
  const [newImageFiles, setNewImageFiles] = useState<{ id: string; slot: ThemeSlot; file: File; previewUrl: string }[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // When switching mode, auto-suggest a background color if untouched
  const handleModeChange = (nextMode: 'light' | 'dark') => {
    setMode(nextMode);
    if (nextMode === 'dark' && LIGHT_BG_SWATCHES.includes(backgroundColor)) {
      setBackgroundColor(DARK_BG_SWATCHES[0]);
    } else if (nextMode === 'light' && DARK_BG_SWATCHES.includes(backgroundColor)) {
      setBackgroundColor(LIGHT_BG_SWATCHES[0]);
    }
  };

  // Derived tokens for live preview
  const tokens = useMemo(() => {
    return deriveThemeTokens(primaryColor, backgroundColor, mode);
  }, [primaryColor, backgroundColor, mode]);

  // Contrast validation
  const contrastCheck = useMemo(() => {
    return validateThemeContrast(primaryColor, backgroundColor, mode);
  }, [primaryColor, backgroundColor, mode]);

  const btnContrastRatio = useMemo(() => {
    return getContrastRatio(tokens.primaryText, primaryColor);
  }, [tokens.primaryText, primaryColor]);

  // Current active existing images (excluding staged deletions)
  const activeExistingImages = useMemo(() => {
    return existingImages.filter((img) => !deletedImageIds.includes(img.id));
  }, [existingImages, deletedImageIds]);

  const handleFileSelect = (slot: ThemeSlot, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const currentCount =
      activeExistingImages.filter((i) => i.slot === slot).length +
      newImageFiles.filter((i) => i.slot === slot).length;

    const remainingSlots = 4 - currentCount;
    if (remainingSlots <= 0) {
      alert(`Maximum of 4 images reached for the ${slot} slot.`);
      return;
    }

    const added: { id: string; slot: ThemeSlot; file: File; previewUrl: string }[] = [];
    for (let i = 0; i < Math.min(files.length, remainingSlots); i++) {
      const file = files[i];
      const val = validateThemeImageInput(file);
      if (!val.valid) {
        alert(val.error);
        continue;
      }
      added.push({
        id: crypto.randomUUID(),
        slot,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setNewImageFiles((prev) => [...prev, ...added]);
    e.target.value = '';
  };

  const handleRemoveExistingImage = (id: string) => {
    setDeletedImageIds((prev) => [...prev, id]);
  };

  const handleRemoveNewImage = (tempId: string) => {
    setNewImageFiles((prev) => {
      const item = prev.find((i) => i.id === tempId);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== tempId);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = name.trim();
    if (!trimmed) {
      setError('Please provide a theme name.');
      return;
    }
    if (trimmed.length > 30) {
      setError('Theme name must be 30 characters or fewer.');
      return;
    }

    setSaving(true);
    try {
      await onSave({
        name: trimmed,
        mode,
        primaryColor,
        backgroundColor,
        newImages: newImageFiles.map(({ slot, file }) => ({ slot, file })),
        deletedImageIds,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save theme');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-6 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <motion.div
        initial={{ scale: 0.96, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.96, opacity: 0 }}
        className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-gray-100 overflow-hidden flex flex-col max-h-[92vh]"
      >
        {/* Header */}
        <div className="p-4 px-6 border-b border-gray-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-purple-50 text-purple-600">
              <Sparkles size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900 font-['Fredoka']">
                {isEditing ? `Edit Theme: ${themeToEdit?.name}` : 'Create Custom Theme'}
              </h2>
              <p className="text-xs text-gray-500">
                Personalize your colors, base mode, and visual decoration images.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-xl hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl flex items-center gap-2">
              <AlertTriangle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* 1. Name & Base Mode */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">
                Theme Name <span className="text-gray-400 font-normal">(1-30 chars)</span>
              </label>
              <input
                type="text"
                maxLength={30}
                required
                placeholder="e.g. Lavender Mist, Cyberpunk Dark"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-gray-700 block mb-1">Base Mode</label>
              <div className="flex bg-gray-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleModeChange('light')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    mode === 'light'
                      ? 'bg-white text-gray-900 shadow-xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Sun size={14} className="text-amber-500" />
                  <span>Light</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleModeChange('dark')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    mode === 'dark'
                      ? 'bg-zinc-800 text-white shadow-xs'
                      : 'text-gray-500 hover:text-gray-800'
                  }`}
                >
                  <Moon size={14} className="text-indigo-400" />
                  <span>Dark</span>
                </button>
              </div>
            </div>
          </div>

          {/* 2. Primary Color & Background Color Plates */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 rounded-2xl bg-gray-50/70 border border-gray-100">
            {/* Primary Color Plate */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700">Primary Color</label>
                <span className="text-[11px] font-mono font-bold text-gray-500">
                  {primaryColor.toUpperCase()}
                </span>
              </div>

              {/* Swatch grid */}
              <div className="flex flex-wrap gap-2">
                {PRIMARY_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setPrimaryColor(swatch)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-transform cursor-pointer ${
                      primaryColor.toLowerCase() === swatch.toLowerCase()
                        ? 'ring-2 ring-purple-500 scale-110 shadow-xs'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: swatch }}
                  >
                    {primaryColor.toLowerCase() === swatch.toLowerCase() && (
                      <Check size={14} className="text-white drop-shadow-xs" strokeWidth={3} />
                    )}
                  </button>
                ))}
              </div>

              {/* Native picker + Hex Input */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                />
                <input
                  type="text"
                  value={primaryColor}
                  onChange={(e) => {
                    const val = e.target.value;
                    setPrimaryColor(val);
                  }}
                  placeholder="#8B5CF6"
                  className="w-28 p-1.5 rounded-lg border border-gray-200 text-xs font-mono font-bold uppercase text-gray-800"
                />
              </div>

              {/* Contrast Badge */}
              <div className="pt-1">
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
                    btnContrastRatio >= 4.5
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {btnContrastRatio >= 4.5 ? <Check size={12} /> : <AlertTriangle size={12} />}
                  WCAG AA: {btnContrastRatio.toFixed(1)}:1 ({tokens.primaryText === '#ffffff' ? 'White label' : 'Dark label'})
                </span>
              </div>
            </div>

            {/* Background Color Plate */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700">Background Tint</label>
                <span className="text-[11px] font-mono font-bold text-gray-500">
                  {backgroundColor.toUpperCase()}
                </span>
              </div>

              {/* Swatch grid */}
              <div className="flex flex-wrap gap-2">
                {(mode === 'dark' ? DARK_BG_SWATCHES : LIGHT_BG_SWATCHES).map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setBackgroundColor(swatch)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center border border-black/10 transition-transform cursor-pointer ${
                      backgroundColor.toLowerCase() === swatch.toLowerCase()
                        ? 'ring-2 ring-purple-500 scale-110 shadow-xs'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: swatch }}
                  >
                    {backgroundColor.toLowerCase() === swatch.toLowerCase() && (
                      <Check
                        size={14}
                        className={mode === 'dark' ? 'text-white' : 'text-gray-800'}
                        strokeWidth={3}
                      />
                    )}
                  </button>
                ))}
              </div>

              {/* Native picker + Hex Input */}
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  className="w-8 h-8 rounded-lg cursor-pointer border-0 bg-transparent p-0"
                />
                <input
                  type="text"
                  value={backgroundColor}
                  onChange={(e) => setBackgroundColor(e.target.value)}
                  placeholder="#F3FAF5"
                  className="w-28 p-1.5 rounded-lg border border-gray-200 text-xs font-mono font-bold uppercase text-gray-800"
                />
              </div>
            </div>
          </div>

          {/* Contrast Warnings if any */}
          {contrastCheck.warnings.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-2xl space-y-1">
              <div className="font-bold flex items-center gap-1.5">
                <AlertTriangle size={14} />
                <span>Accessibility Warning</span>
              </div>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px]">
                {contrastCheck.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* 3. Live Preview */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-gray-700 flex items-center gap-1.5">
              <Eye size={14} className="text-purple-600" />
              <span>Live Theme Preview</span>
            </label>

            <div
              className="p-5 rounded-3xl transition-colors border shadow-inner flex flex-col md:flex-row gap-4"
              style={{ background: tokens.backgroundCss, borderColor: tokens.surfaceBorder }}
            >
              {/* Sidebar Preview Item */}
              <div
                className="p-3 rounded-2xl w-full md:w-48 flex items-center gap-2.5 font-bold text-xs"
                style={{
                  background: tokens.surface,
                  color: tokens.textHeading,
                  border: `1px solid ${tokens.surfaceBorder}`,
                }}
              >
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center text-xs"
                  style={{ backgroundColor: primaryColor, color: tokens.primaryText }}
                >
                  ✨
                </div>
                <span>Halo Active Pill</span>
              </div>

              {/* Sample Card with text and button */}
              <div
                className="flex-1 p-4 rounded-2xl space-y-3"
                style={{
                  background: tokens.surface,
                  border: `1px solid ${tokens.surfaceBorder}`,
                }}
              >
                <div className="flex items-center justify-between">
                  <h4
                    className="font-bold text-sm font-['Fredoka']"
                    style={{ color: tokens.textHeading }}
                  >
                    Sample Card Heading
                  </h4>
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                    style={{ background: tokens.primaryLight, color: primaryColor }}
                  >
                    Badge
                  </span>
                </div>

                <p className="text-xs leading-relaxed" style={{ color: tokens.textBody }}>
                  This card previews body typography contrast against the theme surface.
                </p>

                <div className="flex items-center justify-between pt-1">
                  {/* Calendar mini cell */}
                  <div
                    className="w-12 h-10 rounded-xl p-1 flex flex-col justify-between text-left"
                    style={{
                      background: tokens.surfaceSolid,
                      border: `1px solid ${tokens.surfaceBorder}`,
                    }}
                  >
                    <span
                      className="text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: primaryColor, color: tokens.primaryText }}
                    >
                      31
                    </span>
                  </div>

                  {/* Primary button */}
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl text-xs font-bold shadow-xs cursor-default"
                    style={{ backgroundColor: primaryColor, color: tokens.primaryText }}
                  >
                    Action Button
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* 4. Five Optional Image Slots */}
          <div className="space-y-4 pt-2 border-t border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <div>
                <h3 className="text-sm font-bold text-gray-900 font-['Fredoka'] flex items-center gap-1.5">
                  <Upload size={16} className="text-purple-600" />
                  <span>Decorative Image Slots</span>
                </h3>
                <p className="text-xs text-gray-500">
                  Optional images appear when Style is set to <strong>Custom</strong>. Up to 4 per slot.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {SLOTS.map((slot) => {
                const existingForSlot = activeExistingImages.filter((i) => i.slot === slot.key);
                const newForSlot = newImageFiles.filter((i) => i.slot === slot.key);
                const totalInSlot = existingForSlot.length + newForSlot.length;
                const remaining = 4 - totalInSlot;

                return (
                  <div
                    key={slot.key}
                    className="p-4 rounded-2xl bg-gray-50/70 border border-gray-100 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wide">
                          {slot.label}
                        </h4>
                        <p className="text-[11px] text-gray-400">{slot.desc}</p>
                      </div>
                      <span className="text-[11px] font-bold text-gray-500">
                        {totalInSlot} / 4
                      </span>
                    </div>

                    {/* Thumbnails */}
                    <div className="flex flex-wrap gap-2 min-h-[56px] items-center">
                      {/* Existing image thumbnails */}
                      {existingForSlot.map((img) => (
                        <div
                          key={img.id}
                          className="relative w-14 h-14 rounded-xl overflow-hidden border border-gray-200 group bg-gray-100 shadow-2xs"
                        >
                          <img
                            src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/theme-images/${img.storage_path}`}
                            alt={slot.label}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveExistingImage(img.id)}
                            className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="Remove image"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}

                      {/* Newly staged image thumbnails */}
                      {newForSlot.map((img) => (
                        <div
                          key={img.id}
                          className="relative w-14 h-14 rounded-xl overflow-hidden border-2 border-emerald-400 group bg-gray-100 shadow-2xs"
                        >
                          <img
                            src={img.previewUrl}
                            alt={slot.label}
                            className="w-full h-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemoveNewImage(img.id)}
                            className="absolute inset-0 bg-black/50 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            title="Remove image"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}

                      {/* Add button if slots remain */}
                      {remaining > 0 && (
                        <label className="w-14 h-14 rounded-xl border-2 border-dashed border-gray-300 hover:border-purple-400 bg-white flex flex-col items-center justify-center text-gray-400 hover:text-purple-600 cursor-pointer transition-colors">
                          <Plus size={16} />
                          <span className="text-[9px] font-bold mt-0.5">Add</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            multiple
                            onChange={(e) => handleFileSelect(slot.key, e)}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              <span>{isEditing ? 'Save Changes' : 'Create Theme'}</span>
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default CustomThemeEditor;
