import type { MediaItem } from '@metabook/core';

const files = import.meta.glob<MediaItem[]>('../../../../content/media/*.json', {
  eager: true,
  import: 'default',
});

/** Approved photos by id. Their `url` is a path in the `media` bucket, resolved by `mediaUrl`. */
export const mediaById: ReadonlyMap<string, MediaItem> = new Map(
  Object.values(files)
    .flat()
    .map((item) => [item.id, item]),
);

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

/** Absolute URLs pass through; bucket paths ("approved/pl/x.webp") get the media base. */
export function mediaUrl(path: string, base = BASE): string {
  return /^(https?:|data:)/.test(path) ? path : `${base}${path}`;
}
