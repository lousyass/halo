import React, { useState, useEffect, useMemo, useCallback, Suspense, lazy } from "react";
import { Session } from "@supabase/supabase-js";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Plus, X, Check, Search, ChevronLeft, ChevronRight,
  Trash2, Pencil, Printer, Palette, ListChecks,
  LayoutDashboard, CalendarDays, BookOpen, BarChart3, LogOut,
  Clock, Settings, NotebookPen, Languages, Gamepad2,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { SUPPORT_CONTACT } from "./lib/contact";
import { SyllabusView } from "./SyllabusView";
import academicsIcon from "./assets/icons/academics.png";
import journalIcon from "./assets/icons/journal.png";

// Code-split top-level modes with React.lazy
const JournalView = lazy(() => import("./JournalView"));
const FrenchView = lazy(() => import("./FrenchView").then((m) => ({ default: m.FrenchView })));
const EntertainmentView = lazy(() => import("./EntertainmentView").then((m) => ({ default: m.EntertainmentView })));
const GamesView = lazy(() => import("./GamesView").then((m) => ({ default: m.GamesView })));

/* ─────────────────────────────── types ─────────────────────────────── */

interface Subject {
  id: string;
  name: string;
  color: string;
}

interface FrontendTask {
  id: string;
  subjectId: string;
  title: string;
  type: string;
  dueDate: string;
  status: "pending" | "completed";
  completedAt: string | null;
  customColor: string | null;
  customIcon: string | null;
  topics: Topic[];
  createdAt: string;
  rescheduledFrom: string | null;
}

interface Topic {
  id: string;
  name: string;
  done: boolean;
}

interface RoutineEntry {
  id: string;
  user_id: string;
  day_of_week: number;   // 0=Sun … 6=Sat
  subject: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  notes: string | null;
}

interface UserProfile {
  id: string;
  timezone: string;
  reminder_mode: string;
  daily_digest_time: string;
  display_name: string | null;
}

/* ─────────────────────────── DB row types ───────────────────────────── */

interface DbTask {
  id: string;
  user_id: string;
  subject: string;
  type: string;
  title: string;
  due_date: string;
  due_time: string | null;
  completed: boolean;
  custom_color: string | null;
  custom_icon: string | null;
  created_at: string;
}

interface DbDayBackground {
  id: string;
  user_id: string;
  date: string;
  image_url: string;
}

/* ─────────────────────────── constants ─────────────────────────────── */

const COLOR_PRESETS = [
  { name: "Blush",     hex: "#F5B8C4" },
  { name: "Lavender",  hex: "#C9B6E4" },
  { name: "Mint",      hex: "#A8D5BA" },
  { name: "Peach",     hex: "#F3C08A" },
  { name: "Sky",       hex: "#A8C9E4" },
  { name: "Rose",      hex: "#E497B3" },
  { name: "Lemon",     hex: "#F0DA8A" },
  { name: "Lilac",     hex: "#D8B8E8" },
  { name: "Baby blue", hex: "#89CFF0" },
];

const URGENCY = { red: "#E8837A", yellow: "#EFC067", green: "#93C9A8" };

const THEMES = {
  bloom:      { label: "Blush Bloom",        css: "linear-gradient(135deg, #FDF2F6 0%, #F7E4EE 50%, #EFE2F7 100%)" },
  meadow:     { label: "Mint Meadow",        css: "linear-gradient(135deg, #F3FAF5 0%, #E3F3E8 50%, #DDEFE9 100%)" },
  dusk:       { label: "Golden Dusk",        css: "linear-gradient(135deg, #FFF6E9 0%, #FBE7D4 50%, #F3D9E6 100%)" },
  lilac:      { label: "Lilac Dream",        css: "linear-gradient(135deg, #F6F1FC 0%, #EDE1F7 50%, #E3D6F0 100%)" },
  babyblue:   { label: "Baby Blue",          css: "linear-gradient(135deg, #F0F7FD 0%, #E1EFFB 50%, #D4E6F8 100%)" },
  monochrome: { label: "Monochrome Minimal", css: "linear-gradient(135deg, #F9FAFB 0%, #F3F4F6 50%, #E5E7EB 100%)" },
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TYPE_ICON: Record<string, string> = { assignment: "📝", exam: "📖" };
const CREATURES = ["🦌", "🐉", "🐱", "🦋", "🌸"];

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ─────────────────────────── date helpers ───────────────────────────── */

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function todayStr() { return fmtDate(new Date()); }

function parseDateOnly(dateStr: string): Date {
  if (!dateStr) return new Date();
  const clean = dateStr.split("T")[0];
  const parts = clean.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function daysBetween(a: string, b: string) {
  const da = parseDateOnly(a);
  const db = parseDateOnly(b);
  return Math.round((da.getTime() - db.getTime()) / 86_400_000);
}

function isTaskOverdue(dueDate: string): boolean {
  if (!dueDate) return false;
  const clean = dueDate.split("T")[0];
  const parts = clean.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return false;
  // End of day (23:59:59) in user's local timezone
  const target = new Date(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999).getTime();
  return Date.now() > target;
}

function urgencyOf(dueDate: string) {
  const d = daysBetween(dueDate, todayStr());
  if (d < 3) return "red";
  if (d <= 7) return "yellow";
  return "green";
}
function niceDate(dateStr: string) {
  if (!dateStr) return "";
  const d = parseDateOnly(dateStr);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
function monthGrid(year: number, month: number): (number | null)[] {
  const startWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  return cells;
}

/* ─────────────────── Supabase ↔ frontend mapping ───────────────────── */

function dbToFrontend(
  row: DbTask,
  subjects: Subject[],
  extras: Record<string, { completedAt: string | null; topics: Topic[]; rescheduledFrom: string | null }>
): FrontendTask {
  const subject = subjects.find((s) => s.name === row.subject) || subjects[0];
  const ex = extras[row.id] || { completedAt: null, topics: [], rescheduledFrom: null };
  return {
    id: row.id,
    subjectId: subject?.id || "unknown",
    title: row.title,
    type: row.type,
    dueDate: row.due_date,
    status: row.completed ? "completed" : "pending",
    completedAt: ex.completedAt,
    customColor: row.custom_color,
    customIcon: row.custom_icon,
    topics: ex.topics,
    createdAt: row.created_at,
    rescheduledFrom: ex.rescheduledFrom,
  };
}

function frontendToDb(t: FrontendTask, subjects: Subject[], userId: string): Omit<DbTask, "created_at"> {
  const subject = subjects.find((s) => s.id === t.subjectId);
  return {
    id: t.id,
    user_id: userId,
    subject: subject?.name || "Unknown",
    type: t.type,
    title: t.title,
    due_date: t.dueDate,
    due_time: null,
    completed: t.status === "completed",
    custom_color: t.customColor,
    custom_icon: t.customIcon,
  };
}

/* ─────────────────────────── small UI bits ─────────────────────────── */

function Sticker({ children, rotate = 0, style, className = "" }: {
  children: React.ReactNode; rotate?: number; style?: React.CSSProperties; className?: string;
}) {
  return (
    <div
      className={`relative rounded-3xl bg-white/80 shadow-[0_4px_18px_rgba(120,90,130,0.12)] ${className}`}
      style={{ transform: `rotate(${rotate}deg)`, ...style }}
    >
      <div
        className="absolute -top-2 left-6 w-10 h-4 rounded-sm opacity-70"
        style={{ background: "repeating-linear-gradient(45deg,rgba(255,255,255,.6),rgba(255,255,255,.6) 4px,rgba(230,200,215,.55) 4px,rgba(230,200,215,.55) 8px)", transform: "rotate(-4deg)" }}
      />
      {children}
    </div>
  );
}

function UrgencyDot({ level }: { level: keyof typeof URGENCY }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: URGENCY[level] }} />;
}

function EmptyState({ emoji, text }: { emoji: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center opacity-70">
      <div className="text-4xl mb-2">{emoji}</div>
      <div className="text-sm" style={{ fontFamily: "Quicksand, sans-serif" }}>{text}</div>
    </div>
  );
}

/* ─────────────────────────── task countdown ─────────────────────────── */

function TaskCountdown({ dueDate, status }: { dueDate: string; status: string }) {
  const [timeLeft, setTimeLeft] = useState<{ d: string; h: string; m: string; s: string; overdue: boolean } | null>(null);

  useEffect(() => {
    if (status === "completed") return;

    const calc = () => {
      // Treat deadline as 23:59:59 local time on due_date
      const target = new Date(`${dueDate}T23:59:59`).getTime();
      const now = Date.now();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft({ d: "00", h: "00", m: "00", s: "00", overdue: true });
        return;
      }

      const d = Math.floor(diff / (1000 * 60 * 60 * 24));
      const h = Math.floor((diff / (1000 * 60 * 60)) % 24);
      const m = Math.floor((diff / (1000 * 60)) % 60);
      const s = Math.floor((diff / 1000) % 60);

      setTimeLeft({
        d: String(d).padStart(2, "0"),
        h: String(h).padStart(2, "0"),
        m: String(m).padStart(2, "0"),
        s: String(s).padStart(2, "0"),
        overdue: false,
      });
    };

    calc();
    const interval = setInterval(calc, 1000);
    return () => clearInterval(interval);
  }, [dueDate, status]);

  if (status === "completed" || !timeLeft) return null;

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-mono font-bold tracking-wider transition-colors ${
        timeLeft.overdue
          ? "bg-red-50 text-red-700 border border-red-200"
          : "bg-purple-50/90 text-purple-900 border border-purple-200/80 shadow-2xs"
      }`}
      title={timeLeft.overdue ? "Task is overdue" : "Live deadline countdown (DD : HH : MM : SS)"}
    >
      <Clock size={11} className={timeLeft.overdue ? "text-red-500" : "text-purple-600 animate-pulse"} />
      <span>{timeLeft.d} : {timeLeft.h} : {timeLeft.m} : {timeLeft.s}</span>
      {timeLeft.overdue && <span className="text-[9px] uppercase font-sans font-extrabold text-red-600 ml-0.5">Overdue</span>}
    </div>
  );
}

/* ─────────────────────────── task card ─────────────────────────────── */

function TaskCard({ task, subject, onToggle, onEdit, onDelete }: {
  task: FrontendTask; subject: Subject | undefined;
  onToggle: (id: string) => void; onEdit: (t: FrontendTask) => void; onDelete: (id: string) => void;
}) {
  const urgency = task.status === "completed" ? null : urgencyOf(task.dueDate);
  const overdue = task.status !== "completed" && daysBetween(task.dueDate, todayStr()) < 0;
  const color = task.customColor || subject?.color || "#C9B6E4";
  const doneTopics = task.topics.filter((t) => t.done).length;
  const totalTopics = task.topics.length;

  return (
    <div
      className="rounded-2xl p-3.5 mb-2.5 border transition-shadow hover:shadow-md"
      style={{ borderColor: color + "55", background: task.status === "completed" ? "#F7F5F2" : "#FFFFFFCC" }}
    >
      <div className="flex items-start gap-2.5">
        <button
          onClick={() => onToggle(task.id)}
          className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors"
          style={{ borderColor: color, background: task.status === "completed" ? color : "transparent" }}
        >
          {task.status === "completed" && <Check size={12} color="white" strokeWidth={3} />}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-base">{task.customIcon || TYPE_ICON[task.type] || "📝"}</span>
            <span className={`font-semibold text-sm ${task.status === "completed" ? "line-through opacity-50" : ""}`} style={{ fontFamily: "Quicksand, sans-serif" }}>
              {task.title}
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: color + "33", color: "#5B4B6D" }}>
              {subject?.name || "No subject"}
            </span>
            {urgency && <UrgencyDot level={overdue ? "red" : urgency} />}
            <TaskCountdown dueDate={task.dueDate} status={task.status} />
          </div>
          <div className="text-xs mt-1 opacity-70">
            {task.status === "completed" ? `Done · was due ${niceDate(task.dueDate)}`
              : overdue ? `Overdue since ${niceDate(task.dueDate)}`
              : `Due ${niceDate(task.dueDate)} · ${daysBetween(task.dueDate, todayStr())}d left`}
            {totalTopics > 0 && ` · ${doneTopics}/${totalTopics} topics`}
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onEdit(task)} className="p-1.5 rounded-lg hover:bg-black/5"><Pencil size={14} /></button>
          <button onClick={() => onDelete(task.id)} className="p-1.5 rounded-lg hover:bg-black/5"><Trash2 size={14} /></button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── task form ─────────────────────────────── */

function TaskForm({ initial, subjects, typeSuggestions, onSave, onClose }: {
  initial: Partial<FrontendTask> | null; subjects: Subject[];
  typeSuggestions: string[];
  onSave: (t: FrontendTask) => void; onClose: () => void;
}) {
  const [subjectId, setSubjectId] = useState(initial?.subjectId || subjects[0]?.id || "");
  const [title, setTitle] = useState(initial?.title || "");
  const [type, setType] = useState(initial?.type || "");
  const [dueDate, setDueDate] = useState(initial?.dueDate || todayStr());
  const [customColor, setCustomColor] = useState(initial?.customColor || "");
  const [customIcon, setCustomIcon] = useState(initial?.customIcon || "");
  const [topics, setTopics] = useState<Topic[]>(initial?.topics || []);
  const [newTopic, setNewTopic] = useState("");

  const addTopic = () => {
    if (!newTopic.trim()) return;
    setTopics([...topics, { id: uid(), name: newTopic.trim(), done: false }]);
    setNewTopic("");
  };

  const save = () => {
    if (!title.trim() || !subjectId) return;
    const resolvedType = type.trim() || "Assignment";
    onSave({
      id: initial?.id || crypto.randomUUID(), subjectId, title: title.trim(), type: resolvedType, dueDate,
      status: initial?.status || "pending", completedAt: initial?.completedAt || null,
      customColor: customColor || null, customIcon: customIcon || null,
      topics: resolvedType.toLowerCase() === "exam" ? topics : [],
      createdAt: initial?.createdAt || new Date().toISOString(),
      rescheduledFrom: initial?.dueDate && initial.dueDate !== dueDate ? (initial.rescheduledFrom || initial.dueDate) : (initial?.rescheduledFrom || null),
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()} style={{ fontFamily: "Quicksand, sans-serif" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>{initial?.id ? "Edit task" : "Add a task"}</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        {subjects.length === 0 ? (
          <p className="text-sm opacity-70 mb-3">Add a subject first from the Tasks tab 🌸</p>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold opacity-70">Subject</label>
              <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-full mt-1 p-2 rounded-xl border bg-white">
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold opacity-70">Title</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Activity 5" className="w-full mt-1 p-2 rounded-xl border" />
            </div>
            <div>
              <label className="text-xs font-semibold opacity-70">Type</label>
              <input
                list="type-suggestions"
                value={type}
                onChange={(e) => setType(e.target.value)}
                placeholder="e.g. Assignment, Exam, CT, Quiz…"
                className="w-full mt-1 p-2 rounded-xl border bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
              />
              <datalist id="type-suggestions">
                {typeSuggestions.map((s) => <option key={s} value={s} />)}
              </datalist>

              {/* Suggestions chips from previously entered & standard task types */}
              {typeSuggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {typeSuggestions.slice(0, 8).map((s) => {
                    const isSelected = type.toLowerCase() === s.toLowerCase();
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setType(s)}
                        className={`text-[11px] px-2.5 py-1 rounded-lg border transition-all ${
                          isSelected
                            ? "bg-purple-100 border-purple-300 text-purple-900 font-bold shadow-xs"
                            : "bg-gray-50/80 border-gray-200 hover:bg-purple-50 hover:border-purple-200 text-gray-700 font-medium"
                        }`}
                      >
                        {s}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-semibold opacity-70">Due date</label>
              <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full mt-1 p-2 rounded-xl border" />
            </div>
            {(type.toLowerCase() === "exam" || type.toLowerCase() === "ct" || type.toLowerCase() === "quiz") && (
              <div className="p-3 rounded-xl bg-purple-50/60">
                <label className="text-xs font-semibold opacity-70 flex items-center gap-1"><ListChecks size={14} /> Exam topics</label>
                <div className="space-y-1 mt-2">
                  {topics.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={t.done} onChange={() => setTopics(topics.map((x) => x.id === t.id ? { ...x, done: !x.done } : x))} />
                      <span className={t.done ? "line-through opacity-50" : ""}>{t.name}</span>
                      <button onClick={() => setTopics(topics.filter((x) => x.id !== t.id))} className="ml-auto opacity-50 hover:opacity-100"><X size={13} /></button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5 mt-2">
                  <input value={newTopic} onChange={(e) => setNewTopic(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTopic()} placeholder="Add topic..." className="flex-1 p-1.5 rounded-lg border text-sm" />
                  <button onClick={addTopic} className="px-2.5 rounded-lg bg-purple-200"><Plus size={14} /></button>
                </div>
              </div>
            )}
            <details className="text-sm">
              <summary className="text-xs font-semibold opacity-70 cursor-pointer">Custom look (optional)</summary>
              <div className="flex gap-1 flex-wrap mt-2">
                {COLOR_PRESETS.map((c) => (
                  <button key={c.hex} onClick={() => setCustomColor(c.hex)} className="w-6 h-6 rounded-full border-2" style={{ background: c.hex, borderColor: customColor === c.hex ? "#5B4B6D" : "transparent" }} />
                ))}
                <button onClick={() => setCustomColor("")} className="text-xs opacity-60 underline ml-1">clear</button>
              </div>
              <input value={customIcon} onChange={(e) => setCustomIcon(e.target.value.slice(0, 2))} placeholder="🌸 emoji" className="w-20 mt-2 p-1.5 rounded-lg border text-sm" />
            </details>
            <button onClick={save} className="w-full mt-2 p-2.5 rounded-xl font-semibold text-white" style={{ background: "#C9B6E4", fontFamily: "Fredoka, sans-serif" }}>
              {initial?.id ? "Save changes" : "Add task"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────── routine form ───────────────────────────── */

const EMPTY_ROUTINE: Omit<RoutineEntry, "id" | "user_id"> = {
  day_of_week: 1,
  subject: "",
  start_time: "08:00",
  end_time: "",
  location: "",
  notes: "",
};

function RoutineForm({ initial, onSave, onClose }: {
  initial?: Partial<RoutineEntry>; onSave: (r: Omit<RoutineEntry, "id" | "user_id">) => void; onClose: () => void;
}) {
  const [form, setForm] = useState({
    day_of_week: initial?.day_of_week ?? 1,
    subject: initial?.subject ?? "",
    start_time: initial?.start_time ?? "08:00",
    end_time: initial?.end_time ?? "",
    location: initial?.location ?? "",
    notes: initial?.notes ?? "",
  });

  const save = () => {
    if (!form.subject.trim() || !form.start_time) return;
    onSave({
      day_of_week: Number(form.day_of_week),
      subject: form.subject.trim(),
      start_time: form.start_time,
      end_time: form.end_time || null,
      location: form.location || null,
      notes: form.notes || null,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-3xl p-5 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()} style={{ fontFamily: "Quicksand, sans-serif" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>{initial?.id ? "Edit class" : "Add class"}</h3>
          <button onClick={onClose}><X size={20} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold opacity-70">Day</label>
            <select value={form.day_of_week} onChange={(e) => setForm({ ...form, day_of_week: Number(e.target.value) })} className="w-full mt-1 p-2 rounded-xl border bg-white">
              {DAY_NAMES.map((name, i) => <option key={i} value={i}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold opacity-70">Subject</label>
            <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="e.g. Math 101" className="w-full mt-1 p-2 rounded-xl border" />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs font-semibold opacity-70">Start time</label>
              <input type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} className="w-full mt-1 p-2 rounded-xl border" />
            </div>
            <div className="flex-1">
              <label className="text-xs font-semibold opacity-70">End time</label>
              <input type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} className="w-full mt-1 p-2 rounded-xl border" />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold opacity-70">Location</label>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Room 201" className="w-full mt-1 p-2 rounded-xl border" />
          </div>
          <div>
            <label className="text-xs font-semibold opacity-70">Notes</label>
            <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="optional" className="w-full mt-1 p-2 rounded-xl border" />
          </div>
          <button onClick={save} className="w-full mt-2 p-2.5 rounded-xl font-semibold text-white" style={{ background: "#A8D5BA", fontFamily: "Fredoka, sans-serif" }}>
            {initial?.id ? "Save changes" : "Add class"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── routine view ───────────────────────────── */

function RoutineView({ routineEntries, onAdd, onEdit, onDelete }: {
  routineEntries: RoutineEntry[];
  onAdd: (r: Omit<RoutineEntry, "id" | "user_id">) => void;
  onEdit: (id: string, r: Omit<RoutineEntry, "id" | "user_id">) => void;
  onDelete: (id: string) => void;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<RoutineEntry | null>(null);

  const grouped = useMemo(() => {
    const map: Record<number, RoutineEntry[]> = {};
    routineEntries.forEach((e) => {
      (map[e.day_of_week] = map[e.day_of_week] || []).push(e);
    });
    return map;
  }, [routineEntries]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
            Your weekly routine 🗓️
          </h2>
          <p className="text-xs opacity-60">Your recurring 7 day weekly schedule</p>
        </div>
        <button
          onClick={() => { setEditingEntry(null); setFormOpen(true); }}
          className="px-4 py-2.5 rounded-2xl text-white font-semibold flex items-center gap-1.5 shadow-sm hover:opacity-95 transition-all text-sm"
          style={{ background: "#A8D5BA", fontFamily: "Fredoka, sans-serif" }}
        >
          <Plus size={16} /> Add a class
        </button>
      </div>

      {/* 7-Day Timetable Grid */}
      <div className="overflow-x-auto pb-4">
        <div className="grid grid-cols-7 gap-2.5 min-w-[820px]">
          {DAY_NAMES.map((dayName, dow) => {
            const entries = [...(grouped[dow] || [])].sort((a, b) => a.start_time.localeCompare(b.start_time));
            const shortName = dayName.slice(0, 3);
            const isWeekend = dow === 0 || dow === 6;

            return (
              <div
                key={dow}
                className={`flex flex-col rounded-3xl p-3 border transition-all ${
                  isWeekend ? "bg-purple-50/40 border-purple-100/70" : "bg-white/80 border-black/5"
                } shadow-xs min-h-[420px]`}
              >
                {/* Column Header */}
                <div className="flex items-center justify-between border-b border-black/5 pb-2 mb-2.5">
                  <div>
                    <span className="font-bold text-sm text-[#5B4B6D]" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      {shortName}
                    </span>
                    <span className="text-[10px] opacity-50 block font-medium">
                      {entries.length === 0 ? "Free" : `${entries.length} ${entries.length === 1 ? "class" : "classes"}`}
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setEditingEntry({
                        id: "",
                        user_id: "",
                        day_of_week: dow,
                        subject: "",
                        start_time: "09:00",
                        end_time: null,
                        location: null,
                        notes: null,
                      });
                      setFormOpen(true);
                    }}
                    className="w-6 h-6 rounded-full bg-black/5 hover:bg-[#A8D5BA] hover:text-white flex items-center justify-center text-gray-500 transition-colors"
                    title={`Add class for ${dayName}`}
                  >
                    <Plus size={13} />
                  </button>
                </div>

                {/* Class Slots */}
                <div className="space-y-2 flex-1">
                  {entries.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-3 opacity-35 border-2 border-dashed border-black/5 rounded-2xl">
                      <span className="text-xl mb-1">☕</span>
                      <span className="text-xs font-medium">No classes</span>
                    </div>
                  ) : (
                    entries.map((entry) => (
                      <div
                        key={entry.id}
                        className="p-2.5 rounded-2xl bg-white border border-[#EADEF0] shadow-2xs hover:shadow-xs transition-all text-left group"
                      >
                        {/* Time Pill */}
                        <div className="inline-flex items-center gap-1 text-[10px] font-bold text-[#7C3AED] bg-purple-50 px-2 py-0.5 rounded-full mb-1">
                          <Clock size={10} />
                          <span>
                            {entry.start_time.slice(0, 5)}
                            {entry.end_time ? ` - ${entry.end_time.slice(0, 5)}` : ""}
                          </span>
                        </div>

                        {/* Subject */}
                        <h4 className="font-bold text-xs text-[#5B4B6D] leading-tight mb-1 truncate" title={entry.subject}>
                          {entry.subject}
                        </h4>

                        {/* Location / Notes */}
                        {entry.location && (
                          <div className="text-[11px] text-gray-500 truncate mb-0.5">
                            📍 {entry.location}
                          </div>
                        )}
                        {entry.notes && (
                          <div className="text-[10px] text-gray-400 italic line-clamp-2 leading-tight">
                            {entry.notes}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="mt-2 pt-1.5 border-t border-gray-100 flex items-center justify-end gap-1 opacity-80 group-hover:opacity-100">
                          <button
                            onClick={() => { setEditingEntry(entry); setFormOpen(true); }}
                            className="p-1 rounded-lg hover:bg-black/5 text-gray-500 hover:text-[#5B4B6D]"
                            title="Edit"
                          >
                            <Pencil size={11} />
                          </button>
                          <button
                            onClick={() => onDelete(entry.id)}
                            className="p-1 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600"
                            title="Delete"
                          >
                            <Trash2 size={11} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {formOpen && (
        <RoutineForm
          initial={editingEntry || undefined}
          onSave={(r) => {
            if (editingEntry?.id) { onEdit(editingEntry.id, r); }
            else { onAdd(r); }
            setFormOpen(false); setEditingEntry(null);
          }}
          onClose={() => { setFormOpen(false); setEditingEntry(null); }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── settings view ─────────────────────────── */

function SettingsView({ profile, onSave, onSignOut }: {
  profile: UserProfile | null;
  onSave: (updates: { reminder_mode: string; daily_digest_time: string }) => Promise<void>;
  onSignOut: () => void;
}) {
  const [reminderMode, setReminderMode] = useState(profile?.reminder_mode || "urgent");
  const [digestTime, setDigestTime] = useState((profile?.daily_digest_time || "08:00:00").slice(0, 5));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (profile) {
      setReminderMode(profile.reminder_mode);
      setDigestTime(profile.daily_digest_time.slice(0, 5));
    }
  }, [profile]);

  const save = async () => {
    setSaving(true);
    await onSave({ reminder_mode: reminderMode, daily_digest_time: digestTime });
    setSaving(false);
  };

  if (!profile) return <div className="p-4 text-center opacity-60">Loading profile...</div>;

  return (
    <div className="space-y-4">
      <Sticker className="p-4" rotate={-0.2}>
        <h3 className="font-bold mb-3" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>⚙️ Reminder Settings</h3>
        <p className="text-xs opacity-60 mb-3">Chose how and when you want to receive reminder emails to your inbox</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold opacity-70 block mb-1">Reminder mode</label>
            <div className="flex gap-2">
              <button
                onClick={() => setReminderMode("urgent")}
                className={`flex-1 p-3 rounded-xl border text-sm text-left transition-colors ${reminderMode === "urgent" ? "bg-pink-50 border-pink-300" : "bg-white border-gray-200"}`}
              >
                <div className="font-semibold">⚡ Urgent</div>
                <div className="text-xs opacity-60 mt-0.5">Emails at 48h, 24h, 2h before deadline + when overdue</div>
              </button>
              <button
                onClick={() => setReminderMode("daily")}
                className={`flex-1 p-3 rounded-xl border text-sm text-left transition-colors ${reminderMode === "daily" ? "bg-purple-50 border-purple-300" : "bg-white border-gray-200"}`}
              >
                <div className="font-semibold">📋 Daily digest</div>
                <div className="text-xs opacity-60 mt-0.5">One email per day listing all pending tasks</div>
              </button>
            </div>
          </div>

          {reminderMode === "daily" && (
            <div>
              <label className="text-xs font-semibold opacity-70 block mb-1">Digest time (your local time)</label>
              <input
                type="time"
                value={digestTime}
                onChange={(e) => setDigestTime(e.target.value)}
                className="p-2 rounded-xl border w-40"
              />
            </div>
          )}

          <button
            onClick={save}
            disabled={saving}
            className="w-full p-2.5 rounded-xl font-semibold text-white"
            style={{ background: saving ? "#C9B6E4AA" : "#C9B6E4", fontFamily: "Fredoka, sans-serif" }}
          >
            {saving ? "Saving..." : "Save reminder settings"}
          </button>
        </div>
      </Sticker>

      <Sticker className="p-4" rotate={0.2}>
        <h3 className="font-bold mb-3" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>🧾 Account</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between py-1.5 border-b border-black/5">
            <span className="opacity-60">Timezone</span>
            <span className="font-semibold">{profile.timezone}</span>
          </div>
          <div className="flex justify-between py-1.5 border-b border-black/5">
            <span className="opacity-60">Reminder mode</span>
            <span className="font-semibold capitalize">{profile.reminder_mode}</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="opacity-60">Digest time</span>
            <span className="font-semibold">{profile.daily_digest_time.slice(0, 5)}</span>
          </div>
        </div>
        <a
          href={SUPPORT_CONTACT.waLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 mb-2 block text-center text-sm py-2 rounded-xl"
          style={{ background: "#F0F9F4", color: "#2D7A4F" }}
        >
          💬 Report a bug or suggest something
        </a>
        <button
          onClick={onSignOut}
          className="w-full p-2.5 rounded-xl font-semibold flex items-center justify-center gap-2 text-sm"
          style={{ background: "#FEE2E2", color: "#B91C1C", fontFamily: "Fredoka, sans-serif" }}
        >
          <LogOut size={15} /> Sign out
        </button>
      </Sticker>
    </div>
  );
}

/* ─────────────────────────── calendar view ─────────────────────────── */

function CalendarView({ tasks, subjects, routineEntries, onQuickAdd }: {
  tasks: FrontendTask[];
  subjects: Subject[];
  routineEntries: RoutineEntry[];
  onQuickAdd: (date: string) => void;
}) {
  const [cursor, setCursor] = useState(new Date());
  const [selected, setSelected] = useState<string | null>(null);

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const cells = monthGrid(year, month);
  const subjById = Object.fromEntries(subjects.map((s) => [s.id, s]));

  const tasksByDate = useMemo(() => {
    const map: Record<string, FrontendTask[]> = {};
    tasks.forEach((t) => { (map[t.dueDate] = map[t.dueDate] || []).push(t); });
    return map;
  }, [tasks]);

  const selectedTasks = selected ? (tasksByDate[selected] || []) : [];

  // Routine entries for the selected date's day-of-week
  const selectedDow = selected ? new Date(selected + "T00:00:00").getDay() : null;
  const selectedRoutine = selectedDow !== null
    ? [...routineEntries].filter((r) => r.day_of_week === selectedDow).sort((a, b) => a.start_time.localeCompare(b.start_time))
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-2 rounded-xl hover:bg-black/5"><ChevronLeft size={18} /></button>
        <h3 className="font-bold text-lg" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
          {cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h3>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-2 rounded-xl hover:bg-black/5"><ChevronRight size={18} /></button>
      </div>

      <div className="grid grid-cols-7 gap-2 text-center text-xs font-bold text-gray-500 mb-2">
        {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-2">
        {cells.map((d, i) => {
          if (!d) return <div key={i} className="min-h-[90px] rounded-2xl bg-black/[0.02]" />;
          const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
          const dayTasks = tasksByDate[dateStr] || [];
          const isToday = dateStr === todayStr();
          return (
            <button
              key={i}
              onClick={() => setSelected(dateStr)}
              className={`min-h-[90px] rounded-2xl p-2 text-left relative overflow-hidden border transition-all ${
                isToday ? "border-2 shadow-sm bg-white/95" : "border-white/70 hover:border-purple-200 bg-white/75 hover:bg-white/95"
              } backdrop-blur-sm flex flex-col justify-between`}
              style={{ borderColor: isToday ? "#C9B6E4" : undefined }}
            >
              <div className="flex items-center justify-between w-full">
                <span className={`text-sm font-bold ${isToday ? "text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded-lg" : "text-gray-700"}`}>
                  {d}
                </span>
                {dayTasks.length > 0 && (
                  <div className="flex gap-1 items-center">
                    {dayTasks.slice(0, 3).map((t) => (
                      <span
                        key={t.id}
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: t.customColor || subjById[t.subjectId]?.color || "#C9B6E4" }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Task titles shown as text badges in the cell */}
              <div className="mt-1 space-y-1 w-full overflow-hidden">
                {dayTasks.slice(0, 2).map((t) => {
                  const color = t.customColor || subjById[t.subjectId]?.color || "#C9B6E4";
                  return (
                    <div
                      key={t.id}
                      className="text-[10.5px] font-semibold px-1.5 py-0.5 rounded-md truncate text-gray-800 flex items-center gap-1"
                      style={{
                        backgroundColor: color + "22",
                        borderLeft: `2.5px solid ${color}`,
                      }}
                      title={t.title}
                    >
                      <span className="truncate">{t.title}</span>
                    </div>
                  );
                })}
                {dayTasks.length > 2 && (
                  <span className="text-[9.5px] font-bold text-gray-400 pl-1 block">
                    +{dayTasks.length - 2} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <Sticker className="mt-4 p-4" rotate={-0.4}>
          <div className="flex justify-between items-start mb-2">
            <h4 className="font-bold" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
              {niceDate(selected)} <span className="text-sm font-normal opacity-60">({DAY_NAMES[selectedDow!]})</span>
            </h4>
            <button onClick={() => setSelected(null)}><X size={16} /></button>
          </div>

          {/* Tasks due this day */}
          <div className="mb-3">
            <h5 className="text-xs font-bold opacity-60 uppercase tracking-wide mb-1.5">📝 Tasks due</h5>
            {selectedTasks.length === 0
              ? <p className="text-sm opacity-50">Nothing due this day 🌿</p>
              : selectedTasks.map((t) => (
                  <div key={t.id} className="text-sm flex items-center gap-1.5 mb-1">
                    <span>{TYPE_ICON[t.type] || "📝"}</span>
                    <span className={t.status === "completed" ? "line-through opacity-50" : ""}>{t.title}</span>
                    <span className="opacity-50">— {subjById[t.subjectId]?.name}</span>
                  </div>
                ))}
          </div>

          {/* Routine for this day-of-week */}
          <div className="mb-3">
            <h5 className="text-xs font-bold opacity-60 uppercase tracking-wide mb-1.5">🗓️ Classes ({DAY_NAMES[selectedDow!]})</h5>
            {selectedRoutine.length === 0
              ? <p className="text-sm opacity-50">No classes scheduled 📚</p>
              : selectedRoutine.map((r) => (
                  <div key={r.id} className="text-sm flex items-center gap-1.5 mb-1">
                    <span className="font-semibold">{r.start_time.slice(0, 5)}{r.end_time ? `–${r.end_time.slice(0, 5)}` : ""}</span>
                    <span>{r.subject}</span>
                    {r.location && <span className="opacity-50">@ {r.location}</span>}
                  </div>
                ))}
          </div>

          <button onClick={() => onQuickAdd(selected)} className="text-sm px-3 py-1.5 rounded-xl bg-pink-100 flex items-center gap-1">
            <Plus size={14} /> Add task on this day
          </button>
        </Sticker>
      )}
    </div>
  );
}

/* ─────────────────────────── stats view ────────────────────────────── */

function StatsView({ tasks }: { tasks: FrontendTask[] }) {
  const data = useMemo(() =>
    tasks
      .filter((t) => t.status === "completed" && t.completedAt)
      .sort((a, b) => new Date(a.completedAt!).getTime() - new Date(b.completedAt!).getTime())
      .map((t, i) => ({ name: `#${i + 1}`, delta: daysBetween(t.dueDate, fmtDate(new Date(t.completedAt!))), title: t.title })),
    [tasks]
  );

  return (
    <div>
      <Sticker className="p-4 mb-4" rotate={0.3}>
        <h4 className="font-bold mb-2 flex items-center gap-1.5" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>🐉 Your submission trend</h4>
        {data.length === 0
          ? <EmptyState emoji="📈" text="Complete a few tasks to see your trend here" />
          : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} label={{ value: "days early(+)/late(-)", angle: -90, position: "insideLeft", fontSize: 10 }} />
                <Tooltip formatter={(v, _n, p) => [`${v} days`, (p?.payload as { title?: string })?.title || ""]} />
                <ReferenceLine y={0} stroke="#999" strokeDasharray="4 2" />
                <Line type="monotone" dataKey="delta" stroke="#C9B6E4" strokeWidth={2.5} dot={{ fill: "#5B4B6D", r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        <p className="text-xs opacity-60 mt-1">Above the line = ahead of deadline. Below = turned in late.</p>
      </Sticker>
    </div>
  );
}

/* ─────────────────────────── main component ─────────────────────────── */

export default function StudyDen({ session }: { session: Session }) {
  const userId = session.user.id;

  // localStorage-only
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [theme, setTheme] = useState<keyof typeof THEMES>("bloom");
  const [taskExtras, setTaskExtras] = useState<Record<string, { completedAt: string | null; topics: Topic[]; rescheduledFrom: string | null }>>({});

  // Supabase-backed
  const [tasks, setTasks] = useState<FrontendTask[]>([]);
  const [dayBackgrounds, setDayBackgrounds] = useState<Record<string, string>>({});
  const [routineEntries, setRoutineEntries] = useState<RoutineEntry[]>([]);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // UI
  const [loaded, setLoaded] = useState(false);
  const [mode, setMode] = useState<"academics" | "journal" | "french" | "entertainment" | "games" | "settings">("academics");
  const [academicTab, setAcademicTab] = useState<"dashboard" | "calendar" | "tasks" | "routine" | "stats">("dashboard");
  const [snoozedOverdueIds, setSnoozedOverdueIds] = useState<Set<string>>(new Set());
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Partial<FrontendTask> | null>(null);
  const [subjectDraft, setSubjectDraft] = useState({ name: "", color: COLOR_PRESETS[0].hex });
  const [filterStatus, setFilterStatus] = useState("pending");
  const [filterSubject, setFilterSubject] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [groupBy, setGroupBy] = useState("subject");
  const [search, setSearch] = useState("");
  const [thisWeekOnly, setThisWeekOnly] = useState(false);

  /* ── bootstrap ── */
  useEffect(() => {
    const savedSettings = localStorage.getItem(`halo-settings-${userId}`);
    if (savedSettings) {
      const p = JSON.parse(savedSettings);
      setSubjects(p.subjects || []);
      setTheme(p.theme || "bloom");
      setTaskExtras(p.taskExtras || {});
    }
    Promise.all([fetchTasks(), fetchDayBackgrounds(), fetchRoutineEntries(), fetchProfile()])
      .finally(() => setLoaded(true));
  }, [userId]);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(`halo-settings-${userId}`, JSON.stringify({ subjects, theme, taskExtras }));
  }, [subjects, theme, taskExtras, loaded, userId]);

  /* ── fetchers ── */
  const getLocalSettings = () => {
    const raw = localStorage.getItem(`halo-settings-${userId}`);
    return raw ? JSON.parse(raw) : { subjects: [], taskExtras: {} };
  };

  const fetchTasks = useCallback(async () => {
    const { data, error } = await supabase.from("tasks").select("*").eq("user_id", userId).order("due_date", { ascending: true });
    if (error) { console.error("fetchTasks:", error.message); return; }
    const s = getLocalSettings();
    setTasks((data as DbTask[]).map((row) => dbToFrontend(row, s.subjects || [], s.taskExtras || {})));
  }, [userId]);

  const fetchDayBackgrounds = useCallback(async () => {
    const { data, error } = await supabase.from("day_backgrounds").select("*").eq("user_id", userId);
    if (error) { console.error("fetchDayBackgrounds:", error.message); return; }
    const map: Record<string, string> = {};
    (data as DbDayBackground[]).forEach((row) => { map[row.date] = row.image_url; });
    setDayBackgrounds(map);
  }, [userId]);

  const fetchRoutineEntries = useCallback(async () => {
    const { data, error } = await supabase.from("routine_entries").select("*").eq("user_id", userId).order("day_of_week").order("start_time");
    if (error) { console.error("fetchRoutineEntries:", error.message); return; }
    setRoutineEntries(data as RoutineEntry[]);
  }, [userId]);

  const fetchProfile = useCallback(async () => {
    const { data, error } = await supabase.from("profiles").select("id, timezone, reminder_mode, daily_digest_time, display_name").eq("id", userId).single();
    if (error) { console.error("fetchProfile:", error.message); return; }
    setProfile(data as UserProfile);
  }, [userId]);

  /* ── derived ── */
  const subjById = useMemo(() => Object.fromEntries(subjects.map((s) => [s.id, s])), [subjects]);

  // Distinct type values the user has previously entered + common defaults — used for datalist & suggestions
  const typeSuggestions = useMemo(() => {
    const defaults = ["Assignment", "Exam", "CT", "Quiz", "Project", "Lab", "Homework", "Activity", "Presentation"];
    const userEntered = tasks.map((t) => t.type).filter(Boolean);
    return [...new Set([...userEntered, ...defaults])].filter(Boolean);
  }, [tasks]);

  // Overdue tasks: deadline passed, still not completed — shown as in-app prompt on dashboard
  const overdueForPrompt = useMemo(() =>
    tasks.filter((t) => t.status !== "completed" && isTaskOverdue(t.dueDate) && !snoozedOverdueIds.has(t.id)),
    [tasks, snoozedOverdueIds]
  );

  const upcoming = useMemo(() =>
    [...tasks].filter((t) => t.status !== "completed").sort((a, b) => daysBetween(a.dueDate, todayStr()) - daysBetween(b.dueDate, todayStr())).slice(0, 6),
    [tasks]
  );

  const filtered = useMemo(() =>
    tasks.filter((t) => {
      if (filterStatus !== "all" && t.status !== filterStatus) return false;
      if (filterSubject !== "all" && t.subjectId !== filterSubject) return false;
      if (filterType !== "all" && t.type !== filterType) return false;
      if (search && !t.title.toLowerCase().includes(search.toLowerCase()) && !subjById[t.subjectId]?.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (thisWeekOnly && daysBetween(t.dueDate, todayStr()) > 7) return false;
      return true;
    }),
    [tasks, filterStatus, filterSubject, filterType, search, thisWeekOnly, subjById]
  );

  const grouped = useMemo(() => {
    const map: Record<string, FrontendTask[]> = {};
    filtered.filter((t) => t.status !== "completed").forEach((t) => {
      const key = groupBy === "subject" ? (subjById[t.subjectId]?.name || "No subject") : t.type;
      (map[key] = map[key] || []).push(t);
    });
    return map;
  }, [filtered, groupBy, subjById]);

  /* ── task CRUD ── */
  const saveTask = async (t: FrontendTask) => {
    const payload = frontendToDb(t, subjects, userId);
    const { error } = await supabase.from("tasks").upsert(payload, { onConflict: "id" });
    if (error) { alert("Save failed: " + error.message); return; }
    setTaskExtras((prev) => ({ ...prev, [t.id]: { completedAt: t.completedAt, topics: t.topics, rescheduledFrom: t.rescheduledFrom } }));
    setTasks((prev) => { const exists = prev.some((x) => x.id === t.id); return exists ? prev.map((x) => x.id === t.id ? t : x) : [...prev, t]; });
    setFormOpen(false); setEditingTask(null);
  };

  const toggleTask = async (id: string) => {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    const nowCompleted = task.status !== "completed";
    const completedAt = nowCompleted ? new Date().toISOString() : null;
    const { error } = await supabase.from("tasks").update({ completed: nowCompleted }).eq("id", id);
    if (error) { alert("Toggle failed: " + error.message); return; }
    setTaskExtras((prev) => ({ ...prev, [id]: { ...(prev[id] || { topics: [], rescheduledFrom: null }), completedAt } }));
    setTasks((prev) => prev.map((t) => t.id === id ? { ...t, status: nowCompleted ? "completed" : "pending", completedAt } : t));
  };

  const deleteTask = async (id: string) => {
    if (!confirm("Delete this task?")) return;
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) { alert("Delete failed: " + error.message); return; }
    setTasks((prev) => prev.filter((t) => t.id !== id));
    setTaskExtras((prev) => { const n = { ...prev }; delete n[id]; return n; });
  };

  /* ── subject CRUD (localStorage) ── */
  const addSubject = () => {
    if (!subjectDraft.name.trim()) return;
    setSubjects((prev) => [...prev, { id: uid(), name: subjectDraft.name.trim(), color: subjectDraft.color }]);
    setSubjectDraft({ name: "", color: COLOR_PRESETS[subjects.length % COLOR_PRESETS.length].hex });
  };

  const deleteSubject = (id: string) => {
    if (!confirm("Delete subject? Tasks with this subject will still exist in the DB.")) return;
    setSubjects((prev) => prev.filter((s) => s.id !== id));
  };

  /* ── routine CRUD ── */
  const addRoutineEntry = async (r: Omit<RoutineEntry, "id" | "user_id">) => {
    const { data, error } = await supabase.from("routine_entries").insert({ ...r, user_id: userId }).select().single();
    if (error) { alert("Failed to add class: " + error.message); return; }
    setRoutineEntries((prev) => [...prev, data as RoutineEntry]);
  };

  const editRoutineEntry = async (id: string, r: Omit<RoutineEntry, "id" | "user_id">) => {
    const { error } = await supabase.from("routine_entries").update(r).eq("id", id);
    if (error) { alert("Failed to update class: " + error.message); return; }
    setRoutineEntries((prev) => prev.map((e) => e.id === id ? { ...e, ...r } : e));
  };

  const deleteRoutineEntry = async (id: string) => {
    if (!confirm("Delete this class?")) return;
    const { error } = await supabase.from("routine_entries").delete().eq("id", id);
    if (error) { alert("Failed to delete: " + error.message); return; }
    setRoutineEntries((prev) => prev.filter((e) => e.id !== id));
  };

  /* ── day backgrounds ── */
  const setDayBackground = async (date: string, url: string) => {
    if (!url.trim()) return;
    const { error } = await supabase.from("day_backgrounds").upsert({ user_id: userId, date, image_url: url.trim() }, { onConflict: "user_id,date" });
    if (error) { alert("Failed to save background: " + error.message); return; }
    setDayBackgrounds((prev) => ({ ...prev, [date]: url.trim() }));
  };

  const clearDayBackground = async (date: string) => {
    const { error } = await supabase.from("day_backgrounds").delete().eq("user_id", userId).eq("date", date);
    if (error) { alert("Failed to clear: " + error.message); return; }
    setDayBackgrounds((prev) => { const n = { ...prev }; delete n[date]; return n; });
  };

  /* ── profile settings ── */
  const saveProfile = async (updates: { reminder_mode: string; daily_digest_time: string }) => {
    const { error } = await supabase.from("profiles").update(updates).eq("id", userId);
    if (error) { alert("Save failed: " + error.message); return; }
    setProfile((prev) => prev ? { ...prev, ...updates } : prev);
    alert("Settings saved ✅");
  };

  const pendingPrintList = [...tasks].filter((t) => t.status !== "completed").sort((a, b) => daysBetween(a.dueDate, todayStr()) - daysBetween(b.dueDate, todayStr()));

  if (!loaded) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: THEMES[theme].css, fontFamily: "Quicksand, sans-serif" }}>
        <style>{`
          @keyframes pulseLanding {
            0%, 100% { transform: scale(1); opacity: 0.85; }
            50% { transform: scale(1.08) translateY(-4px); opacity: 1; }
          }
        `}</style>
        <div style={{ animation: "pulseLanding 2.4s ease-in-out infinite", fontSize: "2.5rem", marginBottom: "1rem" }}>
          ✨ 🦌 ✨
        </div>
        <p style={{ color: "#5B4B6D", fontSize: "1.15rem", fontWeight: 600, letterSpacing: "0.02em", fontFamily: "Fredoka, sans-serif" }}>
          Landing to earth
        </p>
      </div>
    );
  }

  /* ─── render ─── */
  return (
    <div className="min-h-screen p-3 md:p-6" style={{ background: THEMES[theme].css, fontFamily: "Quicksand, sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@500;600;700&family=Quicksand:wght@400;500;600;700&display=swap'); @media print { .no-print { display: none !important; } .print-only { display: block !important; } } .print-only { display: none; }`}</style>

      <div className="max-w-7xl mx-auto flex flex-col md:flex-row gap-6 items-start">
        {/* ── Left Sidebar (Desktop) / Top Nav (Mobile) ── */}
        <aside className="w-full md:w-64 shrink-0 no-print flex flex-col justify-between md:sticky md:top-6">
          <div className="space-y-4">
            {/* App Brand Header */}
            <div className="p-4 rounded-3xl bg-white/70 backdrop-blur-md border border-white/60 shadow-sm flex items-center justify-between md:block">
              <div>
                <h1 className="text-2xl font-black flex items-center gap-2 tracking-tight" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
                  Halo <span className="text-xl">{CREATURES[new Date().getDate() % CREATURES.length]}</span>
                </h1>
                <p className="text-[11px] font-semibold text-gray-500 truncate max-w-[180px] mt-0.5">{session.user.email}</p>
              </div>
              <div className="md:hidden flex items-center gap-1.5">
                <select value={theme} onChange={(e) => setTheme(e.target.value as keyof typeof THEMES)} className="text-[11px] p-1.5 rounded-xl border bg-white/80">
                  {Object.entries(THEMES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <button onClick={() => window.print()} className="p-1.5 rounded-xl bg-white/80 hover:bg-white"><Printer size={14} /></button>
              </div>
            </div>

            {/* 6 Modes Navigation List */}
            <nav className="p-2 rounded-3xl bg-white/60 backdrop-blur-md border border-white/60 shadow-sm flex md:flex-col gap-1.5 overflow-x-auto">
              {[
                { id: "academics" as const, label: "Academics", iconImg: academicsIcon },
                { id: "journal" as const, label: "Journal", iconImg: journalIcon },
                { id: "french" as const, label: "Le Coin Français", emoji: "🥐" },
                { id: "entertainment" as const, label: "Entertainment", emoji: "🎬" },
                { id: "games" as const, label: "Games", emoji: "🎮" },
                { id: "settings" as const, label: "Settings", icon: Settings },
              ].map((m) => {
                const isActive = mode === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setMode(m.id)}
                    className={`flex items-center gap-3 px-3.5 py-3 rounded-2xl text-xs md:text-sm font-bold transition-all text-left whitespace-nowrap md:whitespace-normal w-full ${
                      isActive
                        ? "bg-white text-purple-900 shadow-md scale-[1.02]"
                        : "text-gray-700 hover:bg-white/50 opacity-80 hover:opacity-100"
                    }`}
                    style={{ fontFamily: "Fredoka, sans-serif" }}
                  >
                    {"iconImg" in m && m.iconImg ? (
                      <img src={m.iconImg} alt={m.label} className="w-8 h-8 object-contain shrink-0" />
                    ) : "emoji" in m && m.emoji ? (
                      <span className="w-8 h-8 flex items-center justify-center text-2xl shrink-0 leading-none">{m.emoji}</span>
                    ) : "icon" in m && m.icon ? (
                      <m.icon size={24} className="text-gray-600 shrink-0 p-0.5" />
                    ) : null}
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Sidebar Footer (Desktop Theme & Print) */}
          <div className="hidden md:flex p-3 rounded-2xl bg-white/50 backdrop-blur-sm border border-white/50 items-center justify-between mt-6">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-500">Theme:</span>
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as keyof typeof THEMES)}
                className="text-xs p-1 rounded-xl border bg-white/80 focus:outline-none"
              >
                {Object.entries(THEMES).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() => window.print()}
              className="p-1.5 rounded-xl bg-white/80 hover:bg-white text-gray-700 shadow-sm"
              title="Print view"
            >
              <Printer size={15} />
            </button>
          </div>
        </aside>

        {/* ── Main Workspace Area ── */}
        <main className="flex-1 min-w-0 w-full">
          {/* Mode 1: ACADEMICS */}
          {mode === "academics" && (
            <div>
              {/* Academics Sub-Tabs Switcher */}
              <div className="flex items-center justify-between mb-5 no-print flex-wrap gap-2">
                <div className="flex gap-1.5 p-1.5 rounded-2xl bg-white/60 backdrop-blur-md border border-white/60 shadow-sm overflow-x-auto">
                  {[
                    { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
                    { id: "calendar" as const, label: "Calendar", icon: CalendarDays },
                    { id: "tasks" as const, label: "Tasks", icon: BookOpen },
                    { id: "routine" as const, label: "Routine", icon: Clock },
                    { id: "stats" as const, label: "Syllabus & Stats", icon: BarChart3 },
                  ].map((st) => {
                    const isSubActive = academicTab === st.id;
                    return (
                      <button
                        key={st.id}
                        onClick={() => setAcademicTab(st.id)}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
                          isSubActive
                            ? "bg-purple-600 text-white shadow-sm"
                            : "text-gray-700 hover:bg-white/60 opacity-80 hover:opacity-100"
                        }`}
                      >
                        <st.icon size={14} /> <span>{st.label}</span>
                      </button>
                    );
                  })}
                </div>

                {academicTab === "tasks" && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setEditingTask(null); setFormOpen(true); }}
                      className="px-3.5 py-2 rounded-xl text-xs font-bold bg-pink-500 text-white hover:bg-pink-600 shadow-sm flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Add Task
                    </button>
                  </div>
                )}
              </div>

              {/* Sub-tab: Dashboard */}
              {academicTab === "dashboard" && (
                <div className="no-print">
                  {/* Overdue confirmation prompt */}
                  {overdueForPrompt.length > 0 && (
                    <Sticker className="p-4 mb-4 border border-red-100" rotate={0.3}>
                      <h3 className="font-bold mb-2 flex items-center gap-1.5 text-sm" style={{ fontFamily: "Fredoka, sans-serif", color: "#B91C1C" }}>
                        ⚠️ Did you submit these?
                      </h3>
                      {overdueForPrompt.map((t) => (
                        <div key={t.id} className="flex items-center justify-between gap-2 mb-2 text-sm">
                          <div>
                            <span className="font-semibold">{t.title}</span>
                            <span className="opacity-50 ml-1">— due {niceDate(t.dueDate)}</span>
                          </div>
                          <div className="flex gap-1.5 shrink-0">
                            <button onClick={() => toggleTask(t.id)} className="px-2.5 py-1 rounded-lg text-white text-xs font-semibold" style={{ background: "#93C9A8" }}>
                              ✓ Mark done
                            </button>
                            <button
                              onClick={() => setSnoozedOverdueIds((prev) => new Set([...prev, t.id]))}
                              className="px-2.5 py-1 rounded-lg text-xs bg-black/5 hover:bg-black/10 opacity-70"
                            >
                              Still working
                            </button>
                          </div>
                        </div>
                      ))}
                    </Sticker>
                  )}

                  <Sticker className="p-4 mb-4" rotate={-0.3}>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>🌸 Coming up soon</h3>
                      <button onClick={() => { setEditingTask(null); setFormOpen(true); }} className="flex items-center gap-1 text-sm px-3 py-1.5 rounded-xl text-white" style={{ background: "#E497B3" }}>
                        <Plus size={14} /> Add task
                      </button>
                    </div>
                    {upcoming.length === 0
                      ? <EmptyState emoji="🎀" text="Nothing pending — add a task to get started" />
                      : upcoming.map((t) => <TaskCard key={t.id} task={t} subject={subjById[t.subjectId]} onToggle={toggleTask} onEdit={(t) => { setEditingTask(t); setFormOpen(true); }} onDelete={deleteTask} />)}
                  </Sticker>

                  <Sticker className="p-4" rotate={0.2}>
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="font-bold" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>All tasks</h3>
                      <button onClick={() => setGroupBy(groupBy === "subject" ? "type" : "subject")} className="text-xs px-2.5 py-1 rounded-lg bg-black/5">
                        Group by: {groupBy === "subject" ? "Subject" : "Type"}
                      </button>
                    </div>
                    <div className="flex gap-1.5 mb-3 flex-wrap">
                      <div className="flex items-center gap-1 bg-white rounded-lg px-2 flex-1 min-w-[140px]">
                        <Search size={13} className="opacity-50" />
                        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="p-1.5 text-sm outline-none w-full" />
                      </div>
                      <select value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)} className="text-xs p-1.5 rounded-lg border bg-white">
                        <option value="all">All subjects</option>
                        {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                      </select>
                      <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="text-xs p-1.5 rounded-lg border bg-white">
                        <option value="all">All types</option>
                        {typeSuggestions.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="text-xs p-1.5 rounded-lg border bg-white">
                        <option value="pending">Pending</option>
                        <option value="completed">Completed</option>
                        <option value="all">All</option>
                      </select>
                      <button onClick={() => setThisWeekOnly(!thisWeekOnly)} className={`text-xs px-2.5 py-1 rounded-lg ${thisWeekOnly ? "bg-pink-200" : "bg-black/5"}`}>This week</button>
                    </div>
                    {filterStatus === "pending" && Object.keys(grouped).length === 0
                      ? <EmptyState emoji="🐱" text="No tasks match your filters" />
                      : filterStatus !== "pending"
                      ? filtered.map((t) => <TaskCard key={t.id} task={t} subject={subjById[t.subjectId]} onToggle={toggleTask} onEdit={(t) => { setEditingTask(t); setFormOpen(true); }} onDelete={deleteTask} />)
                      : Object.entries(grouped).map(([key, list]) => (
                          <div key={key} className="mb-3">
                            <div className="text-xs font-bold opacity-60 mb-1 uppercase tracking-wide">{groupBy === "type" ? (TYPE_ICON[key] || "📝") + " " + key : key}</div>
                            {list.map((t) => <TaskCard key={t.id} task={t} subject={subjById[t.subjectId]} onToggle={toggleTask} onEdit={(t) => { setEditingTask(t); setFormOpen(true); }} onDelete={deleteTask} />)}
                          </div>
                        ))}
                  </Sticker>
                </div>
              )}

              {/* Sub-tab: Calendar */}
              {academicTab === "calendar" && (
                <div className="no-print">
                  <Sticker className="p-4" rotate={-0.2}>
                    <CalendarView
                      tasks={tasks}
                      subjects={subjects}
                      routineEntries={routineEntries}
                      onQuickAdd={(date) => { setEditingTask({ dueDate: date }); setFormOpen(true); }}
                    />
                  </Sticker>
                </div>
              )}

              {/* Sub-tab: Tasks + Subjects */}
              {academicTab === "tasks" && (
                <div className="no-print">
                  <Sticker className="p-4 mb-4" rotate={0.3}>
                    <h3 className="font-bold mb-2 flex items-center gap-1.5" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}><Palette size={16} /> Subjects</h3>
                    <p className="text-xs opacity-60 mb-2">Set your subjects name and suitable color</p>
                    <div className="flex flex-wrap gap-2 mb-3">
                      {subjects.map((s) => (
                        <div key={s.id} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl" style={{ background: s.color + "33" }}>
                          <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />
                          <span className="text-sm font-semibold">{s.name}</span>
                          <button onClick={() => deleteSubject(s.id)}><X size={12} /></button>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-1.5 items-center flex-wrap">
                      <input value={subjectDraft.name} onChange={(e) => setSubjectDraft({ ...subjectDraft, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addSubject()} placeholder="Subject name" className="p-1.5 rounded-lg border text-sm flex-1 min-w-[140px]" />
                      <div className="flex gap-1">
                        {COLOR_PRESETS.map((c) => (
                          <button key={c.hex} onClick={() => setSubjectDraft({ ...subjectDraft, color: c.hex })} className="w-5 h-5 rounded-full border-2" style={{ background: c.hex, borderColor: subjectDraft.color === c.hex ? "#5B4B6D" : "transparent" }} />
                        ))}
                      </div>
                      <button onClick={addSubject} className="px-3 py-1.5 rounded-lg text-white text-sm font-semibold" style={{ background: "#C9B6E4" }}>Add</button>
                    </div>
                  </Sticker>

                  <button onClick={() => { setEditingTask(null); setFormOpen(true); }} className="w-full mb-4 p-3 rounded-2xl text-white font-semibold flex items-center justify-center gap-1.5" style={{ background: "#E497B3", fontFamily: "Fredoka, sans-serif" }}>
                    <Plus size={16} /> Add a task
                  </button>

                  <Sticker className="p-4" rotate={-0.3}>
                    <h3 className="font-bold mb-2" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>🐱 All tasks</h3>
                    {tasks.length === 0
                      ? <EmptyState emoji="📚" text="No tasks yet — add your first one above" />
                      : [...tasks].sort((a, b) => daysBetween(a.dueDate, todayStr()) - daysBetween(b.dueDate, todayStr())).map((t) => (
                          <TaskCard key={t.id} task={t} subject={subjById[t.subjectId]} onToggle={toggleTask} onEdit={(t) => { setEditingTask(t); setFormOpen(true); }} onDelete={deleteTask} />
                        ))}
                  </Sticker>
                </div>
              )}

              {/* Sub-tab: Routine */}
              {academicTab === "routine" && (
                <div className="no-print">
                  <RoutineView
                    routineEntries={routineEntries}
                    onAdd={addRoutineEntry}
                    onEdit={editRoutineEntry}
                    onDelete={deleteRoutineEntry}
                  />
                </div>
              )}

              {/* Sub-tab: Syllabus & Stats */}
              {academicTab === "stats" && (
                <div className="no-print space-y-6">
                  <SyllabusView userId={userId} subjects={subjects} />
                  <StatsView tasks={tasks} />
                </div>
              )}
            </div>
          )}

          {/* Mode 2: JOURNAL */}
          {mode === "journal" && (
            <div className="no-print">
              <Suspense
                fallback={
                  <div className="p-12 text-center rounded-3xl bg-white/60 backdrop-blur-sm border border-white/60 shadow-sm max-w-md mx-auto my-8">
                    <div className="animate-pulse text-3xl mb-2">✨ 🦌 ✨</div>
                    <p className="text-xs font-bold text-gray-500" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      Opening Journal...
                    </p>
                  </div>
                }
              >
                <JournalView userId={userId} session={session} />
              </Suspense>
            </div>
          )}

          {/* Mode 3: LE COIN FRANÇAIS */}
          {mode === "french" && (
            <div className="no-print">
              <Suspense
                fallback={
                  <div className="p-12 text-center rounded-3xl bg-white/60 backdrop-blur-sm border border-white/60 shadow-sm max-w-md mx-auto my-8">
                    <div className="animate-pulse text-3xl mb-2">✨ 🥐 ✨</div>
                    <p className="text-xs font-bold text-gray-500" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      Opening Le Coin Français...
                    </p>
                  </div>
                }
              >
                <FrenchView userId={userId} />
              </Suspense>
            </div>
          )}

          {/* Mode 4: ENTERTAINMENT */}
          {mode === "entertainment" && (
            <div className="no-print">
              <Suspense
                fallback={
                  <div className="p-12 text-center rounded-3xl bg-white/60 backdrop-blur-sm border border-white/60 shadow-sm max-w-md mx-auto my-8">
                    <div className="animate-pulse text-3xl mb-2">✨ 🎬 ✨</div>
                    <p className="text-xs font-bold text-gray-500" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      Opening Entertainment...
                    </p>
                  </div>
                }
              >
                <EntertainmentView userId={userId} />
              </Suspense>
            </div>
          )}

          {/* Mode 5: GAMES */}
          {mode === "games" && (
            <div className="no-print">
              <Suspense
                fallback={
                  <div className="p-12 text-center rounded-3xl bg-white/60 backdrop-blur-sm border border-white/60 shadow-sm max-w-md mx-auto my-8">
                    <div className="animate-pulse text-3xl mb-2">✨ 🎮 ✨</div>
                    <p className="text-xs font-bold text-gray-500" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      Opening Games...
                    </p>
                  </div>
                }
              >
                <GamesView userId={userId} />
              </Suspense>
            </div>
          )}

          {/* Mode 6: SETTINGS */}
          {mode === "settings" && (
            <div className="no-print">
              <SettingsView
                profile={profile}
                onSave={saveProfile}
                onSignOut={() => supabase.auth.signOut()}
              />
            </div>
          )}
        </main>
      </div>

      {/* print view */}
      <div className="print-only">
        <h2 style={{ fontFamily: "Fredoka, sans-serif" }}>Pending Tasks — {niceDate(todayStr())}</h2>
        {pendingPrintList.map((t) => (
          <div key={t.id} style={{ marginBottom: 6 }}>
            {TYPE_ICON[t.type] || "📝"} <strong>{subjById[t.subjectId]?.name}</strong> — {t.title} — due {niceDate(t.dueDate)}
          </div>
        ))}
      </div>

      {formOpen && (
        <TaskForm
          initial={editingTask}
          subjects={subjects}
          typeSuggestions={typeSuggestions}
          onSave={saveTask}
          onClose={() => { setFormOpen(false); setEditingTask(null); }}
        />
      )}
    </div>
  );
}
