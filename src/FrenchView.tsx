import React, { useState, useEffect, useMemo } from "react";
import { supabase } from "./lib/supabase";
import {
  Volume2,
  Sparkles,
  Plus,
  Search,
  BookOpen,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ExternalLink,
  Heart,
  Star,
  ChevronDown,
  ChevronRight,
  Flame,
  RotateCcw,
  Languages,
  Layers,
  GraduationCap,
  FileText,
  Bookmark,
  Shuffle,
  Clock,
  Filter,
  Check,
  Award,
} from "lucide-react";
import { FRENCH_FREQUENCY_WORDS, FrequencyWord } from "./data/frenchFrequencyWords";

// Card interface
export interface LearningCard {
  id: string;
  user_id: string;
  french: string;
  english: string;
  example_sentence?: string | null;
  tag?: string | null;
  unit_id?: string | null;
  source: "manual" | "daily_suggestion" | "dictionary_star";
  interval_days: number;
  ease_factor: number;
  next_review_date: string;
  created_at: string;
}

// Unit interface
export interface LearningUnit {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  order_index: number;
  icon?: string | null;
  created_at: string;
}

// Note interface
export interface LearningNote {
  id: string;
  user_id: string;
  title: string;
  content: string;
  unit_id?: string | null;
  created_at: string;
}

// Resource interface
export interface LearningResource {
  id: string;
  user_id: string;
  title: string;
  url?: string | null;
  resource_type:
    | "app"
    | "website"
    | "youtube"
    | "podcast"
    | "book"
    | "music"
    | "film_tv"
    | "audiobook"
    | "article"
    | "browser_extension"
    | "other";
  section:
    | "core_course"
    | "extras"
    | "watch"
    | "listen_music"
    | "listen_podcast"
    | "listen_audiobook"
    | "read"
    | "inspiration";
  level?: "all" | "absolute_beginner" | "a1_a2" | "a2_b1" | "b1_b2" | "b2_c1" | null;
  skills?: string | null;
  notes?: string | null;
  recommended: boolean;
  her_favorite: boolean;
  source_attribution?: string | null;
  created_at: string;
}

const SECTION_LABELS: Record<string, { label: string; icon: string; desc: string }> = {
  core_course: { label: "Core Courses & Starter Kits", icon: "🧭", desc: "Foundational interactive courses, exercises, and beginner guides" },
  extras: { label: "Useful Extras & Reference", icon: "✨", desc: "Pronunciation tips, idiomatic expressions, and grammar helpers" },
  watch: { label: "Watch: Cinema, TV & YouTube", icon: "🎬", desc: "Immersion shows, documentaries, films, and video vlogs" },
  listen_music: { label: "Listen: Music & Artists", icon: "🎵", desc: "French chansons, pop hits, rap, electro, and indie favorites" },
  listen_podcast: { label: "Listen: Podcasts", icon: "🎙️", desc: "Comprehensible input podcasts from beginner stories to native debates" },
  listen_audiobook: { label: "Listen: Audiobooks", icon: "🎧", desc: "Classic novels and stories narrated by native speakers" },
  read: { label: "Read: Books & Articles", icon: "📖", desc: "French literature, news, and reading recommendations" },
  inspiration: { label: "Inspiration & Method", icon: "💡", desc: "Language learning strategies, personal roadmaps, and tips" },
};

const RESOURCE_TYPE_BADGES: Record<string, { label: string; bg: string; text: string }> = {
  app: { label: "App", bg: "#EFF6FF", text: "#1D4ED8" },
  website: { label: "Website", bg: "#F0FDF4", text: "#15803D" },
  youtube: { label: "YouTube", bg: "#FEF2F2", text: "#B91C1C" },
  podcast: { label: "Podcast", bg: "#FAF5FF", text: "#7E22CE" },
  book: { label: "Book", bg: "#FFFBEB", text: "#B45309" },
  music: { label: "Music", bg: "#FDF2F8", text: "#BE185D" },
  film_tv: { label: "Film / TV", bg: "#F3E8FF", text: "#6B21A8" },
  audiobook: { label: "Audiobook", bg: "#ECFDF5", text: "#047857" },
  article: { label: "Article", bg: "#F1F5F9", text: "#475569" },
  browser_extension: { label: "Extension", bg: "#F5F3FF", text: "#5B21B6" },
  other: { label: "Other", bg: "#F8FAFC", text: "#334155" },
};

const LEVEL_LABELS: Record<string, string> = {
  all: "All Levels",
  absolute_beginner: "Absolute Beginner",
  a1_a2: "A1 – A2 (Beginner)",
  a2_b1: "A2 – B1 (Elementary)",
  b1_b2: "B1 – B2 (Intermediate)",
  b2_c1: "B2 – C1 (Advanced)",
};

export const FrenchView: React.FC<{ userId: string }> = ({ userId }) => {
  const [activeSubTab, setActiveSubTab] = useState<
    "daily" | "deck" | "quiz" | "dictionary" | "units" | "notes" | "resources"
  >("daily");

  // State
  const [cards, setCards] = useState<LearningCard[]>([]);
  const [units, setUnits] = useState<LearningUnit[]>([]);
  const [notes, setNotes] = useState<LearningNote[]>([]);
  const [resources, setResources] = useState<LearningResource[]>([]);
  const [wordsShown, setWordsShown] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  // Daily suggestions state
  const [dailyBatch, setDailyBatch] = useState<FrequencyWord[]>([]);
  const [addedDailyWords, setAddedDailyWords] = useState<Set<string>>(new Set());

  // Dictionary state
  const [dictQuery, setDictQuery] = useState("");
  const [dictMode, setDictMode] = useState<"fr_en" | "en_fr">("fr_en");
  const [dictResult, setDictResult] = useState<any>(null);
  const [dictLoading, setDictLoading] = useState(false);
  const [starredDictWords, setStarredDictWords] = useState<Set<string>>(new Set());

  // Card filter & form state
  const [cardSearch, setCardSearch] = useState("");
  const [cardFilterUnit, setCardFilterUnit] = useState<string>("all");
  const [cardFilterTag, setCardFilterTag] = useState<string>("all");
  const [cardFilterDueOnly, setCardFilterDueOnly] = useState(false);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [newCardFrench, setNewCardFrench] = useState("");
  const [newCardEnglish, setNewCardEnglish] = useState("");
  const [newCardExample, setNewCardExample] = useState("");
  const [newCardTag, setNewCardTag] = useState("");
  const [newCardUnitId, setNewCardUnitId] = useState<string>("");

  // Spaced Repetition Review State
  const [reviewModeActive, setReviewModeActive] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewRevealed, setReviewRevealed] = useState(false);

  // Quiz State
  const [quizMode, setQuizMode] = useState<"flashcard" | "mcq" | "type" | "listening" | "matching">("mcq");
  const [quizQuestionIndex, setQuizQuestionIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizAnswerSelected, setQuizAnswerSelected] = useState<string | null>(null);
  const [typeAnswerInput, setTypeAnswerInput] = useState("");
  const [typeAnswerFeedback, setTypeAnswerFeedback] = useState<"correct" | "incorrect" | null>(null);
  const [matchingSelected, setMatchingSelected] = useState<{ id: string; text: string; cardId: string; type: "fr" | "en" } | null>(null);
  const [matchedPairs, setMatchedPairs] = useState<Set<string>>(new Set());

  // Resources state
  const [resourceSearch, setResourceSearch] = useState("");
  const [resourceTypeFilter, setResourceTypeFilter] = useState("all");
  const [resourceLevelFilter, setResourceLevelFilter] = useState("all");
  const [resourceOnlyFavorites, setResourceOnlyFavorites] = useState(false);
  const [resourceOnlyRecommended, setResourceOnlyRecommended] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

  // Notes state
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [noteUnitId, setNoteUnitId] = useState<string>("");
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);

  // Units state
  const [newUnitTitle, setNewUnitTitle] = useState("");
  const [newUnitDesc, setNewUnitDesc] = useState("");
  const [newUnitIcon, setNewUnitIcon] = useState("🇫🇷");
  const [showAddUnitModal, setShowAddUnitModal] = useState(false);

  const todayStr = new Date().toISOString().split("T")[0];

  // Fetch initial data
  useEffect(() => {
    fetchFrenchData();
  }, [userId]);

  const fetchFrenchData = async () => {
    setLoading(true);
    try {
      const [cardsRes, unitsRes, notesRes, resourcesRes, shownRes] = await Promise.all([
        supabase.from("learning_cards").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("learning_units").select("*").eq("user_id", userId).order("order_index", { ascending: true }),
        supabase.from("learning_notes").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
        supabase.from("learning_resources").select("*").eq("user_id", userId).order("title", { ascending: true }),
        supabase.from("learning_words_shown").select("french_word").eq("user_id", userId),
      ]);

      if (cardsRes.data) setCards(cardsRes.data);
      if (unitsRes.data) setUnits(unitsRes.data);
      if (notesRes.data) setNotes(notesRes.data);
      if (resourcesRes.data) setResources(resourcesRes.data);

      const shownSet = new Set<string>();
      if (shownRes.data) {
        shownRes.data.forEach((r) => shownSet.add(r.french_word.toLowerCase()));
      }
      setWordsShown(shownSet);

      // Generate daily words
      generateDailyBatch(shownSet);
    } catch (err) {
      console.error("Error fetching French data:", err);
    } finally {
      setLoading(false);
    }
  };

  // Generate 6 fresh daily words from frequency list not yet shown
  const generateDailyBatch = (shown: Set<string>) => {
    const unshown = FRENCH_FREQUENCY_WORDS.filter((w) => !shown.has(w.french.toLowerCase()));
    const batch = unshown.slice(0, 6);
    setDailyBatch(batch.length > 0 ? batch : FRENCH_FREQUENCY_WORDS.slice(0, 6));
  };

  // Web Speech API for pronunciation
  const speakFrench = (text: string) => {
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported on this browser.");
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "fr-FR";
    utterance.rate = 0.9;
    window.speechSynthesis.speak(utterance);
  };

  // Add daily word to learning cards
  const addDailyWordToDeck = async (word: FrequencyWord) => {
    try {
      const { data, error } = await supabase
        .from("learning_cards")
        .insert({
          user_id: userId,
          french: word.french,
          english: word.english,
          source: "daily_suggestion",
          interval_days: 1,
          ease_factor: 2.5,
          next_review_date: todayStr,
        })
        .select()
        .single();

      if (error) throw error;

      // Mark as shown in DB
      await supabase
        .from("learning_words_shown")
        .insert({ user_id: userId, french_word: word.french.toLowerCase() });

      setWordsShown((prev) => new Set([...prev, word.french.toLowerCase()]));
      setAddedDailyWords((prev) => new Set([...prev, word.french]));
      if (data) setCards((prev) => [data, ...prev]);
    } catch (err: any) {
      alert("Error adding card: " + err.message);
    }
  };

  // Add all unadded daily words at once
  const addAllDailyWords = async () => {
    for (const w of dailyBatch) {
      if (!addedDailyWords.has(w.french)) {
        await addDailyWordToDeck(w);
      }
    }
  };

  // Dictionary Lookup (using Free Dictionary API + Wiktionary fallback)
  const lookupDictionary = async () => {
    if (!dictQuery.trim()) return;
    setDictLoading(true);
    setDictResult(null);

    const cleanWord = dictQuery.trim().toLowerCase();

    try {
      // Look up via Dictionary API
      const langCode = dictMode === "fr_en" ? "fr" : "en";
      const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/${langCode}/${encodeURIComponent(cleanWord)}`);
      
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setDictResult({
            word: data[0].word,
            phonetic: data[0].phonetic || (data[0].phonetics?.[0]?.text ?? ""),
            meanings: data[0].meanings,
            raw: data[0],
          });
          return;
        }
      }

      // Fallback: search in our bundled frequency list
      const match = FRENCH_FREQUENCY_WORDS.find(
        (w) =>
          (dictMode === "fr_en" && w.french.toLowerCase() === cleanWord) ||
          (dictMode === "en_fr" && w.english.toLowerCase().includes(cleanWord))
      );

      if (match) {
        setDictResult({
          word: match.french,
          english: match.english,
          pos: match.pos,
          fallback: true,
        });
      } else {
        setDictResult({ notFound: true, word: cleanWord });
      }
    } catch (err) {
      // Fallback to frequency list
      const match = FRENCH_FREQUENCY_WORDS.find((w) => w.french.toLowerCase() === cleanWord);
      if (match) {
        setDictResult({ word: match.french, english: match.english, pos: match.pos, fallback: true });
      } else {
        setDictResult({ notFound: true, word: cleanWord });
      }
    } finally {
      setDictLoading(false);
    }
  };

  // Star dictionary word to deck
  const starWordToDeck = async (french: string, english: string, example?: string) => {
    try {
      const { data, error } = await supabase
        .from("learning_cards")
        .insert({
          user_id: userId,
          french,
          english,
          example_sentence: example || null,
          source: "dictionary_star",
          interval_days: 1,
          ease_factor: 2.5,
          next_review_date: todayStr,
        })
        .select()
        .single();

      if (error) throw error;
      setStarredDictWords((prev) => new Set([...prev, french]));
      if (data) setCards((prev) => [data, ...prev]);
    } catch (err: any) {
      alert("Error adding starred word: " + err.message);
    }
  };

  // Due cards for SM-2 Spaced Repetition review
  const dueCards = useMemo(() => {
    return cards.filter((c) => c.next_review_date <= todayStr);
  }, [cards, todayStr]);

  // SM-2 Review Grade Handler
  const handleReviewGrade = async (rating: "again" | "hard" | "good" | "easy") => {
    const card = dueCards[reviewIndex];
    if (!card) return;

    let newInterval = card.interval_days;
    let newEase = card.ease_factor;

    // SM-2 Algorithm computation
    if (rating === "again") {
      newInterval = 1;
      newEase = Math.max(1.3, newEase - 0.2);
    } else if (rating === "hard") {
      newInterval = Math.max(1, Math.round(card.interval_days * 1.2));
      newEase = Math.max(1.3, newEase - 0.15);
    } else if (rating === "good") {
      newInterval = card.interval_days === 1 ? 6 : Math.round(card.interval_days * newEase);
    } else if (rating === "easy") {
      newInterval = card.interval_days === 1 ? 6 : Math.round(card.interval_days * newEase * 1.3);
      newEase = Math.min(3.0, newEase + 0.15);
    }

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + newInterval);
    const nextDateStr = nextDate.toISOString().split("T")[0];

    // Optimistic update
    setCards((prev) =>
      prev.map((c) =>
        c.id === card.id
          ? { ...c, interval_days: newInterval, ease_factor: newEase, next_review_date: nextDateStr }
          : c
      )
    );

    await supabase
      .from("learning_cards")
      .update({
        interval_days: newInterval,
        ease_factor: newEase,
        next_review_date: nextDateStr,
      })
      .eq("id", card.id);

    setReviewRevealed(false);
    if (reviewIndex + 1 < dueCards.length) {
      setReviewIndex((prev) => prev + 1);
    } else {
      setReviewModeActive(false);
      setReviewIndex(0);
      alert("🎉 Félicitations! You reviewed all due cards for today!");
    }
  };

  // Manual Add Card
  const handleAddManualCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCardFrench.trim() || !newCardEnglish.trim()) return;

    try {
      const { data, error } = await supabase
        .from("learning_cards")
        .insert({
          user_id: userId,
          french: newCardFrench.trim(),
          english: newCardEnglish.trim(),
          example_sentence: newCardExample.trim() || null,
          tag: newCardTag.trim() || null,
          unit_id: newCardUnitId || null,
          source: "manual",
          interval_days: 1,
          ease_factor: 2.5,
          next_review_date: todayStr,
        })
        .select()
        .single();

      if (error) throw error;
      if (data) setCards((prev) => [data, ...prev]);

      setNewCardFrench("");
      setNewCardEnglish("");
      setNewCardExample("");
      setNewCardTag("");
      setShowAddCardModal(false);
    } catch (err: any) {
      alert("Error adding card: " + err.message);
    }
  };

  // Delete Card
  const handleDeleteCard = async (id: string) => {
    if (!confirm("Are you sure you want to remove this card?")) return;
    setCards((prev) => prev.filter((c) => c.id !== id));
    await supabase.from("learning_cards").delete().eq("id", id);
  };

  // Unit creation
  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnitTitle.trim()) return;

    try {
      const order = units.length + 1;
      const { data, error } = await supabase
        .from("learning_units")
        .insert({
          user_id: userId,
          title: newUnitTitle.trim(),
          description: newUnitDesc.trim() || null,
          order_index: order,
          icon: newUnitIcon.trim() || "🇫🇷",
        })
        .select()
        .single();

      if (error) throw error;
      if (data) setUnits((prev) => [...prev, data]);
      setNewUnitTitle("");
      setNewUnitDesc("");
      setShowAddUnitModal(false);
    } catch (err: any) {
      alert("Error creating unit: " + err.message);
    }
  };

  // Note saving
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteTitle.trim() || !noteContent.trim()) return;

    try {
      if (editingNoteId) {
        const { error } = await supabase
          .from("learning_notes")
          .update({
            title: noteTitle.trim(),
            content: noteContent.trim(),
            unit_id: noteUnitId || null,
          })
          .eq("id", editingNoteId);

        if (error) throw error;
        setNotes((prev) =>
          prev.map((n) =>
            n.id === editingNoteId
              ? { ...n, title: noteTitle.trim(), content: noteContent.trim(), unit_id: noteUnitId || null }
              : n
          )
        );
      } else {
        const { data, error } = await supabase
          .from("learning_notes")
          .insert({
            user_id: userId,
            title: noteTitle.trim(),
            content: noteContent.trim(),
            unit_id: noteUnitId || null,
          })
          .select()
          .single();

        if (error) throw error;
        if (data) setNotes((prev) => [data, ...prev]);
      }

      setNoteTitle("");
      setNoteContent("");
      setNoteUnitId("");
      setEditingNoteId(null);
      setShowNoteModal(false);
    } catch (err: any) {
      alert("Error saving note: " + err.message);
    }
  };

  // Toggle Her Favorite on Resource
  const handleToggleFavorite = async (resId: string, currentFav: boolean) => {
    setResources((prev) =>
      prev.map((r) => (r.id === resId ? { ...r, her_favorite: !currentFav } : r))
    );
    await supabase
      .from("learning_resources")
      .update({ her_favorite: !currentFav })
      .eq("id", resId);
  };

  // Unique tags for filter
  const allTags = useMemo(() => {
    const set = new Set<string>();
    cards.forEach((c) => {
      if (c.tag) set.add(c.tag);
    });
    return Array.from(set);
  }, [cards]);

  // Filtered cards list
  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      if (cardFilterDueOnly && c.next_review_date > todayStr) return false;
      if (cardFilterUnit !== "all" && c.unit_id !== cardFilterUnit) return false;
      if (cardFilterTag !== "all" && c.tag !== cardFilterTag) return false;
      if (
        cardSearch &&
        !c.french.toLowerCase().includes(cardSearch.toLowerCase()) &&
        !c.english.toLowerCase().includes(cardSearch.toLowerCase())
      ) {
        return false;
      }
      return true;
    });
  }, [cards, cardFilterDueOnly, cardFilterUnit, cardFilterTag, cardSearch, todayStr]);

  // Filtered resources list grouped by section
  const groupedResources = useMemo(() => {
    const groups: Record<string, LearningResource[]> = {
      core_course: [],
      extras: [],
      watch: [],
      listen_music: [],
      listen_podcast: [],
      listen_audiobook: [],
      read: [],
      inspiration: [],
    };

    resources.forEach((r) => {
      if (resourceTypeFilter !== "all" && r.resource_type !== resourceTypeFilter) return;
      if (resourceLevelFilter !== "all" && r.level !== resourceLevelFilter) return;
      if (resourceOnlyFavorites && !r.her_favorite) return;
      if (resourceOnlyRecommended && !r.recommended) return;
      if (
        resourceSearch &&
        !r.title.toLowerCase().includes(resourceSearch.toLowerCase()) &&
        !(r.notes && r.notes.toLowerCase().includes(resourceSearch.toLowerCase())) &&
        !(r.skills && r.skills.toLowerCase().includes(resourceSearch.toLowerCase()))
      ) {
        return false;
      }

      if (groups[r.section]) {
        groups[r.section].push(r);
      } else {
        groups.extras.push(r);
      }
    });

    return groups;
  }, [
    resources,
    resourceSearch,
    resourceTypeFilter,
    resourceLevelFilter,
    resourceOnlyFavorites,
    resourceOnlyRecommended,
  ]);

  // Quiz Pool: if user cards < 4, blend with high frequency words so quiz always works!
  const quizPool = useMemo(() => {
    if (cards.length >= 4) {
      return cards.map((c) => ({ id: c.id, french: c.french, english: c.english }));
    }
    const existingFrench = new Set(cards.map((c) => c.french.toLowerCase()));
    const extraWords = FRENCH_FREQUENCY_WORDS.filter(
      (w) => !existingFrench.has(w.french.toLowerCase())
    ).slice(0, 20);
    const combined = [
      ...cards.map((c) => ({ id: c.id, french: c.french, english: c.english })),
      ...extraWords.map((w, i) => ({ id: `freq-${i}`, french: w.french, english: w.english })),
    ];
    return combined;
  }, [cards]);

  // Quiz questions list
  const quizQuestions = useMemo(() => {
    return [...quizPool].sort(() => Math.random() - 0.5).slice(0, 10);
  }, [quizPool, quizMode]);

  // Matching game items
  const matchingPairs = useMemo(() => {
    const sample = [...quizPool].sort(() => Math.random() - 0.5).slice(0, 6);
    const tiles: { id: string; text: string; cardId: string; type: "fr" | "en" }[] = [];
    sample.forEach((c) => {
      tiles.push({ id: `fr-${c.id}`, text: c.french, cardId: c.id, type: "fr" });
      tiles.push({ id: `en-${c.id}`, text: c.english, cardId: c.id, type: "en" });
    });
    return tiles.sort(() => Math.random() - 0.5);
  }, [quizPool, activeSubTab, quizMode]);

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="rounded-3xl p-6 bg-gradient-to-r from-pink-100/90 via-purple-100/80 to-blue-100/90 border border-white/60 shadow-sm flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">🥐</span>
            <h2 className="text-2xl font-bold" style={{ fontFamily: "Fredoka, sans-serif", color: "#4A3B59" }}>
              Le Coin Français
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-white/80 text-pink-600 border border-pink-200">
              Halo Learning
            </span>
          </div>
          <p className="text-sm opacity-75 text-gray-700">
            Your personal French learning haven — daily vocabulary, spaced repetition deck, interactive quizzes & 250+ curated resources.
          </p>
        </div>

        {/* Quick Review Due Badge */}
        <div className="flex items-center gap-3">
          <div className="bg-white/80 backdrop-blur-sm px-4 py-2.5 rounded-2xl border border-white/60 shadow-sm text-center">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Due for Review</div>
            <div className="text-xl font-bold flex items-center justify-center gap-1.5" style={{ color: dueCards.length > 0 ? "#E11D48" : "#059669" }}>
              <Flame size={18} className={dueCards.length > 0 ? "text-rose-500 animate-pulse" : "text-emerald-500"} />
              {dueCards.length} {dueCards.length === 1 ? "card" : "cards"}
            </div>
          </div>
          {dueCards.length > 0 && (
            <button
              onClick={() => {
                setActiveSubTab("deck");
                setReviewModeActive(true);
                setReviewIndex(0);
                setReviewRevealed(false);
              }}
              className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-rose-400 to-pink-500 text-white font-bold text-sm shadow hover:opacity-95 transition-all flex items-center gap-1.5"
            >
              <RotateCcw size={15} /> Review Now
            </button>
          )}
        </div>
      </div>

      {/* Sub-Navigation Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 border-b border-gray-200/60 no-scrollbar">
        {[
          { id: "daily", label: "Daily Words", icon: Sparkles, badge: dailyBatch.length },
          { id: "deck", label: "Vocabulary Deck", icon: Layers, badge: cards.length },
          { id: "quiz", label: "Quiz Modes", icon: GraduationCap },
          { id: "dictionary", label: "FR ↔ EN Dictionary", icon: BookOpen },
          { id: "units", label: "The Journey (Units)", icon: Award, badge: units.length },
          { id: "notes", label: "Grammar & Notes", icon: FileText, badge: notes.length },
          { id: "resources", label: "Curated Library", icon: Bookmark, badge: resources.length },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveSubTab(t.id as any);
              setReviewModeActive(false);
            }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl text-sm font-bold transition-all whitespace-nowrap ${
              activeSubTab === t.id
                ? "bg-white text-purple-900 shadow-sm border border-purple-100"
                : "text-gray-600 hover:text-gray-900 hover:bg-white/40"
            }`}
          >
            <t.icon size={16} />
            <span>{t.label}</span>
            {t.badge !== undefined && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${activeSubTab === t.id ? "bg-purple-100 text-purple-700" : "bg-gray-200/70 text-gray-700"}`}>
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ────────────────── 1. DAILY WORDS TAB ────────────────── */}
      {activeSubTab === "daily" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2 text-gray-800" style={{ fontFamily: "Fredoka, sans-serif" }}>
                <span>✨</span> Today's Daily Intake Suggestions
              </h3>
              <p className="text-xs text-gray-600">
                Fresh high-frequency French words selected for your deck. Listen, practice, and add them with one click.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => generateDailyBatch(wordsShown)}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-white/70 hover:bg-white border text-gray-700 flex items-center gap-1 shadow-sm"
              >
                <Shuffle size={13} /> Refresh Suggestions
              </button>
              <button
                onClick={addAllDailyWords}
                className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-sm flex items-center gap-1"
              >
                <Plus size={13} /> Add All ({dailyBatch.filter((w) => !addedDailyWords.has(w.french)).length})
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dailyBatch.map((word, idx) => {
              const isAdded = addedDailyWords.has(word.french) || cards.some((c) => c.french.toLowerCase() === word.french.toLowerCase());
              return (
                <div
                  key={idx}
                  className="rounded-3xl p-5 bg-white/85 backdrop-blur-sm border border-white/60 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between mb-2">
                      <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-600 border border-purple-100">
                        {word.pos || "vocab"}
                      </span>
                      <button
                        onClick={() => speakFrench(word.french)}
                        className="p-1.5 rounded-xl bg-pink-50 text-pink-600 hover:bg-pink-100 transition-colors"
                        title="Listen to French pronunciation"
                      >
                        <Volume2 size={16} />
                      </button>
                    </div>

                    <div className="text-2xl font-extrabold text-gray-800 tracking-tight mb-1" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      {word.french}
                    </div>
                    <div className="text-sm font-medium text-purple-700 mb-3">
                      {word.english}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                    <button
                      onClick={() => {
                        setDictQuery(word.french);
                        setDictMode("fr_en");
                        setActiveSubTab("dictionary");
                        lookupDictionary();
                      }}
                      className="text-xs text-gray-500 hover:text-purple-600 font-semibold flex items-center gap-1"
                    >
                      <BookOpen size={12} /> Lookup
                    </button>

                    <button
                      onClick={() => addDailyWordToDeck(word)}
                      disabled={isAdded}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                        isAdded
                          ? "bg-emerald-50 text-emerald-600 border border-emerald-200 cursor-default"
                          : "bg-purple-100 text-purple-800 hover:bg-purple-200"
                      }`}
                    >
                      {isAdded ? (
                        <>
                          <Check size={13} /> In Deck
                        </>
                      ) : (
                        <>
                          <Plus size={13} /> Add to Deck
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ────────────────── 2. VOCABULARY DECK TAB ────────────────── */}
      {activeSubTab === "deck" && (
        <div className="space-y-6">
          {/* Review Mode Banner / Screen */}
          {reviewModeActive ? (
            <div className="rounded-3xl p-8 bg-gradient-to-b from-white/95 to-purple-50/80 border border-purple-100 shadow-md max-w-xl mx-auto text-center space-y-6">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                <span className="flex items-center gap-1 text-purple-700">
                  <Flame size={14} /> Reviewing card {reviewIndex + 1} of {dueCards.length}
                </span>
                <button
                  onClick={() => setReviewModeActive(false)}
                  className="px-2.5 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600"
                >
                  Exit Review
                </button>
              </div>

              {dueCards[reviewIndex] && (
                <div className="py-6 space-y-4">
                  <div className="flex items-center justify-center gap-3">
                    <h3 className="text-4xl font-extrabold text-gray-900 tracking-tight" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      {dueCards[reviewIndex].french}
                    </h3>
                    <button
                      onClick={() => speakFrench(dueCards[reviewIndex].french)}
                      className="p-2 rounded-2xl bg-purple-100 text-purple-700 hover:bg-purple-200"
                      title="Pronounce"
                    >
                      <Volume2 size={20} />
                    </button>
                  </div>

                  {!reviewRevealed ? (
                    <button
                      onClick={() => setReviewRevealed(true)}
                      className="px-6 py-3 rounded-2xl bg-purple-600 text-white font-bold text-sm shadow hover:bg-purple-700 transition-all mt-4"
                    >
                      Reveal Answer (Space / Click)
                    </button>
                  ) : (
                    <div className="space-y-5 animate-in fade-in duration-300">
                      <div className="p-4 rounded-2xl bg-white border border-purple-100 shadow-sm text-left">
                        <div className="text-xs font-bold text-purple-600 uppercase mb-1">English Translation</div>
                        <div className="text-2xl font-bold text-gray-800">{dueCards[reviewIndex].english}</div>
                        {dueCards[reviewIndex].example_sentence && (
                          <div className="mt-3 pt-2 border-t border-gray-100 text-xs italic text-gray-600">
                            "{dueCards[reviewIndex].example_sentence}"
                          </div>
                        )}
                      </div>

                      {/* SM-2 Self Rating Buttons */}
                      <div>
                        <div className="text-xs font-bold text-gray-500 mb-2">How easily did you recall this?</div>
                        <div className="grid grid-cols-4 gap-2">
                          <button
                            onClick={() => handleReviewGrade("again")}
                            className="p-3 rounded-2xl bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-xs"
                          >
                            <div>Forgot</div>
                            <div className="text-[10px] opacity-70">1 day</div>
                          </button>
                          <button
                            onClick={() => handleReviewGrade("hard")}
                            className="p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-bold text-xs"
                          >
                            <div>Hard</div>
                            <div className="text-[10px] opacity-70">~2 days</div>
                          </button>
                          <button
                            onClick={() => handleReviewGrade("good")}
                            className="p-3 rounded-2xl bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold text-xs"
                          >
                            <div>Good</div>
                            <div className="text-[10px] opacity-70">~6 days</div>
                          </button>
                          <button
                            onClick={() => handleReviewGrade("easy")}
                            className="p-3 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold text-xs"
                          >
                            <div>Easy</div>
                            <div className="text-[10px] opacity-70">~8+ days</div>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Deck Toolbar */}
              <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white/70 backdrop-blur-sm p-4 rounded-3xl border border-white/60 shadow-sm">
                <div className="flex items-center gap-2 flex-1">
                  <div className="relative flex-1">
                    <Search size={15} className="absolute left-3 top-3 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search French or English words..."
                      value={cardSearch}
                      onChange={(e) => setCardSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-2xl bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  {/* Filter by Unit */}
                  <select
                    value={cardFilterUnit}
                    onChange={(e) => setCardFilterUnit(e.target.value)}
                    className="text-xs py-2 px-3 rounded-2xl bg-white border border-gray-200 font-semibold text-gray-700"
                  >
                    <option value="all">All Units</option>
                    {units.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.icon || "🇫🇷"} {u.title}
                      </option>
                    ))}
                  </select>

                  {/* Filter by Tag */}
                  {allTags.length > 0 && (
                    <select
                      value={cardFilterTag}
                      onChange={(e) => setCardFilterTag(e.target.value)}
                      className="text-xs py-2 px-3 rounded-2xl bg-white border border-gray-200 font-semibold text-gray-700"
                    >
                      <option value="all">All Tags</option>
                      {allTags.map((tag) => (
                        <option key={tag} value={tag}>
                          #{tag}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCardFilterDueOnly(!cardFilterDueOnly)}
                    className={`px-3 py-2 rounded-2xl text-xs font-bold transition-colors flex items-center gap-1.5 ${
                      cardFilterDueOnly
                        ? "bg-rose-500 text-white shadow-sm"
                        : "bg-white text-gray-700 border hover:bg-gray-50"
                    }`}
                  >
                    <Flame size={14} /> Due Only ({dueCards.length})
                  </button>

                  <button
                    onClick={() => setShowAddCardModal(true)}
                    className="px-4 py-2 rounded-2xl bg-purple-600 text-white font-bold text-xs hover:bg-purple-700 shadow-sm flex items-center gap-1.5"
                  >
                    <Plus size={14} /> Add Card
                  </button>
                </div>
              </div>

              {/* Cards Grid */}
              {filteredCards.length === 0 ? (
                <div className="text-center py-12 bg-white/50 rounded-3xl border border-dashed border-gray-300">
                  <div className="text-3xl mb-2">📭</div>
                  <h4 className="font-bold text-gray-700 mb-1">No cards found</h4>
                  <p className="text-xs text-gray-500 mb-4">Add your own words or accept daily suggestions!</p>
                  <button
                    onClick={() => setShowAddCardModal(true)}
                    className="px-4 py-2 rounded-2xl bg-purple-600 text-white text-xs font-bold"
                  >
                    Create your first card
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCards.map((card) => {
                    const isDue = card.next_review_date <= todayStr;
                    return (
                      <div
                        key={card.id}
                        className="rounded-3xl p-5 bg-white/90 backdrop-blur-sm border border-white/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between relative group"
                      >
                        <div>
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 text-gray-600">
                                {card.source}
                              </span>
                              {card.tag && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-pink-50 text-pink-600">
                                  #{card.tag}
                                </span>
                              )}
                              {isDue && (
                                <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-700 animate-pulse">
                                  Due Today
                                </span>
                              )}
                            </div>

                            <button
                              onClick={() => speakFrench(card.french)}
                              className="p-1 rounded-lg text-gray-400 hover:text-pink-600 hover:bg-pink-50 transition-colors"
                              title="Listen"
                            >
                              <Volume2 size={16} />
                            </button>
                          </div>

                          <div className="text-xl font-bold text-gray-900 mb-1" style={{ fontFamily: "Fredoka, sans-serif" }}>
                            {card.french}
                          </div>
                          <div className="text-sm font-semibold text-purple-700 mb-2">{card.english}</div>

                          {card.example_sentence && (
                            <div className="text-xs text-gray-600 italic bg-purple-50/50 p-2 rounded-xl mb-3">
                              "{card.example_sentence}"
                            </div>
                          )}
                        </div>

                        <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[11px] text-gray-500">
                          <span title={`Interval: ${card.interval_days}d | Ease: ${card.ease_factor}`}>
                            Next: {card.next_review_date}
                          </span>
                          <button
                            onClick={() => handleDeleteCard(card.id)}
                            className="opacity-0 group-hover:opacity-100 text-rose-500 hover:text-rose-700 font-bold transition-opacity"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Add Card Modal */}
          {showAddCardModal && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-purple-100 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-gray-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
                    Add Vocabulary Card
                  </h3>
                  <button onClick={() => setShowAddCardModal(false)} className="text-gray-400 hover:text-gray-600">
                    ✕
                  </button>
                </div>

                <form onSubmit={handleAddManualCard} className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">French Word / Phrase</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        value={newCardFrench}
                        onChange={(e) => setNewCardFrench(e.target.value)}
                        placeholder="e.g. bibliothèque"
                        className="flex-1 px-3 py-2 rounded-2xl border bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                      <button
                        type="button"
                        onClick={() => speakFrench(newCardFrench)}
                        disabled={!newCardFrench}
                        className="p-2 rounded-2xl bg-pink-50 text-pink-600 hover:bg-pink-100 disabled:opacity-40"
                      >
                        <Volume2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">English Translation</label>
                    <input
                      type="text"
                      required
                      value={newCardEnglish}
                      onChange={(e) => setNewCardEnglish(e.target.value)}
                      placeholder="e.g. library"
                      className="w-full px-3 py-2 rounded-2xl border bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Example Sentence (Optional)</label>
                    <input
                      type="text"
                      value={newCardExample}
                      onChange={(e) => setNewCardExample(e.target.value)}
                      placeholder="e.g. Je vais à la bibliothèque aujourd'hui."
                      className="w-full px-3 py-2 rounded-2xl border bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Tag / Category</label>
                      <input
                        type="text"
                        value={newCardTag}
                        onChange={(e) => setNewCardTag(e.target.value)}
                        placeholder="e.g. food, verbs"
                        className="w-full px-3 py-2 rounded-2xl border bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 mb-1">Unit</label>
                      <select
                        value={newCardUnitId}
                        onChange={(e) => setNewCardUnitId(e.target.value)}
                        className="w-full px-3 py-2 rounded-2xl border bg-gray-50 focus:bg-white text-xs"
                      >
                        <option value="">None</option>
                        {units.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.icon || "🇫🇷"} {u.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="pt-3 flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowAddCardModal(false)}
                      className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-xs text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 font-bold text-xs text-white shadow"
                    >
                      Save Card
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── 3. QUIZ MODES TAB ────────────────── */}
      {activeSubTab === "quiz" && (
        <div className="space-y-6">
          {/* Mode Selector */}
          <div className="flex gap-2 flex-wrap bg-white/70 backdrop-blur-sm p-2 rounded-3xl border border-white/60">
            {[
              { id: "mcq", label: "Multiple Choice", icon: CheckCircle2 },
              { id: "type", label: "Type the Answer", icon: FileText },
              { id: "listening", label: "Listening Mode", icon: Volume2 },
              { id: "matching", label: "Matching Game", icon: Shuffle },
            ].map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setQuizMode(m.id as any);
                  setQuizQuestionIndex(0);
                  setQuizScore(0);
                  setQuizAnswerSelected(null);
                  setTypeAnswerFeedback(null);
                  setTypeAnswerInput("");
                  setMatchedPairs(new Set());
                }}
                className={`px-4 py-2 rounded-2xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                  quizMode === m.id
                    ? "bg-purple-600 text-white shadow-sm"
                    : "bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                <m.icon size={14} /> {m.label}
              </button>
            ))}
          </div>

          {cards.length < 4 ? (
            <div className="p-8 text-center bg-white/60 rounded-3xl border">
              <p className="font-bold text-gray-700">You need at least 4 cards in your deck to start quizzes!</p>
              <p className="text-xs text-gray-500 mt-1">Add words from the Daily Suggestions or Dictionary.</p>
            </div>
          ) : quizMode === "matching" ? (
            /* Matching Game */
            <div className="bg-white/80 backdrop-blur-sm p-6 rounded-3xl border shadow-sm max-w-2xl mx-auto space-y-5">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-gray-800 flex items-center gap-2" style={{ fontFamily: "Fredoka, sans-serif" }}>
                  <span>🧩</span> Match French & English Pairs
                </h4>
                <div className="text-xs font-bold text-purple-700 bg-purple-50 px-3 py-1 rounded-xl">
                  Matched: {matchedPairs.size / 2} / 6
                </div>
              </div>

              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {matchingPairs.map((tile) => {
                  const isMatched = matchedPairs.has(tile.cardId);
                  const isSelected = matchingSelected?.id === tile.id;

                  return (
                    <button
                      key={tile.id}
                      disabled={isMatched}
                      onClick={() => {
                        if (!matchingSelected) {
                          setMatchingSelected(tile);
                          if (tile.type === "fr") speakFrench(tile.text);
                        } else if (matchingSelected.id === tile.id) {
                          setMatchingSelected(null);
                        } else if (matchingSelected.cardId === tile.cardId && matchingSelected.type !== tile.type) {
                          // Correct Match!
                          setMatchedPairs((prev) => new Set([...prev, tile.cardId]));
                          setMatchingSelected(null);
                        } else {
                          // Incorrect match
                          setMatchingSelected(null);
                        }
                      }}
                      className={`p-4 rounded-2xl font-bold text-xs transition-all border shadow-sm text-center flex items-center justify-center min-h-[70px] ${
                        isMatched
                          ? "bg-emerald-50 text-emerald-600 border-emerald-200 opacity-40"
                          : isSelected
                          ? "bg-purple-600 text-white border-purple-700 scale-105 shadow-md"
                          : "bg-white text-gray-800 hover:bg-purple-50/50"
                      }`}
                    >
                      {tile.text}
                    </button>
                  );
                })}
              </div>

              {matchedPairs.size === 12 && (
                <div className="p-4 rounded-2xl bg-emerald-100 text-emerald-800 text-center font-bold text-sm">
                  🎉 Bravo! You matched all pairs!
                </div>
              )}
            </div>
          ) : quizQuestionIndex < quizQuestions.length ? (
            /* MCQ / Type / Listening Mode */
            <div className="bg-white/90 backdrop-blur-sm p-8 rounded-3xl border border-purple-100 shadow-md max-w-xl mx-auto space-y-6">
              <div className="flex items-center justify-between text-xs font-bold text-gray-500">
                <span>Question {quizQuestionIndex + 1} of {quizQuestions.length}</span>
                <span className="text-purple-600">Score: {quizScore}</span>
              </div>

              {/* Question Prompts */}
              <div className="text-center py-4 space-y-3">
                {quizMode === "listening" ? (
                  <div className="space-y-2">
                    <button
                      onClick={() => speakFrench(quizQuestions[quizQuestionIndex].french)}
                      className="px-6 py-4 rounded-3xl bg-pink-100 text-pink-700 font-bold hover:bg-pink-200 shadow inline-flex items-center gap-2"
                    >
                      <Volume2 size={24} /> Play Audio (Listen)
                    </button>
                    <div className="text-xs text-gray-500">Listen carefully and identify the French word</div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                      {quizMode === "type" ? "Type the French spelling for:" : "Translate to English:"}
                    </div>
                    <div className="text-3xl font-extrabold text-gray-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      {quizMode === "type" ? quizQuestions[quizQuestionIndex].english : quizQuestions[quizQuestionIndex].french}
                    </div>
                  </div>
                )}
              </div>

              {/* Mode Specific Inputs */}
              {quizMode === "type" ? (
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="Type French word here..."
                    value={typeAnswerInput}
                    onChange={(e) => setTypeAnswerInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !typeAnswerFeedback) {
                        const isCorrect =
                          typeAnswerInput.trim().toLowerCase() ===
                          quizQuestions[quizQuestionIndex].french.trim().toLowerCase();
                        setTypeAnswerFeedback(isCorrect ? "correct" : "incorrect");
                        if (isCorrect) setQuizScore((prev) => prev + 1);
                      }
                    }}
                    className="w-full p-4 rounded-2xl text-center text-lg font-bold border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />

                  {typeAnswerFeedback && (
                    <div
                      className={`p-3 rounded-2xl text-center font-bold text-xs ${
                        typeAnswerFeedback === "correct"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-rose-100 text-rose-800"
                      }`}
                    >
                      {typeAnswerFeedback === "correct" ? (
                        "✅ Correct!"
                      ) : (
                        `❌ Incorrect! Correct answer: ${quizQuestions[quizQuestionIndex].french}`
                      )}
                    </div>
                  )}

                  <div className="flex justify-end">
                    {!typeAnswerFeedback ? (
                      <button
                        onClick={() => {
                          const isCorrect =
                            typeAnswerInput.trim().toLowerCase() ===
                            quizQuestions[quizQuestionIndex].french.trim().toLowerCase();
                          setTypeAnswerFeedback(isCorrect ? "correct" : "incorrect");
                          if (isCorrect) setQuizScore((prev) => prev + 1);
                        }}
                        className="px-6 py-2.5 rounded-2xl bg-purple-600 text-white font-bold text-xs shadow"
                      >
                        Submit
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          setQuizQuestionIndex((prev) => prev + 1);
                          setTypeAnswerFeedback(null);
                          setTypeAnswerInput("");
                        }}
                        className="px-6 py-2.5 rounded-2xl bg-purple-600 text-white font-bold text-xs shadow"
                      >
                        Next Question →
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                /* MCQ Options */
                <div className="space-y-2.5">
                  {(() => {
                    const current = quizQuestions[quizQuestionIndex];
                    if (!current) return [];
                    const correctAnswer = quizMode === "listening" ? current.french : current.english;
                    const distractors = quizPool
                      .filter((c) => c.id !== current.id)
                      .slice(0, 5)
                      .map((c) => (quizMode === "listening" ? c.french : c.english));
                    const uniqueOptions = Array.from(new Set([correctAnswer, ...distractors])).slice(0, 4);
                    return uniqueOptions;
                  })().map((opt, idx) => {
                    const current = quizQuestions[quizQuestionIndex];
                    const correctAnswer = quizMode === "listening" ? current.french : current.english;
                    const isSelected = quizAnswerSelected === opt;
                    const isCorrect = opt === correctAnswer;

                    let btnStyle = "bg-white hover:bg-purple-50 text-gray-800 border-gray-200";
                    if (quizAnswerSelected) {
                      if (isCorrect) btnStyle = "bg-emerald-500 text-white border-emerald-600";
                      else if (isSelected) btnStyle = "bg-rose-500 text-white border-rose-600";
                      else btnStyle = "bg-white opacity-50 border-gray-200";
                    }

                    return (
                      <button
                        key={idx}
                        disabled={!!quizAnswerSelected}
                        onClick={() => {
                          setQuizAnswerSelected(opt);
                          if (isCorrect) setQuizScore((prev) => prev + 1);
                        }}
                        className={`w-full p-4 rounded-2xl font-bold text-sm border shadow-sm text-left transition-all ${btnStyle}`}
                      >
                        {opt}
                      </button>
                    );
                  })}

                  {quizAnswerSelected && (
                    <div className="pt-3 flex justify-end">
                      <button
                        onClick={() => {
                          setQuizQuestionIndex((prev) => prev + 1);
                          setQuizAnswerSelected(null);
                        }}
                        className="px-6 py-2.5 rounded-2xl bg-purple-600 text-white font-bold text-xs shadow"
                      >
                        Next Question →
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white/90 p-8 rounded-3xl border shadow text-center max-w-md mx-auto space-y-4">
              <div className="text-4xl">🏆</div>
              <h3 className="text-2xl font-bold text-gray-800" style={{ fontFamily: "Fredoka, sans-serif" }}>
                Quiz Finished!
              </h3>
              <p className="text-sm text-gray-600">
                You scored <span className="font-bold text-purple-700">{quizScore}</span> out of{" "}
                <span className="font-bold">{quizQuestions.length}</span>!
              </p>
              <button
                onClick={() => {
                  setQuizQuestionIndex(0);
                  setQuizScore(0);
                  setQuizAnswerSelected(null);
                  setTypeAnswerFeedback(null);
                }}
                className="px-5 py-2.5 rounded-2xl bg-purple-600 text-white font-bold text-xs shadow"
              >
                Play Again
              </button>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── 4. DICTIONARY TAB ────────────────── */}
      {activeSubTab === "dictionary" && (
        <div className="space-y-6 max-w-2xl mx-auto">
          <div className="bg-white/85 backdrop-blur-sm p-6 rounded-3xl border border-white/80 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2" style={{ fontFamily: "Fredoka, sans-serif" }}>
                <span>📖</span> French ↔ English Bidirectional Dictionary
              </h3>
              <div className="flex rounded-xl bg-gray-100 p-1 text-xs font-bold">
                <button
                  onClick={() => setDictMode("fr_en")}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    dictMode === "fr_en" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"
                  }`}
                >
                  FR ➔ EN
                </button>
                <button
                  onClick={() => setDictMode("en_fr")}
                  className={`px-3 py-1 rounded-lg transition-all ${
                    dictMode === "en_fr" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"
                  }`}
                >
                  EN ➔ FR
                </button>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                lookupDictionary();
              }}
              className="flex gap-2"
            >
              <div className="relative flex-1">
                <Search size={16} className="absolute left-3.5 top-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder={dictMode === "fr_en" ? "Search French word (e.g. papillon)..." : "Search English word (e.g. butterfly)..."}
                  value={dictQuery}
                  onChange={(e) => setDictQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 rounded-2xl border bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm font-medium"
                />
              </div>
              <button
                type="submit"
                disabled={dictLoading}
                className="px-5 py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow transition-all disabled:opacity-50"
              >
                {dictLoading ? "Searching..." : "Lookup"}
              </button>
            </form>

            {/* WordReference External Link */}
            {dictQuery.trim() && (
              <div className="flex justify-end">
                <a
                  href={`http://www.wordreference.com/${dictMode === "fr_en" ? "fren" : "enfr"}/${encodeURIComponent(dictQuery.trim())}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-purple-600 hover:underline font-bold flex items-center gap-1"
                >
                  Open in WordReference <ExternalLink size={12} />
                </a>
              </div>
            )}
          </div>

          {/* Dictionary Results Display */}
          {dictResult && (
            <div className="bg-white/90 backdrop-blur-sm p-6 rounded-3xl border border-purple-100 shadow-md space-y-5 animate-in fade-in">
              {dictResult.notFound ? (
                <div className="text-center py-6">
                  <p className="text-gray-600 font-bold">No direct dictionary entry found for "{dictResult.word}".</p>
                  <p className="text-xs text-gray-500 mt-1">Try checking on WordReference or add manually as a custom card.</p>
                </div>
              ) : dictResult.fallback ? (
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
                          {dictResult.word}
                        </h4>
                        <button
                          onClick={() => speakFrench(dictResult.word)}
                          className="p-1.5 rounded-xl bg-pink-50 text-pink-600 hover:bg-pink-100"
                        >
                          <Volume2 size={16} />
                        </button>
                      </div>
                      {dictResult.pos && (
                        <span className="text-xs font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded-md">
                          {dictResult.pos}
                        </span>
                      )}
                    </div>

                    <button
                      onClick={() => starWordToDeck(dictResult.word, dictResult.english)}
                      disabled={starredDictWords.has(dictResult.word)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                        starredDictWords.has(dictResult.word)
                          ? "bg-amber-100 text-amber-800"
                          : "bg-amber-400 text-white hover:bg-amber-500"
                      }`}
                    >
                      <Star size={13} className="fill-current" /> {starredDictWords.has(dictResult.word) ? "Saved to Deck" : "Star to Deck"}
                    </button>
                  </div>

                  <div className="mt-4 p-4 rounded-2xl bg-purple-50/50">
                    <div className="text-xs font-bold text-purple-700 mb-1">Definition / Translation:</div>
                    <div className="text-base font-bold text-gray-800">{dictResult.english}</div>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-2xl font-extrabold text-gray-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
                          {dictResult.word}
                        </h4>
                        <button
                          onClick={() => speakFrench(dictResult.word)}
                          className="p-1.5 rounded-xl bg-pink-50 text-pink-600 hover:bg-pink-100"
                        >
                          <Volume2 size={16} />
                        </button>
                      </div>
                      {dictResult.phonetic && (
                        <div className="text-xs text-gray-500 font-mono mt-0.5">{dictResult.phonetic}</div>
                      )}
                    </div>

                    <button
                      onClick={() => {
                        const def = dictResult.meanings?.[0]?.definitions?.[0]?.definition || "Starred definition";
                        starWordToDeck(dictResult.word, def);
                      }}
                      disabled={starredDictWords.has(dictResult.word)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 transition-all ${
                        starredDictWords.has(dictResult.word)
                          ? "bg-amber-100 text-amber-800"
                          : "bg-amber-400 text-white hover:bg-amber-500"
                      }`}
                    >
                      <Star size={13} className="fill-current" /> {starredDictWords.has(dictResult.word) ? "Saved" : "Star to Deck"}
                    </button>
                  </div>

                  {/* Meanings */}
                  <div className="mt-4 space-y-4">
                    {dictResult.meanings?.map((m: any, idx: number) => (
                      <div key={idx} className="p-4 rounded-2xl bg-gray-50/80 border border-gray-100 space-y-2">
                        <span className="text-xs font-bold text-purple-600 uppercase tracking-wider">{m.partOfSpeech}</span>
                        {m.definitions?.slice(0, 3).map((d: any, dIdx: number) => (
                          <div key={dIdx} className="text-sm text-gray-800">
                            <p className="font-medium">• {d.definition}</p>
                            {d.example && <p className="text-xs text-gray-500 italic mt-0.5 ml-3">"{d.example}"</p>}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ────────────────── 5. THE JOURNEY (UNITS) TAB ────────────────── */}
      {activeSubTab === "units" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
                The Learning Path & Units
              </h3>
              <p className="text-xs text-gray-600">
                Organize your study cards into structured curriculum steps and track mastery progression.
              </p>
            </div>
            <button
              onClick={() => setShowAddUnitModal(true)}
              className="px-4 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow flex items-center gap-1.5"
            >
              <Plus size={14} /> New Unit
            </button>
          </div>

          {units.length === 0 ? (
            <div className="p-8 text-center bg-white/60 rounded-3xl border border-dashed">
              <div className="text-3xl mb-2">🗺️</div>
              <h4 className="font-bold text-gray-700 mb-1">No units created yet</h4>
              <p className="text-xs text-gray-500 mb-4">Create your first unit to organize cards into a journey path!</p>
              <button
                onClick={() => setShowAddUnitModal(true)}
                className="px-4 py-2 rounded-2xl bg-purple-600 text-white font-bold text-xs shadow"
              >
                Create Unit 1
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {units.map((unit) => {
                const unitCards = cards.filter((c) => c.unit_id === unit.id);
                const masteredCount = unitCards.filter((c) => c.interval_days >= 3).length;
                const progressPct = unitCards.length > 0 ? Math.round((masteredCount / unitCards.length) * 100) : 0;

                return (
                  <div
                    key={unit.id}
                    className="p-5 rounded-3xl bg-white/90 backdrop-blur-sm border border-purple-100 shadow-sm space-y-4 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-3xl">{unit.icon || "🇫🇷"}</span>
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-50 text-purple-700 border border-purple-100">
                          Unit {unit.order_index}
                        </span>
                      </div>

                      <h4 className="text-lg font-bold text-gray-900 mb-1" style={{ fontFamily: "Fredoka, sans-serif" }}>
                        {unit.title}
                      </h4>
                      {unit.description && <p className="text-xs text-gray-600">{unit.description}</p>}
                    </div>

                    <div className="space-y-2 pt-3 border-t border-gray-100">
                      <div className="flex items-center justify-between text-xs font-bold text-gray-600">
                        <span>Mastery Progress</span>
                        <span>{progressPct}% ({masteredCount}/{unitCards.length} cards)</span>
                      </div>
                      <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add Unit Modal */}
          {showAddUnitModal && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-purple-100 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-gray-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
                    Create Learning Unit
                  </h3>
                  <button onClick={() => setShowAddUnitModal(false)} className="text-gray-400 hover:text-gray-600">
                    ✕
                  </button>
                </div>

                <form onSubmit={handleCreateUnit} className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Unit Title</label>
                    <input
                      type="text"
                      required
                      value={newUnitTitle}
                      onChange={(e) => setNewUnitTitle(e.target.value)}
                      placeholder="e.g. Unit 1: Greetings & Basics"
                      className="w-full px-3 py-2 rounded-2xl border bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Description</label>
                    <textarea
                      rows={2}
                      value={newUnitDesc}
                      onChange={(e) => setNewUnitDesc(e.target.value)}
                      placeholder="e.g. Essential everyday greetings, polite expressions, and introduce oneself."
                      className="w-full px-3 py-2 rounded-2xl border bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Emoji Icon</label>
                    <input
                      type="text"
                      value={newUnitIcon}
                      onChange={(e) => setNewUnitIcon(e.target.value)}
                      placeholder="e.g. 🥖"
                      className="w-20 px-3 py-2 rounded-2xl border bg-gray-50 text-center text-lg"
                    />
                  </div>

                  <div className="pt-3 flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowAddUnitModal(false)}
                      className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-xs text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 font-bold text-xs text-white shadow"
                    >
                      Save Unit
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── 6. GRAMMAR & PERSONAL NOTES TAB ────────────────── */}
      {activeSubTab === "notes" && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
                Grammar & Personal Study Notes
              </h3>
              <p className="text-xs text-gray-600">
                Write notes on tricky conjugation rules, idioms, pronunciation guides, and tips.
              </p>
            </div>
            <button
              onClick={() => {
                setEditingNoteId(null);
                setNoteTitle("");
                setNoteContent("");
                setNoteUnitId("");
                setShowNoteModal(true);
              }}
              className="px-4 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow flex items-center gap-1.5"
            >
              <Plus size={14} /> New Note
            </button>
          </div>

          {notes.length === 0 ? (
            <div className="p-8 text-center bg-white/60 rounded-3xl border border-dashed">
              <div className="text-3xl mb-2">📝</div>
              <h4 className="font-bold text-gray-700 mb-1">No notes recorded yet</h4>
              <p className="text-xs text-gray-500 mb-4">Write down rules like Passé Composé vs Imparfait, prepositions, or idioms.</p>
              <button
                onClick={() => setShowNoteModal(true)}
                className="px-4 py-2 rounded-2xl bg-purple-600 text-white font-bold text-xs shadow"
              >
                Create First Note
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {notes.map((note) => (
                <div
                  key={note.id}
                  className="p-6 rounded-3xl bg-white/90 backdrop-blur-sm border border-purple-100 shadow-sm space-y-3 relative group"
                >
                  <div className="flex items-start justify-between">
                    <h4 className="text-base font-bold text-gray-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
                      {note.title}
                    </h4>
                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => {
                          setEditingNoteId(note.id);
                          setNoteTitle(note.title);
                          setNoteContent(note.content);
                          setNoteUnitId(note.unit_id || "");
                          setShowNoteModal(true);
                        }}
                        className="text-xs font-bold text-purple-600 hover:underline"
                      >
                        Edit
                      </button>
                      <button
                        onClick={async () => {
                          if (!confirm("Delete note?")) return;
                          setNotes((prev) => prev.filter((n) => n.id !== note.id));
                          await supabase.from("learning_notes").delete().eq("id", note.id);
                        }}
                        className="text-xs font-bold text-rose-500 hover:underline"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  <p className="text-xs text-gray-700 whitespace-pre-wrap leading-relaxed">{note.content}</p>

                  <div className="pt-2 border-t border-gray-100 text-[10px] text-gray-400 flex items-center justify-between">
                    <span>{new Date(note.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Note Modal */}
          {showNoteModal && (
            <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl border border-purple-100 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-lg text-gray-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
                    {editingNoteId ? "Edit Note" : "New Study Note"}
                  </h3>
                  <button onClick={() => setShowNoteModal(false)} className="text-gray-400 hover:text-gray-600">
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveNote} className="space-y-3 text-sm">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Title</label>
                    <input
                      type="text"
                      required
                      value={noteTitle}
                      onChange={(e) => setNoteTitle(e.target.value)}
                      placeholder="e.g. Passé Composé with Être (DR & MRS VANDERTRAMP)"
                      className="w-full px-3 py-2 rounded-2xl border bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Content</label>
                    <textarea
                      rows={6}
                      required
                      value={noteContent}
                      onChange={(e) => setNoteContent(e.target.value)}
                      placeholder="Write markdown or text explanation..."
                      className="w-full px-3 py-2 rounded-2xl border bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-400 text-xs font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Link to Unit (Optional)</label>
                    <select
                      value={noteUnitId}
                      onChange={(e) => setNoteUnitId(e.target.value)}
                      className="w-full px-3 py-2 rounded-2xl border bg-gray-50 focus:bg-white text-xs"
                    >
                      <option value="">None</option>
                      {units.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.icon || "🇫🇷"} {u.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="pt-3 flex gap-2 justify-end">
                    <button
                      type="button"
                      onClick={() => setShowNoteModal(false)}
                      className="px-4 py-2 rounded-2xl bg-gray-100 hover:bg-gray-200 font-bold text-xs text-gray-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-2xl bg-purple-600 hover:bg-purple-700 font-bold text-xs text-white shadow"
                    >
                      Save Note
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ────────────────── 7. CURATED RESOURCE LIBRARY TAB ────────────────── */}
      {activeSubTab === "resources" && (
        <div className="space-y-6">
          {/* Filter Toolbar */}
          <div className="bg-white/80 backdrop-blur-sm p-4 rounded-3xl border border-white/80 shadow-sm space-y-3">
            <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-3 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search 250+ curated resources (title, topic, notes)..."
                  value={resourceSearch}
                  onChange={(e) => setResourceSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm rounded-2xl bg-white border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-400"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* Resource Type filter */}
                <select
                  value={resourceTypeFilter}
                  onChange={(e) => setResourceTypeFilter(e.target.value)}
                  className="text-xs py-2 px-3 rounded-2xl bg-white border border-gray-200 font-semibold text-gray-700"
                >
                  <option value="all">All Types</option>
                  {Object.entries(RESOURCE_TYPE_BADGES).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>

                {/* Level filter */}
                <select
                  value={resourceLevelFilter}
                  onChange={(e) => setResourceLevelFilter(e.target.value)}
                  className="text-xs py-2 px-3 rounded-2xl bg-white border border-gray-200 font-semibold text-gray-700"
                >
                  <option value="all">All Levels</option>
                  {Object.entries(LEVEL_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>

                {/* Favorites filter */}
                <button
                  onClick={() => setResourceOnlyFavorites(!resourceOnlyFavorites)}
                  className={`px-3 py-2 rounded-2xl text-xs font-bold flex items-center gap-1 transition-all ${
                    resourceOnlyFavorites
                      ? "bg-rose-500 text-white shadow-sm"
                      : "bg-white text-gray-700 border hover:bg-gray-50"
                  }`}
                >
                  <Heart size={13} className={resourceOnlyFavorites ? "fill-current" : ""} /> Favorites
                </button>

                {/* Recommended filter */}
                <button
                  onClick={() => setResourceOnlyRecommended(!resourceOnlyRecommended)}
                  className={`px-3 py-2 rounded-2xl text-xs font-bold flex items-center gap-1 transition-all ${
                    resourceOnlyRecommended
                      ? "bg-amber-500 text-white shadow-sm"
                      : "bg-white text-gray-700 border hover:bg-gray-50"
                  }`}
                >
                  <Star size={13} className={resourceOnlyRecommended ? "fill-current" : ""} /> Top Picks
                </button>
              </div>
            </div>
          </div>

          {/* Categorized Sections */}
          <div className="space-y-6">
            {Object.entries(SECTION_LABELS).map(([sectionKey, meta]) => {
              const list = groupedResources[sectionKey] || [];
              if (list.length === 0 && (resourceSearch || resourceTypeFilter !== "all" || resourceLevelFilter !== "all")) {
                return null;
              }

              const isCollapsed = !!collapsedSections[sectionKey];

              return (
                <div key={sectionKey} className="rounded-3xl bg-white/75 backdrop-blur-sm border border-purple-100 shadow-sm overflow-hidden">
                  {/* Section Header */}
                  <button
                    onClick={() =>
                      setCollapsedSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }))
                    }
                    className="w-full p-4 md:p-5 flex items-center justify-between hover:bg-purple-50/50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{meta.icon}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-gray-900" style={{ fontFamily: "Fredoka, sans-serif" }}>
                            {meta.label}
                          </h4>
                          <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-purple-100 text-purple-700">
                            {list.length}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">{meta.desc}</p>
                      </div>
                    </div>

                    <div className="text-gray-400">
                      {isCollapsed ? <ChevronRight size={20} /> : <ChevronDown size={20} />}
                    </div>
                  </button>

                  {/* Section Items */}
                  {!isCollapsed && list.length > 0 && (
                    <div className="p-4 md:p-5 pt-0 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 border-t border-gray-100/60 mt-1">
                      {list.map((res) => {
                        const badge = RESOURCE_TYPE_BADGES[res.resource_type] || RESOURCE_TYPE_BADGES.other;

                        return (
                          <div
                            key={res.id}
                            className="p-4 rounded-2xl bg-white border border-gray-100/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
                          >
                            <div>
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span
                                    className="px-2 py-0.5 rounded-md text-[10px] font-bold"
                                    style={{ backgroundColor: badge.bg, color: badge.text }}
                                  >
                                    {badge.label}
                                  </span>
                                  {res.level && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-gray-100 text-gray-600">
                                      {LEVEL_LABELS[res.level] || res.level}
                                    </span>
                                  )}
                                  {res.recommended && (
                                    <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                      ⭐ Recommended
                                    </span>
                                  )}
                                </div>

                                <button
                                  onClick={() => handleToggleFavorite(res.id, res.her_favorite)}
                                  className={`p-1.5 rounded-xl transition-colors ${
                                    res.her_favorite
                                      ? "text-rose-500 bg-rose-50 hover:bg-rose-100"
                                      : "text-gray-300 hover:text-rose-400 hover:bg-rose-50"
                                  }`}
                                  title={res.her_favorite ? "Remove from Favorites" : "Add to Favorites"}
                                >
                                  <Heart size={16} className={res.her_favorite ? "fill-current" : ""} />
                                </button>
                              </div>

                              <div className="font-bold text-sm text-gray-900 mb-1 leading-snug">
                                {res.title}
                              </div>

                              {res.skills && (
                                <div className="text-[11px] font-semibold text-purple-700 mb-1.5">
                                  Focus: {res.skills}
                                </div>
                              )}

                              {res.notes && (
                                <p className="text-xs text-gray-600 line-clamp-3 leading-relaxed mb-3">
                                  {res.notes}
                                </p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-gray-50 flex items-center justify-between text-[11px] text-gray-400">
                              <span className="truncate max-w-[140px]" title={res.source_attribution || ""}>
                                {res.source_attribution || ""}
                              </span>

                              {res.url && (
                                <a
                                  href={res.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2.5 py-1 rounded-xl bg-purple-50 text-purple-700 hover:bg-purple-100 font-bold flex items-center gap-1"
                                >
                                  Open <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
