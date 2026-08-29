import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./lib/supabase";
import {
  Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight, Pin,
  Image as ImageIcon, Shuffle, BookOpen, Calendar as CalendarIcon,
  Search, Book, Sparkles, ExternalLink,
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

/* ─────────────────────────── constants ─────────────────────────── */

const MOODS: { value: string; emoji: string; label: string; color: string; bg: string }[] = [
  { value: "great",  emoji: "🌟", label: "Great",  color: "#D97706", bg: "#FEF3C7" },
  { value: "good",   emoji: "🌸", label: "Good",   color: "#059669", bg: "#D1FAE5" },
  { value: "okay",   emoji: "🌤️", label: "Okay",   color: "#0284C7", bg: "#E0F2FE" },
  { value: "tough",  emoji: "🌧️", label: "Tough",  color: "#7C3AED", bg: "#EDE9FE" },
  { value: "rough",  emoji: "🌪️", label: "Rough",  color: "#DC2626", bg: "#FEE2E2" },
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

/* ─────────────────────────── entry form modal ─────────────────────────── */

function EntryFormModal({
  userId,
  initial,
  onSave,
  onClose,
}: {
  userId: string;
  initial?: Partial<JournalEntry> | null;
  onSave: (entry: JournalEntry, newFiles: File[], deletedPhotoIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initial?.entry_date || todayStr());
  const [content, setContent] = useState(initial?.content || "");
  const [mood, setMood] = useState<string | null>(initial?.mood || null);
  const [isPinned, setIsPinned] = useState(initial?.is_pinned || false);
  const [photos, setPhotos] = useState<JournalPhoto[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!initial?.id) return;
    supabase
      .from("journal_photos")
      .select("*")
      .eq("journal_entry_id", initial.id)
      .then(({ data }) => setPhotos((data as JournalPhoto[]) || []));
  }, [initial?.id]);

  const save = async () => {
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
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-[#FCFBF8] rounded-3xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl border border-[#E9E4DC]"
        style={{ fontFamily: "Quicksand, sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">✍️</span>
            <h3 className="text-xl font-bold" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
              {initial?.id ? "Edit Diary Page" : "Write in Diary"}
            </h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-black/5"><X size={20} /></button>
        </div>

        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-bold uppercase tracking-wider text-[#8A7B9D]">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full mt-1 p-2.5 rounded-xl border border-[#E0D7CD] bg-white font-medium text-sm"
              />
            </div>
            <button
              onClick={() => setIsPinned(!isPinned)}
              type="button"
              className={`p-2.5 rounded-xl border transition-all flex items-center gap-1 text-sm font-semibold ${
                isPinned ? "bg-amber-100 border-amber-300 text-amber-800" : "bg-white border-[#E0D7CD] text-gray-500 hover:bg-gray-50"
              }`}
              title="Pin this memory"
            >
              <Pin size={16} className={isPinned ? "fill-amber-500 text-amber-500" : ""} />
              <span>{isPinned ? "Pinned" : "Pin"}</span>
            </button>
          </div>

          {/* Mood picker */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#8A7B9D]">How was today?</label>
            <div className="grid grid-cols-5 gap-1.5 mt-1.5">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  onClick={() => setMood(mood === m.value ? null : m.value)}
                  className={`flex flex-col items-center py-2 px-1 rounded-2xl border text-xs font-semibold transition-all ${
                    mood === m.value
                      ? "ring-2 ring-[#C9B6E4] shadow-sm scale-105"
                      : "opacity-75 hover:opacity-100 bg-white border-[#E5E0D8]"
                  }`}
                  style={{ backgroundColor: mood === m.value ? m.bg : undefined }}
                >
                  <span className="text-xl mb-0.5">{m.emoji}</span>
                  <span style={{ color: m.color }}>{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#8A7B9D]">Diary Entry</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={7}
              placeholder="Dear Diary, today was..."
              className="w-full mt-1.5 p-3.5 rounded-2xl border border-[#E0D7CD] bg-white resize-none text-sm leading-relaxed focus:ring-2 focus:ring-[#C9B6E4] focus:outline-none"
              style={{ lineHeight: "1.7" }}
            />
          </div>

          {/* Photos */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-[#8A7B9D] flex items-center gap-1.5">
              <ImageIcon size={14} /> Attach Photos (Polaroids)
            </label>
            <div className="flex flex-wrap gap-2.5 mt-2">
              {photos.map((p) => (
                <div key={p.id} className="relative group rounded-xl overflow-hidden border border-black/10 shadow-xs">
                  <img src={p.image_url} alt="" className="w-20 h-20 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeExistingPhoto(p.id)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={11} />
                  </button>
                  {p.original_drive_url && (
                    <a
                      href={p.original_drive_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="absolute bottom-0 right-0 text-[8px] bg-black/60 text-white px-1 rounded-tl"
                    >
                      Drive
                    </a>
                  )}
                </div>
              ))}
              {newFiles.map((f, i) => (
                <div key={i} className="relative group rounded-xl overflow-hidden border border-black/10 shadow-xs">
                  <img src={URL.createObjectURL(f)} alt="" className="w-20 h-20 object-cover" />
                  <button
                    type="button"
                    onClick={() => removeNewFile(i)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={11} />
                  </button>
                  <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/50 text-white py-0.5 font-medium">
                    New
                  </span>
                </div>
              ))}
              <label className="w-20 h-20 border-2 border-dashed border-[#C9B6E4] rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:bg-purple-50/50 text-xs text-[#8A7B9D] font-medium transition-colors">
                <Plus size={18} className="text-[#C9B6E4] mb-0.5" />
                <span>Add</span>
                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
              </label>
            </div>
          </div>

          <button
            onClick={save}
            disabled={saving}
            className="w-full mt-2 p-3 rounded-2xl font-bold text-white shadow-md transition-all flex items-center justify-center gap-2"
            style={{
              background: saving ? "#C9B6E4AA" : "linear-gradient(135deg, #C9B6E4 0%, #B8A3D8 100%)",
              fontFamily: "Fredoka, sans-serif",
            }}
          >
            {saving ? "Saving Page..." : initial?.id ? "Update Diary Page ✨" : "Save in Diary 🌸"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── Diary Book View ─────────────────────────── */

function DiaryBookView({
  entries,
  photosByEntry,
  onWriteNew,
  onEdit,
  onDelete,
}: {
  entries: JournalEntry[];
  photosByEntry: Record<string, JournalPhoto[]>;
  onWriteNew: () => void;
  onEdit: (e: JournalEntry) => void;
  onDelete: (id: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Keep index within bounds when entries change
  useEffect(() => {
    if (currentIndex >= entries.length && entries.length > 0) {
      setCurrentIndex(entries.length - 1);
    }
  }, [entries.length, currentIndex]);

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

  const currentEntry = entries[currentIndex];
  const currentPhotos = currentEntry ? photosByEntry[currentEntry.id] || [] : [];
  const moodInfo = currentEntry ? MOODS.find((m) => m.value === currentEntry.mood) : null;

  return (
    <div className="max-w-2xl mx-auto my-2">
      {/* Book Frame */}
      <div className="relative bg-[#FFFDF9] rounded-3xl border-2 border-[#E8E2D8] shadow-2xl overflow-hidden transition-all">
        {/* Book spine accent line & bookmark ribbon */}
        <div className="absolute top-0 left-0 w-3.5 h-full bg-gradient-to-r from-[#E0D7C9] to-[#F5EFEB] border-r border-[#D8CFC0]/60" />
        <div className="absolute top-0 right-8 w-4 h-10 bg-[#F5B8C4] rounded-b-md shadow-sm z-10 flex items-center justify-center">
          <span className="text-[9px] text-white font-bold">♥</span>
        </div>

        {/* Inner page content */}
        <div className="pl-8 pr-6 pt-7 pb-6">
          {/* Header with Date, Mood, Pin, and Page info */}
          <div className="flex items-start justify-between border-b border-[#EFE9DF] pb-4 mb-5">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-bold text-[#5B4B6D]" style={{ fontFamily: "Fredoka, sans-serif" }}>
                  {niceDate(currentEntry.entry_date)}
                </span>
                {moodInfo && (
                  <span
                    className="px-2.5 py-0.5 rounded-full text-xs font-semibold flex items-center gap-1 shadow-2xs"
                    style={{ backgroundColor: moodInfo.bg, color: moodInfo.color }}
                  >
                    <span>{moodInfo.emoji}</span>
                    <span>{moodInfo.label}</span>
                  </span>
                )}
                {currentEntry.is_pinned && (
                  <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full text-xs font-bold flex items-center gap-1">
                    <Pin size={11} className="fill-amber-600" /> Pinned
                  </span>
                )}
              </div>
              <p className="text-xs text-[#9B8BAD] mt-0.5">
                Page {currentIndex + 1} of {entries.length}
              </p>
            </div>

            {/* Edit / Delete actions */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => onEdit(currentEntry)}
                className="p-2 rounded-xl text-gray-500 hover:bg-black/5 hover:text-[#5B4B6D] transition-colors"
                title="Edit this entry"
              >
                <Pencil size={15} />
              </button>
              <button
                onClick={() => onDelete(currentEntry.id)}
                className="p-2 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                title="Delete this entry"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </div>

          {/* Photo Gallery / Polaroid Tape Style */}
          {currentPhotos.length > 0 && (
            <div className="mb-5 flex gap-3 overflow-x-auto pb-2 pt-1 scrollbar-thin">
              {currentPhotos.map((photo, i) => (
                <div
                  key={photo.id}
                  className="shrink-0 bg-white p-2 pb-3 rounded-2xl shadow-md border border-[#E8E2D8] transform rotate-[-0.5deg] hover:rotate-0 transition-transform"
                  style={{ width: currentPhotos.length === 1 ? "100%" : "220px" }}
                >
                  <img
                    src={photo.image_url}
                    alt=""
                    className="w-full h-44 object-cover rounded-xl"
                  />
                  {photo.original_drive_url && (
                    <div className="mt-1.5 flex justify-end">
                      <a
                        href={photo.original_drive_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-[#8A7B9D] hover:underline flex items-center gap-1"
                      >
                        <span>View Original</span>
                        <ExternalLink size={10} />
                      </a>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Diary Entry Content */}
          <div
            className="text-[#4A3E56] text-[15px] leading-relaxed whitespace-pre-wrap min-h-[160px]"
            style={{ fontFamily: "'Quicksand', sans-serif", lineHeight: "1.85" }}
          >
            {currentEntry.content}
          </div>
        </div>

        {/* Page Flip Navigation Bar */}
        <div className="bg-[#FAF6EF] border-t border-[#E8E2D8] px-6 py-3.5 flex items-center justify-between">
          <button
            onClick={() => setCurrentIndex((prev) => Math.max(0, prev - 1))}
            disabled={currentIndex === 0}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              currentIndex === 0
                ? "opacity-30 cursor-not-allowed text-gray-400"
                : "bg-white text-[#5B4B6D] hover:bg-[#F3EDE3] shadow-xs"
            }`}
          >
            <ChevronLeft size={16} /> Previous Page
          </button>

          {/* Quick jump dots or counter */}
          <div className="text-xs font-bold text-[#8A7B9D]">
            {currentIndex + 1} / {entries.length}
          </div>

          <button
            onClick={() => setCurrentIndex((prev) => Math.min(entries.length - 1, prev + 1))}
            disabled={currentIndex === entries.length - 1}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              currentIndex === entries.length - 1
                ? "opacity-30 cursor-not-allowed text-gray-400"
                : "bg-white text-[#5B4B6D] hover:bg-[#F3EDE3] shadow-xs"
            }`}
          >
            Next Page <ChevronRight size={16} />
          </button>
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

  // 4 or more photos
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
}: {
  entries: JournalEntry[];
  photosByEntry: Record<string, JournalPhoto[]>;
  onOpenEntry: (entry: JournalEntry | null, date: string) => void;
}) {
  const [cursor, setCursor] = useState(new Date());
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const cells = monthGrid(year, month);

  const entryByDate = useMemo(() => {
    const map: Record<string, JournalEntry> = {};
    entries.forEach((e) => { map[e.entry_date] = e; });
    return map;
  }, [entries]);

  return (
    <div className="bg-white/85 rounded-3xl p-5 border border-white/60 shadow-lg">
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-xl hover:bg-black/5">
          <ChevronLeft size={20} />
        </button>
        <div className="text-center">
          <h3 className="font-bold text-lg" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
            {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          </h3>
          <p className="text-xs opacity-60">Memory Wall — Days with polaroids & memories</p>
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
          const entry = entryByDate[dateStr];
          const photos = entry ? photosByEntry[entry.id] || [] : [];
          const hasPhotos = photos.length > 0;
          const moodInfo = entry ? MOODS.find((m) => m.value === entry.mood) : null;
          const isToday = dateStr === todayStr();

          return (
            <button
              key={i}
              type="button"
              onClick={() => onOpenEntry(entry || null, dateStr)}
              className={`relative aspect-square rounded-2xl flex flex-col justify-between p-2 text-left border transition-all overflow-hidden group shadow-2xs ${
                isToday ? "ring-2 ring-[#C9B6E4]" : "border-black/5"
              } ${
                hasPhotos
                  ? "hover:scale-105 shadow-md"
                  : entry
                  ? "bg-[#FAF7F2] hover:bg-[#F3EFE8]"
                  : "bg-white/60 hover:bg-white"
              }`}
            >
              {/* Photo Background or Collage */}
              {hasPhotos && (
                <>
                  <PhotoCollageCell photos={photos} />
                  {/* Subtle top & bottom dark gradients for text readability */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/60 pointer-events-none rounded-2xl" />
                </>
              )}

              {/* Day Number */}
              <div className="relative z-10 flex items-center justify-between w-full">
                <span
                  className={`text-xs font-bold ${
                    hasPhotos ? "text-white drop-shadow-md" : isToday ? "text-[#C9B6E4]" : "text-[#5B4B6D]"
                  }`}
                >
                  {d}
                </span>
                {entry?.is_pinned && (
                  <span className="text-[10px] drop-shadow-xs">📌</span>
                )}
              </div>

              {/* Bottom Mood / Indicator */}
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
                {entry && !hasPhotos && (
                  <span className="text-[10px] opacity-40">📖</span>
                )}
                {hasPhotos && photos.length > 1 && (
                  <span className="text-[9px] text-white/90 font-bold bg-black/40 px-1 py-0.2 rounded-md">
                    {photos.length} 📷
                  </span>
                )}
              </div>
            </button>
          );
        })}
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

  const filteredEntries = useMemo(() => {
    return entries.filter((e) => {
      if (selectedMood !== "all" && e.mood !== selectedMood) return false;
      if (search && !e.content.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [entries, selectedMood, search]);

  const randomPhotos = randomPick ? photosByEntry[randomPick.id] || [] : [];
  const randomMood = randomPick ? MOODS.find((m) => m.value === randomPick.mood) : null;

  return (
    <div className="space-y-6">
      {/* ── Random Memory Area (Top) ── */}
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

            <p className="text-sm text-gray-800 line-clamp-3 whitespace-pre-wrap leading-relaxed">
              {randomPick.content}
            </p>

            <div className="mt-3 flex justify-end">
              <button
                onClick={() => onOpenEntry(randomPick)}
                className="text-xs text-[#C9B6E4] hover:text-[#9B8BAD] font-bold flex items-center gap-1"
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
              {MOODS.map((m) => (
                <option key={m.value} value={m.value}>{m.emoji} {m.label}</option>
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
              const mood = MOODS.find((m) => m.value === entry.mood);
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

                  <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed whitespace-pre-wrap">
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

export default function JournalView({
  userId,
  session,
}: {
  userId: string;
  session: { access_token: string };
}) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [photosByEntry, setPhotosByEntry] = useState<Record<string, JournalPhoto[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"diary" | "wall" | "log">("diary");
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<Partial<JournalEntry> | null>(null);

  const fetchEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false });

    if (error) {
      console.error("fetchEntries:", error.message);
      return;
    }
    const elist = (data as JournalEntry[]) || [];
    setEntries(elist);

    if (elist.length > 0) {
      const { data: photos } = await supabase
        .from("journal_photos")
        .select("*")
        .in("journal_entry_id", elist.map((e) => e.id));

      const map: Record<string, JournalPhoto[]> = {};
      ((photos as JournalPhoto[]) || []).forEach((p) => {
        (map[p.journal_entry_id] = map[p.journal_entry_id] || []).push(p);
      });
      setPhotosByEntry(map);
    }
  }, [userId]);

  useEffect(() => {
    fetchEntries().finally(() => setLoaded(true));
  }, [fetchEntries]);

  const uploadPhoto = async (file: File, entryId: string, entryDate: string): Promise<JournalPhoto> => {
    const compressed = await compressImage(file);
    const path = `journal/${userId}/${entryId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("journal-photos")
      .upload(path, compressed, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage.from("journal-photos").getPublicUrl(path);

    // Best-effort Drive upload relay
    let originalDriveUrl: string | null = null;
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("entry_date", entryDate);
      const driveRes = await fetch(`${SUPABASE_URL}/functions/v1/upload-original-to-drive`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: form,
      });
      if (driveRes.ok) {
        const resData = await driveRes.json();
        originalDriveUrl = resData.drive_url || null;
      }
    } catch (e) {
      console.warn("Drive upload failed (best-effort):", e);
    }

    const { data: photoRow, error: dbErr } = await supabase
      .from("journal_photos")
      .insert({
        journal_entry_id: entryId,
        user_id: userId,
        image_url: publicUrl,
        original_drive_url: originalDriveUrl,
      })
      .select()
      .single();

    if (dbErr) throw dbErr;
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
    setFormOpen(false);
    setEditingEntry(null);
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

  if (!loaded) {
    return <div className="p-8 text-center opacity-60">Opening your journal... 🌸</div>;
  }

  return (
    <div style={{ fontFamily: "Quicksand, sans-serif" }}>
      {/* On-This-Day Banner (bonus resurfacing) */}
      <OnThisDayBanner
        userId={userId}
        onSelectEntry={(entry) => {
          setEditingEntry(entry);
          setActiveSubTab("diary");
        }}
      />

      {/* Top Journal Sub-Navigation */}
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <div className="flex gap-1.5 p-1 bg-white/60 rounded-2xl border border-black/5 shadow-xs">
          <button
            onClick={() => setActiveSubTab("diary")}
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
          onClick={() => {
            setEditingEntry(null);
            setFormOpen(true);
          }}
          className="px-4 py-2 rounded-2xl text-xs font-bold text-white shadow-sm flex items-center gap-1.5 hover:opacity-95 transition-all"
          style={{ background: "#C9B6E4", fontFamily: "Fredoka, sans-serif" }}
        >
          <Plus size={15} /> Write New Entry
        </button>
      </div>

      {/* Sub-Views */}
      {activeSubTab === "diary" && (
        <DiaryBookView
          entries={entries}
          photosByEntry={photosByEntry}
          onWriteNew={() => { setEditingEntry(null); setFormOpen(true); }}
          onEdit={(e) => { setEditingEntry(e); setFormOpen(true); }}
          onDelete={deleteEntry}
        />
      )}

      {activeSubTab === "wall" && (
        <MemoryWallCalendar
          entries={entries}
          photosByEntry={photosByEntry}
          onOpenEntry={(entry, date) => {
            if (entry) {
              setEditingEntry(entry);
              setFormOpen(true);
            } else {
              setEditingEntry({ entry_date: date, content: "", mood: null, is_pinned: false });
              setFormOpen(true);
            }
          }}
        />
      )}

      {activeSubTab === "log" && (
        <MemoriesAndLogView
          entries={entries}
          photosByEntry={photosByEntry}
          onEdit={(e) => { setEditingEntry(e); setFormOpen(true); }}
          onDelete={deleteEntry}
          onOpenEntry={(e) => {
            setActiveSubTab("diary");
          }}
        />
      )}

      {/* Form Modal */}
      {formOpen && (
        <EntryFormModal
          userId={userId}
          initial={editingEntry}
          onSave={saveEntry}
          onClose={() => { setFormOpen(false); setEditingEntry(null); }}
        />
      )}
    </div>
  );
}
