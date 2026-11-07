import { existsSync, readFileSync } from 'node:fs';

/** Reads process.env plus a simple KEY=VALUE .env.local (process.env wins). */
export function loadEnv(file = new URL('../.env.local', import.meta.url)) {
  const out = {};
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
      if (!m || line.trimStart().startsWith('#')) continue;
      out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return { ...out, ...process.env };
}
