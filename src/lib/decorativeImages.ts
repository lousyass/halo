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
  "/src/assets/decorative/**/*.{png,jpg,jpeg,webp,svg,avif,PNG,JPG,JPEG}",
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

    if (path.includes("/decorative/calendar/")) {
      pools.calendar.push(url);
    } else if (path.includes("/decorative/diary/")) {
      pools.diary.push(url);
    } else {
      for (const [folderName, catMap] of Object.entries(pools.themes)) {
        if (path.includes(`/decorative/themes/${folderName}/`)) {
          if (path.includes("/background/")) catMap.background.push(url);
          else if (path.includes("/dashboard/")) catMap.dashboard.push(url);
          else if (path.includes("/routine/")) catMap.routine.push(url);
        }
      }
    }
  });

  return pools;
}

const POOLS = buildImagePools();

// Session-scoped cache to ensure each component gets constant random image per session
const sessionPicks: Record<string, string | null> = {};

// Session-scoped 12 monthly calendar picks (indexed 0 to 11 for Jan..Dec)
let monthlyCalendarPicks: (string | null)[] | null = null;

/**
 * Helper to preload an image URL into browser cache for instant rendering
 */
function preloadImage(url: string | null) {
  if (typeof window !== "undefined" && url) {
    const img = new Image();
    img.src = url;
  }
}

function pickRandom(arr: string[]): string | null {
  if (!arr || arr.length === 0) return null;
  const idx = Math.floor(Math.random() * arr.length);
  const picked = arr[idx];
  preloadImage(picked);
  return picked;
}

/**
 * Returns a distinct session-scoped decorative image for each of the 12 calendar months.
 * Pre-assigns 12 strictly unique images from the shared calendar image pool upon first call
 * and preloads all 12 into the browser cache for zero-lag month switching.
 */
export function getCalendarMonthImage(monthIndex: number): string | null {
  const pool = Array.from(new Set(POOLS.calendar));
  if (pool.length === 0) return null;

  if (!monthlyCalendarPicks) {
    const shuffled = [...pool];
    // Fisher-Yates shuffle
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    if (shuffled.length >= 12) {
      monthlyCalendarPicks = shuffled.slice(0, 12);
    } else {
      // If pool has fewer than 12 images, cycle them after exhausting unique ones
      const repeated: string[] = [];
      while (repeated.length < 12) {
        repeated.push(...shuffled);
      }
      monthlyCalendarPicks = repeated.slice(0, 12);
    }

    // Preload all 12 images into browser cache immediately
    monthlyCalendarPicks.forEach(preloadImage);
  }

  const idx = ((monthIndex % 12) + 12) % 12;
  return monthlyCalendarPicks[idx] || null;
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
