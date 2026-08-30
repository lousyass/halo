import React, { useState, useMemo } from "react";
import {
  Search,
  ExternalLink,
  ChevronDown,
  X,
  Tv,
  Film,
  Sparkles,
  Layers,
  Radio,
  Download,
  Database,
  Subtitles,
  Wrench,
  Globe,
  Tag,
  Monitor,
  Flame,
} from "lucide-react";
import entertainmentSnapshot from "./data/entertainment/fmhy-video-snapshot.json";
import entertainmentIcon from "./assets/icons/entertainment.png";

/* ─────────────────────────────── types ─────────────────────────────── */

export interface LinkItem {
  label: string;
  url: string;
}

export interface EntertainmentResource {
  name: string;
  url: string;
  category: string;
  section: string | null;
  subsection: string | null;
  description: string;
  tags: string[];
  searchableText: string;
  all_links: LinkItem[];
  source: string;
}

/* ─────────────────────────── category icons ─────────────────────────── */

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Streaming Sites": Film,
  "Specialty Streaming": Tv,
  "Live TV / Sports": Radio,
  "Smart TV": Monitor,
  "Download Sites": Download,
  "Torrent Apps": Flame,
  "Torrent Sites": Layers,
  "Tracking / Databases": Database,
  "Subtitle Tools": Subtitles,
  "Helpful Sites / Tools": Wrench,
};

const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string; activeBg: string }> = {
  "Streaming Sites": { bg: "bg-purple-50", text: "text-purple-700", border: "border-purple-200", activeBg: "bg-purple-600" },
  "Specialty Streaming": { bg: "bg-pink-50", text: "text-pink-700", border: "border-pink-200", activeBg: "bg-pink-600" },
  "Live TV / Sports": { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", activeBg: "bg-emerald-600" },
  "Smart TV": { bg: "bg-sky-50", text: "text-sky-700", border: "border-sky-200", activeBg: "bg-sky-600" },
  "Download Sites": { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", activeBg: "bg-amber-600" },
  "Torrent Apps": { bg: "bg-orange-50", text: "text-orange-700", border: "border-orange-200", activeBg: "bg-orange-600" },
  "Torrent Sites": { bg: "bg-rose-50", text: "text-rose-700", border: "border-rose-200", activeBg: "bg-rose-600" },
  "Tracking / Databases": { bg: "bg-indigo-50", text: "text-indigo-700", border: "border-indigo-200", activeBg: "bg-indigo-600" },
  "Subtitle Tools": { bg: "bg-teal-50", text: "text-teal-700", border: "border-teal-200", activeBg: "bg-teal-600" },
  "Helpful Sites / Tools": { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", activeBg: "bg-blue-600" },
};

/* ─────────────────────────── ranking helper ─────────────────────────── */

function calculateMatchScore(resource: EntertainmentResource, query: string): number {
  const q = query.toLowerCase().trim();
  if (!q) return 0;

  const name = resource.name.toLowerCase();
  const desc = resource.description.toLowerCase();
  const cat = (resource.category || "").toLowerCase();
  const sec = (resource.section || "").toLowerCase();
  const subsec = (resource.subsection || "").toLowerCase();

  // 1. Exact / Full match in name
  if (name === q) return 1;

  // 2. Name starts with query or contains token prefix
  if (name.startsWith(q)) return 2;
  const nameTokens = name.split(/\s+/);
  if (nameTokens.some((t) => t.startsWith(q))) return 2.5;

  // 3. Name contains query substring
  if (name.includes(q)) return 3;

  // 4. Match in keywords / tags
  if (resource.tags.some((tag) => tag.toLowerCase() === q || tag.toLowerCase().includes(q))) return 4;

  // 5. Match in category / section / subsection
  if (cat.includes(q) || sec.includes(q) || subsec.includes(q)) return 5;

  // 6. Match in description
  if (desc.includes(q)) return 6;

  // 7. General fallback in searchable text
  if (resource.searchableText.includes(q)) return 7;

  return 999;
}

/* ─────────────────────────── main component ─────────────────────────── */

export function EntertainmentView() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedSection, setSelectedSection] = useState<string>("all");
  const [openLinksId, setOpenLinksId] = useState<string | null>(null);

  const allResources = useMemo(() => {
    return (entertainmentSnapshot.resources || []) as EntertainmentResource[];
  }, []);

  const snapshotDateFormatted = useMemo(() => {
    try {
      const d = new Date(entertainmentSnapshot.generated_at_utc);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return "Aug 2026";
    }
  }, []);

  // Distinct categories with resource counts
  const categoriesWithCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allResources.forEach((r) => {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [allResources]);

  // Distinct sections within current category
  const availableSections = useMemo(() => {
    if (selectedCategory === "all") {
      const secMap: Record<string, number> = {};
      allResources.forEach((r) => {
        if (r.section) secMap[r.section] = (secMap[r.section] || 0) + 1;
      });
      return Object.entries(secMap).sort((a, b) => b[1] - a[1]);
    }
    const secMap: Record<string, number> = {};
    allResources
      .filter((r) => r.category === selectedCategory)
      .forEach((r) => {
        const key = r.section || "General";
        secMap[key] = (secMap[key] || 0) + 1;
      });
    return Object.entries(secMap).sort((a, b) => b[1] - a[1]);
  }, [allResources, selectedCategory]);

  // Filtered and Deterministically Ranked resources
  const filteredResources = useMemo(() => {
    const trimmedQuery = search.trim().toLowerCase();

    return allResources
      .filter((r) => {
        // Category filter
        if (selectedCategory !== "all" && r.category !== selectedCategory) {
          return false;
        }

        // Section filter
        if (selectedSection !== "all") {
          if (selectedSection === "General") {
            if (r.section !== null && r.section !== "General") return false;
          } else if (r.section !== selectedSection) {
            return false;
          }
        }

        // Search query filter (matches any searchable field)
        if (trimmedQuery) {
          return (
            r.name.toLowerCase().includes(trimmedQuery) ||
            r.description.toLowerCase().includes(trimmedQuery) ||
            r.category.toLowerCase().includes(trimmedQuery) ||
            (r.section && r.section.toLowerCase().includes(trimmedQuery)) ||
            (r.subsection && r.subsection.toLowerCase().includes(trimmedQuery)) ||
            r.tags.some((t) => t.toLowerCase().includes(trimmedQuery)) ||
            r.searchableText.includes(trimmedQuery)
          );
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
  }, [allResources, search, selectedCategory, selectedSection]);

  const clearFilters = () => {
    setSearch("");
    setSelectedCategory("all");
    setSelectedSection("all");
  };

  return (
    <div className="space-y-6">
      {/* ── Header Banner ── */}
      <div className="p-5 md:p-6 rounded-3xl bg-white/75 backdrop-blur-md border border-white/70 shadow-sm relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-pink-100/80 border border-pink-200/70 p-2 flex items-center justify-center shrink-0 shadow-sm">
              <img src={entertainmentIcon} alt="Entertainment" className="w-8 h-8 object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl md:text-2xl font-black tracking-tight text-gray-800" style={{ fontFamily: "Fredoka, sans-serif", color: "#5B4B6D" }}>
                  Entertainment Directory
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-pink-100/90 text-pink-700 border border-pink-200/80">
                  Curated Snapshot • {snapshotDateFormatted}
                </span>
              </div>
              <p className="text-xs md:text-sm text-gray-600 mt-1">
                Static reference directory for streaming, anime, live TV, download sites & media databases.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
            <span className="text-xs font-bold px-3 py-1.5 rounded-xl bg-purple-50 text-purple-700 border border-purple-100">
              {allResources.length} Verified Sources
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
              placeholder="Search by name, category, anime, korean drama, live sports, subtitles..."
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
          {(search || selectedCategory !== "all" || selectedSection !== "all") && (
            <button
              onClick={clearFilters}
              className="px-3.5 py-2.5 rounded-2xl text-xs font-bold bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors shrink-0"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* ── Category Filter Pills ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-purple-900/70">
            Categories ({categoriesWithCounts.length})
          </span>
          <span className="text-[11px] font-bold text-gray-500">
            Showing {filteredResources.length} of {allResources.length} resources
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              setSelectedCategory("all");
              setSelectedSection("all");
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              selectedCategory === "all"
                ? "bg-purple-600 text-white shadow-sm scale-[1.02]"
                : "bg-white/70 hover:bg-white text-gray-700 border border-white/80"
            }`}
          >
            <Sparkles size={13} />
            <span>All Categories</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-md ${selectedCategory === "all" ? "bg-white/20" : "bg-black/5"}`}>
              {allResources.length}
            </span>
          </button>

          {categoriesWithCounts.map(([catName, count]) => {
            const Icon = CATEGORY_ICONS[catName] || Globe;
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
                  setSelectedSection("all");
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

        {/* ── Sub-Section Pills ── */}
        {availableSections.length > 1 && (
          <div className="p-3 rounded-2xl bg-white/40 border border-white/50 flex flex-wrap gap-1.5 items-center">
            <span className="text-[11px] font-bold text-gray-500 mr-1 flex items-center gap-1">
              <Tag size={11} /> Section:
            </span>
            <button
              onClick={() => setSelectedSection("all")}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                selectedSection === "all"
                  ? "bg-purple-700 text-white shadow-sm"
                  : "bg-white/70 hover:bg-white text-gray-600"
              }`}
            >
              All Sections
            </button>
            {availableSections.map(([secName, count]) => {
              const isSecActive = selectedSection === secName;
              return (
                <button
                  key={secName}
                  onClick={() => setSelectedSection(secName)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 ${
                    isSecActive
                      ? "bg-purple-700 text-white shadow-sm"
                      : "bg-white/70 hover:bg-white text-gray-600"
                  }`}
                >
                  <span>{secName}</span>
                  <span className={`text-[9px] px-1 rounded ${isSecActive ? "bg-white/20" : "bg-black/5"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Resource Cards Grid ── */}
      {filteredResources.length === 0 ? (
        <div className="p-12 text-center rounded-3xl bg-white/60 border border-white/60 shadow-sm max-w-md mx-auto my-8">
          <div className="text-4xl mb-3">🔍</div>
          <h3 className="text-lg font-bold text-gray-800 mb-1" style={{ fontFamily: "Fredoka, sans-serif" }}>
            No resources match your search
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Try adjusting your search query or switching to another category.
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
          {filteredResources.map((res, idx) => {
            const hasMultipleLinks = res.all_links && res.all_links.length > 1;
            const cardKey = `${res.name}-${res.category}-${idx}`;
            const isLinksOpen = openLinksId === cardKey;
            const catColors = CATEGORY_COLORS[res.category] || {
              bg: "bg-purple-50",
              text: "text-purple-700",
              border: "border-purple-200",
            };

            return (
              <div
                key={cardKey}
                className="p-4 rounded-2xl bg-white/80 hover:bg-white/95 backdrop-blur-sm border border-white/70 hover:border-purple-200/80 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group relative"
              >
                <div>
                  {/* Category & Section badges */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${catColors.bg} ${catColors.text} border ${catColors.border}`}
                    >
                      {res.category}
                    </span>
                    {res.section && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-gray-100 text-gray-600">
                        {res.section}
                      </span>
                    )}
                  </div>

                  {/* Resource Name */}
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
                      {res.tags.slice(0, 3).map((tag) => (
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

                {/* Card Actions */}
                <div className="mt-4 pt-3 border-t border-gray-100/80 flex items-center justify-between gap-2 relative">
                  {/* Primary Open link */}
                  <a
                    href={res.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-1.5 px-3 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-all"
                  >
                    <span>Open</span>
                    <ExternalLink size={12} />
                  </a>

                  {/* Mirrors / alternate links popover */}
                  {hasMultipleLinks && (
                    <div className="relative">
                      <button
                        onClick={() => setOpenLinksId(isLinksOpen ? null : cardKey)}
                        className="py-1.5 px-2.5 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold flex items-center gap-1 transition-all"
                        title="Alternate mirrors & links"
                      >
                        <span>Links ({res.all_links.length})</span>
                        <ChevronDown size={12} className={`transition-transform ${isLinksOpen ? "rotate-180" : ""}`} />
                      </button>

                      {isLinksOpen && (
                        <>
                          <div
                            className="fixed inset-0 z-10"
                            onClick={() => setOpenLinksId(null)}
                          />
                          <div className="absolute right-0 bottom-full mb-1.5 w-48 p-1.5 rounded-xl bg-white border border-gray-200 shadow-xl z-20 space-y-1">
                            <div className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-wide border-b border-gray-100">
                              All Mirrors & Links
                            </div>
                            <div className="max-h-44 overflow-y-auto space-y-0.5">
                              {res.all_links.map((link, lIdx) => (
                                <a
                                  key={lIdx}
                                  href={link.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="px-2 py-1.5 rounded-lg text-xs font-medium text-purple-900 hover:bg-purple-50 flex items-center justify-between gap-1 transition-colors"
                                >
                                  <span className="truncate">{link.label}</span>
                                  <ExternalLink size={11} className="text-gray-400 shrink-0" />
                                </a>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
