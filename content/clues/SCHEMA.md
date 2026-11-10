# content/clues

One `<code>.json` per country (lower-case file name, upper-case `country` inside), shape `ClueCountry`
from `packages/core/src/clues.ts`. Written by the content pipeline, never by hand:

- `plonkit` step: fetches https://www.plonkit.net/guide and every country page (each embeds its data as
  JSON in `<script id="__PRELOADED_DATA__" type="application/json">`), one request every 4 s, cached in
  `content/sources/plonkit/<slug>.json`. Each `tip` item becomes one clue (`id = <code>-<item id>`),
  in step and item order. `centeredImage` items (summary maps) are skipped.
- `learnablemeta` step: fetches https://learnablemeta.com/api/maps/ and each map's
  `/maps/<geoguessrId>/__data.json` (SvelteKit devalue format), cached in
  `content/sources/learnablemeta/<geoguessrId>.json`. A meta whose images or note match a Plonk It clue
  adds its images there; otherwise it becomes its own clue (`<code>-lm-<meta id>`).
- `links` step: resolves each image's Google Maps link (goo.gl / maps.app.goo.gl short links included)
  into `location` (pano, lat, lng, heading, pitch = t - 90, fov from the `y` value).
- `clues` step: writes this folder. Family from Plonk It tags, then keywords, else `other`.
- `clueimages` step: copies each image into the private `clues` bucket as webp and sets `path`.

Licences: Plonk It content is CC BY-NC-SA 4.0. Metabook is a personal, non-commercial study app;
every clue keeps its `credit`.
