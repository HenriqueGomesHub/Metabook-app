// Downloads a photo and turns it into a 1024px-wide WebP plus a 16px-wide WebP preview data URI;
// crops an approved photo to the part the curator kept.
// CLI: node tools/content/images.mjs --url <image url> --out photo.webp
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { isMain, parseArgs, request } from './lib/common.mjs';

export const WIDTH = 1024;
const QUALITY = 72;
const PREVIEW_WIDTH = 16;

export async function download(url) {
  return Buffer.from(await (await request(url, {}, { timeoutMs: 120_000 })).arrayBuffer());
}

/** Any image sharp reads (png, jpg, avif…) → { webp: Buffer, width, height }, at most `width` wide. */
export async function encodeWebp(input, { width = WIDTH, quality = QUALITY } = {}) {
  const { data, info } = await sharp(input)
    .rotate() // honour EXIF orientation
    .resize({ width, withoutEnlargement: true })
    .webp({ quality })
    .toBuffer({ resolveWithObject: true });
  return { webp: data, width: info.width, height: info.height };
}

/** → { webp: Buffer, width, height, preview: 'data:image/webp;base64,…' } */
export async function processImage(input) {
  return { ...(await encodeWebp(input)), preview: await previewOf(input) };
}

/** The 16px-wide WebP preview data URI of an image. */
export async function previewOf(input) {
  const tiny = await sharp(input).rotate().resize({ width: PREVIEW_WIDTH }).webp({ quality: 50 }).toBuffer();
  return `data:image/webp;base64,${tiny.toString('base64')}`;
}

/**
 * A crop ({x, y, w, h}, fractions 0..1 of the image) → sharp's extract region in pixels. Each
 * edge is rounded to the nearest pixel (not the size, so the right and bottom edges of a crop that
 * reaches them land exactly on the image's), kept inside the image, and at least 1px.
 */
export function cropBox({ x, y, w, h }, width, height) {
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) throw new Error(`bad crop ${JSON.stringify({ x, y, w, h })}`);
  const edge = (v, size) => Math.min(Math.max(Math.round(v * size), 0), size);
  const left = Math.min(edge(x, width), width - 1);
  const top = Math.min(edge(y, height), height - 1);
  return {
    left,
    top,
    width: Math.max(edge(x + w, width) - left, 1),
    height: Math.max(edge(y + h, height) - top, 1),
  };
}

/** The cropped region as a lossless PNG (EXIF orientation applied first, as the crop was drawn). */
export async function extractCrop(input, crop) {
  const upright = await sharp(input).rotate().png().toBuffer();
  const { width, height } = await sharp(upright).metadata();
  return sharp(upright).extract(cropBox(crop, width, height)).png().toBuffer();
}

/** Crops, then encodes like processImage: → { webp, width, height, preview } of the cropped photo. */
export async function cropImage(input, crop) {
  return processImage(await extractCrop(input, crop));
}

/** Size and preview of an image already processed: → { width, height, preview }. */
export async function describeImage(input) {
  const { width, height } = await sharp(input).metadata();
  return { width, height, preview: await previewOf(input) };
}

if (isMain(import.meta)) {
  const { url, out = 'photo.webp' } = parseArgs();
  const result = await processImage(await download(url));
  writeFileSync(out, result.webp);
  console.log(JSON.stringify({ out, width: result.width, height: result.height, preview: result.preview.length }));
}
