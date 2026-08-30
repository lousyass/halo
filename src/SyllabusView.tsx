import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Check,
  Trash2,
  BookOpen,
  FolderPlus,
  Sparkles,
  ListPlus,
  Layers,
} from "lucide-react";
import { supabase } from "./lib/supabase";

export interface SyllabusEntry {
  id: string;
  user_id: string;
  subject: string;
  title: string;
  parent_entry_id: string | null;
  completed: boolean;
  order_index: number;
  created_at: string;
}

interface Subject {
  id: string;
  name: string;
  color: string;
}

// In-memory session cache for syllabus entries
let syllabusCache: { userId: string; entries: SyllabusEntry[] } | null = null;

export function SyllabusView({
  userId,
  subjects,
}: {
  userId: string;
  subjects: Subject[];
}) {
  const [entries, setEntries] = useState<SyllabusEntry[]>(() => {
    return syllabusCache && syllabusCache.userId === userId ? syllabusCache.entries : [];
  });
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());
  const [newChapterTitle, setNewChapterTitle] = useState<Record<string, string>>({});
  const [newSubtopicTitle, setNewSubtopicTitle] = useState<Record<string, string>>({});
  const [addingChapterForSubj, setAddingChapterForSubj] = useState<string | null>(null);
  const [addingSubtopicForChap, setAddingSubtopicForChap] = useState<string | null>(null);

  // Fetch entries from Supabase
  const fetchSyllabus = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from("syllabus_entries")
        .select("*")
        .eq("user_id", userId)
        .order("order_index", { ascending: true })
        .order("created_at", { ascending: true });

      if (error) {
        console.error("fetchSyllabus error:", error.message);
        return;
      }

      if (data) {
        setEntries(data as SyllabusEntry[]);
        syllabusCache = { userId, entries: data as SyllabusEntry[] };
      }
    } catch (e) {
      console.warn("fetchSyllabus failed:", e);
    }
  }, [userId]);

  useEffect(() => {
    fetchSyllabus();
  }, [fetchSyllabus]);

  // Derived tree structure per subject
  const subjectTree = useMemo(() => {
    const subjectMap: Record<
      string,
      {
        chapters: {
          chapter: SyllabusEntry;
          subtopics: SyllabusEntry[];
        }[];
      }
    > = {};

    // Ensure all registered subjects exist in map
    subjects.forEach((s) => {
      subjectMap[s.name] = { chapters: [] };
    });

    // Also include any subjects with existing entries even if not in subjects list
    entries.forEach((e) => {
      if (!subjectMap[e.subject]) {
        subjectMap[e.subject] = { chapters: [] };
      }
    });

    // Group chapters (parent_entry_id === null)
    const chaptersBySubj: Record<string, SyllabusEntry[]> = {};
    const subtopicsByChap: Record<string, SyllabusEntry[]> = {};

    entries.forEach((e) => {
      if (!e.parent_entry_id) {
        if (!chaptersBySubj[e.subject]) chaptersBySubj[e.subject] = [];
        chaptersBySubj[e.subject].push(e);
      } else {
        if (!subtopicsByChap[e.parent_entry_id]) subtopicsByChap[e.parent_entry_id] = [];
        subtopicsByChap[e.parent_entry_id].push(e);
      }
    });

    Object.keys(subjectMap).forEach((subj) => {
      const chaps = (chaptersBySubj[subj] || []).sort((a, b) => a.order_index - b.order_index);
      subjectMap[subj].chapters = chaps.map((c) => ({
        chapter: c,
        subtopics: (subtopicsByChap[c.id] || []).sort((a, b) => a.order_index - b.order_index),
      }));
    });

    return subjectMap;
  }, [subjects, entries]);

  // Calculate completion stats for a subject
  const getSubjectStats = useCallback(
    (subjName: string) => {
      const data = subjectTree[subjName];
      if (!data || data.chapters.length === 0) return { percent: 0, total: 0, completed: 0 };

      let totalItems = 0;
      let completedItems = 0;

      data.chapters.forEach(({ chapter, subtopics }) => {
        if (subtopics.length > 0) {
          totalItems += subtopics.length;
          completedItems += subtopics.filter((st) => st.completed).length;
        } else {
          totalItems += 1;
          if (chapter.completed) completedItems += 1;
        }
      });

      const percent = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
      return { percent, total: totalItems, completed: completedItems };
    },
    [subjectTree]
  );

  // Toggle subject card expansion
  const toggleSubjectExpand = (subj: string) => {
    setExpandedSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(subj)) next.delete(subj);
      else next.add(subj);
      return next;
    });
  };

  // Toggle chapter expansion
  const toggleChapterExpand = (chapId: string) => {
    setExpandedChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapId)) next.delete(chapId);
      else next.add(chapId);
      return next;
    });
  };

  // Toggle completed state on any entry (chapter or subtopic)
  const toggleCompleted = async (entry: SyllabusEntry) => {
    const nextCompleted = !entry.completed;

    // Optimistic UI update
    setEntries((prev) => {
      let updated = prev.map((e) => (e.id === entry.id ? { ...e, completed: nextCompleted } : e));
      // If toggling a chapter, optionally cascade to children
      if (!entry.parent_entry_id) {
        updated = updated.map((e) =>
          e.parent_entry_id === entry.id ? { ...e, completed: nextCompleted } : e
        );
      }
      return updated;
    });

    try {
      const { error } = await supabase
        .from("syllabus_entries")
        .update({ completed: nextCompleted })
        .eq("id", entry.id);

      if (error) throw error;

      // If chapter, update children on backend too
      if (!entry.parent_entry_id) {
        await supabase
          .from("syllabus_entries")
          .update({ completed: nextCompleted })
          .eq("parent_entry_id", entry.id);
      }
    } catch (e) {
      console.error("toggleCompleted error:", e);
      fetchSyllabus(); // Revert
    }
  };

  // Add Chapter
  const addChapter = async (subject: string) => {
    const title = (newChapterTitle[subject] || "").trim();
    if (!title) return;

    const newId = crypto.randomUUID();
    const newEntry: SyllabusEntry = {
      id: newId,
      user_id: userId,
      subject,
      title,
      parent_entry_id: null,
      completed: false,
      order_index: (subjectTree[subject]?.chapters.length || 0) + 1,
      created_at: new Date().toISOString(),
    };

    setEntries((prev) => [...prev, newEntry]);
    setNewChapterTitle((prev) => ({ ...prev, [subject]: "" }));
    setAddingChapterForSubj(null);
    // Auto-expand subject
    setExpandedSubjects((prev) => new Set([...prev, subject]));

    try {
      const { error } = await supabase.from("syllabus_entries").insert(newEntry);
      if (error) throw error;
    } catch (e) {
      console.error("addChapter error:", e);
      fetchSyllabus();
    }
  };

  // Add Subtopic
  const addSubtopic = async (chapter: SyllabusEntry) => {
    const title = (newSubtopicTitle[chapter.id] || "").trim();
    if (!title) return;

    const newId = crypto.randomUUID();
    const newEntry: SyllabusEntry = {
      id: newId,
      user_id: userId,
      subject: chapter.subject,
      title,
      parent_entry_id: chapter.id,
      completed: false,
      order_index: (subjectTree[chapter.subject]?.chapters.find((c) => c.chapter.id === chapter.id)?.subtopics.length || 0) + 1,
      created_at: new Date().toISOString(),
    };

    setEntries((prev) => [...prev, newEntry]);
    setNewSubtopicTitle((prev) => ({ ...prev, [chapter.id]: "" }));
    setAddingSubtopicForChap(null);
    // Auto-expand chapter
    setExpandedChapters((prev) => new Set([...prev, chapter.id]));

    try {
      const { error } = await supabase.from("syllabus_entries").insert(newEntry);
      if (error) throw error;
    } catch (e) {
      console.error("addSubtopic error:", e);
      fetchSyllabus();
    }
  };

  // Delete Entry
  const deleteEntry = async (id: string) => {
    if (!confirm("Delete this syllabus entry?")) return;
    setEntries((prev) => prev.filter((e) => e.id !== id && e.parent_entry_id !== id));

    try {
      const { error } = await supabase.from("syllabus_entries").delete().eq("id", id);
      if (error) throw error;
    } catch (e) {
      console.error("deleteEntry error:", e);
      fetchSyllabus();
    }
  };

  const subjectNames = Object.keys(subjectTree);

  return (
    <div className="space-y-4 mb-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">📚</span>
          <div>
            <h3 className="font-bold text-base md:text-lg text-[#5B4B6D]" style={{ fontFamily: "Fredoka, sans-serif" }}>
              Course Syllabus Tracker
            </h3>
            <p className="text-xs text-gray-500 font-medium">
              Track chapters, subtopics, and progress across all your subjects
            </p>
          </div>
        </div>
      </div>

      {subjectNames.length === 0 ? (
        <div className="p-8 text-center bg-white/70 rounded-3xl border border-white/60">
          <BookOpen className="mx-auto text-purple-300 mb-2" size={32} />
          <p className="text-xs font-semibold text-gray-600">
            No subjects created yet. Add subjects in the Tasks tab to start organizing your syllabus!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {subjectNames.map((subjName) => {
            const subjObj = subjects.find((s) => s.name === subjName);
            const { chapters } = subjectTree[subjName] || { chapters: [] };
            const stats = getSubjectStats(subjName);
            const isExpanded = expandedSubjects.has(subjName);
            const color = subjObj?.color || "#93C9A8";

            return (
              <div
                key={subjName}
                className="bg-white/85 rounded-3xl border border-white/70 shadow-sm overflow-hidden transition-all"
              >
                {/* Subject Header Card */}
                <div
                  onClick={() => toggleSubjectExpand(subjName)}
                  className="p-4 cursor-pointer flex items-center justify-between gap-3 hover:bg-purple-50/30 transition-colors select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0 shadow-xs"
                      style={{ background: color }}
                    />
                    <div className="min-w-0">
                      <h4
                        className="font-bold text-sm md:text-base text-gray-800 truncate"
                        style={{ fontFamily: "Fredoka, sans-serif" }}
                      >
                        {subjName}
                      </h4>
                      <p className="text-[11px] text-gray-500 font-medium">
                        {chapters.length} {chapters.length === 1 ? "Chapter" : "Chapters"} • {stats.completed}/{stats.total} completed
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    {/* Completion Badge & Progress Bar */}
                    <div className="flex items-center gap-2">
                      <div className="w-20 md:w-28 bg-gray-100 rounded-full h-2 overflow-hidden hidden sm:block">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${stats.percent}%`,
                            background: stats.percent === 100 ? "#10B981" : color,
                          }}
                        />
                      </div>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-lg border ${
                          stats.percent === 100
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : "bg-purple-50 text-purple-700 border-purple-100"
                        }`}
                      >
                        {stats.percent}%
                      </span>
                    </div>

                    <div className="p-1 rounded-full text-gray-400 hover:text-gray-700">
                      {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    </div>
                  </div>
                </div>

                {/* Expanded Subject Content (Chapters & Subtopics) */}
                {isExpanded && (
                  <div className="p-4 pt-1 border-t border-gray-100/80 bg-gray-50/40 space-y-3">
                    {chapters.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-2">
                        No chapters added yet. Add your first chapter below!
                      </p>
                    ) : (
                      <div className="space-y-2.5">
                        {chapters.map(({ chapter, subtopics }) => {
                          const isChapExpanded = expandedChapters.has(chapter.id);
                          const hasSubtopics = subtopics.length > 0;
                          const completedSubtopics = subtopics.filter((st) => st.completed).length;
                          const chapterPercent = hasSubtopics
                            ? Math.round((completedSubtopics / subtopics.length) * 100)
                            : chapter.completed ? 100 : 0;

                          return (
                            <div
                              key={chapter.id}
                              className="bg-white rounded-2xl border border-gray-100 shadow-2xs overflow-hidden"
                            >
                              {/* Chapter Row */}
                              <div className="p-3 flex items-center justify-between gap-2.5">
                                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                  {/* Chapter Checkbox */}
                                  <button
                                    type="button"
                                    onClick={() => toggleCompleted(chapter)}
                                    className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all shrink-0 ${
                                      chapter.completed || chapterPercent === 100
                                        ? "bg-purple-600 border-purple-600 text-white shadow-2xs"
                                        : "border-gray-300 hover:border-purple-400 bg-white"
                                    }`}
                                  >
                                    {(chapter.completed || chapterPercent === 100) && <Check size={13} strokeWidth={3} />}
                                  </button>

                                  {/* Chapter Title */}
                                  <span
                                    className={`text-xs md:text-sm font-bold flex-1 truncate ${
                                      chapter.completed || chapterPercent === 100
                                        ? "line-through text-gray-400 font-medium"
                                        : "text-gray-800"
                                    }`}
                                    style={{ fontFamily: "Fredoka, sans-serif" }}
                                  >
                                    {chapter.title}
                                  </span>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                  {hasSubtopics && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-purple-50 text-purple-700 border border-purple-100">
                                      {completedSubtopics}/{subtopics.length} ({chapterPercent}%)
                                    </span>
                                  )}

                                  {/* Subtopic Add button */}
                                  <button
                                    type="button"
                                    onClick={() => setAddingSubtopicForChap(addingSubtopicForChap === chapter.id ? null : chapter.id)}
                                    className="text-gray-400 hover:text-purple-600 p-1 rounded-lg hover:bg-purple-50"
                                    title="Add subtopic"
                                  >
                                    <ListPlus size={14} />
                                  </button>

                                  {/* Delete Chapter */}
                                  <button
                                    type="button"
                                    onClick={() => deleteEntry(chapter.id)}
                                    className="text-gray-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50"
                                    title="Delete chapter"
                                  >
                                    <Trash2 size={13} />
                                  </button>

                                  {/* Expand/Collapse Chapter */}
                                  {hasSubtopics && (
                                    <button
                                      type="button"
                                      onClick={() => toggleChapterExpand(chapter.id)}
                                      className="text-gray-400 hover:text-gray-700 p-0.5"
                                    >
                                      {isChapExpanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Quick Add Subtopic Input */}
                              {addingSubtopicForChap === chapter.id && (
                                <div className="p-2.5 bg-purple-50/60 border-t border-purple-100 flex items-center gap-1.5">
                                  <input
                                    type="text"
                                    value={newSubtopicTitle[chapter.id] || ""}
                                    onChange={(e) =>
                                      setNewSubtopicTitle((prev) => ({
                                        ...prev,
                                        [chapter.id]: e.target.value,
                                      }))
                                    }
                                    onKeyDown={(e) => e.key === "Enter" && addSubtopic(chapter)}
                                    placeholder="Enter subtopic name..."
                                    className="flex-1 px-2.5 py-1 text-xs rounded-xl border border-purple-200 bg-white focus:outline-none focus:ring-1 focus:ring-purple-300"
                                    autoFocus
                                  />
                                  <button
                                    onClick={() => addSubtopic(chapter)}
                                    className="px-2.5 py-1 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 shadow-2xs"
                                  >
                                    Add
                                  </button>
                                  <button
                                    onClick={() => setAddingSubtopicForChap(null)}
                                    className="px-2 py-1 rounded-xl text-gray-500 text-xs hover:bg-black/5"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              )}

                              {/* Subtopics List */}
                              {isChapExpanded && hasSubtopics && (
                                <div className="px-4 pb-2.5 pt-1 space-y-1.5 border-t border-gray-50 bg-gray-50/30">
                                  {subtopics.map((subtopic) => (
                                    <div
                                      key={subtopic.id}
                                      className="flex items-center justify-between gap-2 py-1 px-2 rounded-xl hover:bg-white transition-colors group"
                                    >
                                      <div className="flex items-center gap-2 min-w-0 flex-1">
                                        <button
                                          type="button"
                                          onClick={() => toggleCompleted(subtopic)}
                                          className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                                            subtopic.completed
                                              ? "bg-purple-500 border-purple-500 text-white"
                                              : "border-gray-300 hover:border-purple-300 bg-white"
                                          }`}
                                        >
                                          {subtopic.completed && <Check size={11} strokeWidth={3} />}
                                        </button>
                                        <span
                                          className={`text-xs truncate ${
                                            subtopic.completed
                                              ? "line-through text-gray-400"
                                              : "text-gray-700 font-medium"
                                          }`}
                                        >
                                          {subtopic.title}
                                        </span>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => deleteEntry(subtopic.id)}
                                        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 p-0.5 transition-opacity"
                                        title="Delete subtopic"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add Chapter Section */}
                    {addingChapterForSubj === subjName ? (
                      <div className="p-3 bg-white rounded-2xl border border-purple-200 flex items-center gap-2 shadow-sm">
                        <input
                          type="text"
                          value={newChapterTitle[subjName] || ""}
                          onChange={(e) =>
                            setNewChapterTitle((prev) => ({
                              ...prev,
                              [subjName]: e.target.value,
                            }))
                          }
                          onKeyDown={(e) => e.key === "Enter" && addChapter(subjName)}
                          placeholder="e.g. Chapter 1: Limits & Continuity"
                          className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-purple-200"
                          autoFocus
                        />
                        <button
                          onClick={() => addChapter(subjName)}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 text-white text-xs font-bold hover:bg-purple-700 shadow-2xs"
                        >
                          Add Chapter
                        </button>
                        <button
                          onClick={() => setAddingChapterForSubj(null)}
                          className="px-2.5 py-1.5 rounded-xl text-gray-500 text-xs hover:bg-black/5"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAddingChapterForSubj(subjName)}
                        className="w-full py-2 px-3 rounded-2xl border border-dashed border-purple-200 hover:border-purple-400 bg-white/70 hover:bg-white text-purple-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs"
                      >
                        <FolderPlus size={14} /> Add Chapter to {subjName}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
