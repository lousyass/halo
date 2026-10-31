/**
 * customThemeTokens.ts
 * Computes full color token sets from (primary, background, mode),
 * enforces WCAG AA contrast (4.5:1), and applies tokens as CSS variables.
 */

export interface CustomThemeRecord {
  id: string;
  user_id: string;
  name: string;
  mode: 'light' | 'dark';
  primary_color: string;
  background_color: string;
  created_at: string;
  updated_at: string;
}

export interface CustomThemeImageRecord {
  id: string;
  user_id: string;
  theme_id: string;
  slot: 'background' | 'dashboard' | 'routine' | 'calendar' | 'diary';
  storage_path: string;
  created_at: string;
}

export interface DerivedThemeTokens {
  mode: 'light' | 'dark';
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryText: string; // text on primary button (guaranteed >= 4.5:1)
  background: string;
  backgroundCss: string; // linear-gradient or solid
  surface: string; // cards, modals
  surfaceSolid: string;
  surfaceBorder: string;
  textHeading: string;
  textBody: string; // guaranteed >= 4.5:1 on surface
  textSecondary: string;
  textMuted: string;
  timerBg: string;
  timerBorder: string;
  timerText: string;
  timerSubText: string;
  timerIcon: string;
  timerColon: string;
  timerBadgeBg: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Color Math & WCAG Contrast Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  let clean = hex.replace('#', '').trim();
  if (clean.length === 3) {
    clean = clean.split('').map((c) => c + c).join('');
  }
  const num = parseInt(clean, 16);
  if (isNaN(num)) return { r: 0, g: 0, b: 0 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (val: number) => Math.max(0, Math.min(255, Math.round(val)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((x) => x.toString(16).padStart(2, '0'))
      .join('')
  );
}

/**
 * Calculates sRGB relative luminance according to WCAG 2.1 specs.
 */
export function getRelativeLuminance(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const sRgb = [r / 255, g / 255, b / 255].map((c) => {
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * sRgb[0] + 0.7152 * sRgb[1] + 0.0722 * sRgb[2];
}

/**
 * Calculates WCAG contrast ratio between two colors (range 1:1 to 21:1).
 */
export function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getRelativeLuminance(hex1);
  const l2 = getRelativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Checks whether contrast meets WCAG AA (>= 4.5:1).
 */
export function meetsWcagAA(foreground: string, background: string): boolean {
  return getContrastRatio(foreground, background) >= 4.5;
}

/**
 * Lightens or darkens color by percentage (-1 to 1).
 */
export function adjustColor(hex: string, percent: number): string {
  const { r, g, b } = hexToRgb(hex);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent);
  return rgbToHex(
    Math.round((t - r) * p) + r,
    Math.round((t - g) * p) + g,
    Math.round((t - b) * p) + b
  );
}

/**
 * Selects either white (#ffffff) or black (#000000) depending on which provides
 * the highest contrast ratio >= 4.5:1 against the given background.
 */
export function getBestContrastTextColor(backgroundHex: string): string {
  const contrastWithWhite = getContrastRatio('#ffffff', backgroundHex);
  const contrastWithBlack = getContrastRatio('#000000', backgroundHex);
  return contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#000000';
}

/**
 * Ensures primary color guarantees >= 4.5:1 contrast for button text.
 * Clamps the color slightly if it falls within the narrow dead-zone (lum ~ 0.175-0.183).
 */
export function getGuaranteedContrastPrimary(primaryHex: string): {
  primary: string;
  primaryText: string;
} {
  let primary = primaryHex;
  let text = getBestContrastTextColor(primary);
  let ratio = getContrastRatio(text, primary);

  if (ratio < 4.5) {
    const lum = getRelativeLuminance(primary);
    if (lum < 0.179) {
      for (let step = -0.02; step >= -0.2; step -= 0.02) {
        const adjusted = adjustColor(primaryHex, step);
        if (getContrastRatio('#ffffff', adjusted) >= 4.5) {
          primary = adjusted;
          text = '#ffffff';
          break;
        }
      }
    } else {
      for (let step = 0.02; step <= 0.2; step += 0.02) {
        const adjusted = adjustColor(primaryHex, step);
        if (getContrastRatio('#000000', adjusted) >= 4.5) {
          primary = adjusted;
          text = '#000000';
          break;
        }
      }
    }
  }

  return { primary, primaryText: text };
}

/**
 * Checks contrast safety for a theme and returns warnings if any.
 */
export function validateThemeContrast(
  primary: string,
  background: string,
  mode: 'light' | 'dark'
): { valid: boolean; warnings: string[] } {
  const warnings: string[] = [];

  const surface = mode === 'dark' ? '#18181b' : '#ffffff';
  const bodyText = mode === 'dark' ? '#f4f4f5' : '#18181b';

  // 1. Body text on card surface
  const bodyOnSurfaceRatio = getContrastRatio(bodyText, surface);
  if (bodyOnSurfaceRatio < 4.5) {
    warnings.push(
      `Body text contrast (${bodyOnSurfaceRatio.toFixed(1)}:1) does not meet WCAG AA (4.5:1) on cards.`
    );
  }

  // 2. Button label on primary
  const btnTextColor = getBestContrastTextColor(primary);
  const btnRatio = getContrastRatio(btnTextColor, primary);
  if (btnRatio < 4.5) {
    warnings.push(
      `Button text contrast (${btnRatio.toFixed(1)}:1) on primary color is under WCAG AA (4.5:1). Consider choosing a slightly darker or lighter primary shade.`
    );
  }

  // 3. Background luminance check for mode
  const bgLum = getRelativeLuminance(background);
  if (mode === 'light' && bgLum < 0.45) {
    warnings.push('Light mode background is quite dark. Consider using a lighter tint.');
  } else if (mode === 'dark' && bgLum > 0.35) {
    warnings.push('Dark mode background is quite bright. Consider using a darker tint.');
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Full Token Set Derivation
// ─────────────────────────────────────────────────────────────────────────────

export function deriveThemeTokens(
  primary: string,
  background: string,
  mode: 'light' | 'dark'
): DerivedThemeTokens {
  const isDark = mode === 'dark';

  // Primary button label text guaranteed WCAG AA (with clamping if in dead zone)
  const { primary: safePrimary, primaryText } = getGuaranteedContrastPrimary(primary);
  const primaryHover = isDark ? adjustColor(safePrimary, 0.12) : adjustColor(safePrimary, -0.12);
  const primaryLight = isDark ? adjustColor(safePrimary, -0.35) : adjustColor(safePrimary, 0.35);

  // Background gradient derivation
  const bgGrad1 = isDark ? adjustColor(background, 0.04) : adjustColor(background, 0.05);
  const bgGrad2 = background;
  const bgGrad3 = isDark ? adjustColor(background, -0.04) : adjustColor(background, -0.05);
  const backgroundCss = `linear-gradient(135deg, ${bgGrad1} 0%, ${bgGrad2} 50%, ${bgGrad3} 100%)`;

  // Surface colors
  const surface = isDark ? 'rgba(28, 29, 36, 0.88)' : 'rgba(255, 255, 255, 0.82)';
  const surfaceSolid = isDark ? '#1c1d24' : '#ffffff';
  const surfaceBorder = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.65)';

  // Text colors
  const textHeading = isDark ? '#ffffff' : adjustColor(primary, -0.45);
  const textBody = isDark ? '#f3f4f6' : '#1f2937';
  const textSecondary = isDark ? '#9ca3af' : '#4b5563';
  const textMuted = isDark ? '#6b7280' : '#9ca3af';

  // Timer styles matching THEME_TIMER_STYLES structure
  const timerBg = isDark ? 'bg-zinc-800/90 hover:bg-zinc-700/80' : 'bg-white/90 hover:bg-white';
  const timerBorder = isDark ? 'border-zinc-700' : 'border-black/10';
  const timerText = isDark ? 'text-zinc-100' : 'text-zinc-900';
  const timerSubText = isDark ? 'text-zinc-400 font-semibold' : 'text-zinc-600 font-semibold';
  const timerIcon = isDark ? 'text-zinc-300' : 'text-zinc-600';
  const timerColon = isDark ? 'text-zinc-500' : 'text-zinc-400';
  const timerBadgeBg = `${safePrimary} ${primaryText}`;

  return {
    mode,
    primary: safePrimary,
    primaryHover,
    primaryLight,
    primaryText,
    background,
    backgroundCss,
    surface,
    surfaceSolid,
    surfaceBorder,
    textHeading,
    textBody,
    textSecondary,
    textMuted,
    timerBg,
    timerBorder,
    timerText,
    timerSubText,
    timerIcon,
    timerColon,
    timerBadgeBg,
  };
}

/**
 * Injects CSS variables onto document.documentElement for active custom themes.
 * When a built-in theme is active, resets the custom variables.
 */
export function applyThemeTokensToDOM(tokens: DerivedThemeTokens | null) {
  const root = document.documentElement;
  if (!tokens) {
    // Reset custom properties
    root.style.removeProperty('--theme-primary');
    root.style.removeProperty('--theme-primary-hover');
    root.style.removeProperty('--theme-primary-light');
    root.style.removeProperty('--theme-primary-text');
    root.style.removeProperty('--theme-bg');
    root.style.removeProperty('--theme-surface');
    root.style.removeProperty('--theme-surface-solid');
    root.style.removeProperty('--theme-surface-border');
    root.style.removeProperty('--theme-text-heading');
    root.style.removeProperty('--theme-text-body');
    root.style.removeProperty('--theme-text-secondary');
    root.style.removeProperty('--theme-text-muted');
    root.removeAttribute('data-theme-mode');
    root.classList.remove('theme-dark', 'theme-custom');
    return;
  }

  root.style.setProperty('--theme-primary', tokens.primary);
  root.style.setProperty('--theme-primary-hover', tokens.primaryHover);
  root.style.setProperty('--theme-primary-light', tokens.primaryLight);
  root.style.setProperty('--theme-primary-text', tokens.primaryText);
  root.style.setProperty('--theme-bg', tokens.background);
  root.style.setProperty('--theme-surface', tokens.surface);
  root.style.setProperty('--theme-surface-solid', tokens.surfaceSolid);
  root.style.setProperty('--theme-surface-border', tokens.surfaceBorder);
  root.style.setProperty('--theme-text-heading', tokens.textHeading);
  root.style.setProperty('--theme-text-body', tokens.textBody);
  root.style.setProperty('--theme-text-secondary', tokens.textSecondary);
  root.style.setProperty('--theme-text-muted', tokens.textMuted);

  root.setAttribute('data-theme-mode', tokens.mode);
  root.classList.add('theme-custom');
  if (tokens.mode === 'dark') {
    root.classList.add('theme-dark');
  } else {
    root.classList.remove('theme-dark');
  }
}
