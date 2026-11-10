# Content tools

Fetch the clue catalogue (Plonk It and Learnable Meta), facts and region maps into `content/`. They run
in GitHub Actions (`.github/workflows/content.yml`), because the sites are not reachable from every
machine. Each module also has a CLI or exported functions for local use.

## Running a job

1. Write `content/jobs/<name>.json`:

   ```json
   {"name":"clues-fetch","countries":"all","steps":["plonkit","learnablemeta","links","clues"],"budgetMinutes":80}
   ```

   - `countries`: lower-case ISO codes from `content/pool.json`, or `"all"` for every `in_pool` country.
   - `steps`: run in the order given (see below).
   - `budgetMinutes`: wall-clock budget shared by the clue steps of one job (default 80, inside the
     workflow's 90-minute timeout). When it runs out the step stops with `budgetHit: true`; everything
     done so far is saved and the next run carries on from there. For `mapillary` it is per country.
   - `refreshDays`: for `plonkit` and `learnablemeta`, re-fetch cached pages older than this many days
     (default: never re-fetch a cached page).

2. Push it to any branch but `main`. The workflow runs the job, then commits `content/` back to the
   same branch as `content: <name> [skip ci]`. Pull to see it.
3. Read `content/jobs/<name>.result.json`: per step, `ok`, `counts`, `errors` and `ms` (global steps
   report under `all`), plus `validation` (the output of `content/validate.mjs`). The file is rewritten
   after every step (`finishedAt` is `null` until the job is done). If the job itself crashes the file
   is `{ name, fatal, steps }` and the run still exits 0 so the results are committed.

To re-run a job, change something in its file (any extra field, e.g. `"run": 2`), or use **Run
workflow** in the Actions tab with the file path. Jobs pushed together run in parallel, so push
`clues-images.json` only after `clues-fetch` has committed its clues.

## Clue pipeline

Job files: `clues-fetch` (`plonkit`, `learnablemeta`, `links`, `clues`), then `clues-images`
(`clueimages`), and once `wipe-media` (`wipemedia`). Field by field description: `content/clues/SCHEMA.md`.

| Step | Does | Needs |
| --- | --- | --- |
| `plonkit` | Fetches https://www.plonkit.net/guide and every country page in it (not `spillover-countries`, `maps`, `beginners-guide`, `middle-earth`), one request every 4 s with a browser User-Agent. Each page's `__PRELOADED_DATA__` JSON plus `fetchedAt` goes to `content/sources/plonkit/<slug>.json`, the guide's to `_guide.json`. A page without the JSON (Cloudflare challenge) is retried after 30 s, 60 s, 90 s. Cached pages are skipped. | nothing |
| `learnablemeta` | Fetches https://learnablemeta.com/api/maps/ into `content/sources/learnablemeta/maps.json` and each map's `/maps/<geoguessrId>/__data.json` (SvelteKit devalue, unflattened with `devalue`) into `<geoguessrId>.json`: `mapName`, `authors`, `metas[{id, name, note, images, locationsCount, footer}]`. One request every 2 s; cached maps are skipped. | nothing |
| `links` | Resolves every short Google Maps image link of the cached Plonk It pages (goo.gl/maps, maps.app.goo.gl) by following up to 5 redirects by hand, one request per second, into `content/sources/links.json` (`{ "<short url>": { url } \| { error } }`). Cached links are skipped; 429/5xx/network errors are retried on the next run, and 20 failures in a row stop the step. | nothing |
| `clues` | Offline, from `content/sources`: writes `content/clues/<code>.json` (`ClueCountry`) for every pool country with a Plonk It page or a Learnable Meta meta, and `content/clues/index.json`. Deterministic, so re-runs give clean diffs; image `path`/`width`/`height` from `clueimages` are kept. Metas whose name prefix is no pool country are listed in the result as `unmatched`. Locally: `node tools/content/clues.mjs --sources <dir> --out <dir>`. | nothing |
| `clueimages` | Copies every clue image without `path` into the private `clues` bucket as `<code>/<image id>.webp` (1280 px wide at most, WebP q78; sharp also reads Learnable Meta's AVIF) and records `path`, `width`, `height`. 0.5 s between downloads per host; failures are listed and retried next run. | Supabase secrets, migration 0006 |
| `wipemedia` | Deletes every object of the old public `media` bucket (all folders), 100 per request, and reports the counts. | Supabase secrets |

How a clue is built:

- One clue per Plonk It `tip` item (`<code>-<item id>`), steps and order as on the page; other items
  (summary maps, dividers) are skipped. Family from the Plonk It tags, else the keyword found earliest
  in the first paragraph, then the whole text, else `other`; a sign's kind from keywords (tagged signs
  default to `chevron`). Title: family label plus the first clause of the first sentence.
- `region`: in a regional step only, the first-level region names (from `content/maps`) in the first
  sentence, at most 3. `lookalikes`: other pool countries named in the text (names and common aliases).
- Images: `id` = 12 hex chars of sha1(src); `location` from the image's Google Maps link; `giveaway`
  when the file name says map/summary/region/distribution or the text says "map" (a first guess).
- Sub-territory pages (Plonk It codes `US-AK`, `US-HI`, `PT-AZ`, `PT-MA`) join their parent country
  when the pool has no entry of their own: ids `us-ak-<item id>`, `region` = the page title, steps
  prefixed with it. Pages of countries outside the pool (`UM-MQ`, `AQ`, `CN`…) are skipped.
- A Learnable Meta meta goes to the country its name starts with ("Germany - Bollard"). When its
  footer links that country's Plonk It page and the thing's family has a Plonk It clue whose text
  shares enough words with the note, its images join that clue; otherwise it becomes its own clue
  `<code>-lm-<meta id>` in a "Learnable Meta" step. Metas repeated across maps count once.

## Older steps

The photo pipeline before the clue catalogue (`commons`, `mapillary`, `collect`, `pack`, `review`,
`rereview`, `rename`) is still in the code but no longer used; `facts`, `regions` and `generate` are.

| Step | Does | Needs |
| --- | --- | --- |
| `facts` | One Wikidata SPARQL query for the job's countries; fills `wikidata`, `drivingSide`, `tld`, `callingCode`, `languages`, `scripts` in `content/facts/<code>.json` **only where missing**. Notes and hand-set values are never changed; files with nothing new are not rewritten. | nothing |
| `commons` | Per subject, tries the Commons categories (`Utility poles in <Country>`, `License plates of` / `Vehicle registration plates of`, `Road signs in`, `Delineators in`, `Guard rails in`; also with "the" and Commons spellings such as "the Czech Republic"), walks subcategories to depth 2, keeps CC0 / public domain / CC BY / CC BY-SA files at least 800px wide, no logos, no SVGs except for signs. | Supabase secrets, migration 0003 |
| `mapillary` | Random 0.05° boxes inside the country (Natural Earth admin-0). `pole`: images that saw a detected utility pole; every other subject, and poles where nothing is detected, become roadside scenes filed as `bollard` (Mapillary has no bollard class). Photos at least 10 km apart, at most 3 per box. CC BY-SA 4.0, credited to the uploader. | `MAPILLARY_TOKEN`, Supabase secrets, migration 0003 |
| `regions` | `content/maps/<code>-regions.json` from Natural Earth admin-1, same shape as `br-states.json` (Mercator fitted to 640 wide, simplified, labels at centroids, capitals where Natural Earth names them). Brazil is skipped: `br-states.json` stays. | nothing |
| `collect` | Approved rows not yet in `content/media`: moves `candidates/<id>.webp` to `approved/<id>.webp` (unless it is already there), appends a `MediaItem` to `content/media/<code>.json`. A row with a `crop` (migration 0004) is downloaded, cropped and re-encoded like `images.mjs` (1024px max, q72, new 16px preview) and uploaded to `approved/<id>.webp` instead; its candidate file is kept so an interrupted run can redo the crop. Skips and reports a photo whose caption names its country. Never marks rows collected: `node tools/content/mark-collected.mjs` does that after the commit is pushed, so a failed run is retried. Pending and rejected rows are left alone. Approved `media_uses` (migration 0005) not collected yet each become their own `MediaItem`, cropped into `approved/<photo id>-<subject>-<crop hash>.webp`, with the use's subject and its note as caption unless the note names the country. | Supabase secrets |
| `pack` | Every pending candidate of the job's countries at 512px (WebP q70) in `review-pack/img/<id>.webp`, plus `review-pack/manifest.json`, for vision agents. Run by `.github/workflows/review-pack.yml` (push `content/jobs/pack.json` to a non-main branch), which force-pushes `review-pack/` to the orphan branch `review-pack`. | Supabase secrets |
| `review` | Applies the agents' `content/review/*.json` (format in `REVIEW_GUIDE.md`): rejects, or inserts suggested `media_uses` and marks the candidate `reviewed`. Only pending candidates are touched; invalid entries are reported in the result. Idempotent. Job file: `content/jobs/review-apply.json`. Check a file first with `node tools/content/review-check.mjs <file>`. | Supabase secrets, migration 0005 |
| `generate` | Rewrites `content/cards/generated-<code>.json` from facts and media (logic in `packages/core/src/generate.ts`). Never touches hand-written card files. | nothing |

`commons` and `mapillary` resize each photo to a 1280px-wide WebP (quality 78) with a 16px preview,
upload it to the public `media` bucket under `candidates/<id>.webp` (creating the bucket if
needed) and insert a `pending` row in `media_candidates`. The id is the first 12 hex characters of
`sha1(source_url)`, so neither ids nor storage paths say which country a photo is from. A Commons
description is stored as the curator-only `description` (shown read-only in `/curate`), never as the
caption. Curate them in the app at `/curate`, then
run a job with `collect` and `generate`.

## What gets generated

- A photo card per approved photo ("Where is this?", id `gen:<code>:<subject>:<mediaId>`), options from
  the matching note's `lookalikes`, then same-continent pool countries.
- A reverse `photo-choice` card per country and subject (`gen:<code>:<subject>:choice`) once that
  subject has photos from at least 3 other countries.
- Fact cards: driving side (left-driving countries only), `.tld` and calling code (skipped when another
  country shares the value), and one text card per `verified` + `distinctive` note without a photo.
  Note text is shown as the question, so it should not name the country.
- `where` cards (`gen:<code>:where:<noteId>`, type `region`, `map: '<code>'`): one per note whose `region`
  names exactly one state of the country's regions map (`<code>-regions.json`, or `br-states.json`),
  as an ISO 3166-2 code ("US-TX", suffix matched to the state code ignoring case) or else as a state name
  (exact, ignoring case and accents). Plain labels like "north" and ambiguous names are skipped, and a
  country gets these cards only once it has at least 4. The answer is the state code, clicked on the map.

Captions become alt text, so they must not name the country either. The generator drops a caption (and
falls back to "Photo of a <subject>") that contains the country's name, its ISO code as a word, or its
capital or a demonym when `content/facts/<code>.json` has `capital` / `demonym`; it skips notes that
contain the name or a demonym. `content/validate.mjs` fails on a media caption or image card alt that
names the country, and on a media licence that is not CC0, public domain, CC BY or CC BY-SA.

## Secrets and codes

- Repo secrets: `MAPILLARY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The service role key is only
  used here, never in `apps/web`.
- `SUPABASE_SERVICE_ROLE_KEY` may be a legacy `service_role` JWT or a new secret key (`sb_secret_…`).
  Keys starting with `sb_` are not JWTs, so they are sent as the `apikey` header only; any other key is
  sent as both `apikey` and `Authorization: Bearer`.
- Codes are lower case in file names, `facts.code`, `media.country` and the queue; cards keep the upper-case
  codes of `pool.json`. Photo ids and storage paths carry no code (card ids stay `gen:<cc>:<subject>:<mediaId>`).

## Tests

`npm test -w @metabook/content-tools` runs the parsers against hand-written fixtures in `test/fixtures/`.
