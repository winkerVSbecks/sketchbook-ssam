import type { Archive, SketchEntry } from './types.ts';

export type Sketch = SketchEntry & {
  /** id without the sketches/ prefix, e.g. "nalee/loom-3" */
  displayName: string;
  /** first path segment when nested, e.g. "nalee"; null for singletons */
  series: string | null;
  thumbUrl: string;
  fullUrl: string;
  dateLabel: string;
};

export type YearGroup = { year: number; sketches: Sketch[] };
export type SeriesGroup = { name: string; sketches: Sketch[]; newest: string };

export type Model = {
  total: number;
  generatedLabel: string;
  years: YearGroup[];
  /** series with ≥2 sketches, ordered by most recent activity */
  series: SeriesGroup[];
  /** singletons + 1-item series, newest first */
  oneOffs: Sketch[];
  /** alphabetical entries for the series index */
  index: { name: string; count: number }[];
  /** newest sketch's image at social-card size; null when the archive is empty */
  ogImage: string | null;
};

const dateFormat = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

export function thumbnailUrl(secureUrl: string): string {
  return secureUrl.replace('/upload/', '/upload/w_400,h_400,c_fill,f_auto,q_auto/');
}

function toSketch(entry: SketchEntry): Sketch {
  const displayName = entry.id.replace(/^sketches\//, '');
  const slash = displayName.indexOf('/');
  return {
    ...entry,
    displayName,
    series: slash > 0 ? displayName.slice(0, slash) : null,
    thumbUrl: thumbnailUrl(entry.cloudinary!.url),
    fullUrl: entry.cloudinary!.url,
    dateLabel: dateFormat.format(new Date(entry.firstCommitDate)),
  };
}

const newestFirst = (a: Sketch, b: Sketch) =>
  b.firstCommitDate.localeCompare(a.firstCommitDate);

export function buildModel(archive: Archive): Model {
  // Fail loudly at build time, with the offending entry named — a corrupt
  // entry must break the build, not silently ship a broken card.
  const sketches = archive.sketches
    .filter((s) => s.cloudinary)
    .map((entry) => {
      try {
        return toSketch(entry);
      } catch (err) {
        throw new Error(`bad archive.json entry "${entry.id}": ${err}`);
      }
    });

  const byYear = new Map<number, Sketch[]>();
  for (const s of sketches) {
    (byYear.get(s.year) ?? byYear.set(s.year, []).get(s.year)!).push(s);
  }
  const years: YearGroup[] = [...byYear.keys()]
    .sort((a, b) => b - a)
    .map((year) => ({ year, sketches: byYear.get(year)!.sort(newestFirst) }));

  const bySeries = new Map<string, Sketch[]>();
  for (const s of sketches) {
    if (!s.series) continue;
    (bySeries.get(s.series) ?? bySeries.set(s.series, []).get(s.series)!).push(s);
  }

  const series: SeriesGroup[] = [];
  const oneOffs: Sketch[] = sketches.filter((s) => !s.series);
  for (const [name, group] of bySeries) {
    if (group.length < 2) {
      oneOffs.push(...group);
      continue;
    }
    group.sort(newestFirst);
    series.push({ name, sketches: group, newest: group[0]!.firstCommitDate });
  }
  series.sort((a, b) => b.newest.localeCompare(a.newest));
  oneOffs.sort(newestFirst);

  const index = series
    .map(({ name, sketches }) => ({ name, count: sketches.length }))
    .sort((a, b) => a.name.localeCompare(b.name));

  const newest = years[0]?.sketches[0];

  return {
    total: sketches.length,
    generatedLabel: dateFormat.format(new Date(archive.generatedAt)),
    years,
    series,
    oneOffs,
    index,
    ogImage: newest
      ? newest.fullUrl.replace('/upload/', '/upload/w_1200,h_630,c_fill,f_auto,q_auto/')
      : null,
  };
}
