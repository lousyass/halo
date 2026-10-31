/**
 * customThemeImages.ts
 * Handles client-side validation, resizing, WebP re-encoding under 400KB,
 * EXIF stripping via Canvas, and explicit storage deletion.
 */

import { supabase } from './supabase';

export type ThemeSlot = 'background' | 'dashboard' | 'routine' | 'calendar' | 'diary';

export const MAX_INPUT_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_OUTPUT_BYTES = 400 * 1024; // 400 KB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Validates input file type and size before any processing.
 */
export function validateThemeImageInput(file: File): { valid: boolean; error?: string } {
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported image format (${file.type || 'unknown'}). Please choose a JPEG, PNG, or WebP image.`,
    };
  }

  if (file.size > MAX_INPUT_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed upload size is 10 MB.`,
    };
  }

  return { valid: true };
}

/**
 * Calculates resized dimensions preserving aspect ratio.
 */
export function calculateTargetDimensions(
  width: number,
  height: number,
  maxLongEdgeOrSlot: number | ThemeSlot
): { width: number; height: number } {
  const maxLongEdge = typeof maxLongEdgeOrSlot === 'number'
    ? maxLongEdgeOrSlot
    : (maxLongEdgeOrSlot === 'background' || maxLongEdgeOrSlot === 'calendar' ? 1600 : 1200);

  if (width <= maxLongEdge && height <= maxLongEdge) {
    return { width, height };
  }
  if (width > height) {
    return {
      width: maxLongEdge,
      height: Math.round((height * maxLongEdge) / width),
    };
  }
  return {
    width: Math.round((width * maxLongEdge) / height),
    height: maxLongEdge,
  };
}

/**
 * Resizes, strips EXIF (by canvas rendering), and encodes to WebP <= 400 KB.
 */
export async function processThemeImage(
  file: File,
  slot: ThemeSlot
): Promise<Blob> {
  const maxLongEdge = slot === 'background' || slot === 'calendar' ? 1600 : 1200;

  // Load file into image
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);

  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to decode image file'));
      img.src = objectUrl;
    });

    const { width, height } = calculateTargetDimensions(
      img.naturalWidth || img.width,
      img.naturalHeight || img.height,
      maxLongEdge
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context not available');
    }

    // Drawing onto canvas strips all EXIF metadata
    ctx.drawImage(img, 0, 0, width, height);

    // Iteratively step down quality if needed until <= 400 KB
    let quality = 0.82;
    let blob: Blob | null = null;

    while (quality >= 0.28) {
      blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), 'image/webp', quality)
      );

      if (blob && blob.size <= MAX_OUTPUT_BYTES) {
        break;
      }
      quality -= 0.1;
    }

    if (!blob) {
      throw new Error('Failed to convert image to WebP');
    }

    return blob;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/**
 * Uploads processed WebP blob to the theme-images bucket at unguessable path.
 */
export async function uploadThemeImageToStorage(
  userId: string,
  themeId: string,
  blob: Blob
): Promise<{ path: string; publicUrl: string }> {
  const fileId = crypto.randomUUID();
  const path = `${userId}/${themeId}/${fileId}.webp`;

  const { error } = await supabase.storage
    .from('theme-images')
    .upload(path, blob, {
      contentType: 'image/webp',
      cacheControl: '31536000', // 1 year CDN cache
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload theme image: ${error.message}`);
  }

  const { data } = supabase.storage.from('theme-images').getPublicUrl(path);

  return {
    path,
    publicUrl: data.publicUrl,
  };
}

/**
 * Explicitly removes theme image objects from storage before row deletion.
 */
export async function deleteThemeImagesFromStorage(paths: string[]): Promise<void> {
  if (!paths || paths.length === 0) return;
  try {
    const { error } = await supabase.storage.from('theme-images').remove(paths);
    if (error) {
      console.warn('Storage deletion warning:', error.message);
    }
  } catch (err) {
    console.warn('Failed to delete storage objects:', err);
  }
}
