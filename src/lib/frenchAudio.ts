// Supabase Public Storage CDN Base URL for pre-generated native French audio clips
export const SUPABASE_AUDIO_BASE =
  "https://rzlktluhwayzlybncdbw.supabase.co/storage/v1/object/public/french-audio";

/**
 * Converts a French word to its deterministic hex storage file key.
 */
export function wordToAudioKey(word: string): string {
  const clean = word.trim().toLowerCase();
  const utf8 = new TextEncoder().encode(clean);
  let hex = "";
  for (let i = 0; i < utf8.length; i++) {
    hex += utf8[i].toString(16).padStart(2, "0");
  }
  return `${hex}.opus`;
}

/**
 * Returns the public CDN URL for a pre-generated word audio clip.
 */
export function getPreGeneratedAudioUrl(word: string): string {
  return `${SUPABASE_AUDIO_BASE}/${wordToAudioKey(word)}`;
}

let activeAudio: HTMLAudioElement | null = null;

/**
 * Plays pre-generated native audio clip if available, falling back to Web Speech API.
 */
export async function playFrenchAudio(
  text: string,
  fallbackWebSpeech: (t: string) => void
): Promise<void> {
  const clean = text.trim();
  if (!clean) return;

  try {
    if (activeAudio) {
      activeAudio.pause();
      activeAudio = null;
    }

    const audioUrl = getPreGeneratedAudioUrl(clean);
    const audio = new Audio(audioUrl);
    activeAudio = audio;

    let hasHandledError = false;

    audio.onerror = () => {
      if (!hasHandledError) {
        hasHandledError = true;
        fallbackWebSpeech(clean);
      }
    };

    const playPromise = audio.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        if (!hasHandledError) {
          hasHandledError = true;
          fallbackWebSpeech(clean);
        }
      });
    }
  } catch (err) {
    fallbackWebSpeech(clean);
  }
}
