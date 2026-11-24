/* Tiny Web Audio blips for right/wrong feedback (no assets needed), and the course's progress,
   kept in this browser. */

let audioCtx: AudioContext | null = null;

export function beep(kind: 'good' | 'bad') {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx = audioCtx ?? new Ctx();
    const ctx = audioCtx;
    const play = (freq: number, start: number, dur: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + start;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    if (kind === 'good') {
      play(587, 0, 0.12);
      play(880, 0.1, 0.18);
    } else play(170, 0, 0.22);
  } catch {
    /* audio unavailable */
  }
}

export interface CyrillicProgress {
  /** ids of finished lessons */
  completed: number[];
  xp: number;
  bestStreaks: { letters: number; words: number; cities: number };
}

export const EMPTY: CyrillicProgress = {
  completed: [],
  xp: 0,
  bestStreaks: { letters: 0, words: 0, cities: 0 },
};

const KEY = 'metabook.cyrillic';

export function loadProgress(): CyrillicProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const saved = JSON.parse(raw) as Partial<CyrillicProgress>;
    return {
      completed: Array.isArray(saved.completed) ? saved.completed : [],
      xp: typeof saved.xp === 'number' ? saved.xp : 0,
      bestStreaks: { ...EMPTY.bestStreaks, ...(saved.bestStreaks ?? {}) },
    };
  } catch {
    return EMPTY;
  }
}

export function saveProgress(progress: CyrillicProgress) {
  try {
    localStorage.setItem(KEY, JSON.stringify(progress));
  } catch {
    /* storage unavailable: progress lasts this visit */
  }
}
