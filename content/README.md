# Metabook content

STATUS: skeleton only. pool.json, cards/*.json and tips/*.json are empty arrays because the
authoring session could not open any source page (WebFetch permission was never granted and
direct network access was blocked), and the policy below forbids unverified facts.

## Files
- `pool.json` - competitive pool: `{code, name, continent, in_pool}`. Editable config: GeoGuessr
  rotates competitive maps every 4 weeks, so set `in_pool` or add/remove entries as needed.
  Logic must read this file, never hard-code countries.
- `cards/flags.json`, `scripts.json`, `lookalikes.json`, `brazil.json` - Card objects (docs/spec.md section 4).
- `tips/*.json` - Tip objects `{id, answer, scope, text, source}`.
- `chapters.json` - Brazil chapter definitions.
- `maps/br-states.json` - provided, do not modify.
- `validate.mjs` - `node content/validate.mjs` checks unique ids, required fields, http(s) sources,
  card.country in pool, options include answer, 2-digit area codes, known chapters.

## Sources policy
Every card and tip carries a `source` URL of a page that was actually opened and checked.
Anything unverifiable is omitted.

## Flag package decision
Candidate checked: `svg-country-flags@1.2.10` (renders from Wikipedia, 256 SVGs in `svg/<iso2 lowercase>.svg`,
GB home nations as `gb-eng` etc., Kosovo as `xk`). Its SVG `viewBox` mostly carries the true
proportions (de 5:3, ch 1:1, be 450x390, mc 750x600, va 1:1, np non-rectangular), BUT:
- the `width`/`height` attributes disagree with `viewBox` in places (ru: viewBox 9x6, height 3), so
  use `viewBox` only;
- some viewBoxes may not match official ratios (e.g. lu is 1000x600 = 5:3, ba is 16x8 = 2:1); these were NOT checked against an
  official source, so every flag's ratio must be verified before use and a per-card `prompt.ratio` override should win.
Not evaluated (no true-ratio claim known): `flag-icons` (4x3/1x1 only), `country-flags-icons` (3x2).
Recommendation: use svg-country-flags, render using `prompt.ratio` from the card, and spot-check against the override list.
