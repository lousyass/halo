import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Search,
  ExternalLink,
  X,
  Sparkles,
  Gamepad2,
  Brain,
  Puzzle,
  Dice5,
  Users,
  Compass,
  Layers,
  HelpCircle,
  Tag,
  Heart,
  Grid,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import gamesSnapshot from "./data/games/halo-games-resources-v2-verified.json";

/* ─────────────────────────────── types ─────────────────────────────── */

export interface GameResource {
  id: string;
  name: string;
  url: string;
  category: string;
  subcategory: string;
  description: string;
  tags: string[];
  source: string;
  needsManualReview?: boolean;
  verificationStatus?: string;
  verificationNote?: string;
  resourceType?: "site-or-game" | "category-search-page" | "category-page" | string;
}

/* ─────────────────────────── category icons ─────────────────────────── */

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Puzzle & Casual": Puzzle,
  "Puzzle": Puzzle,
  "Casual": Gamepad2,
  "Brain & Puzzle": Brain,
  "Word & Puzzle": Tag,
  "Action & Adventure": Compass,
  "Action": Compass,
  "Arcade & Skill": Gamepad2,
  "Arcade": Gamepad2,
  "Casual & Fashion": Sparkles,
  "Multiplayer": Users,
  "Simulation & Strategy": Layers,
  "Simulation": Layers,
  "Quiz & Trivia": HelpCircle,
  "Board & Card": Dice5,
  "Indie & Creative": Sparkles,
  "General": Grid,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
  "Brain & Puzzle": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", activeBg: "bg-purple-600" },
  "Puzzle & Casual": { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200", activeBg: "bg-pink-600" },
  "Puzzle": { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", activeBg: "bg-indigo-600" },
  "Word & Puzzle": { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", activeBg: "bg-teal-600" },
  "Board & Card": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", activeBg: "bg-amber-600" },
  "Multiplayer": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", activeBg: "bg-sky-600" },
  "Casual": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", activeBg: "bg-rose-600" },
  "Action & Adventure": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", activeBg: "bg-orange-600" },
  "Action": { bg: "bg-red-50", text: "text-red-700", border: "border-red-200", activeBg: "bg-red-600" },
  "Arcade & Skill": { bg: "bg-violet-50", text: "text-violet-700", border: "border-violet-200", activeBg: "bg-violet-600" },
  "Arcade": { bg: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200", activeBg: "bg-fuchsia-600" },
  "Casual & Fashion": { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200", activeBg: "bg-pink-600" },
  "Simulation & Strategy": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", activeBg: "bg-emerald-600" },
  "Simulation": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", activeBg: "bg-emerald-600" },
  "Quiz & Trivia": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", activeBg: "bg-blue-600" },
  "Indie & Creative": { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", activeBg: "bg-cyan-600" },
  "General": { bg: "bg-gray-50", text: "text-gray-700", border: "border-gray-200", activeBg: "bg-gray-700" },
};

/* ─────────────────────────── ranking helper ─────────────────────────── */

function calculateMatchScore(resource: GameResource, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  const name = resource.name.toLowerCase();
  const desc = (resource.description || "").toLowerCase();
  const cat = (resource.category || "").toLowerCase();
  const subcat = (resource.subcategory || "").toLowerCase();

  // 1. Exact name match
  if (name === q) return 1;

  // 2. Name starts with query or contains token prefix
  if (name.startsWith(q)) return 2;
  const nameTokens = name.split(/\s+/);
  if (nameTokens.some((t) => t.startsWith(q))) return 2.5;

  // 3. Name contains query substring
  if (name.includes(q)) return 3;

  // 4. Match in tags
  if (resource.tags && resource.tags.some((t) => t.toLowerCase() === q || t.toLowerCase().includes(q))) return 4;

  // 5. Match in category / subcategory
  if (cat.includes(q) || subcat.includes(q)) return 5;

  // 6. Match in description
  if (desc.includes(q)) return 6;

  return 999;
}

/* ─────────────────────────── main component ─────────────────────────── */

export function GamesView({ userId }: { userId?: string }) {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>("all");
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());

  const allResources = useMemo(() => {
    return (gamesSnapshot.resources || []) as GameResource[];
  }, []);

  // Fetch per-user favorites from Supabase
  const loadFavorites = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const currentUserId = userId || user?.id;
      if (!currentUserId) return;

      const { data, error } = await supabase
        .from("game_favorites")
        .select("resource_id")
        .eq("user_id", currentUserId);

      if (error) {
        console.error("fetch game favorites error:", error.message);
        return;
      }
      if (data) {
        setFavoriteIds(new Set(data.map((r) => r.resource_id)));
      }
    } catch (e) {
      console.warn("loadFavorites failed:", e);
    }
  }, [userId]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // Toggle favorite for a resource
  const toggleFavorite = async (resourceId: string) => {
    const { data: { user } } = await supabase.auth.getUser();
    const currentUserId = userId || user?.id;
    if (!currentUserId) {
      alert("Please sign in to save game favorites.");
      return;
    }

    const isFav = favoriteIds.has(resourceId);
    const nextFavorites = new Set(favoriteIds);

    // Optimistic UI update
    if (isFav) {
      nextFavorites.delete(resourceId);
    } else {
      nextFavorites.add(resourceId);
    }
    setFavoriteIds(nextFavorites);

    try {
      if (isFav) {
        const { error } = await supabase
          .from("game_favorites")
          .delete()
          .eq("user_id", currentUserId)
          .eq("resource_id", resourceId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("game_favorites")
          .insert({ user_id: currentUserId, resource_id: resourceId });
        if (error) throw error;
      }
    } catch (e) {
      console.error("toggleFavorite error:", e);
      // Revert on error
      setFavoriteIds(favoriteIds);
    }
  };

  // Distinct categories with resource counts
  const categoriesWithCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allResources.forEach((r) => {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allResources]);

  // Distinct subcategories within current category
  const availableSubcategories = useMemo(() => {
    const subMap: Record<string, number> = {};
    const pool = selectedCategory === "all"
      ? allResources
      : allResources.filter((r) => r.category === selectedCategory);

    pool.forEach((r) => {
      if (r.subcategory) {
        subMap[r.subcategory] = (subMap[r.subcategory] || 0) + 1;
      }
    });
    return Object.entries(subMap).sort((a, b) => b[1] - a[1]);
  }, [allResources, selectedCategory]);

  // Filtered and Deterministically Ranked resources
  const filteredResources = useMemo(() => {
    const trimmedQuery = search.trim().toLowerCase();

    return allResources
      .filter((r) => {
        // Favorites filter
        if (showFavoritesOnly && !favoriteIds.has(r.id)) {
          return false;
        }

        // Category filter
        if (selectedCategory !== "all" && r.category !== selectedCategory) {
          return false;
        }

        // Subcategory filter
        if (selectedSubcategory !== "all" && r.subcategory !== selectedSubcategory) {
          return false;
        }

        // Search query filter
        if (trimmedQuery) {
          const matchScore = calculateMatchScore(r, trimmedQuery);
          if (matchScore > 100) return false;
        }

        return true;
      })
      .map((r) => ({
        resource: r,
        score: trimmedQuery ? calculateMatchScore(r, trimmedQuery) : 0,
      }))
      .sort((a, b) => {
        if (trimmedQuery) {
          if (a.score !== b.score) return a.score - b.score;
        }
        return a.resource.name.localeCompare(b.resource.name);
      })
      .map((item) => item.resource);
  }, [allResources, search, selectedCategory, selectedSubcategory, showFavoritesOnly, favoriteIds]);

  const clearFilters = () => {
    setSearch("");
    setSelectedCategory("all");
    setSelectedSubcategory("all");
    setShowFavoritesOnly(false);
  };

  return (
    <div className="space-y-6">
      {/* ── Header Banner ── */}
      <div className="p-5 md:p-6 rounded-3xl bg-white/75 backdrop-blur-md border border-white/70 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-purple-100/80 border border-purple-200/70 p-2 flex items-center justify-center shrink-0 shadow-sm text-purple-700">
              <Gamepad2 size={28} />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl md:text-2xl font-black tracking-tight" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
                  Halo Games
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100/90 text-purple-700 border border-purple-200/80">
                  {allResources.length} Handpicked Games & Hubs
                </span>
              </div>
              <p className="text-xs md:text-sm text-gray-700 mt-1 leading-relaxed font-medium">
                Curated browser games, brain puzzles, word challenges & casual classics. Have fun!
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
              🎮 Verified Catalog
            </span>
          </div>
        </div>

        {/* ── Search Bar ── */}
        <div className="mt-5 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, category, puzzle, sudoku, multiplayer, word, board..."
              className="w-full pl-10 pr-10 py-2.5 rounded-2xl border border-purple-100 bg-white/90 text-xs md:text-sm font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-300 shadow-inner"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-gray-100 text-gray-400"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {(search || selectedCategory !== "all" || selectedSubcategory !== "all" || showFavoritesOnly) && (
            <button
              onClick={clearFilters}
              className="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors shrink-0"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Category & Favorite Filter Pills ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-900/70">
            Categories ({categoriesWithCounts.length})
          </span>
          <span className="text-[11px] font-bold text-gray-500">
            Showing {filteredResources.length} of {allResources.length} games
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {/* Favorites Filter Pill */}
          <button
            onClick={() => {
              setShowFavoritesOnly(!showFavoritesOnly);
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              showFavoritesOnly
                ? "bg-rose-500 text-white shadow-sm scale-[1.02]"
                : "bg-white/70 hover:bg-white text-gray-700 border border-white/80"
            }`}
          >
            <Heart size={13} className={showFavoritesOnly ? "fill-white text-white" : "text-rose-500"} />
            <span>Favorites</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${showFavoritesOnly ? "bg-white/20" : "bg-rose-100 text-rose-700"}`}>
              {favoriteIds.size}
            </span>
          </button>

          {/* All Categories */}
          <button
            onClick={() => {
              setSelectedCategory("all");
              setSelectedSubcategory("all");
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              selectedCategory === "all" && !showFavoritesOnly
                ? "bg-purple-600 text-white shadow-sm scale-[1.02]"
                : "bg-white/70 hover:bg-white text-gray-700 border border-white/80"
            }`}
          >
            <Sparkles size={13} />
            <span>All Categories</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${selectedCategory === "all" && !showFavoritesOnly ? "bg-white/20" : "bg-black/5"}`}>
              {allResources.length}
            </span>
          </button>

          {categoriesWithCounts.map(([catName, count]) => {
            const Icon = CATEGORY_ICONS[catName] || Gamepad2;
            const isCatActive = selectedCategory === catName;
            const colorScheme = CATEGORY_COLORS[catName] || {
              bg: "bg-purple-50",
              text: "text-purple-700",
              border: "border-purple-200",
              activeBg: "bg-purple-600",
            };

            return (
              <button
                key={catName}
                onClick={() => {
                  setSelectedCategory(catName);
                  setSelectedSubcategory("all");
                }}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  isCatActive
                    ? `${colorScheme.activeBg} text-white shadow-sm scale-[1.02]`
                    : `bg-white/70 hover:bg-white text-gray-700 border border-white/80`
                }`}
              >
                <Icon size={13} className={isCatActive ? "text-white" : colorScheme.text} />
                <span>{catName}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-md ${
                    isCatActive ? "bg-white/20" : "bg-black/5 text-gray-500"
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* ── Subcategory Pills ── */}
        {availableSubcategories.length > 1 && (
          <div className="p-3 rounded-2xl bg-white/40 border border-white/50 flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] font-bold text-gray-500 mr-1 flex items-center gap-1">
              <Tag size={11} /> Subcategory:
            </span>
            <button
              onClick={() => setSelectedSubcategory("all")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                selectedSubcategory === "all"
                  ? "bg-purple-700 text-white shadow-sm"
                  : "bg-white/70 hover:bg-white text-gray-600"
              }`}
            >
              All Subcategories
            </button>
            {availableSubcategories.map(([subName, count]) => {
              const isSubActive = selectedSubcategory === subName;
              return (
                <button
                  key={subName}
                  onClick={() => setSelectedSubcategory(subName)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                    isSubActive
                      ? "bg-purple-700 text-white shadow-sm"
                      : "bg-white/70 hover:bg-white text-gray-600"
                  }`}
                >
                  <span>{subName}</span>
                  <span className={`text-[9px] px-1 rounded ${isSubActive ? "bg-white/20" : "bg-black/5"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Games Cards Grid ── */}
      {filteredResources.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white/60 border border-white/60 shadow-sm max-w-md mx-auto my-8">
          <div className="text-4xl mb-3">🎮</div>
          <h3 className="text-lg font-bold text-gray-800 mb-1" style={{ fontFamily: "Fredoka, sans-serif" }}>
            No games match your search
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            {showFavoritesOnly
              ? "You haven't favorited any games matching these filters yet. Click the heart icon on any game card to favorite it!"
              : "Try adjusting your search query or switching to another category."}
          </p>
          <button
            onClick={clearFilters}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-purple-600 text-white hover:bg-purple-700 shadow-sm"
          >
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredResources.map((res) => {
            const isFav = favoriteIds.has(res.id);
            const isCategoryPortal = res.resourceType === "category-search-page" || res.resourceType === "category-page";
            const catColors = CATEGORY_COLORS[res.category] || {
              bg: "bg-purple-50",
              text: "text-purple-700",
              border: "border-purple-200",
            };

            return (
              <div
                key={res.id}
                className="p-4 rounded-2xl bg-white/80 hover:bg-white/95 backdrop-blur-sm border border-white/70 hover:border-purple-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative"
              >
                <div>
                  {/* Category & Subcategory / Portal badges + Favorite toggle */}
                  <div className="flex items-center justify-between gap-1 mb-2.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${catColors.bg} ${catColors.text} border ${catColors.border}`}
                      >
                        {res.category}
                      </span>
                      {res.subcategory && (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                          {res.subcategory}
                        </span>
                      )}
                      {isCategoryPortal && (
                        <span className="text-[9.5px] font-bold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200/70">
                          Browse Category
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => toggleFavorite(res.id)}
                      className={`p-1.5 rounded-xl transition-all ${
                        isFav
                          ? "text-rose-500 bg-rose-50 hover:bg-rose-100"
                          : "text-gray-300 hover:text-rose-400 hover:bg-gray-100/70"
                      }`}
                      title={isFav ? "Remove from favorites" : "Add to favorites"}
                    >
                      <Heart size={15} className={isFav ? "fill-rose-500 text-rose-500" : ""} />
                    </button>
                  </div>

                  {/* Game Name */}
                  <h3
                    className="font-bold text-base text-gray-900 group-hover:text-purple-900 transition-colors truncate"
                    style={{ fontFamily: "Fredoka, sans-serif" }}
                    title={res.name}
                  >
                    {res.name}
                  </h3>

                  {/* Description */}
                  {res.description && (
                    <p className="text-xs text-gray-600 mt-1.5 line-clamp-3 leading-relaxed">
                      {res.description}
                    </p>
                  )}

                  {/* Tags */}
                  {res.tags && res.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2.5">
                      {res.tags.slice(0, 4).map((tag) => (
                        <span
                          key={tag}
                          className="text-[9.5px] font-medium px-1.5 py-0.2 rounded bg-purple-50/70 text-purple-700/80 border border-purple-100/50"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Card Action */}
                <div className="mt-4 pt-3 border-t border-gray-100/80 flex items-center justify-between gap-2">
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-1.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    <span>{isCategoryPortal ? "Browse Hub" : "Play Now"}</span>
                    <ExternalLink size={12} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
