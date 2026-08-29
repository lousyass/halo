import React, { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./lib/supabase";
import {
  Plus, X, Pencil, Trash2, ChevronLeft, ChevronRight, Pin,
  Image as ImageIcon, Shuffle,
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

const MOODS: { value: string; emoji: string; label: string; color: string }[] = [
  { value: "great",  emoji: "🌟", label: "Great",  color: "#F0DA8A" },
  { value: "good",   emoji: "🌸", label: "Good",   color: "#A8D5BA" },
  { value: "okay",   emoji: "🌤️", label: "Okay",   color: "#A8C9E4" },
  { value: "tough",  emoji: "🌧️", label: "Tough",  color: "#C9B6E4" },
  { value: "rough",  emoji: "🌪️", label: "Rough",  color: "#F5B8C4" },
];

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr() { return fmtDate(new Date()); }
function niceDate(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
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

/**
 * Compress an image file client-side before uploading to Supabase Storage.
 * Outputs a Blob at max 1200px wide, 0.8 quality JPEG.
 */
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
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Canvas toBlob failed")), "image/jpeg", 0.8);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/* ─────────────────────────── entry form ─────────────────────────── */

function EntryForm({ userId, initial, onSave, onClose }: {
  userId: string;
  initial?: JournalEntry | null;
  onSave: (entry: JournalEntry, newPhotos: File[], deletedPhotoIds: string[]) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initial?.entry_date ?? todayStr());
  const [content, setContent] = useState(initial?.content ?? "");
  const [mood, setMood] = useState<string | null>(initial?.mood ?? null);
  const [isPinned, setIsPinned] = useState(initial?.is_pinned ?? false);
  const [photos, setPhotos] = useState<JournalPhoto[]>([]);
  const [newFiles, setNewFiles] = useState<File[]>([]);
  const [deletedPhotoIds, setDeletedPhotoIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Load existing photos when editing
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
        id: initial?.id ?? crypto.randomUUID(),
        user_id: userId,
        entry_date: date,
        content: content.trim(),
        mood,
        is_pinned: isPinned,
        created_at: initial?.created_at ?? new Date().toISOString(),
      },
      newFiles,
      deletedPhotoIds
    );
    setSaving(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    setNewFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removeNewFile = (idx: number) => setNewFiles((prev) => prev.filter((_, i) => i !== idx));
  const removeExistingPhoto = (id: string) => {
    setPhotos((prev) => prev.filter((p) => p.id !== id));
    setDeletedPhotoIds((prev) => [...prev, id]);
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-3xl p-5 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-xl"
        style={{ fontFamily: "Quicksand, sans-serif" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
            {initial?.id ? "Edit entry" : "New entry"}
          </h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>

        <div className="space-y-3">
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <label className="text-xs font-semibold opacity-70">Date</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full mt-1 p-2 rounded-xl border" />
            </div>
            <button
              onClick={() => setIsPinned(!isPinned)}
              className={`p-2.5 rounded-xl border mb-0.5 transition-colors ${isPinned ? "bg-yellow-100 border-yellow-300" : "bg-white"}`}
              title="Pin this entry"
            >
              <Pin size={16} className={isPinned ? "text-yellow-500" : "opacity-40"} />
            </button>
          </div>

          {/* Mood picker */}
          <div>
            <label className="text-xs font-semibold opacity-70">How was it?</label>
            <div className="flex gap-2 mt-1">
              {MOODS.map((m) => (
                <button
                  key={m.value}
                  onClick={() => setMood(mood === m.value ? null : m.value)}
                  className="flex flex-col items-center p-2 rounded-xl border text-xs transition-all"
                  style={{
                    background: mood === m.value ? m.color + "66" : "transparent",
                    borderColor: mood === m.value ? m.color : "transparent",
                  }}
                  title={m.label}
                >
                  <span className="text-xl">{m.emoji}</span>
                  <span className="opacity-70">{m.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold opacity-70">Write something</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={6}
              placeholder="What happened today? How are you feeling?"
              className="w-full mt-1 p-3 rounded-xl border resize-none text-sm"
            />
          </div>

          {/* Photos */}
          <div>
            <label className="text-xs font-semibold opacity-70 flex items-center gap-1"><ImageIcon size={12} /> Photos</label>
            <div className="flex flex-wrap gap-2 mt-1">
              {photos.map((p) => (
                <div key={p.id} className="relative group">
                  <img src={p.image_url} alt="" className="w-20 h-20 object-cover rounded-xl" />
                  <button
                    onClick={() => removeExistingPhoto(p.id)}
                    className="absolute -top-1 -right-1 w-5 h-5 bg-red-400 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X size={10} />
                  </button>
                  {p.original_drive_url && (
                    <a href={p.original_drive_url} target="_blank" rel="noopener noreferrer" className="absolute bottom-0 right-0 text-[9px] bg-white/80 px-1 rounded">orig</a>
                  )}
                </div>
              ))}
              {newFiles.map((f, i) => (
                <div key={i} className="relative group">
                  <img src={URL.createObjectURL(f)} alt="" className="w-20 h-20 object-cover rounded-xl opacity-80" />
                  <button onClick={() => removeNewFile(i)} className="absolute -top-1 -right-1 w-5 h-5 bg-red-400 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"><X size={10} /></button>
                  <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/30 text-white rounded-b-xl">new</span>
                </div>
              ))}
              <label className="w-20 h-20 border-2 border-dashed rounded-xl flex flex-col items-center justify-center cursor-pointer hover:bg-gray-50 text-xs opacity-50">
                <Plus size={16} />
                Add photo
                <input type="file" accept="image/*" multiple onChange={handleFileChange} className="hidden" />
              </label>
            </div>
          </div>

          <button onClick={save} disabled={saving} className="w-full p-2.5 rounded-xl font-semibold text-white" style={{ background: saving ? "#C9B6E4AA" : "#C9B6E4", fontFamily: "Fredoka, sans-serif" }}>
            {saving ? "Saving…" : initial?.id ? "Save changes" : "Save entry"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── entry card ─────────────────────────── */

function EntryCard({ entry, photos, onEdit, onDelete }: {
  entry: JournalEntry;
  photos: JournalPhoto[];
  onEdit: (e: JournalEntry) => void;
  onDelete: (id: string) => void;
}) {
  const moodInfo = MOODS.find((m) => m.value === entry.mood);
  return (
    <div className="rounded-2xl border bg-white/80 mb-3 overflow-hidden" style={{ borderColor: moodInfo ? moodInfo.color + "55" : "#E5E7EB" }}>
      {/* Photo strip */}
      {photos.length > 0 && (
        <div className="flex gap-1 overflow-x-auto p-2 pb-0">
          {photos.map((p) => (
            <img key={p.id} src={p.image_url} alt="" className="h-28 w-auto rounded-xl object-cover shrink-0" />
          ))}
        </div>
      )}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold opacity-60">{niceDate(entry.entry_date)}</span>
            {moodInfo && <span className="text-sm" title={moodInfo.label}>{moodInfo.emoji}</span>}
            {entry.is_pinned && <span className="text-yellow-400 text-xs">📌</span>}
          </div>
          <div className="flex gap-1 shrink-0">
            <button onClick={() => onEdit(entry)} className="p-1.5 rounded-lg hover:bg-black/5"><Pencil size={13} /></button>
            <button onClick={() => onDelete(entry.id)} className="p-1.5 rounded-lg hover:bg-black/5"><Trash2 size={13} /></button>
          </div>
        </div>
        <p className="text-sm mt-1.5 whitespace-pre-wrap line-clamp-4">{entry.content}</p>
      </div>
    </div>
  );
}

/* ─────────────────────────── memory wall calendar ─────────────────────────── */

function MemoryWallCalendar({ userId, entries, onOpenEntry }: {
  userId: string;
  entries: JournalEntry[];
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
    <div>
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-xl hover:bg-black/5"><ChevronLeft size={18} /></button>
        <span className="font-bold text-base" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </span>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-xl hover:bg-black/5"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold opacity-50 mb-1">
        {["S","M","T","W","T","F","S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (!d) return <div key={i} />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const entry = entryByDate[dateStr];
          const moodInfo = entry ? MOODS.find((m) => m.value === entry.mood) : null;
          const isToday = dateStr === todayStr();
          return (
            <button
              key={i}
              onClick={() => onOpenEntry(entry || null, dateStr)}
              className={`aspect-square rounded-xl flex flex-col items-center justify-center text-xs border transition-colors ${isToday ? "border-2" : "border-transparent"}`}
              style={{
                borderColor: isToday ? "#C9B6E4" : undefined,
                background: moodInfo ? moodInfo.color + "44" : entry ? "#F7E4EE55" : "#FFFFFF66",
              }}
            >
              <span className="text-xs font-semibold">{d}</span>
              {entry && <span className="text-base leading-none">{moodInfo?.emoji || "📔"}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────── on-this-day banner ─────────────────────────── */

function OnThisDayBanner({ userId }: { userId: string }) {
  const [memories, setMemories] = useState<JournalEntry[]>([]);

  useEffect(() => {
    const today = new Date();
    const md = `${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    // Check 1 week, 1 month, 1 year ago — match month-day only
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
    <div className="mb-4 p-3.5 rounded-2xl bg-yellow-50/80 border border-yellow-200">
      <h4 className="text-sm font-bold mb-2" style={{ fontFamily: "Fredoka, sans-serif", color: "#92400E" }}>✨ On this day…</h4>
      {memories.map((m) => {
        const moodInfo = MOODS.find((x) => x.value === m.mood);
        const daysAgo = Math.round((new Date().getTime() - new Date(m.entry_date + "T00:00:00").getTime()) / 86400000);
        return (
          <div key={m.id} className="mb-1.5">
            <span className="text-xs opacity-60">{daysAgo} days ago · {niceDate(m.entry_date)}{moodInfo ? ` ${moodInfo.emoji}` : ""}</span>
            <p className="text-sm line-clamp-2">{m.content}</p>
          </div>
        );
      })}
    </div>
  );
}

/* ─────────────────────────── main journal view ─────────────────────────── */

export default function JournalView({ userId, session }: { userId: string; session: { access_token: string } }) {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [photosByEntry, setPhotosByEntry] = useState<Record<string, JournalPhoto[]>>({});
  const [loaded, setLoaded] = useState(false);
  const [view, setView] = useState<"list" | "wall">("list");
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [randomMemory, setRandomMemory] = useState<JournalEntry | null>(null);
  const [showRandom, setShowRandom] = useState(false);

  const fetchEntries = useCallback(async () => {
    const { data, error } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", userId)
      .order("entry_date", { ascending: false });
    if (error) { console.error("fetchEntries:", error.message); return; }
    const elist = data as JournalEntry[];
    setEntries(elist);

    // Fetch photos for all entries
    if (elist.length > 0) {
      const { data: photos } = await supabase
        .from("journal_photos")
        .select("*")
        .in("journal_entry_id", elist.map((e) => e.id));
      const map: Record<string, JournalPhoto[]> = {};
      (photos as JournalPhoto[] || []).forEach((p) => {
        (map[p.journal_entry_id] = map[p.journal_entry_id] || []).push(p);
      });
      setPhotosByEntry(map);
    }
  }, [userId]);

  useEffect(() => {
    fetchEntries().finally(() => setLoaded(true));
  }, [fetchEntries]);

  const handleRandomMemory = async () => {
    const { data } = await supabase
      .from("journal_entries")
      .select("*")
      .eq("user_id", userId)
      .order("created_at") // workaround: order then limit; true random done client-side from full set
      .limit(500);
    if (data && data.length > 0) {
      const pick = data[Math.floor(Math.random() * data.length)] as JournalEntry;
      setRandomMemory(pick);
      setShowRandom(true);
    }
  };

  /**
   * Upload a compressed copy to Supabase Storage and, best-effort,
   * send the original to the upload-original-to-drive Edge Function.
   */
  const uploadPhoto = async (file: File, entryId: string, entryDate: string): Promise<JournalPhoto> => {
    const compressed = await compressImage(file);
    const path = `journal/${userId}/${entryId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("journal-photos")
      .upload(path, compressed, { contentType: "image/jpeg", upsert: true });
    if (upErr) throw upErr;

    const { data: { publicUrl } } = supabase.storage.from("journal-photos").getPublicUrl(path);

    // Best-effort: send original to Drive
    let originalDriveUrl: string | null = null;
    try {
      const form = new FormData();
      form.append("file", file, file.name);
      form.append("entry_date", entryDate);
      const driveRes = await fetch(
        `${SUPABASE_URL}/functions/v1/upload-original-to-drive`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.access_token}` },
          body: form,
        }
      );
      if (driveRes.ok) {
        const { drive_url } = await driveRes.json();
        originalDriveUrl = drive_url ?? null;
      }
    } catch (e) {
      console.warn("Drive upload failed (best-effort, ignoring):", e);
    }

    // Insert photo row
    const { data: photoRow, error: dbErr } = await supabase
      .from("journal_photos")
      .insert({ journal_entry_id: entryId, user_id: userId, image_url: publicUrl, original_drive_url: originalDriveUrl })
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
      // Insert without id — let Postgres generate UUID
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
        .update({ entry_date: entry.entry_date, content: entry.content, mood: entry.mood, is_pinned: entry.is_pinned })
        .eq("id", entry.id);
      if (error) { alert("Save failed: " + error.message); return; }
    }

    // Handle photo deletions
    for (const photoId of deletedPhotoIds) {
      await supabase.from("journal_photos").delete().eq("id", photoId);
    }

    // Upload new photos
    const newPhotos: JournalPhoto[] = [];
    for (const file of newFiles) {
      try {
        const photo = await uploadPhoto(file, entry.id, entry.entry_date);
        newPhotos.push(photo);
      } catch (e) {
        console.error("Photo upload failed:", e);
        alert("One photo failed to upload: " + (e instanceof Error ? e.message : "Unknown"));
      }
    }

    await fetchEntries();
    setFormOpen(false);
    setEditingEntry(null);
  };

  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this entry? This cannot be undone.")) return;
    await supabase.from("journal_entries").delete().eq("id", id);
    setEntries((prev) => prev.filter((e) => e.id !== id));
    setPhotosByEntry((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  const pinnedEntries = useMemo(() => entries.filter((e) => e.is_pinned), [entries]);
  const regularEntries = useMemo(() => entries.filter((e) => !e.is_pinned), [entries]);

  if (!loaded) return <div className="p-8 text-center opacity-60">Loading journal…</div>;

  return (
    <div style={{ fontFamily: "Quicksand, sans-serif" }}>
      {/* On-this-day banner */}
      <OnThisDayBanner userId={userId} />

      {/* View toggle + actions */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button onClick={() => setView("list")} className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${view === "list" ? "bg-white shadow-sm" : "bg-white/40 opacity-70"}`} style={{ color: "#5B4B6D" }}>
          📝 List
        </button>
        <button onClick={() => setView("wall")} className={`px-3 py-1.5 rounded-xl text-sm font-semibold ${view === "wall" ? "bg-white shadow-sm" : "bg-white/40 opacity-70"}`} style={{ color: "#5B4B6D" }}>
          🗓️ Memory wall
        </button>
        <button onClick={handleRandomMemory} className="px-3 py-1.5 rounded-xl text-sm font-semibold bg-white/40 opacity-70 flex items-center gap-1.5" style={{ color: "#5B4B6D" }}>
          <Shuffle size={14} /> Random memory
        </button>
        <button
          onClick={() => { setEditingEntry(null); setFormOpen(true); }}
          className="ml-auto px-3 py-1.5 rounded-xl text-sm font-semibold text-white flex items-center gap-1"
          style={{ background: "#C9B6E4" }}
        >
          <Plus size={14} /> New entry
        </button>
      </div>

      {/* Random memory modal */}
      {showRandom && randomMemory && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowRandom(false)}>
          <div className="bg-white rounded-3xl p-5 max-w-md w-full shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between mb-3">
              <h3 className="font-bold" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>🎲 A memory from the past</h3>
              <button onClick={() => setShowRandom(false)}><X size={18} /></button>
            </div>
            <p className="text-xs opacity-60 mb-2">{niceDate(randomMemory.entry_date)}</p>
            {(photosByEntry[randomMemory.id] || []).length > 0 && (
              <img src={photosByEntry[randomMemory.id][0].image_url} alt="" className="w-full h-40 object-cover rounded-xl mb-3" />
            )}
            <p className="text-sm whitespace-pre-wrap">{randomMemory.content}</p>
          </div>
        </div>
      )}

      {/* List view */}
      {view === "list" && (
        <div>
          {entries.length === 0 ? (
            <div className="text-center py-12 opacity-60">
              <div className="text-4xl mb-2">📔</div>
              <p className="text-sm">No entries yet — write your first memory!</p>
            </div>
          ) : (
            <>
              {pinnedEntries.length > 0 && (
                <div className="mb-2">
                  <div className="text-xs font-bold opacity-50 uppercase tracking-wide mb-2">📌 Pinned</div>
                  {pinnedEntries.map((e) => (
                    <EntryCard key={e.id} entry={e} photos={photosByEntry[e.id] || []} onEdit={(e) => { setEditingEntry(e); setFormOpen(true); }} onDelete={deleteEntry} />
                  ))}
                </div>
              )}
              {regularEntries.map((e) => (
                <EntryCard key={e.id} entry={e} photos={photosByEntry[e.id] || []} onEdit={(e) => { setEditingEntry(e); setFormOpen(true); }} onDelete={deleteEntry} />
              ))}
            </>
          )}
        </div>
      )}

      {/* Memory wall (calendar) */}
      {view === "wall" && (
        <div className="bg-white/80 rounded-2xl p-4">
          <MemoryWallCalendar
            userId={userId}
            entries={entries}
            onOpenEntry={(entry, date) => {
              if (entry) { setEditingEntry(entry); setFormOpen(true); }
              else { setEditingEntry({ id: "", user_id: userId, entry_date: date, content: "", mood: null, is_pinned: false, created_at: "" }); setFormOpen(true); }
            }}
          />
        </div>
      )}

      {/* Entry form */}
      {formOpen && (
        <EntryForm
          userId={userId}
          initial={editingEntry}
          onSave={saveEntry}
          onClose={() => { setFormOpen(false); setEditingEntry(null); }}
        />
      )}
    </div>
  );
}
