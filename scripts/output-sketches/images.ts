/**
 * Image preparation for the TypeSafe API: outputs and archive references become baseline JPEGs
 * the API accepts (PNG or JPEG, each side 280–1568 px).
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import sharp from 'sharp';

export const MAX_SIDE = 1568;
export const MIN_SIDE = 280;

export type ImageSource = {
  /** `later`: a video whose Light Table thumbnail is not built yet; try again next run. */
  kind: 'file' | 'thumb' | 'later' | 'unsupported';
  path: string | null;
};

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 255;
};

/**
 * Median colour of the one-pixel border of an RGB raw buffer, per channel. Deterministic, and
 * robust to a few outlier edge pixels (unlike the mean).
 */
function medianEdgeColour(raw: Buffer, width: number, height: number) {
  const channels: [number[], number[], number[]] = [[], [], []];
  const take = (x: number, y: number) => {
    const i = (y * width + x) * 3;
    for (let c = 0; c < 3; c += 1) channels[c]?.push(raw[i + c] ?? 0);
  };
  for (let x = 0; x < width; x += 1) {
    take(x, 0);
    take(x, height - 1);
  }
  for (let y = 1; y < height - 1; y += 1) {
    take(0, y);
    take(width - 1, y);
  }
  return { r: median(channels[0]), g: median(channels[1]), b: median(channels[2]) };
}

/**
 * Upright pixels (EXIF orientation applied), fitted inside 1568×1568 without enlarging, any side
 * under 280 padded centred with the median edge colour, emitted as a baseline JPEG at quality 90.
 * Transparency is flattened onto white first. The padding colour is sampled after the resize.
 */
export async function prepareImage(input: Buffer): Promise<Buffer> {
  const fitted = await sharp(input)
    .rotate()
    .flatten({ background: '#ffffff' })
    .resize(MAX_SIDE, MAX_SIDE, { fit: 'inside', withoutEnlargement: true })
    .removeAlpha()
    .toBuffer({ resolveWithObject: true });
  const { width, height } = fitted.info;
  const targetW = Math.max(width, MIN_SIDE);
  const targetH = Math.max(height, MIN_SIDE);
  let pipeline = sharp(fitted.data);
  if (targetW !== width || targetH !== height) {
    const raw = await sharp(fitted.data).raw().toBuffer();
    const left = Math.floor((targetW - width) / 2);
    const top = Math.floor((targetH - height) / 2);
    pipeline = pipeline.extend({
      left,
      right: targetW - width - left,
      top,
      bottom: targetH - height - top,
      background: medianEdgeColour(raw, width, height),
    });
  }
  return pipeline.jpeg({ quality: 90, progressive: false }).toBuffer();
}

const VIDEO_EXTS = new Set(['.mp4', '.mov', '.webm']);
// webp/gif are accepted: prepareImage converts everything to JPEG.
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif']);

/** Which file to read for an output: itself, a review video thumbnail, not yet, or never. */
export function outputImageSource(name: string, outputDir: string): ImageSource {
  const ext = extname(name).toLowerCase();
  if (IMAGE_EXTS.has(ext)) return { kind: 'file', path: join(outputDir, name) };
  if (VIDEO_EXTS.has(ext)) {
    const thumb = join(outputDir, '.review', 'thumbs', `${name}.webp`);
    return existsSync(thumb) ? { kind: 'thumb', path: thumb } : { kind: 'later', path: null };
  }
  return { kind: 'unsupported', path: null };
}

/** Cloudinary delivery URL for a small JPEG rendition of an archived sketch image. */
export function referenceUrl(cloudinaryUrl: string): string {
  return cloudinaryUrl.replace('/upload/', '/upload/w_384,c_limit,f_jpg/');
}

export type FetchFn = (url: string) => Promise<{
  ok: boolean;
  status: number;
  arrayBuffer: () => Promise<ArrayBuffer>;
}>;

/**
 * Cache file name for a reference: `<id with / → __>@v<version>.jpg`, the version read from the
 * Cloudinary URL's `/v<digits>/` segment, so a re-archived sketch fetches its new picture.
 */
export function referenceCacheName(id: string, url: string): string {
  const version = url.match(/\/v(\d+)\//)?.[1];
  return `${id.replaceAll('/', '__')}@${version ? `v${version}` : 'unversioned'}.jpg`;
}

/**
 * Fetch an archive reference once into `cacheDir/<referenceCacheName>`, then read from disk.
 * The rendition is run through `prepareImage` before caching: `c_limit` never enlarges, so a small
 * or thin archive image can arrive under the API's 280 px minimum. Cache files from before the
 * version was in the name are never read: they are misses.
 */
export async function loadReference(
  id: string,
  url: string,
  cacheDir: string,
  fetchFn: FetchFn = fetch,
): Promise<Buffer> {
  const file = join(cacheDir, referenceCacheName(id, url));
  if (existsSync(file)) return readFile(file);
  const res = await fetchFn(referenceUrl(url));
  if (!res.ok) throw new Error(`reference ${id}: HTTP ${res.status}`);
  const buf = await prepareImage(Buffer.from(await res.arrayBuffer()));
  await mkdir(cacheDir, { recursive: true });
  await writeFile(file, buf);
  return buf;
}
