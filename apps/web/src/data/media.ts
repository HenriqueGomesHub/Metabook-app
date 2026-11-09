import type { MediaItem } from '@metabook/core';

const files = import.meta.glob<MediaItem[]>('../../../../content/media/*.json', {
  import: 'default',
});

/** Approved photos by id. Their `url` is a path in the `media` bucket, resolved by `mediaUrl`. Filled in place by `loadMedia`. */
export const mediaById = new Map<string, MediaItem>();

let loading: Promise<void> | undefined;

/** Fetches the photo registries once and fills `mediaById`. */
export function loadMedia(): Promise<void> {
  loading ??= Promise.all(Object.values(files).map((load) => load()))
    .then((registries) => {
      for (const item of registries.flat()) mediaById.set(item.id, item);
    })
    .catch((error: unknown) => {
      loading = undefined;
      throw error;
    });
  return loading;
}

/**
 * Where the public `media` bucket lives: `VITE_MEDIA_BASE` when set (local-mode deploys), else the
 * cloud project's public storage URL. Empty when neither is set; photos then show their alt text.
 */
export function mediaBase(env: { VITE_MEDIA_BASE?: string; VITE_SUPABASE_URL?: string }): string {
  if (env.VITE_MEDIA_BASE) return env.VITE_MEDIA_BASE.replace(/\/?$/, '/');
  if (env.VITE_SUPABASE_URL) {
    return `${env.VITE_SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/media/`;
  }
  return '';
}

const BASE = mediaBase(import.meta.env as Parameters<typeof mediaBase>[0]);

/** Absolute URLs pass through; bucket paths ("approved/<id>.webp") get the media base. */
export function mediaUrl(path: string, base = BASE): string {
  return /^(https?:|data:)/.test(path) ? path : `${base}${path}`;
}
