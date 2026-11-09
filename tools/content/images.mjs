// Downloads a photo and turns it into a 1280px-wide WebP plus a 16px-wide WebP preview data URI.
// CLI: node tools/content/images.mjs --url <image url> --out photo.webp
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { isMain, parseArgs, request } from './lib/common.mjs';

export const WIDTH = 1280;
const QUALITY = 78;
const PREVIEW_WIDTH = 16;

export async function download(url) {
  return Buffer.from(await (await request(url, {}, { timeoutMs: 120_000 })).arrayBuffer());
}

/** → { webp: Buffer, width, height, preview: 'data:image/webp;base64,…' } */
export async function processImage(input) {
  const { data, info } = await sharp(input)
    .rotate() // honour EXIF orientation
    .resize({ width: WIDTH, withoutEnlargement: true })
    .webp({ quality: QUALITY })
    .toBuffer({ resolveWithObject: true });
  const tiny = await sharp(input).rotate().resize({ width: PREVIEW_WIDTH }).webp({ quality: 50 }).toBuffer();
  return {
    webp: data,
    width: info.width,
    height: info.height,
    preview: `data:image/webp;base64,${tiny.toString('base64')}`,
  };
}

if (isMain(import.meta)) {
  const { url, out = 'photo.webp' } = parseArgs();
  const result = await processImage(await download(url));
  writeFileSync(out, result.webp);
  console.log(JSON.stringify({ out, width: result.width, height: result.height, preview: result.preview.length }));
}
