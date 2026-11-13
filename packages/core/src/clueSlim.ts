// A compact encoding of the clue catalogue for the app's up-front download. It keeps everything cards,
// drills and lists need (ids, family, title, images with crops, Street View spots, lookalikes,
// credit) and leaves out the clue text, which the app loads per country when a clue is read. Text
// stays in for clues with no image a drill may show: they become text cards, whose question is the
// text. `expandCatalogue(slimCatalogue(x))` equals `x` with those fields emptied.
// Imports only clues.ts (itself import-free) so the web app's Vite config can run it at build time.
import { quizImages } from './clues';
import type { Clue, ClueCountry, ClueCredit, ClueImage, ClueLocation, CropBox } from './clues';

/** [pano ('' when none), lat, lng, heading, pitch, fov, source] */
type SlimLocation = [string, number, number, number, number, number, ClueLocation['source']];
/** The image review's fields, when any is set. */
type SlimImageExtra = Pick<ClueImage, 'role' | 'caption' | 'dupeOf'>;
/**
 * [id, src, path, width, height, crop, giveaway, location, extra?]: path 1 = "<country>/<id>.webp",
 * 0 = none; 0 also marks an absent width, height, crop or location.
 */
type SlimImage = [
  string,
  string,
  string | 0 | 1,
  number,
  number,
  [number, number, number, number] | 0,
  0 | 1,
  SlimLocation | 0,
  SlimImageExtra?,
];
/** A clue location: the index of the image carrying the same spot, else the spot itself. */
type SlimClueLocation = number | SlimLocation;
interface SlimExtra {
  region?: string;
  regionCode?: string;
  alsoRegions?: string[];
  kind?: Clue['kind'];
  text?: string[];
  summary?: string;
  sameAs?: string[];
  differs?: Clue['differs'];
}
/** [id, step, order, family, title, images, locations, lookalikes, credit index, extra] */
type SlimClue = [
  string,
  number,
  number,
  Clue['family'],
  string,
  SlimImage[],
  SlimClueLocation[],
  string[],
  number,
  SlimExtra | 0,
];

export interface SlimCountry {
  country: string;
  name: string;
  sourceUrl: string;
  updatedAt?: string;
  fetchedAt: string;
  steps: string[];
  credits: ClueCredit[];
  clues: SlimClue[];
}

/** Common URL starts, shortened in `src`. */
const PREFIXES: [string, string][] = [
  ['~l/', 'https://learnablemeta.com/images/'],
  ['~p/', 'https://www.plonkit.net/images/'],
  ['~g/', 'https://ocsc00skc0wokcs8kw8g8k84.geohints.com/storage/'],
];

const shorten = (src: string) => {
  const hit = PREFIXES.find(([, long]) => src.startsWith(long));
  return hit ? hit[0] + src.slice(hit[1].length) : src;
};
const lengthen = (src: string) => {
  const hit = PREFIXES.find(([short]) => src.startsWith(short));
  return hit ? hit[1] + src.slice(hit[0].length) : src;
};

const slimLocation = (l: ClueLocation): SlimLocation => [
  l.pano ?? '',
  l.lat,
  l.lng,
  l.heading,
  l.pitch,
  l.fov,
  l.source,
];

function expandLocation([pano, lat, lng, heading, pitch, fov, source]: SlimLocation): ClueLocation {
  return { ...(pano && { pano }), lat, lng, heading, pitch, fov, source };
}

const sameLocation = (a: ClueLocation, b: ClueLocation) =>
  JSON.stringify(slimLocation(a)) === JSON.stringify(slimLocation(b));

export function slimCatalogue(countries: ClueCountry[]): SlimCountry[] {
  return countries.map((country) => {
    const folder = country.country.toLowerCase();
    const credits: ClueCredit[] = [];
    const creditIndex = (credit: ClueCredit) => {
      const key = JSON.stringify(credit);
      let index = credits.findIndex((c) => JSON.stringify(c) === key);
      if (index < 0) index = credits.push(credit) - 1;
      return index;
    };
    const clues = country.clues.map((clue): SlimClue => {
      const images = clue.images.map((image): SlimImage => {
        const slim: SlimImage = [
          image.id,
          shorten(image.src),
          image.path === undefined
            ? 0
            : image.path === `${folder}/${image.id}.webp`
              ? 1
              : image.path,
          image.width ?? 0,
          image.height ?? 0,
          image.crop ? [image.crop.x, image.crop.y, image.crop.w, image.crop.h] : 0,
          image.giveaway ? 1 : 0,
          image.location ? slimLocation(image.location) : 0,
        ];
        const extra: SlimImageExtra = {
          ...(image.role !== undefined && { role: image.role }),
          ...(image.caption !== undefined && { caption: image.caption }),
          ...(image.dupeOf !== undefined && { dupeOf: image.dupeOf }),
        };
        if (Object.keys(extra).length > 0) slim.push(extra);
        return slim;
      });
      const locations = clue.locations.map((location): SlimClueLocation => {
        const index = clue.images.findIndex(
          (image) => image.location && sameLocation(image.location, location),
        );
        return index >= 0 ? index : slimLocation(location);
      });
      const extra: SlimExtra = {
        ...(clue.region !== undefined && { region: clue.region }),
        ...(clue.regionCode !== undefined && { regionCode: clue.regionCode }),
        ...(clue.alsoRegions !== undefined && { alsoRegions: clue.alsoRegions }),
        ...(clue.kind !== undefined && { kind: clue.kind }),
        ...(quizImages(clue).length === 0 && { text: clue.text }),
        ...(clue.summary !== undefined && { summary: clue.summary }),
        ...(clue.sameAs !== undefined && { sameAs: clue.sameAs }),
        ...(clue.differs !== undefined && { differs: clue.differs }),
      };
      return [
        clue.id,
        clue.step,
        clue.order,
        clue.family,
        clue.title,
        images,
        locations,
        clue.lookalikes,
        creditIndex(clue.credit),
        Object.keys(extra).length > 0 ? extra : 0,
      ];
    });
    return {
      country: country.country,
      name: country.name,
      sourceUrl: country.sourceUrl,
      ...(country.updatedAt !== undefined && { updatedAt: country.updatedAt }),
      fetchedAt: country.fetchedAt,
      steps: country.steps.map((step) => step.title),
      credits,
      clues,
    };
  });
}

/** The catalogue back from `slimCatalogue`: text only on clues without a quiz image, no tags. */
export function expandCatalogue(slim: SlimCountry[]): ClueCountry[] {
  return slim.map((country) => {
    const folder = country.country.toLowerCase();
    return {
      country: country.country,
      name: country.name,
      sourceUrl: country.sourceUrl,
      ...(country.updatedAt !== undefined && { updatedAt: country.updatedAt }),
      fetchedAt: country.fetchedAt,
      steps: country.steps.map((title) => ({ title })),
      clues: country.clues.map(
        ([id, step, order, family, title, slimImages, locations, lookalikes, credit, extra]) => {
          const images = slimImages.map(
            ([imageId, src, path, width, height, crop, giveaway, location, more]): ClueImage => ({
              id: imageId,
              src: lengthen(src),
              ...(path !== 0 ? { path: path === 1 ? `${folder}/${imageId}.webp` : path } : {}),
              ...(width ? { width } : {}),
              ...(height ? { height } : {}),
              ...(crop
                ? { crop: { x: crop[0], y: crop[1], w: crop[2], h: crop[3] } as CropBox }
                : {}),
              ...(giveaway ? { giveaway: true } : {}),
              ...(location ? { location: expandLocation(location) } : {}),
              ...more,
            }),
          );
          return {
            id,
            step,
            order,
            family,
            ...(extra && extra.kind !== undefined && { kind: extra.kind }),
            title,
            text: (extra && extra.text) || [],
            ...(extra && extra.region !== undefined && { region: extra.region }),
            ...(extra && extra.regionCode !== undefined && { regionCode: extra.regionCode }),
            ...(extra && extra.alsoRegions !== undefined && { alsoRegions: extra.alsoRegions }),
            ...(extra && extra.summary !== undefined && { summary: extra.summary }),
            ...(extra && extra.sameAs !== undefined && { sameAs: extra.sameAs }),
            ...(extra && extra.differs !== undefined && { differs: extra.differs }),
            tags: [],
            images,
            locations: locations.map((l) =>
              typeof l === 'number' ? (images[l]?.location as ClueLocation) : expandLocation(l),
            ),
            lookalikes,
            credit: country.credits[credit] as ClueCredit,
          };
        },
      ),
    };
  });
}

/** Each clue's text by clue id: what `slimCatalogue` leaves out, loaded when a clue is read. */
export function clueTexts(country: ClueCountry): Record<string, string[]> {
  return Object.fromEntries(country.clues.map((clue) => [clue.id, clue.text]));
}
