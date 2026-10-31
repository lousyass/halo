/**
 * customThemesStore.ts
 * Manages user-created custom themes and theme images with instant localStorage
 * startup caching, background Supabase revalidation, and pool registration.
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase';
import {
  CustomThemeRecord,
  CustomThemeImageRecord,
  deriveThemeTokens,
  DerivedThemeTokens,
} from './customThemeTokens';
import {
  registerCustomThemePools,
  unregisterCustomThemePools,
  CustomThemePools,
} from './decorativeImages';
import {
  ThemeSlot,
  processThemeImage,
  uploadThemeImageToStorage,
  deleteThemeImagesFromStorage,
} from './customThemeImages';

interface CachedThemesData {
  themes: CustomThemeRecord[];
  images: CustomThemeImageRecord[];
  cachedAt: number;
}

function getCacheKey(userId: string) {
  return `halo-custom-themes-${userId}`;
}

export function loadCachedThemes(userId: string): CachedThemesData {
  try {
    const raw = localStorage.getItem(getCacheKey(userId));
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed.themes) && Array.isArray(parsed.images)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('Failed to load custom themes cache:', e);
  }
  return { themes: [], images: [], cachedAt: 0 };
}

export function saveCachedThemes(
  userId: string,
  themes: CustomThemeRecord[],
  images: CustomThemeImageRecord[]
) {
  try {
    const data: CachedThemesData = {
      themes,
      images,
      cachedAt: Date.now(),
    };
    localStorage.setItem(getCacheKey(userId), JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save custom themes cache:', e);
  }
}

/**
 * Registers CDN URLs for all slots of each custom theme in decorativeImages.
 */
export function syncThemePools(
  themes: CustomThemeRecord[],
  images: CustomThemeImageRecord[]
) {
  for (const theme of themes) {
    const themeImages = images.filter((img) => img.theme_id === theme.id);
    const pools: CustomThemePools = {
      background: [],
      dashboard: [],
      routine: [],
      calendar: [],
      diary: [],
    };

    for (const img of themeImages) {
      const { data } = supabase.storage.from('theme-images').getPublicUrl(img.storage_path);
      if (data?.publicUrl) {
        pools[img.slot].push(data.publicUrl);
      }
    }

    registerCustomThemePools(theme.id, pools);
  }
}

export function useCustomThemes(userId: string) {
  // 1. Instant startup from localStorage cache
  const [cached] = useState(() => loadCachedThemes(userId));
  const [themes, setThemes] = useState<CustomThemeRecord[]>(cached.themes);
  const [images, setImages] = useState<CustomThemeImageRecord[]>(cached.images);
  const [loading, setLoading] = useState(true);

  // Sync initial cached pools immediately so custom themes load without delay
  useEffect(() => {
    if (cached.themes.length > 0) {
      syncThemePools(cached.themes, cached.images);
    }
  }, [cached]);

  // 2. Background revalidation
  const fetchLatest = useCallback(async () => {
    if (!userId) return;
    try {
      const [themesRes, imagesRes] = await Promise.all([
        supabase
          .from('custom_themes')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: true }),
        supabase
          .from('custom_theme_images')
          .select('*')
          .eq('user_id', userId),
      ]);

      if (themesRes.data && imagesRes.data) {
        const remoteThemes = themesRes.data as CustomThemeRecord[];
        const remoteImages = imagesRes.data as CustomThemeImageRecord[];

        setThemes(remoteThemes);
        setImages(remoteImages);
        saveCachedThemes(userId, remoteThemes, remoteImages);
        syncThemePools(remoteThemes, remoteImages);
      }
    } catch (err) {
      console.warn('Background revalidation error for custom themes:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchLatest();
  }, [fetchLatest]);

  // Helper to find a theme
  const getThemeById = useCallback(
    (themeId: string): CustomThemeRecord | undefined => {
      return themes.find((t) => t.id === themeId);
    },
    [themes]
  );

  // Helper to get derived tokens
  const getThemeTokens = useCallback(
    (themeId: string): DerivedThemeTokens | null => {
      const found = themes.find((t) => t.id === themeId);
      if (!found) return null;
      return deriveThemeTokens(found.primary_color, found.background_color, found.mode);
    },
    [themes]
  );

  // Helper to get images for a theme
  const getThemeImages = useCallback(
    (themeId: string) => {
      return images.filter((img) => img.theme_id === themeId);
    },
    [images]
  );

  // 3. Create Theme
  const createTheme = async (params: {
    name: string;
    mode: 'light' | 'dark';
    primaryColor: string;
    backgroundColor: string;
    imageFiles?: { slot: ThemeSlot; file: File }[];
  }): Promise<CustomThemeRecord> => {
    // Check max 5 themes
    if (themes.length >= 5) {
      throw new Error('Maximum limit of 5 custom themes reached. Delete an existing theme first.');
    }

    // Check duplicate name
    const trimmedName = params.name.trim();
    if (!trimmedName || trimmedName.length > 30) {
      throw new Error('Theme name must be between 1 and 30 characters.');
    }

    const duplicate = themes.some(
      (t) => t.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A theme named "${trimmedName}" already exists.`);
    }

    // Insert custom_themes row
    const { data: themeData, error: themeError } = await supabase
      .from('custom_themes')
      .insert({
        user_id: userId,
        name: trimmedName,
        mode: params.mode,
        primary_color: params.primaryColor,
        background_color: params.backgroundColor,
      })
      .select()
      .single();

    if (themeError || !themeData) {
      throw new Error(themeError?.message || 'Failed to create custom theme');
    }

    const createdTheme = themeData as CustomThemeRecord;
    const uploadedImages: CustomThemeImageRecord[] = [];

    // Process and upload image files if any
    if (params.imageFiles && params.imageFiles.length > 0) {
      for (const item of params.imageFiles) {
        try {
          const webpBlob = await processThemeImage(item.file, item.slot);
          const { path } = await uploadThemeImageToStorage(userId, createdTheme.id, webpBlob);

          const { data: imgData, error: imgError } = await supabase
            .from('custom_theme_images')
            .insert({
              user_id: userId,
              theme_id: createdTheme.id,
              slot: item.slot,
              storage_path: path,
            })
            .select()
            .single();

          if (!imgError && imgData) {
            uploadedImages.push(imgData as CustomThemeImageRecord);
          }
        } catch (uploadErr) {
          console.warn(`Failed to process/upload image for slot ${item.slot}:`, uploadErr);
        }
      }
    }

    const nextThemes = [...themes, createdTheme];
    const nextImages = [...images, ...uploadedImages];
    setThemes(nextThemes);
    setImages(nextImages);
    saveCachedThemes(userId, nextThemes, nextImages);
    syncThemePools(nextThemes, nextImages);

    return createdTheme;
  };

  // 4. Update Theme
  const updateTheme = async (
    themeId: string,
    updates: {
      name: string;
      mode: 'light' | 'dark';
      primaryColor: string;
      backgroundColor: string;
    },
    newImages?: { slot: ThemeSlot; file: File }[],
    deletedImageIds?: string[]
  ): Promise<CustomThemeRecord> => {
    const trimmedName = updates.name.trim();
    if (!trimmedName || trimmedName.length > 30) {
      throw new Error('Theme name must be between 1 and 30 characters.');
    }

    const duplicate = themes.some(
      (t) => t.id !== themeId && t.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (duplicate) {
      throw new Error(`A theme named "${trimmedName}" already exists.`);
    }

    // 1. Delete requested images: remove storage objects first, then rows
    let currentThemeImages = images.filter((i) => i.theme_id === themeId);
    if (deletedImageIds && deletedImageIds.length > 0) {
      const toDelete = currentThemeImages.filter((i) => deletedImageIds.includes(i.id));
      const pathsToDelete = toDelete.map((i) => i.storage_path);

      await deleteThemeImagesFromStorage(pathsToDelete);
      await supabase.from('custom_theme_images').delete().in('id', deletedImageIds);

      currentThemeImages = currentThemeImages.filter((i) => !deletedImageIds.includes(i.id));
    }

    // 2. Upload and insert new images
    const addedImages: CustomThemeImageRecord[] = [];
    if (newImages && newImages.length > 0) {
      for (const item of newImages) {
        try {
          const webpBlob = await processThemeImage(item.file, item.slot);
          const { path } = await uploadThemeImageToStorage(userId, themeId, webpBlob);

          const { data: imgData, error: imgError } = await supabase
            .from('custom_theme_images')
            .insert({
              user_id: userId,
              theme_id: themeId,
              slot: item.slot,
              storage_path: path,
            })
            .select()
            .single();

          if (!imgError && imgData) {
            addedImages.push(imgData as CustomThemeImageRecord);
          }
        } catch (uploadErr) {
          console.warn(`Failed to process/upload new image:`, uploadErr);
        }
      }
    }

    // 3. Update custom_themes row
    const { data: updatedData, error: updateError } = await supabase
      .from('custom_themes')
      .update({
        name: trimmedName,
        mode: updates.mode,
        primary_color: updates.primaryColor,
        background_color: updates.backgroundColor,
      })
      .eq('id', themeId)
      .select()
      .single();

    if (updateError || !updatedData) {
      throw new Error(updateError?.message || 'Failed to update theme');
    }

    const updatedTheme = updatedData as CustomThemeRecord;
    const nextThemes = themes.map((t) => (t.id === themeId ? updatedTheme : t));
    const nextImages = [
      ...images.filter(
        (i) => i.theme_id !== themeId || (!deletedImageIds?.includes(i.id))
      ),
      ...addedImages,
    ];

    setThemes(nextThemes);
    setImages(nextImages);
    saveCachedThemes(userId, nextThemes, nextImages);
    syncThemePools(nextThemes, nextImages);

    return updatedTheme;
  };

  // 5. Duplicate Theme
  const duplicateTheme = async (themeId: string): Promise<CustomThemeRecord> => {
    if (themes.length >= 5) {
      throw new Error('Maximum limit of 5 custom themes reached. Delete an existing theme first.');
    }

    const source = themes.find((t) => t.id === themeId);
    if (!source) throw new Error('Source theme not found');

    // Create unique copy name (max 30 chars)
    let copyName = `${source.name} (Copy)`.slice(0, 30);
    let counter = 1;
    while (themes.some((t) => t.name.toLowerCase() === copyName.toLowerCase())) {
      copyName = `${source.name} (${counter})`.slice(0, 30);
      counter++;
    }

    // Create new theme row
    const { data: newThemeData, error: newThemeError } = await supabase
      .from('custom_themes')
      .insert({
        user_id: userId,
        name: copyName,
        mode: source.mode,
        primary_color: source.primary_color,
        background_color: source.background_color,
      })
      .select()
      .single();

    if (newThemeError || !newThemeData) {
      throw new Error(newThemeError?.message || 'Failed to duplicate theme');
    }

    const clonedTheme = newThemeData as CustomThemeRecord;
    const sourceImages = images.filter((i) => i.theme_id === themeId);
    const clonedImages: CustomThemeImageRecord[] = [];

    // Duplicate images in storage and database
    for (const img of sourceImages) {
      try {
        const { data: fileBlob } = await supabase.storage
          .from('theme-images')
          .download(img.storage_path);

        if (fileBlob) {
          const { path } = await uploadThemeImageToStorage(userId, clonedTheme.id, fileBlob);
          const { data: newImgData } = await supabase
            .from('custom_theme_images')
            .insert({
              user_id: userId,
              theme_id: clonedTheme.id,
              slot: img.slot,
              storage_path: path,
            })
            .select()
            .single();

          if (newImgData) {
            clonedImages.push(newImgData as CustomThemeImageRecord);
          }
        }
      } catch (copyErr) {
        console.warn('Failed to clone theme image:', copyErr);
      }
    }

    const nextThemes = [...themes, clonedTheme];
    const nextImages = [...images, ...clonedImages];
    setThemes(nextThemes);
    setImages(nextImages);
    saveCachedThemes(userId, nextThemes, nextImages);
    syncThemePools(nextThemes, nextImages);

    return clonedTheme;
  };

  // 6. Delete Theme
  const deleteTheme = async (themeId: string): Promise<void> => {
    const toDeleteImages = images.filter((i) => i.theme_id === themeId);
    const paths = toDeleteImages.map((i) => i.storage_path);

    // Delete storage objects first
    await deleteThemeImagesFromStorage(paths);

    // Delete database theme (cascades custom_theme_images in database)
    const { error } = await supabase.from('custom_themes').delete().eq('id', themeId);
    if (error) {
      throw new Error(`Failed to delete theme: ${error.message}`);
    }

    unregisterCustomThemePools(themeId);

    const nextThemes = themes.filter((t) => t.id !== themeId);
    const nextImages = images.filter((i) => i.theme_id !== themeId);
    setThemes(nextThemes);
    setImages(nextImages);
    saveCachedThemes(userId, nextThemes, nextImages);
  };

  return {
    themes,
    images,
    loading,
    getThemeById,
    getThemeTokens,
    getThemeImages,
    createTheme,
    updateTheme,
    duplicateTheme,
    deleteTheme,
    refresh: fetchLatest,
  };
}
