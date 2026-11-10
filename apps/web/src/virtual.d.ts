declare module 'virtual:country-names' {
  import type { CountryNames } from '@metabook/core';
  const names: CountryNames[];
  export default names;
}

declare module 'virtual:clue-catalogue' {
  import type { SlimCountry } from '@metabook/core';
  const catalogue: SlimCountry[];
  export default catalogue;
}

declare module 'virtual:clue-text' {
  /** By lower-case country code (the content/clues file name): each clue's text by clue id. */
  const loaders: Record<string, () => Promise<{ default: Record<string, string[]> }>>;
  export default loaders;
}
