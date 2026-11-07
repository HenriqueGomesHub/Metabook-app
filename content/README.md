# Metabook content

STATUS: seed content, ALL items are `verified: false`. It was written from memory without web access
(WebFetch and curl were blocked), so every card and tip must be reviewed by the owner before it is trusted.
Anything the author was not highly confident about was left out. Each item's `source` is the page where
it can be checked.

## Reviewing
Open the item's `source`, check the fact, fix it if wrong, then set `"verified": true`. Delete items that
cannot be confirmed. `node content/validate.mjs` requires a boolean `verified` on every card and tip.
Flag `prompt.ratio` values (official height:width) especially need checking. Tip `answer` must equal a card
`answer` (country name, region id, UF code) or `ddd:br:pattern`.

Skipped for lack of confidence in official coverage: Georgia, Armenia, Vietnam, Nepal, Namibia, Egypt, Gulf
states other than UAE/Qatar. Add them to `pool.json` (and write cards) once confirmed.

Check coverage (included, but unsure they are in the official competitive pool): Cambodia, Sri Lanka,
Kazakhstan, Kyrgyzstan, Cyprus, Tanzania. Also confirm Nepal, Namibia and Oman before adding them.

Territories added to the pool without a flag card (they officially use a parent flag, or the own-flag ratio
was not confidently known): Réunion (uses the French flag), US Virgin Islands (flag ratio not confirmed).
Add a card once confirmed.

Flag ratios to check first: Dominican Republic (`do`) and Paraguay (`py`) (Paraguay's reverse side differs
from its obverse; DO's ratio is also unsure). Also double-check the territory ratios (fo 8:11, ax 17:26,
gu 5:9, je 3:5, li 3:5).

## Files
- `pool.json` - competitive pool: `{code, name, continent, in_pool}`. Editable config: GeoGuessr
  rotates competitive maps every 4 weeks, so set `in_pool` or add/remove entries as needed.
  Logic must read this file, never hard-code countries.
- `cards/flags.json`, `scripts.json`, `lookalikes.json`, `brazil.json` - Card objects (docs/spec.md section 4).
- `tips/*.json` - Tip objects `{id, answer, scope, text, source, verified}`.
- `chapters.json` - Brazil chapter definitions.
- `maps/br-states.json` - provided, do not modify.
- `validate.mjs` - `node content/validate.mjs` checks unique ids, required fields, http(s) sources,
  card.country in pool, options include answer, 2-digit area codes, known chapters.

## Sources policy
Every card and tip carries a `source` URL of the page where it can be checked, and `verified` says whether
that has been done (currently never). Anything the author was unsure of is omitted.

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
