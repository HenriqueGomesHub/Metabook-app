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
   - `budgetMinutes`: wall-clock budget for the `mapillary` step, per country (default 12). When it runs
     out, sampling stops and that country's result carries `budgetHit: true`. Graph calls time out after
     15 s with one retry.

2. Push it (any branch). The workflow runs the job, then commits `content/` back to the same branch
   as `content: <name> [skip ci]`. Pull to see it.
3. Read `content/jobs/<name>.result.json`: per step and country, `ok`, `counts`, `errors` and `ms`,
   plus `validation` (the output of `content/validate.mjs`). One country failing never stops the others.
   The file is rewritten after every step (`finishedAt` is `null` until the job is done). If the job
   itself crashes (bad job file, unknown country, a missing import) the file is
   `{ name, fatal, steps }` with the steps finished so far, and the run still exits 0 so the results
   are committed. If the runner dies before `run-job` writes anything, the workflow commits a stub with
   a `fatal` pointing at the Actions log.

To re-run a job, change something in its file (or use **Run workflow** in the Actions tab with the
file path). Re-runs never duplicate photos: the queue skips anything it has seen, whatever its status.

## Steps

| Step | Does | Needs |
| --- | --- | --- |
| `facts` | One Wikidata SPARQL query for the job's countries; fills `wikidata`, `drivingSide`, `tld`, `callingCode`, `languages`, `scripts` in `content/facts/<code>.json` **only where missing**. Notes and hand-set values are never changed; files with nothing new are not rewritten. | nothing |
| `commons` | Per subject, tries the Commons categories (`Utility poles in <Country>`, `License plates of` / `Vehicle registration plates of`, `Road signs in`, `Delineators in`, `Guard rails in`; also with "the" and Commons spellings such as "the Czech Republic"), walks subcategories to depth 2, keeps CC0 / public domain / CC BY / CC BY-SA files at least 800px wide, no logos, no SVGs except for signs. | Supabase secrets, migration 0003 |
| `mapillary` | Random 0.05° boxes inside the country (Natural Earth admin-0). `pole`: images that saw a detected utility pole; every other subject, and poles where nothing is detected, become roadside scenes filed as `bollard` (Mapillary has no bollard class). Photos at least 10 km apart, at most 3 per box. CC BY-SA 4.0, credited to the uploader. | `MAPILLARY_TOKEN`, Supabase secrets, migration 0003 |
| `regions` | `content/maps/<code>-regions.json` from Natural Earth admin-1, same shape as `br-states.json` (Mercator fitted to 640 wide, simplified, labels at centroids, capitals where Natural Earth names them). Brazil is skipped: `br-states.json` stays. | nothing |
| `collect` | Approved rows not yet collected: moves `candidates/<id>.webp` to `approved/<id>.webp`, appends a `MediaItem` to `content/media/<code>.json`, marks the row collected. Pending and rejected rows are left alone. | Supabase secrets |
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
