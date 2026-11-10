/** Mirrors Round in @metabook/core, restricted to what the ingest-rounds function accepts from the extension. */
export interface ExtensionRound {
  id: string;
  source: 'extension';
  playedAt: string;
  truth: { country: string };
  guess: { country: string };
  distanceKm?: number;
  score?: number;
}

/** content script -> background */
export type ContentMessage =
  | { type: 'capture'; gameKey: string; round: ExtensionRound }
  | { type: 'parse-failed'; reason: string };

/** popup -> background */
export type PopupMessage = { type: 'recheck' };

export type Message = ContentMessage | PopupMessage;

export interface ParseStatus {
  ok: boolean;
  reason?: string;
  at: string;
}

export interface Config {
  url: string;
  token: string;
}

export interface Status {
  /** true = server accepted the token; false = 401; undefined = unknown */
  paired?: boolean;
  /** false after a 403 (kill switch) until the popup re-checks */
  enabled?: boolean;
  lastCaptureAt?: string;
  lastError?: string;
  parse?: ParseStatus;
}

/** Most recently captured round, shown in the side panel. region/lat/lng are optional (the result screen is not known to expose them). */
export interface LastRound {
  truth: string;
  guess: string;
  region?: string;
  lat?: number;
  lng?: number;
  at: string;
}
