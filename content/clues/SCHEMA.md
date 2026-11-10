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
- GeoHints (https://geohints.com): category pages saved once from a browser into
  `content/sources/geohints/data.json` (photo categories: bollards, architecture, nature, sceneries,
  licence plates, Google vehicles, follow cars, rifts, house numbers, post boxes, sidewalks) and
  `signs.json` (`/meta/signs/*`). The `clues` step adds one clue per country and category
  (`id = <code>-gh-<category slug>`, e.g. `pl-gh-bollards`, `us-gh-googlevehicles-cars`,
  `fr-gh-signs-stop`) in a last step "More from GeoHints", with a generated title, summary and one
  paragraph of labels and regions; every item is an `example` image with a caption (SVG sign drawings:
  "Sign design: …"). `region` is set when every item carries the same region label. Countries listed
  under one image (a shared sign design) are each other's `sameAs`. Spots from the Maps links have
  `source: 'saved'`. Names are mapped by pool name and aliases (`Åland` → FI as a region); names
  that map to no pool country (Palestine, US Minor Outlying Islands, Antarctica) are reported.
- `links` step: resolves each image's Google Maps link (Plonk It's first, then GeoHints') (goo.gl / maps.app.goo.gl short links included)
  into `location` (pano, lat, lng, heading, pitch = t - 90, fov from the `y` value).
- `clues` step: writes this folder and `index.json`. Family from Plonk It tags, then keywords, else
  `other`. Sub-territory pages (`US-AK`, `US-HI`, `PT-AZ`, `PT-MA`) join their parent country with
  ids `<sub code>-<item id>` (e.g. `us-ak-x1y2`) and `region` set to the page title.
- `clueimages` step: copies each image into the private `clues` bucket as webp and sets `path`;
  SVG drawings are rasterised 1024 px wide on white first.

Licences: Plonk It content is CC BY-NC-SA 4.0. Metabook is a personal, non-commercial study app;
every clue keeps its `credit`. GeoHints content is used with its owner's permission for personal
study, with credit.
