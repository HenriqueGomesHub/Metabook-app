# Content tools

Fetch facts, photos and region maps into `content/`. They run in GitHub Actions
(`.github/workflows/content.yml`), because the APIs are not reachable from every machine. Each
module also has a CLI for local use (`node tools/content/<module>.mjs --help`-style flags in its
header comment).

## Running a job

1. Write `content/jobs/<name>.json`:

   ```json
   {
     "name": "pl-test",
     "countries": ["pl"],
     "steps": ["facts", "commons", "mapillary", "regions", "generate"],
     "subjects": ["bollard", "pole", "plate", "sign"],
     "perSubject": 30
   }
   ```

   - `countries`: lower-case ISO codes from `content/pool.json`, or `"all"` for every `in_pool` country.
   - `steps`: run in the order given; any of `facts`, `commons`, `mapillary`, `regions`, `collect`, `generate`.
   - `subjects`: for `commons` and `mapillary` (default `bollard, pole, plate, sign`).
   - `perSubject`: at most this many **new** photos queued per country and subject (default 40).

2. Push it (any branch). The workflow runs the job, then commits `content/` back to the same branch
   as `content: <name> [skip ci]`. Pull to see it.
3. Read `content/jobs/<name>.result.json`: per step and country, `ok`, `counts`, `errors` and `ms`,
   plus `validation` (the output of `content/validate.mjs`). One country failing never stops the others.

To re-run a job, change something in its file (or use **Run workflow** in the Actions tab with the
file path). Re-runs never duplicate photos: the queue skips anything it has seen, whatever its status.

## Steps

| Step | Does | Needs |
| --- | --- | --- |
| `facts` | One Wikidata SPARQL query for the job's countries; fills `wikidata`, `drivingSide`, `tld`, `callingCode`, `languages`, `scripts` in `content/facts/<code>.json` **only where missing**. Notes and hand-set values are never changed; files with nothing new are not rewritten. | nothing |
| `commons` | Per subject, tries the Commons categories (`Utility poles in <Country>`, `License plates of` / `Vehicle registration plates of`, `Road signs in`, `Delineators in`, `Guard rails in`; also with "the" and Commons spellings such as "the Czech Republic"), walks subcategories to depth 2, keeps CC0 / public domain / CC BY / CC BY-SA files at least 800px wide, no logos, no SVGs except for signs. | Supabase secrets, migration 0003 |
| `mapillary` | Random 0.05° boxes inside the country (Natural Earth admin-0). `pole`: images that saw a detected utility pole; every other subject, and poles where nothing is detected, become roadside scenes filed as `bollard` (Mapillary has no bollard class). Photos at least 10 km apart, at most 3 per box. CC BY-SA 4.0, credited to the uploader. | `MAPILLARY_TOKEN`, Supabase secrets, migration 0003 |
| `regions` | `content/maps/<code>-regions.json` from Natural Earth admin-1, same shape as `br-states.json` (Mercator fitted to 640 wide, simplified, labels at centroids, capitals where Natural Earth names them). Brazil is skipped: `br-states.json` stays. | nothing |
| `collect` | Approved rows not yet collected: moves `candidates/<code>/<id>.webp` to `approved/<code>/<id>.webp`, appends a `MediaItem` to `content/media/<code>.json`, marks the row collected. Pending and rejected rows are left alone. | Supabase secrets |
| `generate` | Rewrites `content/cards/generated-<code>.json` from facts and media (logic in `packages/core/src/generate.ts`). Never touches hand-written card files. | nothing |

`commons` and `mapillary` resize each photo to a 1280px-wide WebP (quality 78) with a 16px preview,
upload it to the public `media` bucket under `candidates/<code>/<id>.webp` (creating the bucket if
needed) and insert a `pending` row in `media_candidates`. Curate them in the app at `/curate`, then
run a job with `collect` and `generate`.

## What gets generated

- A photo card per approved photo ("Where is this?", id `gen:<code>:<subject>:<mediaId>`), options from
  the matching note's `lookalikes`, then same-continent pool countries.
- A reverse `photo-choice` card per country and subject (`gen:<code>:<subject>:choice`) once that
  subject has photos from at least 3 other countries.
- Fact cards: driving side (left-driving countries only), `.tld` and calling code (skipped when another
  country shares the value), and one text card per `verified` + `distinctive` note without a photo.
  Note text is shown as the question, so it should not name the country.

Captions become alt text, so they must not name the country either.

## Secrets and codes

- Repo secrets: `MAPILLARY_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. The service role key is only
  used here, never in `apps/web`.
- Codes are lower case in file names, storage paths, `facts.code`, `media.country` and the queue; cards keep
  the upper-case codes of `pool.json`.

## Tests

`npm test -w @metabook/content-tools` runs the parsers against hand-written fixtures in `test/fixtures/`.
