# Metabook content

## Verification status (November 2026)
Source notes: `sources/verification-2026-11.md` (checked in a browser against Wikipedia and plonkit.net;
the script prompts were checked against the matching-language Wikipedia article).

Verified (`verified: true`):
- Flag cards: every `prompt.ratio` was checked against the Wikipedia "Flag of ..." infobox; six were
  corrected (cy 2:3, ar 5:8, py 11:20, do 2:3, gu 22:41, mp 20:39). Flag tips are `false`: only the ratios
  were checked, not the tip wording. The 10 new flags (ge, xk, na, np, om, bm, cx, cc, st, pm) have verified cards.
  Nepal is non-rectangular, ratio `"1.219:1"` (height:width).
- Pool: coverage checked against Wikipedia "Google Street View coverage" (2026-11). Every pool country is in the
  official-coverage table. Tanzania removed; Georgia, Kosovo, Namibia, Nepal, Oman, Bermuda, Christmas Island,
  Cocos (Keeling) Islands, Sao Tome and Principe, Saint Pierre and Miquelon added. `pool.json` has no verified field.
  Still out (limited/landmark-only): Afghanistan, Belarus, China, Egypt, Iraq, Mali, Pakistan, Vietnam, Martinique;
  Armenia not assessed.
- Brazil area codes (DDD): all 67 mappings match pt.wikipedia. The pattern tips match the cards.
- Brazil chapter: region and meta cards and their tips were rebuilt from the Plonkit notes
  (`https://www.plonkit.net/brazil`). Exception: the Pantanal card and the Centre-West composition tip stay `false`.
- Script cards: every prompt is checked against its own-language Wikipedia article (the card `source`).
  Script tips stay `false`. Arabic was removed (it cannot separate Jordan from Oman/UAE/Qatar/Lebanon/Tunisia).

Still unverified (`verified: false`): all flag tips, script tips, all lookalike cards and tips, the Pantanal card,
and the Centre-West tips about Brasília and the region's states.

Missing flag cards: Reunion (uses the French flag), US Virgin Islands (ratio not checked). Add once confirmed.
All new flag SVGs exist in `node_modules/svg-country-flags/svg/` (xk, ge, na, np, om, bm, cx, cc, st, pm).

## Reviewing
Open the item's `source`, check the fact, fix it if wrong, then set `"verified": true`. Delete items that
cannot be confirmed. `node content/validate.mjs` requires a boolean `verified` on every card and tip.
Tip `answer` must equal a card `answer` (country name, region id, UF code) or `ddd:br:pattern`.

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
