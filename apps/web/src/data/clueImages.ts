import type { ClueImage } from '@metabook/core';
import { useEffect, useState } from 'react';
import { useAppData } from '../app/AppData';
import type { Repository } from './repository';

/** Signs bucket paths; resolves the URLs it could sign, by path. */
export type Signer = (paths: string[]) => Promise<Record<string, string>>;

/** Signed URLs live an hour; reuse one for 50 minutes. */
export const SIGNED_TTL_MS = 50 * 60 * 1000;

interface Entry {
  url: string | null;
  expires: number;
}

/**
 * Turns clue images into URLs to show: a signed URL from the private `clues` bucket when the image
 * has a `path` and it can be signed, else its original `src`. Requests made in the same tick go
 * out as one batch; results (failures too) are cached for SIGNED_TTL_MS.
 */
export class ClueImageUrls {
  private readonly cache = new Map<string, Entry>();
  /** paths whose batch went out and has not come back */
  private readonly inflight = new Map<string, Promise<string | null>>();
  private queue = new Map<string, ((url: string | null) => void)[]>();
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly sign: Signer,
    private readonly now: () => number = Date.now,
  ) {}

  /** The URL to show right now, when it needs no request: no path, or a fresh signed URL. */
  peek(image: ClueImage): string | undefined {
    if (!image.path) return image.src;
    const hit = this.cache.get(image.path);
    if (!hit || hit.expires <= this.now()) return undefined;
    return hit.url ?? image.src;
  }

  async url(image: ClueImage): Promise<string> {
    const ready = this.peek(image);
    if (ready !== undefined) return ready;
    const signed = await this.request(image.path as string);
    return signed ?? image.src;
  }

  private request(path: string): Promise<string | null> {
    const sent = this.inflight.get(path);
    if (sent) return sent;
    const request = new Promise<string | null>((resolve) => {
      this.queue.set(path, [...(this.queue.get(path) ?? []), resolve]);
      this.timer ??= setTimeout(() => void this.flush(), 0);
    });
    this.inflight.set(path, request);
    return request;
  }

  private async flush() {
    const batch = this.queue;
    this.queue = new Map();
    this.timer = undefined;
    const paths = [...batch.keys()];
    let signed: Record<string, string> = {};
    try {
      signed = await this.sign(paths);
    } catch {
      // unsigned paths fall back to the original URLs
    }
    const expires = this.now() + SIGNED_TTL_MS;
    for (const path of paths) {
      const url = signed[path] ?? null;
      this.cache.set(path, { url, expires });
      this.inflight.delete(path);
      for (const resolve of batch.get(path) ?? []) resolve(url);
    }
  }
}

type Signing = Pick<Repository, 'signClueImages'>;

const resolvers = new WeakMap<Signing, ClueImageUrls>();

/** One resolver (and cache) per repository, so a session signs each path once. */
export function clueImageUrls(repo: Signing): ClueImageUrls {
  let resolver = resolvers.get(repo);
  if (!resolver) {
    resolver = new ClueImageUrls((paths) => repo.signClueImages(paths));
    resolvers.set(repo, resolver);
  }
  return resolver;
}

/** The URL to show for a clue image; undefined while its signed URL is on the way. */
export function useClueImageUrl(image: ClueImage | undefined): string | undefined {
  const { repo } = useAppData();
  const resolver = clueImageUrls(repo);
  const [url, setUrl] = useState(() => (image ? resolver.peek(image) : undefined));
  useEffect(() => {
    if (!image) return;
    const ready = resolver.peek(image);
    setUrl(ready);
    if (ready !== undefined) return;
    let live = true;
    void resolver.url(image).then((resolved) => live && setUrl(resolved));
    return () => {
      live = false;
    };
  }, [image, resolver]);
  return url;
}

const preloaded = new Set<string>();

/**
 * Warms the browser cache for the images upcoming cards show. Paths asked for in one call are
 * signed in one batch; each URL is fetched once.
 */
export function preloadClueImages(repo: Signing, images: ClueImage[]) {
  const resolver = clueImageUrls(repo);
  for (const image of images) {
    void resolver.url(image).then((url) => {
      if (preloaded.has(url)) return;
      preloaded.add(url);
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
    });
  }
}
