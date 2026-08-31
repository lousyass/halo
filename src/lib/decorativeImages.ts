/**
 * decorativeImages.ts
 * Manages static asset discovery, per-session random image selection,
 * and opacity/layout configuration for Halo Custom/Decorative Visual Mode.
 */

export interface VisualCustomizationSettings {
  mode: "simple" | "custom";
  background: boolean;
  calendar: boolean;
  dashboard_coming_soon: boolean;
  dashboard_all_tasks: boolean;
  dashboard_same_image: boolean;
  routine: boolean;
  diary: boolean;
}

export const DEFAULT_VISUAL_SETTINGS: VisualCustomizationSettings = {
  mode: "simple",
  background: true,
  calendar: true,
  dashboard_coming_soon: true,
  dashboard_all_tasks: true,
  dashboard_same_image: true,
  routine: true,
  diary: true,
};

// Map internal theme keys to folder names
export const THEME_FOLDER_MAP: Record<string, string> = {
  bloom: "blush-bloom",
  meadow: "mint-meadow",
  dusk: "golden-dusk",
  lilac: "lilac-dream",
  babyblue: "baby-blue",
  monochrome: "monochrome",
};

// Discover all decorative image files at build/bundle time via Vite glob
const rawImages = import.meta.glob<string>(
  "/src/assets/decorative/**/*.{png,jpg,jpeg,webp,svg,avif,PNG,JPG,JPEG,WEBP,SVG,AVIF}",
  { eager: true, import: "default" }
);

// Group images into structured pools
interface ImagePools {
  calendar: string[];
  diary: string[];
  themes: Record<string, {
    background: string[];
    dashboard: string[];
    routine: string[];
  }>;
}

function buildImagePools(): ImagePools {
  const pools: ImagePools = {
    calendar: [],
    diary: [],
    themes: {
      "blush-bloom": { background: [], dashboard: [], routine: [] },
      "mint-meadow": { background: [], dashboard: [], routine: [] },
      "golden-dusk": { background: [], dashboard: [], routine: [] },
      "lilac-dream": { background: [], dashboard: [], routine: [] },
      "baby-blue": { background: [], dashboard: [], routine: [] },
      "monochrome": { background: [], dashboard: [], routine: [] },
    },
  };

  Object.entries(rawImages).forEach(([path, url]) => {
    // Ignore .gitkeep or non-string imports
    if (typeof url !== "string" || path.endsWith(".gitkeep")) return;
    const normalized = path.replace(/\\/g, "/").toLowerCase();

    if (normalized.includes("/calendar/")) {
      pools.calendar.push(url);
    } else if (normalized.includes("/diary/")) {
      pools.diary.push(url);
    } else {
      for (const [folderName, catMap] of Object.entries(pools.themes)) {
        if (normalized.includes(`/themes/${folderName}/`)) {
          if (normalized.includes("/background/")) catMap.background.push(url);
          else if (normalized.includes("/dashboard/")) catMap.dashboard.push(url);
          else if (normalized.includes("/routine/")) catMap.routine.push(url);
        }
      }
    }
  });

  return pools;
}

const POOLS = buildImagePools();

// Session-scoped cache to ensure each component gets constant random image per session
const sessionPicks: Record<string, string | null> = {};
const preloadedUrls = new Set<string>();

/**
 * Helper to preload an image URL into browser cache for instant rendering
 */
export function preloadImage(url: string | null) {
  if (typeof window === "undefined" || !url || preloadedUrls.has(url)) return;
  preloadedUrls.add(url);
  const img = new Image();
  img.src = url;
}

function pickRandom(arr: string[]): string | null {
  if (!arr || arr.length === 0) return null;
  const idx = Math.floor(Math.random() * arr.length);
  const picked = arr[idx];
  preloadImage(picked);
  return picked;
}

/**
 * Exactly 12 unique, deterministically-ordered calendar images.
 * Deduplicates files sharing the same base name (e.g. '1 (1).jpeg' vs '1 (1).jpg')
 * and sorts using numeric natural key comparison:
 * Month 1 (Jan, index 0) -> "1 (1)"
 * Month 2 (Feb, index 1) -> "1 (2)"
 * ...
 * Month 12 (Dec, index 11) -> "1 (12)"
 */
export const CALENDAR_12_MONTHS: string[] = (() => {
  const calendarEntries = Object.entries(rawImages)
    .filter(([path, url]) => {
      if (typeof url !== "string" || path.endsWith(".gitkeep")) return false;
      const normalized = path.replace(/\\/g, "/").toLowerCase();
      return normalized.includes("/calendar/") || normalized.includes("/decorative/calendar/");
    })
    .sort(([pathA], [pathB]) =>
      pathA.localeCompare(pathB, undefined, { numeric: true, sensitivity: "base" })
    );

  const seenBases = new Set<string>();
  const uniqueUrls: string[] = [];

  for (const [path, url] of calendarEntries) {
    const filename = path.split("/").pop() || path;
    const base = filename.replace(/\.[^/.]+$/, "").toLowerCase();
    if (!seenBases.has(base)) {
      seenBases.add(base);
      uniqueUrls.push(url as string);
    }
  }

  return uniqueUrls.slice(0, 12);
})();

/**
 * Phased preloading strategy:
 * Tier 1: Current month image (immediate render)
 * Tier 2: Adjacent (previous & next) months (micro-task / 50ms deferral)
 * Tier 3: Remaining pool of 12 months (deferred idle background queue)
 */
export function preloadCalendarAround(monthIndex: number) {
  if (typeof window === "undefined" || CALENDAR_12_MONTHS.length === 0) return;

  const currentIdx = ((monthIndex % 12) + 12) % 12;
  const currentImg = CALENDAR_12_MONTHS[currentIdx];

  // Tier 1: Load current month immediately
  preloadImage(currentImg);

  // Tier 2: Preload adjacent (previous & next) months with micro-delay
  setTimeout(() => {
    const prevIdx = (currentIdx + 11) % 12;
    const nextIdx = (currentIdx + 1) % 12;
    preloadImage(CALENDAR_12_MONTHS[prevIdx]);
    preloadImage(CALENDAR_12_MONTHS[nextIdx]);

    // Tier 3: Preload the rest during browser idle time
    const scheduleIdle =
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback
        : (cb: () => void) => setTimeout(cb, 1000);

    scheduleIdle(() => {
      CALENDAR_12_MONTHS.forEach((src) => preloadImage(src));
    });
  }, 50);
}

/**
 * Returns the deterministic calendar image for a given month index (0 = January, 11 = December).
 * 100% stable, synchronous, O(1), no random reassignment, no race conditions.
 */
export function getCalendarMonthImage(monthIndex: number): string | null {
  const list = CALENDAR_12_MONTHS.length > 0 ? CALENDAR_12_MONTHS : POOLS.calendar;
  if (!list || list.length === 0) return null;
  const idx = ((monthIndex % list.length) + list.length) % list.length;
  return list[idx] || null;
}

/**
 * Retrieves the session-scoped decorative image for a specific theme and category.
 * If not already rolled this session, picks randomly from the matching pool and caches it.
 */
export function getDecorativeImage(
  category: "background" | "calendar" | "dashboard-upper" | "dashboard-lower" | "routine" | "diary",
  themeKey: string = "bloom",
  sameDashboardImage: boolean = true
): string | null {
  const folder = THEME_FOLDER_MAP[themeKey] || "blush-bloom";

  if (category === "calendar") {
    return getCalendarMonthImage(new Date().getMonth());
  }

  if (category === "diary") {
    const key = "diary";
    if (sessionPicks[key] === undefined) {
      sessionPicks[key] = pickRandom(POOLS.diary);
    }
    return sessionPicks[key];
  }

  if (category === "background") {
    const key = `bg-${folder}`;
    if (sessionPicks[key] === undefined) {
      sessionPicks[key] = pickRandom(POOLS.themes[folder]?.background || []);
    }
    return sessionPicks[key];
  }

  if (category === "routine") {
    const key = `routine-${folder}`;
    if (sessionPicks[key] === undefined) {
      sessionPicks[key] = pickRandom(POOLS.themes[folder]?.routine || []);
    }
    return sessionPicks[key];
  }

  if (category === "dashboard-upper" || category === "dashboard-lower") {
    const dashPool = POOLS.themes[folder]?.dashboard || [];
    if (dashPool.length === 0) return null;

    if (sameDashboardImage) {
      const key = `dash-same-${folder}`;
      if (sessionPicks[key] === undefined) {
        sessionPicks[key] = pickRandom(dashPool);
      }
      return sessionPicks[key];
    } else {
      const keyUpper = `dash-upper-${folder}`;
      const keyLower = `dash-lower-${folder}`;

      if (sessionPicks[keyUpper] === undefined || sessionPicks[keyLower] === undefined) {
        if (dashPool.length === 1) {
          sessionPicks[keyUpper] = dashPool[0];
          sessionPicks[keyLower] = dashPool[0];
        } else {
          const firstIdx = Math.floor(Math.random() * dashPool.length);
          let secondIdx = Math.floor(Math.random() * (dashPool.length - 1));
          if (secondIdx >= firstIdx) secondIdx += 1;
          sessionPicks[keyUpper] = dashPool[firstIdx];
          sessionPicks[keyLower] = dashPool[secondIdx];
        }
      }

      return category === "dashboard-upper" ? sessionPicks[keyUpper] : sessionPicks[keyLower];
    }
  }

  return null;
}
