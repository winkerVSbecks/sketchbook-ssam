import type { Archive, SketchEntry } from './archive-types.ts';

export function renderHtml(archive: Archive): string {
  const byYear = new Map<number, SketchEntry[]>();
  for (const entry of archive.sketches) {
    if (!entry.cloudinary) continue;
    const bucket = byYear.get(entry.year) ?? [];
    bucket.push(entry);
    byYear.set(entry.year, bucket);
  }

  const years = [...byYear.keys()].sort((a, b) => b - a);
  for (const year of years) {
    byYear.get(year)!.sort((a, b) => b.firstCommitDate.localeCompare(a.firstCommitDate));
  }

  const total = archive.sketches.filter((s) => s.cloudinary).length;
  const generated = new Date(archive.generatedAt).toLocaleDateString('en-CA');

  const sections = years
    .map((year) => {
      const items = byYear
        .get(year)!
        .map((entry) => renderItem(entry))
        .join('\n');
      return `    <section class="year">
      <h2>${year}</h2>
      <div class="grid">
${items}
      </div>
    </section>`;
    })
    .join('\n');

  const empty =
    years.length === 0
      ? `    <p class="empty">No sketches archived yet. Run <code>npm run archive</code>.</p>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Sketchbook Archive</title>
  <link rel="stylesheet" href="./style.css">
</head>
<body>
  <header>
    <h1>Sketchbook</h1>
    <p class="meta">${total} sketches · generated ${generated}</p>
  </header>
  <main>
${empty}${sections}
  </main>
</body>
</html>
`;
}

function renderItem(entry: SketchEntry): string {
  const c = entry.cloudinary!;
  const thumb = thumbnailUrl(c.url);
  const date = entry.firstCommitDate.slice(0, 10);
  return `        <a class="card" href="${escapeAttr(c.url)}" target="_blank" rel="noopener">
          <img src="${escapeAttr(thumb)}" alt="${escapeAttr(entry.name)}" loading="lazy" width="400" height="400">
          <div class="caption">
            <span class="name">${escapeText(entry.name)}</span>
            <span class="date">${date}</span>
          </div>
        </a>`;
}

export function thumbnailUrl(secureUrl: string): string {
  return secureUrl.replace('/upload/', '/upload/w_400,h_400,c_fill,f_auto,q_auto/');
}

export function renderCss(): string {
  return `:root {
  color-scheme: light;
  --bg: #fff;
  --fg: #111;
  --muted: #888;
  --hairline: rgba(0, 0, 0, 0.08);
  --img-bg: #f4f4f3;
}
* { box-sizing: border-box; }
html {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  background: var(--bg);
  color: var(--fg);
  line-height: 1.5;
  font-size: 15px;
}
header {
  padding: 5rem 2rem 3rem;
  max-width: 1400px;
  margin: 0 auto;
}
header h1 {
  margin: 0 0 0.375rem;
  font-size: 2.25rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}
.meta {
  margin: 0;
  color: var(--muted);
  font-size: 0.875rem;
  font-variant-numeric: tabular-nums;
}
main {
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 2rem 4rem;
}
.year {
  margin-bottom: 4rem;
}
.year h2 {
  position: sticky;
  top: 0;
  z-index: 10;
  margin: 0 0 1.5rem;
  padding: 1rem 0 0.75rem;
  font-size: 0.8125rem;
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--muted);
  background: var(--bg);
  border-bottom: 1px solid var(--hairline);
  font-variant-numeric: tabular-nums;
  backdrop-filter: saturate(180%) blur(8px);
}
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 4rem;
}
.card {
  display: block;
  text-decoration: none;
  color: inherit;
  transition: opacity 0.2s ease;
}
.card:hover {
  opacity: 0.65;
}
.card img {
  display: block;
  width: 100%;
  height: auto;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  background: var(--img-bg);
}
.caption {
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.5rem 0.125rem 0;
  font-size: 0.8125rem;
}
.name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.date {
  color: var(--muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
.empty {
  color: var(--muted);
  padding: 2rem 0;
}
.empty code {
  background: var(--img-bg);
  padding: 0.15em 0.4em;
  border-radius: 3px;
  font-size: 0.875em;
}
`;
}

function escapeAttr(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]!);
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]!);
}
