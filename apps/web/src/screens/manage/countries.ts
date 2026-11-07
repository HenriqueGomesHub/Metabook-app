import type { PoolCountry } from '@metabook/core';

/** Display name for a country code; unknown keys (such as card answers) are shown as they are. */
export function countryName(pool: PoolCountry[], key: string): string {
  return pool.find((country) => country.code === key.toUpperCase())?.name ?? key;
}

/** The code for what a learner typed: a pool country's name or its code, ignoring case. */
export function resolveCountry(pool: PoolCountry[], text: string): string | undefined {
  const wanted = text.trim().toLowerCase();
  if (!wanted) return undefined;
  return pool.find(
    (country) => country.name.toLowerCase() === wanted || country.code.toLowerCase() === wanted,
  )?.code;
}
