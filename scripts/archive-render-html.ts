import type { Archive, SketchEntry } from './archive-types.ts';

const GITHUB_REPO = 'winkerVSbecks/sketchbook-ssam';

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
  const generated = new Date(archive.generatedAt).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

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
    <p class="meta">By <a href="https://varun.ca">Varun Vachhar</a> · ${total} sketches · Generated ${generated}</p>
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
  const date = new Date(entry.firstCommitDate).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const name = entry.id.replace(/^sketches\//, '');
  const ref = entry.lastCommitSha || 'main';
  const source = `https://github.com/${GITHUB_REPO}/blob/${ref}/${entry.path}`;
  return `        <div class="card">
          <a class="thumb" href="${escapeAttr(c.url)}" target="_blank" rel="noopener">
            <img src="${escapeAttr(thumb)}" alt="${escapeAttr(name)}" loading="lazy" width="400" height="400">
          </a>
          <div class="caption">
            <div class="name-row">
              <div class="name">${escapeText(name)}</div>
              <a class="source" href="${escapeAttr(source)}" target="_blank" rel="noopener" aria-label="View source on GitHub">
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
              </a>
            </div>
            <div class="date">${date}</div>
          </div>
        </div>`;
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
.meta a {
  color: var(--fg);
  text-decoration: underline;
  text-decoration-color: var(--hairline);
  text-underline-offset: 3px;
}
.meta a:hover {
  text-decoration-color: var(--fg);
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
.thumb {
  display: block;
  transition: opacity 0.2s ease;
}
.thumb:hover {
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
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.75rem 0.125rem 0;
}
.name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.name {
  font-size: 0.9375rem;
  font-weight: 500;
  letter-spacing: -0.005em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.date {
  font-size: 0.75rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.source {
  display: inline-flex;
  margin-left: auto;
  flex-shrink: 0;
  color: var(--muted);
  transition: color 0.15s ease;
}
.source:hover {
  color: var(--fg);
}
.source svg {
  display: block;
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
