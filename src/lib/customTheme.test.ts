import { describe, it, expect } from 'vitest';
import {
  getRelativeLuminance,
  getContrastRatio,
  validateThemeContrast,
  deriveThemeTokens,
} from './customThemeTokens';
import {
  validateThemeImageInput,
  calculateTargetDimensions,
} from './customThemeImages';

describe('Custom Theme Color Math and Contrast', () => {
  it('correctly calculates relative luminance for standard colors', () => {
    // Pure black should have luminance 0
    expect(getRelativeLuminance('#000000')).toBeCloseTo(0, 4);
    // Pure white should have luminance 1
    expect(getRelativeLuminance('#ffffff')).toBeCloseTo(1, 4);
    // Mid gray
    const grayLum = getRelativeLuminance('#808080');
    expect(grayLum).toBeGreaterThan(0.2);
    expect(grayLum).toBeLessThan(0.3);
  });

  it('correctly computes WCAG 2.1 contrast ratios', () => {
    // Black and white is 21:1
    const maxContrast = getContrastRatio('#000000', '#ffffff');
    expect(maxContrast).toBeCloseTo(21, 1);

    // Identical colors have 1:1 contrast
    const sameContrast = getContrastRatio('#ffffff', '#ffffff');
    expect(sameContrast).toBeCloseTo(1, 1);

    // Dark text (#1e1b4b) on light surface (#ffffff)
    const darkOnWhite = getContrastRatio('#1e1b4b', '#ffffff');
    expect(darkOnWhite).toBeGreaterThanOrEqual(4.5);
  });

  it('deriveThemeTokens generates full token set guaranteeing WCAG AA contrast', () => {
    // Light mode with a cute pastel pink primary and soft background
    const lightTokens = deriveThemeTokens('#ec4899', '#fdf2f8', 'light');

    expect(lightTokens.mode).toBe('light');
    expect(lightTokens.surface).toBeDefined();
    expect(lightTokens.surfaceSolid).toBe('#ffffff');
    expect(lightTokens.primary).toBe('#ec4899');
    expect(lightTokens.backgroundCss).toContain('linear-gradient');

    // Body text on solid surface must satisfy WCAG AA (>= 4.5:1)
    const bodyContrast = getContrastRatio(
      lightTokens.textBody,
      lightTokens.surfaceSolid
    );
    expect(bodyContrast).toBeGreaterThanOrEqual(4.5);

    // Button label on primary button must satisfy WCAG AA (>= 4.5:1)
    const buttonContrast = getContrastRatio(
      lightTokens.primaryText,
      lightTokens.primary
    );
    expect(buttonContrast).toBeGreaterThanOrEqual(4.5);

    // Dark mode with an indigo primary and dark slate background
    const darkTokens = deriveThemeTokens('#6366f1', '#0f172a', 'dark');
    expect(darkTokens.mode).toBe('dark');
    expect(darkTokens.surface).toBeDefined();
    expect(darkTokens.surfaceSolid).toBe('#1c1d24');

    const darkBodyContrast = getContrastRatio(
      darkTokens.textBody,
      darkTokens.surfaceSolid
    );
    expect(darkBodyContrast).toBeGreaterThanOrEqual(4.5);

    const darkButtonContrast = getContrastRatio(
      darkTokens.primaryText,
      darkTokens.primary
    );
    expect(darkButtonContrast).toBeGreaterThanOrEqual(4.5);
  });

  it('validateThemeContrast flags combinations failing WCAG AA (4.5:1) or mode bounds', () => {
    // Dark background used in light mode should produce a warning
    const darkBgInLightCheck = validateThemeContrast('#8b5cf6', '#111827', 'light');
    expect(darkBgInLightCheck.warnings.length).toBeGreaterThan(0);
    expect(darkBgInLightCheck.warnings.some((w) => w.includes('Light mode background is quite dark'))).toBe(true);

    // Bright background used in dark mode should produce a warning
    const brightBgInDarkCheck = validateThemeContrast('#8b5cf6', '#ffffff', 'dark');
    expect(brightBgInDarkCheck.warnings.length).toBeGreaterThan(0);
    expect(brightBgInDarkCheck.warnings.some((w) => w.includes('Dark mode background is quite bright'))).toBe(true);

    // Good contrast pair
    const goodCheck = validateThemeContrast('#7c3aed', '#faf5ff', 'light');
    expect(goodCheck.valid).toBe(true);
    expect(goodCheck.warnings.length).toBe(0);
  });
});

describe('Custom Theme Image Validation & Resizing', () => {
  it('validates allowed image MIME types and rejects unsupported formats', () => {
    const pngFile = new File(['dummy'], 'sample.png', { type: 'image/png' });
    const jpegFile = new File(['dummy'], 'sample.jpg', { type: 'image/jpeg' });
    const webpFile = new File(['dummy'], 'sample.webp', { type: 'image/webp' });
    const gifFile = new File(['dummy'], 'sample.gif', { type: 'image/gif' });
    const textFile = new File(['dummy'], 'sample.txt', { type: 'text/plain' });

    expect(validateThemeImageInput(pngFile).valid).toBe(true);
    expect(validateThemeImageInput(jpegFile).valid).toBe(true);
    expect(validateThemeImageInput(webpFile).valid).toBe(true);

    const gifResult = validateThemeImageInput(gifFile);
    expect(gifResult.valid).toBe(false);
    expect(gifResult.error).toContain('JPEG, PNG, or WebP');

    const txtResult = validateThemeImageInput(textFile);
    expect(txtResult.valid).toBe(false);
  });

  it('rejects files larger than 10MB', () => {
    // Create mock 11MB file
    const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], 'large.png', {
      type: 'image/png',
    });
    const result = validateThemeImageInput(largeFile);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('10 MB');
  });

  it('calculates proper target dimensions bounded by slot specifications', () => {
    // Slot 'background' & 'calendar': max 1600px long edge
    const bgDims = calculateTargetDimensions(3200, 1800, 'background');
    expect(bgDims.width).toBe(1600);
    expect(bgDims.height).toBe(900);

    const calDims = calculateTargetDimensions(1000, 2000, 'calendar');
    expect(calDims.height).toBe(1600);
    expect(calDims.width).toBe(800);

    // Slot 'dashboard', 'routine', 'diary': max 1200px long edge
    const dashDims = calculateTargetDimensions(2400, 1600, 'dashboard');
    expect(dashDims.width).toBe(1200);
    expect(dashDims.height).toBe(800);

    const routineDims = calculateTargetDimensions(800, 1600, 'routine');
    expect(routineDims.height).toBe(1200);
    expect(routineDims.width).toBe(600);

    // Image smaller than max dimensions is not scaled up
    const smallDims = calculateTargetDimensions(600, 400, 'diary');
    expect(smallDims.width).toBe(600);
    expect(smallDims.height).toBe(400);
  });
});
