import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import {
  getDecorativeImage,
  getCalendarMonthImage,
  preloadCalendarAround,
  DEFAULT_VISUAL_SETTINGS,
  VisualCustomizationSettings,
} from "./lib/decorativeImages";
import {
  Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight, Pin,
  Image as ImageIcon, Shuffle, BookOpen, Calendar as CalendarIcon,
  Search, Sparkles, ExternalLink, Calendar, Check,
} from "lucide-react";

/* ─────────────────────────── types ─────────────────────────── */

export interface JournalEntry {
  id: string;
  user_id: string;
  entry_date: string;
  content: string;
  mood: string | null;
  is_pinned: boolean;
  created_at: string;
}

export interface JournalPhoto {
  id: string;
  journal_entry_id: string;
  user_id: string;
  image_url: string;
  original_drive_url: string | null;
  created_at: string;
}

const MOODS: { value: string; emoji: string; label: string; color: string; bg: string }[] = [
  { value: "gorgeous",           emoji: "💖", label: "Gorgeous",           color: "#DB2777", bg: "#FCE7F3" },
  { value: "stunning",           emoji: "✨", label: "Stunning",           color: "#7C3AED", bg: "#EDE9FE" },
  { value: "pretty",             emoji: "🌸", label: "Pretty",             color: "#E11D48", bg: "#FFE4E6" },
  { value: "cute",               emoji: "🎀", label: "Cute",               color: "#D946EF", bg: "#FAE8FF" },
  { value: "okay",               emoji: "🌤️", label: "Okay",               color: "#0284C7", bg: "#E0F2FE" },
  { value: "jellyfish",          emoji: "🪼", label: "Jellyfish",          color: "#0D9488", bg: "#CCFBF1" },
  { value: "bored",              emoji: "🥱", label: "Bored",              color: "#64748B", bg: "#F1F5F9" },
  { value: "cult_leader_energy", emoji: "👑", label: "Cult Leader Energy", color: "#D97706", bg: "#FEF3C7" },
  { value: "blocking",           emoji: "🛑", label: "Blocking",           color: "#DC2626", bg: "#FEE2E2" },
];

export function getMoodMeta(moodVal: string | null): { emoji: string; label: string; color: string; bg: string } | null {
  if (!moodVal) return null;
  const raw = moodVal.trim();
  const normalized = raw.toLowerCase().replace(/[\s-]+/g, "_");
  const found = MOODS.find((m) => m.value === normalized || m.value === raw.toLowerCase() || m.label.toLowerCase() === raw.toLowerCase());
  if (found) return found;
  return {
    emoji: "💭",
    label: raw.charAt(0).toUpperCase() + raw.slice(1),
    color: "#6D28D9",
    bg: "#F5F3FF",
  };
}

const DIARY_PROMPTS = [
  "Dear Diary, today was...",
  "Something that made me smile today...",
  "What's on my mind right now...",
  "A small moment worth remembering...",
  "Today I noticed...",
  "The little things from today...",
  "How I'm feeling as the day closes...",
  "Something unexpected that happened...",
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr() { return fmtDate(new Date()); }
function niceDate(dateStr: string) {
  if (!dateStr) return "";
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
function monthGrid(year: number, month: number): (number | null)[] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

/* ─────────────────────────── image compression ─────────────────────────── */

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      const maxW = 1200;
      const scale = Math.min(1, maxW / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")), "image/jpeg", 0.82);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* ─────────────────────────── Diary Book: Writing Page Component (2-Page Spread) ─────────────────────────── */

function DiaryWritePage({
  userId,
  initial,
  onSave,
  onCancel,
}: {
  userId: string;
  initial?: Partial<JournalEntry> | null;
  onSave: (entry: JournalEntry, newFiles: File[], deletedPhotoIds: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [date, setDate] = useState(initial?.entry_date || todayStr());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [content, setContent] = useState(initial?.content || "");
  const [mood, setMood] = useState<string | null>(initial?.mood || null);
  const [customMoodInput, setCustomMoodInput] = useState<string>(() => {
    if (!initial?.mood) return "";
    const isCurated = MOODS.some(m => m.value === initial.mood);
    return isCurated ? "" : initial.mood;
  });
  const [isPinned, setIsPinned] = useState(initial?.is_pinned || false);
  const [photos, setPhotos] = useState<JournalPhoto[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Pick a random placeholder prompt when entering write mode
  const placeholderPrompt = useMemo(() => {
    return DIARY_PROMPTS[Math.floor(Math.random() * DIARY_PROMPTS.length)];
  }, []);

  // Load existing photos if editing
  useEffect(() => {
    if (!initial?.id) return;
    supabase
      .from("journal_photos")
      .select("*")
      .eq("journal_entry_id", initial.id)
      .then(({ data }) => setPhotos((data as JournalPhoto[]) || []));
  }, [initial?.id]);

  const handleSave = async () => {
    if (!content.trim()) return;
    setSaving(true);
    await onSave(
      {
        id: initial?.id || crypto.randomUUID(),
        user_id: userId,
        entry_date: date,
        content: content.trim(),
        mood,
        is_pinned: isPinned,
        created_at: initial?.created_at || new Date().toISOString(),
      },
      newFiles,
      deletedPhotoIds
    );
    setSaving(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setNewFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removeNewFile = (idx: number) => setNewFiles((prev) => prev.filter((_, i) => i !== idx));
  const removeExistingPhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setDeletedPhotoIds((prev) => [...prev, id]);
  };

  return (
    <div className="w-full max-w-6xl mx-auto my-2">
      {/* Hardcover Open Book Frame */}
      <div className="relative bg-[#F4EFE6] rounded-[32px] p-4 sm:p-7 md:p-8 border-2 border-[#E5DAC8] shadow-2xl overflow-hidden">
        {/* Top Bookmark Ribbon */}
        <div className="absolute top-0 right-16 sm:right-24 w-6 h-14 bg-pink-400/90 rounded-b-md shadow-md z-20 flex items-center justify-center">
          <span className="text-xs text-white font-bold">♥</span>
        </div>

        {/* 2-Page Spread Container */}
        <div className="grid grid-cols-1 md:grid-cols-2 rounded-2xl bg-[#FFFDF9] border border-[#E8DFD1] shadow-inner overflow-hidden relative min-h-[580px] md:min-h-[640px]">
          {/* Center Spine Shadow Overlay */}
          <div className="hidden md:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-10 pointer-events-none z-10 bg-gradient-to-r from-black/[0.07] via-black/[0.01] to-black/[0.07]" />

          {/* ── LEFT PAGE: Photos & Polaroids ── */}
          <div className="p-6 sm:p-8 md:p-10 border-b md:border-b-0 md:border-r border-[#EFE8DC] flex flex-col justify-between bg-gradient-to-br from-[#FFFDF9] to-[#FAF5EC]/70">
            <div>
              <div className="flex items-center justify-between border-b border-[#EFE8DC] pb-3 mb-5">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">📷</span>
                  <h4 className="font-bold text-base sm:text-lg text-[#5B4B6D]" style={{ fontFamily: "Fredoka, sans-serif" }}>
                    Polaroid Memories
                  </h4>
                </div>
                <span className="text-sm text-[#9B8BAD] italic" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "16px" }}>
                  tuck in your photos ~
                </span>
              </div>

              {/* Polaroids Grid */}
              <div className="grid grid-cols-2 gap-4 mb-4">
                {/* Existing Photos */}
                {photos.map((p) => (
                  <div
                    key={p.id}
                    className="relative bg-white p-2.5 pb-4 rounded-2xl shadow-md border border-[#E8E2D8] transform rotate-[-1.5deg] group hover:rotate-0 transition-transform"
                  >
                    <img src={p.image_url} alt="" className="w-full h-36 sm:h-44 object-cover rounded-xl" />
                    <button
                      type="button"
                      onClick={() => removeExistingPhoto(p.id)}
                      className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                    {p.original_drive_url && (
                      <span className="text-[10px] text-[#8A7B9D] mt-1.5 block text-right font-medium">Drive saved</span>
                    )}
                  </div>
                ))}

                {/* Newly Attached Files */}
                {newFiles.map((f, i) => (
                  <div
                    key={i}
                    className="relative bg-white p-2.5 pb-4 rounded-2xl shadow-md border border-[#E8E2D8] transform rotate-[1.5deg] group hover:rotate-0 transition-transform"
                  >
                    <img src={URL.createObjectURL(f)} alt="" className="w-full h-36 sm:h-44 object-cover rounded-xl" />
                    <button
                      type="button"
                      onClick={() => removeNewFile(i)}
                      className="absolute -top-2 -right-2 w-7 h-7 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X size={14} />
                    </button>
                    <span className="text-xs text-purple-600 mt-1.5 block text-center font-bold" style={{ fontFamily: "'Patrick Hand', cursive" }}>
                      new print ✨
                    </span>
                  </div>
                ))}

                {/* Polaroid Photo Attach Trigger */}
                <label
                  className="relative bg-white/80 hover:bg-white p-4 rounded-2xl shadow-xs border-2 border-dashed border-[#C9B6E4] transform rotate-[-1deg] hover:rotate-0 transition-all flex flex-col items-center justify-center text-center cursor-pointer group min-h-[160px]"
                >
                  <div className="w-11 h-11 rounded-full bg-purple-50 flex items-center justify-center text-[#9B8BAD] group-hover:text-[#5B4B6D] mb-2 transition-colors">
                    <ImageIcon size={22} />
                  </div>
                  <span
                    className="text-sm text-[#5B4B6D] font-bold group-hover:text-[#7C3AED] leading-tight"
                    style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "16px" }}
                  >
                    + Tuck in photo
                  </span>
                  <span className="text-[10px] text-[#9B8BAD] mt-1">JPEG / PNG</span>
                  <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
                </label>
              </div>
            </div>

            {/* Left Page Footer Note */}
            <div className="pt-3 border-t border-[#EFE8DC] text-center">
              <span className="text-xs text-[#A89CB5] italic" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "15px" }}>
                Left Page · Keepsakes & Polaroids
              </span>
            </div>
          </div>

          {/* ── RIGHT PAGE: Writing & Thoughts ── */}
          <div className="p-6 sm:p-8 md:p-10 flex flex-col justify-between bg-[#FFFDF9]">
            <div>
              {/* Header & Date */}
              <div className="flex items-start justify-between border-b border-[#EFE8DC] pb-3 mb-4 flex-wrap gap-2">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-bold text-[#5B4B6D]" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      {niceDate(date)}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowDatePicker(!showDatePicker)}
                      className="text-xs px-2.5 py-1 bg-[#F5EFEB] hover:bg-[#EDE5DA] text-[#8A7B9D] rounded-xl font-medium flex items-center gap-1 transition-colors"
                      title="Change entry date"
                    >
                      <Calendar size={12} />
                      <span>{showDatePicker ? "Done" : "Change date"}</span>
                    </button>
                  </div>

                  {showDatePicker && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        type="date"
                        value={date}
                        onChange={(e) => setDate(e.target.value)}
                        className="p-1.5 px-3 rounded-xl border border-[#D8CFC0] bg-white text-xs font-semibold text-[#5B4B6D]"
                      />
                    </div>
                  )}
                </div>

                {/* Pin & Close */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPinned(!isPinned)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 border transition-all ${
                      isPinned
                        ? "bg-amber-100 border-amber-300 text-amber-900 shadow-2xs"
                        : "bg-white/80 border-[#E8E2D8] text-gray-500 hover:bg-white"
                    }`}
                  >
                    <Pin size={12} className={isPinned ? "fill-amber-600 text-amber-600" : ""} />
                    <span>{isPinned ? "Pinned" : "Pin"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onCancel}
                    className="p-1.5 rounded-xl text-gray-400 hover:bg-black/5 hover:text-gray-700"
                    title="Cancel"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Mood Selector */}
              <div className="mb-4">
                <div className="text-xs text-[#8A7B9D] mb-1.5 italic" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "15px" }}>
                  how was today feeling? ~
                </div>
                <div className="flex gap-1.5 flex-wrap mb-2">
                  {MOODS.map((m) => {
                    const isSelected = mood?.toLowerCase() === m.value.toLowerCase() || mood?.toLowerCase() === m.label.toLowerCase();
                    return (
                      <button
                        key={m.value}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setMood(null);
                          } else {
                            setMood(m.value);
                            setCustomMoodInput("");
                          }
                        }}
                        className={`px-3 py-1 rounded-full text-xs font-medium flex items-center gap-1.5 border transition-all ${
                          isSelected
                            ? "border-current shadow-xs scale-105"
                            : "bg-white/60 border-black/5 hover:bg-white text-gray-600"
                        }`}
                        style={isSelected ? { backgroundColor: m.bg, color: m.color, borderColor: m.color } : {}}
                      >
                        <span>{m.emoji}</span>
                        <span>{m.label}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Custom Mood Input */}
                <input
                  type="text"
                  placeholder="or type custom mood..."
                  value={customMoodInput}
                  onChange={(e) => {
                    setCustomMoodInput(e.target.value);
                    setMood(e.target.value.trim() || null);
                  }}
                  className="w-full text-xs p-2 rounded-xl border border-[#E8E2D8] bg-white/70 focus:bg-white outline-none focus:border-purple-300 transition-colors"
                />
              </div>

              {/* Lined Writing Surface */}
              <div className="relative">
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={placeholderPrompt}
                  className="w-full min-h-[380px] p-3 text-xl sm:text-2xl leading-loose bg-transparent border-none outline-none resize-none text-[#4A3B5D]"
                  style={{
                    fontFamily: "'Caveat', cursive, sans-serif",
                    lineHeight: "2.1",
                    backgroundImage: "repeating-linear-gradient(transparent, transparent 41px, #EFE8DC 42px)",
                    backgroundAttachment: "local",
                  }}
                  autoFocus
                />
              </div>
            </div>

            {/* Right Page Footer Actions */}
            <div className="pt-3 border-t border-[#EFE8DC] flex items-center justify-between mt-4">
              <button
                type="button"
                onClick={onCancel}
                className="text-xs text-[#8A7B9D] hover:text-[#5B4B6D] font-bold"
              >
                Turn back
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || !content.trim()}
                className="px-6 py-2.5 rounded-2xl text-xs font-bold text-white shadow-md hover:opacity-95 disabled:opacity-50 transition-all flex items-center gap-1.5"
                style={{ background: "#C9B6E4", fontFamily: "Fredoka, sans-serif" }}
              >
                <Check size={14} />
                <span>{saving ? "Saving..." : "Keep this Memory"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Diary Book: Reading Page View (2-Page Spread with Turn Animation) ─────────────────────────── */

function DiaryReadPage({
  entries,
  photosByEntry,
  currentIndex,
  onIndexChange,
  onWriteNew,
  onEdit,
  onDelete,
}: {
  entries: JournalEntry[];
  photosByEntry: Record<string, JournalPhoto[]>;
  currentIndex: number;
  onIndexChange: (idx: number) => void;
  onWriteNew: () => void;
  onEdit: (e: JournalEntry) => void;
  onDelete: (id: string) => void;
}) {
  const [flipDirection, setFlipDirection] = useState<"next" | "prev" | null>(null);

  const safeIndex = Math.max(0, Math.min(entries.length - 1, currentIndex));
  const currentEntry = entries[safeIndex];
  const currentPhotos = currentEntry ? photosByEntry[currentEntry.id] || [] : [];
  const moodInfo = currentEntry ? getMoodMeta(currentEntry.mood) : null;

  const handlePageTurn = (newIndex: number, dir: "next" | "prev") => {
    if (newIndex === safeIndex || newIndex < 0 || newIndex >= entries.length) return;
    setFlipDirection(dir);
    setTimeout(() => {
      onIndexChange(newIndex);
      setFlipDirection(null);
    }, 280);
  };

  if (entries.length === 0) {
    return (
      <div className="relative max-w-xl mx-auto my-6 p-10 bg-[#FFFDF9] rounded-3xl border-2 border-[#E9E4DC] shadow-xl text-center">
        <div className="w-16 h-16 mx-auto mb-4 bg-purple-50 rounded-2xl flex items-center justify-center text-3xl">
          📖
        </div>
        <h3 className="text-2xl font-bold mb-2" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
          Your Cozy Diary
        </h3>
        <p className="text-sm opacity-70 mb-6 max-w-sm mx-auto">
          Start recording your memories, thoughts, and polaroids. Each page becomes part of your story.
        </p>
        <button
          onClick={onWriteNew}
          className="px-6 py-3 rounded-2xl text-white font-bold shadow-md hover:opacity-95 transition-all inline-flex items-center gap-2"
          style={{ background: "#C9B6E4", fontFamily: "Fredoka, sans-serif" }}
        >
          <Plus size={18} /> Write Your First Page
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-6xl mx-auto my-2">
      {/* Hardcover Open Book Frame */}
      <div className="relative bg-[#F4EFE6] rounded-[32px] p-4 sm:p-7 md:p-8 border-2 border-[#E5DAC8] shadow-2xl overflow-hidden">
        {/* Top Bookmark Ribbon */}
        <div className="absolute top-0 right-16 sm:right-24 w-6 h-14 bg-pink-400/90 rounded-b-md shadow-md z-20 flex items-center justify-center">
          <span className="text-xs text-white font-bold">♥</span>
        </div>

        {/* 2-Page Spread Container with CSS 3D Page Turn Animation */}
        <div
          className={`grid grid-cols-1 md:grid-cols-2 rounded-2xl bg-[#FFFDF9] border border-[#E8DFD1] shadow-inner overflow-hidden relative min-h-[580px] md:min-h-[640px] transition-all duration-300 ${
            flipDirection === "next"
              ? "opacity-60 translate-x-1 rotate-[-0.3deg] scale-[0.99]"
              : flipDirection === "prev"
              ? "opacity-60 -translate-x-1 rotate-[0.3deg] scale-[0.99]"
              : "opacity-100 translate-x-0 rotate-0 scale-100"
          }`}
        >
          {/* Center Spine Shadow Overlay */}
          <div className="hidden md:block absolute inset-y-0 left-1/2 -translate-x-1/2 w-10 pointer-events-none z-10 bg-gradient-to-r from-black/[0.07] via-black/[0.01] to-black/[0.07]" />

          {/* ── LEFT PAGE: Photos & Polaroids ── */}
          <div className="p-6 sm:p-8 md:p-10 border-b md:border-b-0 md:border-r border-[#EFE8DC] flex flex-col justify-between bg-gradient-to-br from-[#FFFDF9] to-[#FAF5EC]/70">
            <div>
              <div className="flex items-center justify-between border-b border-[#EFE8DC] pb-3 mb-5">
                <div className="flex items-center gap-2.5">
                  <span className="text-xl">📷</span>
                  <h4 className="font-bold text-base sm:text-lg text-[#5B4B6D]" style={{ fontFamily: "Fredoka, sans-serif" }}>
                    Polaroids & Prints
                  </h4>
                </div>
                <span className="text-sm text-[#9B8BAD] italic" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "16px" }}>
                  captured moments ~
                </span>
              </div>

              {currentPhotos.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                  {currentPhotos.map((photo, i) => (
                    <div
                      key={photo.id}
                      className={`bg-white p-2.5 pb-4 rounded-2xl shadow-md border border-[#E8E2D8] transition-transform duration-200 hover:scale-105 hover:rotate-0 ${
                        i % 2 === 0 ? "rotate-[-1.5deg]" : "rotate-[1.5deg]"
                      }`}
                    >
                      <img
                        src={photo.image_url}
                        alt=""
                        className="w-full h-36 sm:h-44 object-cover rounded-xl"
                      />
                      {photo.original_drive_url && (
                        <div className="mt-1.5 flex justify-end">
                          <a
                            href={photo.original_drive_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-[#8A7B9D] hover:underline flex items-center gap-0.5 font-medium"
                          >
                            <span>Drive Original</span>
                            <ExternalLink size={9} />
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center p-8 text-center text-[#9B8BAD] my-auto">
                  <div className="w-16 h-16 rounded-2xl bg-purple-50/80 flex items-center justify-center text-3xl mb-2">
                    🌸
                  </div>
                  <p className="text-base italic" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "17px" }}>
                    no polaroids tucked on this page yet ~
                  </p>
                  <button
                    onClick={() => onEdit(currentEntry)}
                    className="mt-4 text-xs px-4 py-2 rounded-xl bg-white border border-[#E8DFD1] text-[#5B4B6D] hover:bg-purple-50 font-bold transition-colors shadow-xs"
                  >
                    + Tuck in photo
                  </button>
                </div>
              )}
            </div>

            {/* Left Page Footer */}
            <div className="pt-3 border-t border-[#EFE8DC] text-center">
              <span className="text-xs text-[#A89CB5] italic" style={{ fontFamily: "'Patrick Hand', cursive", fontSize: "15px" }}>
                Left Page · Keepsakes
              </span>
            </div>
          </div>

          {/* ── RIGHT PAGE: Written Entry Content ── */}
          <div className="p-6 sm:p-8 md:p-10 flex flex-col justify-between bg-[#FFFDF9]">
            <div>
              {/* Header with Date, Mood, Pin, Actions */}
              <div className="flex items-start justify-between border-b border-[#EFE8DC] pb-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl font-bold text-[#5B4B6D]" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      {niceDate(currentEntry.entry_date)}
                    </span>
                    {moodInfo && (
                      <span
                        className="px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1.5 shadow-2xs"
                        style={{ backgroundColor: moodInfo.bg, color: moodInfo.color }}
                      >
                        <span>{moodInfo.emoji}</span>
                        <span>{moodInfo.label}</span>
                      </span>
                    )}
                    {currentEntry.is_pinned && (
                      <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-full text-xs font-bold flex items-center gap-1">
                        <Pin size={11} className="fill-amber-600" /> Pinned
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#9B8BAD] mt-1">
                    Page {safeIndex + 1} of {entries.length}
                  </p>
                </div>

                {/* Edit / Delete actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onEdit(currentEntry)}
                    className="p-2 rounded-xl text-gray-500 hover:bg-black/5 hover:text-[#5B4B6D] transition-colors"
                    title="Edit this entry"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => onDelete(currentEntry.id)}
                    className="p-2 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Delete this entry"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              {/* Diary Entry Content (With Handwriting Font) */}
              <div
                className="text-[#3F324D] text-[1.5rem] sm:text-[1.65rem] leading-loose whitespace-pre-wrap min-h-[320px] pt-1"
                style={{ fontFamily: "'Caveat', cursive, sans-serif", lineHeight: "2.1" }}
              >
                {currentEntry.content}
              </div>
            </div>

            {/* Right Page Navigation Footer */}
            <div className="pt-3 border-t border-[#EFE8DC] flex items-center justify-between mt-4">
              <button
                onClick={() => handlePageTurn(safeIndex - 1, "prev")}
                disabled={safeIndex === 0}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  safeIndex === 0
                    ? "opacity-30 cursor-not-allowed text-gray-400"
                    : "bg-white text-[#5B4B6D] hover:bg-[#F3EDE3] shadow-xs"
                }`}
              >
                <ChevronLeft size={15} /> Prev Page
              </button>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-[#8A7B9D]">
                  {safeIndex + 1} / {entries.length}
                </span>
                <button
                  onClick={onWriteNew}
                  className="px-2.5 py-1 rounded-xl bg-white text-[#5B4B6D] hover:bg-purple-100/60 text-xs font-bold shadow-2xs flex items-center gap-1"
                >
                  <Plus size={12} /> Write
                </button>
              </div>

              <button
                onClick={() => handlePageTurn(safeIndex + 1, "next")}
                disabled={safeIndex === entries.length - 1}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  safeIndex === entries.length - 1
                    ? "opacity-30 cursor-not-allowed text-gray-400"
                    : "bg-white text-[#5B4B6D] hover:bg-[#F3EDE3] shadow-xs"
                }`}
              >
                Next Page <ChevronRight size={15} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Photo Collage Day Cell ─────────────────────────── */

function PhotoCollageCell({ photos }: { photos: JournalPhoto[] }) {
  if (!photos || photos.length === 0) return null;

  if (photos.length === 1) {
    return (
      <img
        src={photos[0].image_url}
        alt=""
        className="absolute inset-0 w-full h-full object-cover rounded-2xl"
      />
    );
  }

  if (photos.length === 2) {
    return (
      <div className="absolute inset-0 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden">
        <img src={photos[0].image_url} alt="" className="w-full h-full object-cover" />
        <img src={photos[1].image_url} alt="" className="w-full h-full object-cover" />
      </div>
    );
  }

  if (photos.length === 3) {
    return (
      <div className="absolute inset-0 grid grid-cols-2 gap-0.5 rounded-2xl overflow-hidden">
        <img src={photos[0].image_url} alt="" className="w-full h-full object-cover" />
        <div className="grid grid-rows-2 gap-0.5 h-full">
          <img src={photos[1].image_url} alt="" className="w-full h-full object-cover" />
          <img src={photos[2].image_url} alt="" className="w-full h-full object-cover" />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5 rounded-2xl overflow-hidden">
      <img src={photos[0].image_url} alt="" className="w-full h-full object-cover" />
      <img src={photos[1].image_url} alt="" className="w-full h-full object-cover" />
      <img src={photos[2].image_url} alt="" className="w-full h-full object-cover" />
      <div className="relative w-full h-full">
        <img src={photos[3].image_url} alt="" className="w-full h-full object-cover" />
        {photos.length > 4 && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-[10px] text-white font-bold">
            +{photos.length - 3}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Memory Wall Calendar ─────────────────────────── */

function MemoryWallCalendar({
  entries,
  photosByEntry,
  onOpenEntry,
  isCustomVisual = false,
}: {
  entries: JournalEntry[];
  photosByEntry: Record<string, JournalPhoto[]>;
  onOpenEntry: (entry: JournalEntry | null, date: string) => void;
  isCustomVisual?: boolean;
}) {
  const [cursor, setCursor] = useState(new Date());
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const cells = monthGrid(year, month);
  const calBg = isCustomVisual ? getCalendarMonthImage(month) : null;

  useEffect(() => {
    if (isCustomVisual) {
      preloadCalendarAround(cursor.getMonth());
    }
  }, [cursor, isCustomVisual]);

  const { entriesByDate, photosByDate } = useMemo(() => {
    const eMap: Record<string, JournalEntry[]> = {};
    const pMap: Record<string, JournalPhoto[]> = {};
    entries.forEach((e) => {
      (eMap[e.entry_date] = eMap[e.entry_date] || []).push(e);
      const entryPhotos = photosByEntry[e.id] || [];
      if (entryPhotos.length > 0) {
        (pMap[e.entry_date] = pMap[e.entry_date] || []).push(...entryPhotos);
      }
    });
    return { entriesByDate: eMap, photosByDate: pMap };
  }, [entries, photosByEntry]);

  return (
    <div className="relative overflow-hidden bg-white/75 rounded-3xl p-5 border border-white/60 shadow-lg">
      {/* Decorative Calendar Background */}
      {calBg && (
        <div
          className="absolute inset-0 pointer-events-none z-0 bg-cover bg-center rounded-3xl transition-opacity duration-300"
          style={{
            backgroundImage: `url("${calBg}")`,
            opacity: 0.42,
          }}
        />
      )}

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-xl hover:bg-black/5">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <h3 className="font-bold text-lg" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
              {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
            </h3>
            <p className="text-xs opacity-60">Capture your days with Polaroids & memories</p>
          </div>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-xl hover:bg-black/5">
            <ChevronRight size={20} />
          </button>
        </div>

      <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-[#8A7B9D] uppercase tracking-wider mb-2">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-2">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="aspect-square" />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dayEntries = entriesByDate[dateStr] || [];
          const dayPhotos = photosByDate[dateStr] || [];
          const hasPhotos = dayPhotos.length > 0;
          const hasEntries = dayEntries.length > 0;
          const primaryEntry = dayEntries[0] || null;
          const moodInfo = primaryEntry ? MOODS.find((m) => m.value === primaryEntry.mood) : null;
          const isPinned = dayEntries.some((e) => e.is_pinned);
          const isToday = dateStr === todayStr();

          return (
            <button
              key={i}
              type="button"
              onClick={() => onOpenEntry(primaryEntry, dateStr)}
              className={`relative aspect-square rounded-2xl flex flex-col justify-between p-2 text-left border transition-all overflow-hidden group shadow-2xs ${
                isToday ? "ring-2 ring-[#C9B6E4]" : "border-black/5"
              } ${
                hasPhotos
                  ? "hover:scale-105 shadow-md"
                  : hasEntries
                  ? "bg-[#FAF7F2]/90 hover:bg-[#F3EFE8]"
                  : "bg-white/50 hover:bg-white/80 backdrop-blur-2xs"
              }`}
            >
              {hasPhotos && (
                <>
                  <PhotoCollageCell photos={dayPhotos} />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none rounded-2xl" />
                </>
              )}

              <div className="relative z-10 flex items-center justify-between w-full">
                <span
                  className={`text-xs font-bold ${
                    hasPhotos ? "text-white drop-shadow-md" : isToday ? "text-[#C9B6E4]" : "text-[#5B4B6D]"
                  }`}
                >
                  {d}
                </span>
                <div className="flex items-center gap-1">
                  {dayEntries.length > 1 && !hasPhotos && (
                    <span className="text-[9px] bg-[#C9B6E4]/40 text-[#5B4B6D] font-bold px-1 rounded-md">
                      {dayEntries.length}
                    </span>
                  )}
                  {isPinned && (
                    <span className="text-[10px] drop-shadow-xs">📌</span>
                  )}
                </div>
              </div>

              <div className="relative z-10 flex items-center justify-between w-full">
                {moodInfo && (
                  <span
                    className={`text-xs ${
                      hasPhotos ? "drop-shadow-md" : "p-0.5 rounded-md"
                    }`}
                    title={moodInfo.label}
                  >
                    {moodInfo.emoji}
                  </span>
                )}
                {hasEntries && !hasPhotos && (
                  <span className="text-[10px] opacity-40">📖</span>
                )}
                {hasPhotos && dayPhotos.length > 1 && (
                  <span className="text-[9px] text-white/90 font-bold bg-black/50 px-1.5 py-0.5 rounded-md backdrop-blur-2xs">
                    {dayPhotos.length} 📷
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── On-This-Day Banner ─────────────────────────── */

function OnThisDayBanner({
  userId,
  onSelectEntry,
}: {
  userId: string;
  onSelectEntry: (entry: JournalEntry) => void;
}) {
  const [memories, setMemories] = useState<JournalEntry[]>([]);

  useEffect(() => {
    const today = new Date();
    const targets = [7, 30, 365].map((days) => {
      const d = new Date(today.getTime() - days * 86400000);
      return fmtDate(d);
    });

    Promise.all(
      targets.map((date) =>
        supabase.from("journal_entries").select("*").eq("user_id", userId).eq("entry_date", date).maybeSingle()
      )
    ).then((results) => {
      const found = results.map((r) => r.data).filter(Boolean) as JournalEntry[];
      setMemories(found);
    });
  }, [userId]);

  if (memories.length === 0) return null;

  return (
    <div className="mb-5 p-4 rounded-3xl bg-gradient-to-r from-amber-50 to-orange-50/80 border border-amber-200 shadow-sm">
      <div className="flex items-center gap-1.5 mb-2.5">
        <Sparkles size={16} className="text-amber-600" />
        <h4 className="text-sm font-bold text-amber-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
          On This Day in the Past...
        </h4>
      </div>
      <div className="space-y-2">
        {memories.map((m) => {
          const moodInfo = MOODS.find((x) => x.value === m.mood);
          const daysAgo = Math.round((new Date().getTime() - new Date(m.entry_date + "T00:00:00").getTime()) / 86400000);
          return (
            <button
              key={m.id}
              onClick={() => onSelectEntry(m)}
              className="w-full text-left p-3 rounded-2xl bg-white/80 hover:bg-white border border-amber-200/60 shadow-2xs transition-all flex items-start justify-between gap-3"
            >
              <div>
                <div className="flex items-center gap-1.5 text-xs text-amber-800 font-semibold mb-0.5">
                  <span>{daysAgo} days ago · {niceDate(m.entry_date)}</span>
                  {moodInfo && <span>{moodInfo.emoji}</span>}
                </div>
                <p className="text-xs text-gray-700 line-clamp-2">{m.content}</p>
              </div>
              <span className="text-xs text-amber-600 font-bold shrink-0 mt-1">Read 📖</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── Memories & Log View ─────────────────────────── */

function MemoriesAndLogView({
  entries,
  photosByEntry,
  onEdit,
  onDelete,
  onOpenEntry,
}: {
  entries: JournalEntry[];
  photosByEntry: Record<string, JournalPhoto[]>;
  onEdit: (e: JournalEntry) => void;
  onDelete: (id: string) => void;
  onOpenEntry: (entry: JournalEntry) => void;
}) {
  const [randomPick, setRandomPick] = useState<JournalEntry | null>(null);
  const [search, setSearch] = useState("");
  const [selectedMood, setSelectedMood] = useState("all");

  const pickRandom = useCallback(() => {
    if (entries.length === 0) return;
    const pick = entries[Math.floor(Math.random() * entries.length)];
    setRandomPick(pick);
  }, [entries]);

  useEffect(() => {
    if (!randomPick && entries.length > 0) {
      pickRandom();
    }
  }, [entries, randomPick, pickRandom]);

  const distinctMoodOptions = useMemo(() => {
    const fromEntries = entries.map((e) => e.mood).filter(Boolean) as string[];
    const allVals = [...new Set([...MOODS.map((m) => m.value), ...fromEntries])];
    return allVals.map((v) => ({ value: v, meta: getMoodMeta(v) })).filter(item => item.meta !== null);
  }, [entries]);

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (selectedMood !== "all") {
        if (!e.mood) return false;
        const normalized = e.mood.trim().toLowerCase().replace(/[\s-]+/g, "_");
        if (e.mood !== selectedMood && normalized !== selectedMood.toLowerCase()) return false;
      }
      if (search && !e.content.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entries, selectedMood, search]);

  const randomPhotos = randomPick ? photosByEntry[randomPick.id] || [] : [];
  const randomMood = randomPick ? getMoodMeta(randomPick.mood) : null;

  return (
    <div className="space-y-6">
      {/* ── Random Memory Capsule (Top) ── */}
      <div className="bg-gradient-to-br from-purple-50 via-pink-50/50 to-amber-50/40 p-5 rounded-3xl border border-[#EADEF0] shadow-md">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🎲</span>
            <h3 className="font-bold text-base text-[#5B4B6D]" style={{ fontFamily: "Fredoka, sans-serif" }}>
              Random Memory Capsule
            </h3>
          </div>
          <button
            onClick={pickRandom}
            className="px-3 py-1.5 bg-white text-[#5B4B6D] hover:bg-purple-100/60 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all"
          >
            <Shuffle size={13} /> Draw Another
          </button>
        </div>

        {randomPick ? (
          <div className="bg-white/90 p-4 rounded-2xl border border-[#EADEF0] shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-[#8A7B9D]">
                {niceDate(randomPick.entry_date)}
              </span>
              {randomMood && (
                <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ backgroundColor: randomMood.bg, color: randomMood.color }}>
                  {randomMood.emoji} {randomMood.label}
                </span>
              )}
            </div>

            {randomPhotos.length > 0 && (
              <div className="flex gap-2 overflow-x-auto pb-2 mb-2.5">
                {randomPhotos.map((p) => (
                  <img key={p.id} src={p.image_url} alt="" className="h-28 w-auto rounded-xl object-cover" />
                ))}
              </div>
            )}

            <p
              className="text-[#3F324D] text-lg leading-relaxed line-clamp-3 whitespace-pre-wrap"
              style={{ fontFamily: "'Caveat', cursive, sans-serif", lineHeight: "1.7" }}
            >
              {randomPick.content}
            </p>

            <div className="mt-3 flex justify-end">
              <button
                onClick={() => onOpenEntry(randomPick)}
                className="text-xs text-[#7C3AED] hover:underline font-bold flex items-center gap-1"
              >
                Open in Diary 📖
              </button>
            </div>
          </div>
        ) : (
          <p className="text-xs opacity-60 text-center py-4">No memories written yet.</p>
        )}
      </div>

      {/* ── Chronological Log / List (Below Random Memory) ── */}
      <div className="bg-white/80 p-5 rounded-3xl border border-black/5 shadow-md">
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📜</span>
            <h3 className="font-bold text-base text-[#5B4B6D]" style={{ fontFamily: "Fredoka, sans-serif" }}>
              All Memories Log ({entries.length})
            </h3>
          </div>

          <div className="flex items-center gap-2 flex-1 max-w-sm">
            <div className="flex items-center gap-1.5 bg-white rounded-xl px-2.5 py-1.5 border border-gray-200 flex-1">
              <Search size={14} className="opacity-40" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search entries..."
                className="text-xs outline-none w-full"
              />
            </div>
            <select
              value={selectedMood}
              onChange={(e) => setSelectedMood(e.target.value)}
              className="text-xs p-1.5 rounded-xl border border-gray-200 bg-white"
            >
              <option value="all">All moods</option>
              {distinctMoodOptions.map(({ value, meta }) => (
                <option key={value} value={value}>{meta?.emoji} {meta?.label}</option>
              ))}
            </select>
          </div>
        </div>

        {filteredEntries.length === 0 ? (
          <div className="text-center py-8 opacity-60 text-sm">
            No matching entries found.
          </div>
        ) : (
          <div className="space-y-3">
            {filteredEntries.map((entry) => {
              const photos = photosByEntry[entry.id] || [];
              const mood = getMoodMeta(entry.mood);
              return (
                <div
                  key={entry.id}
                  className={`p-4 rounded-2xl border transition-all ${
                    entry.is_pinned
                      ? "bg-amber-50/50 border-amber-200"
                      : "bg-white border-gray-100 hover:border-purple-200"
                  } shadow-2xs`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-bold text-[#5B4B6D]">
                        {niceDate(entry.entry_date)}
                      </span>
                      {mood && (
                        <span className="text-xs" title={mood.label}>{mood.emoji}</span>
                      )}
                      {entry.is_pinned && (
                        <span className="text-xs text-amber-700 font-bold flex items-center gap-0.5">
                          <Pin size={10} className="fill-amber-600" /> Pinned
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onOpenEntry(entry)}
                        className="px-2 py-1 rounded-lg bg-purple-50 text-[#5B4B6D] text-xs font-semibold hover:bg-purple-100"
                      >
                        Read
                      </button>
                      <button
                        onClick={() => onEdit(entry)}
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-black/5"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => onDelete(entry.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  {photos.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto py-1 mb-2">
                      {photos.map((p) => (
                        <img key={p.id} src={p.image_url} alt="" className="h-16 w-20 rounded-xl object-cover shrink-0" />
                      ))}
                    </div>
                  )}

                  <p
                    className="text-gray-700 text-base line-clamp-2 leading-relaxed whitespace-pre-wrap"
                    style={{ fontFamily: "'Caveat', cursive, sans-serif" }}
                  >
                    {entry.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── Main Journal View ─────────────────────────── */

interface JournalDataCache {
  userId: string;
  entries: JournalEntry[];
  photosByEntry: Record<string, JournalPhoto[]>;
}
let journalCache: JournalDataCache | null = null;

export default function JournalView({
  userId,
  session,
  theme = "bloom",
  visualSettings = DEFAULT_VISUAL_SETTINGS,
}: {
  userId: string;
  session: Session | null;
  theme?: string;
  visualSettings?: VisualCustomizationSettings;
}) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [photosByEntry, setPhotosByEntry] = useState<Record<string, JournalPhoto[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"diary" | "wall" | "log">("diary");
  
  // Diary state: reading vs writing mode
  const [diaryMode, setDiaryMode] = useState<"read" | "write">("read");
  const [editingEntry, setEditingEntry] = useState<Partial<JournalEntry> | null>(null);
  const [currentReadIndex, setCurrentReadIndex] = useState(0);

  const fetchEntries = useCallback(async () => {
    const { data: entriesData, error: entriesErr } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false });

    if (entriesErr) {
      console.error("Failed to load journal entries:", entriesErr);
      return;
    }

    const { data: photosData, error: photosErr } = await supabase
      .from("journal_photos")
      .select("*")
      .eq("user_id", userId);

    if (photosErr) {
      console.error("Failed to load journal photos:", photosErr);
      return;
    }

    const photoMap: Record<string, JournalPhoto[]> = {};
    (photosData as JournalPhoto[] || []).forEach((p) => {
      (photoMap[p.journal_entry_id] = photoMap[p.journal_entry_id] || []).push(p);
    });

    setEntries((entriesData as JournalEntry[]) || []);
    setPhotosByEntry(photoMap);
    setLoaded(true);
  }, [userId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const uploadPhoto = async (file: File, entryId: string, entryDate: string): Promise<JournalPhoto> => {
    const ext = file.name.split(".").pop() || "jpg";
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const path = `journal/${userId}/${entryId}/${Date.now()}-${cleanName}`;
    const compressed = await compressImage(file);
    const { error: upErr } = await supabase.storage
      .from("journal-photos")
      .upload(path, compressed, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage.from("journal-photos").getPublicUrl(path);

    // 1. Immediately insert photo row with public CDN url so save completes instantly
    const { data: photoRow, error: dbErr } = await supabase
      .from("journal_photos")
      .insert({
        journal_entry_id: entryId,
        user_id: userId,
        image_url: publicUrl,
        original_drive_url: null,
      })
      .select()
      .single();

    if (dbErr) throw dbErr;

    // 2. Best-effort Google Drive relay upload executed non-blocking in background
    if (session?.access_token && photoRow?.id) {
      const photoId = photoRow.id;
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("entry_date", entryDate);
      fetch(`${SUPABASE_URL}/functions/v1/upload-original-to-drive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      })
        .then(async (res) => {
          if (res.ok) {
            const resData = await res.json();
            if (resData.drive_url) {
              await supabase
                .from("journal_photos")
                .update({ original_drive_url: resData.drive_url })
                .eq("id", photoId);
            }
          }
        })
        .catch((e) => {
          console.warn("Background Drive upload relay failed (best-effort):", e);
        });
    }

    return photoRow as JournalPhoto;
  };

  const saveEntry = async (
    entry: JournalEntry,
    newFiles: File[],
    deletedPhotoIds: string[]
  ) => {
    const isNew = !entries.some((e) => e.id === entry.id);

    if (isNew) {
      const { id: _id, created_at: _ca, ...insertPayload } = entry;
      const { data, error } = await supabase
        .from("journal_entries")
        .insert(insertPayload)
        .select()
        .single();
      if (error) { alert("Save failed: " + error.message); return; }
      entry = data as JournalEntry;
    } else {
      const { error } = await supabase
        .from("journal_entries")
        .update({
          entry_date: entry.entry_date,
          content: entry.content,
          mood: entry.mood,
          is_pinned: entry.is_pinned,
        })
        .eq("id", entry.id);
      if (error) { alert("Save failed: " + error.message); return; }
    }

    for (const photoId of deletedPhotoIds) {
      await supabase.from("journal_photos").delete().eq("id", photoId);
    }

    for (const file of newFiles) {
      try {
        await uploadPhoto(file, entry.id, entry.entry_date);
      } catch (e) {
        console.error("Photo upload failed:", e);
        alert("Photo upload failed: " + (e instanceof Error ? e.message : "Unknown error"));
      }
    }

    await fetchEntries();
    setDiaryMode("read");
    setEditingEntry(null);
    setCurrentReadIndex(0);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Are you sure you want to delete this diary entry? This cannot be undone.")) return;
    await supabase.from("journal_entries").delete().eq("id", id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setPhotosByEntry((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  };

  const openWriteMode = (initialData?: Partial<JournalEntry> | null) => {
    setEditingEntry(initialData || null);
    setDiaryMode("write");
    setActiveSubTab("diary");
  };

  const openReadMode = (entry: JournalEntry) => {
    const idx = entries.findIndex((e) => e.id === entry.id);
    if (idx !== -1) {
      setCurrentReadIndex(idx);
    }
    setDiaryMode("read");
    setActiveSubTab("diary");
  };

  if (!loaded) {
    return <div className="p-8 text-center opacity-60">Opening your journal... 🌸</div>;
  }

  const isCustom = visualSettings.mode === "custom";
  const diaryBg = isCustom && visualSettings.diary ? getDecorativeImage("diary", theme) : null;
  const calBg = isCustom && visualSettings.calendar ? getDecorativeImage("calendar", theme) : null;

  return (
    <div style={{ fontFamily: "Quicksand, sans-serif" }}>
      {/* On-This-Day Banner (Bonus Resurfacing) */}
      <OnThisDayBanner
        userId={userId}
        onSelectEntry={(entry) => openReadMode(entry)}
      />

      {/* Top Journal Sub-Navigation */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex gap-1.5 p-1 bg-white/60 rounded-2xl border border-black/5 shadow-xs">
          <button
            onClick={() => {
              setActiveSubTab("diary");
            }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === "diary"
                ? "bg-white text-[#5B4B6D] shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <BookOpen size={14} /> Diary
          </button>
          <button
            onClick={() => setActiveSubTab("wall")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === "wall"
                ? "bg-white text-[#5B4B6D] shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <CalendarIcon size={14} /> Memory Wall
          </button>
          <button
            onClick={() => setActiveSubTab("log")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              activeSubTab === "log"
                ? "bg-white text-[#5B4B6D] shadow-sm"
                : "text-gray-500 hover:text-gray-800"
            }`}
          >
            <Shuffle size={14} /> Memories & Log
          </button>
        </div>

        <button
          onClick={() => openWriteMode(null)}
          className="px-4 py-2 rounded-2xl text-xs font-bold text-white shadow-sm flex items-center gap-1.5 hover:opacity-95 transition-all"
          style={{ background: "#C9B6E4", fontFamily: "Fredoka, sans-serif" }}
        >
          <Plus size={15} /> Write in Diary ✍️
        </button>
      </div>

      {/* Sub-Views */}
      {activeSubTab === "diary" && (
        <div className="relative p-2 sm:p-5 md:p-8 rounded-[36px] overflow-hidden transition-all">
          {/* Decorative Diary Background */}
          {diaryBg && (
            <div
              className="absolute inset-0 pointer-events-none z-0 bg-cover bg-center rounded-[36px] transition-opacity duration-700 shadow-inner"
              style={{
                backgroundImage: `url("${diaryBg}")`,
                opacity: 0.50,
              }}
            />
          )}
          <div className="relative z-10">
            {diaryMode === "write" ? (
              <DiaryWritePage
                userId={userId}
                initial={editingEntry}
                onSave={saveEntry}
                onCancel={() => {
                  setDiaryMode("read");
                  setEditingEntry(null);
                }}
              />
            ) : (
              <DiaryReadPage
                entries={entries}
                photosByEntry={photosByEntry}
                currentIndex={currentReadIndex}
                onIndexChange={setCurrentReadIndex}
                onWriteNew={() => openWriteMode(null)}
                onEdit={(entry) => openWriteMode(entry)}
                onDelete={deleteEntry}
              />
            )}
          </div>
        </div>
      )}

      {activeSubTab === "wall" && (
        <MemoryWallCalendar
          entries={entries}
          photosByEntry={photosByEntry}
          isCustomVisual={isCustom && visualSettings.calendar}
          onOpenEntry={(entry, date) => {
            if (entry) {
              openReadMode(entry);
            } else {
              openWriteMode({ entry_date: date, content: "", mood: null, is_pinned: false });
            }
          }}
        />
      )}

      {activeSubTab === "log" && (
        <MemoriesAndLogView
          entries={entries}
          photosByEntry={photosByEntry}
          onEdit={(entry) => openWriteMode(entry)}
          onDelete={deleteEntry}
          onOpenEntry={(entry) => openReadMode(entry)}
        />
      )}
    </div>
  );
}
