# Photo review guide (for vision agents)

You are reviewing candidate photos for Metabook, a GeoGuessr trainer. Learners see a photo crop
and must recognise the country from one clue: a bollard, a plate, a sign, and so on. Your job, for
every photo in the review pack: decide whether it is usable, and if it is, propose one or more
crops, each tagged with the subject it teaches. A human then approves or rejects each crop by
subject, so be precise and conservative.

## Input

The review pack (branch `review-pack`) holds:

- `review-pack/manifest.json`: an array of
  `{ id, country, subject, source, width, height, description, title }`.
  - `id` is the candidate's uuid; use it as-is in your output.
  - `country` is the lower-case ISO code the photo is supposed to be from.
  - `subject` is what the photo was searched for. It is a hint, not a rule: a photo searched as
    `bollard` may hold a better sign or guardrail.
  - `width`, `height` are the original image's pixel size.
  - `description`, `title` come from the source (Wikimedia Commons or Mapillary). They often name
    the place. Use them only to understand the photo, never copy them into a note.
- `review-pack/img/<id>.webp`: the photo, shrunk to at most 512px wide.

## Subjects and what makes a good crop

| subject | a good crop |
| --- | --- |
| `bollard` | The roadside post fills most of the crop: shape, cap, reflector and colours clearly visible. |
| `pole` | A utility pole with its shape, top, cross-arms or markings visible. |
| `plate` | The licence plate is legible, with its format and colours visible (band, letters, size). |
| `sign` | The sign face, the back of a sign, or a chevron, filling most of the crop. |
| `line` | Road markings (centre and edge lines) with some road around them to show colour and pattern. |
| `guardrail` | The rail and at least one post visible. |
| `language` | Legible text in the local language (shop signs, notices, road text). |
| `car` | GeoGuessr-relevant vehicle parts: Google car, roof rack, antenna, snorkel, the car's shadow. |
| `landscape` | A wide scene: terrain, vegetation, soil, sky. Usually most of the image. |
| `architecture` | A wide scene of buildings: roofs, walls, fences, building styles. |
| `other` | A clear, useful clue that fits none of the above. Use sparingly. |

One photo can give several uses, for example a `sign` crop and a `guardrail` crop. Prefer 1 to 3
uses per photo; never more than 4. Only propose a use when the clue is clear in the crop. Two crops
of the same subject from one photo should show different objects, not the same one framed twice.

## Reject the photo when

- the country cues are wrong (the plates, signs, driving side or script clearly belong to another
  country than `country`);
- it has a watermark, a logo, or a text overlay (captions, dates, credits drawn on the image);
- it is mostly blurry, too dark, or the clue is too small to read even when cropped;
- it is a close-up of something irrelevant (a person, an animal, food, an interior);
- it duplicates another photo in the pack (same scene, same moment). Keep the better one.

Rejecting is cheap; a misleading card is not. When in doubt, reject.

## Giveaway rule

A crop must not include text that names a place: no town names on signs, no country names, no
region names, no street names that identify the country, no national domain or flag stickers with
the name. The single exception: town names on signs are fine for the `language` subject only, and
even then never the country's name. If a giveaway sits next to the clue, crop it out; if you cannot
crop it out with a crop of at least 10% per side, drop that use (or reject the photo if nothing is
left).

Notes follow the same rule: a note must not name the country, a region or a town. Write a note as
alt text for the learner, describing what is visible ("Black-and-white post with a red reflector"),
or leave it out.

## Crop convention

A crop is `{ "x", "y", "w", "h" }`, fractions 0..1 of the full image:

- `x`, `y`: the top-left corner (0,0 is the image's top left);
- `w`, `h`: the width and height;
- every value is between 0 and 1, `w` and `h` are each at least 0.1, and `x + w` and `y + h` are at
  most 1.

The fractions are relative to the whole image, so they are the same on the 512px copy and on the
original. The whole image is `{ "x": 0, "y": 0, "w": 1, "h": 1 }`. Use up to 3 decimals.

## Output

One JSON file per batch, named like `content/review/<batch>.json`: an array with exactly one entry
per photo you reviewed.

```json
[
  {
    "id": "6f1c2a9e-1d4b-4c1e-9a77-0b8f3c2d5e10",
    "uses": [
      { "subject": "sign", "crop": { "x": 0.52, "y": 0.18, "w": 0.3, "h": 0.34 }, "note": "Yellow diamond priority sign" },
      { "subject": "guardrail", "crop": { "x": 0, "y": 0.55, "w": 0.6, "h": 0.4 } }
    ]
  },
  { "id": "0a9d3e61-7c25-4b8f-8f02-3e5a6c1b9d47", "reject": "watermark" }
]
```

Rules:

- every entry has `id` and exactly one of `reject` (a short reason) or `uses` (1 to 4 items);
- each use has `subject` (one of the subjects above), `crop`, and an optional `note`;
- no id twice, in this file or across files.

Before handing a file back, check it:

```sh
node tools/content/review-check.mjs content/review/<batch>.json --manifest review-pack/manifest.json
```

It prints each problem and exits 1 when there are any. Fix them and run it again.
