const sources = import.meta.glob('./sketches/**/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const SKETCH_EXPORT = /^export\s+const\s+sketch\b/m;
const allSketches = Object.entries(sources)
  .filter(([, src]) => SKETCH_EXPORT.test(src))
  .map(([path]) => path.replace(/^\.\//, '').replace(/\.ts$/, ''))
  .sort();

const allSketchSet = new Set(allSketches);

function expandEntry(entry: string): string[] {
  if (allSketchSet.has(entry)) return [entry];
  const prefix = entry.endsWith('/') ? entry : `${entry}/`;
  return allSketches.filter(
    (p) => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'),
  );
}

const explicitList = import.meta.env.VITE_GALLERY as string | undefined;
const sketches = explicitList
  ? Array.from(
      new Set(
        explicitList
          .split(',')
          .map((s) => s.trim().replace(/^\/+|\.ts$/g, ''))
          .filter(Boolean)
          .flatMap(expandEntry),
      ),
    )
  : allSketches;

const grid = document.getElementById('grid')!;
const frag = document.createDocumentFragment();

for (const path of sketches) {
  const cell = document.createElement('div');
  cell.className = 'cell';

  const iframe = document.createElement('iframe');
  iframe.loading = 'lazy';
  iframe.src = `/?sketch=${encodeURIComponent(path)}&gallery=1`;

  const label = document.createElement('div');
  label.className = 'label';
  const link = document.createElement('a');
  link.href = `/?sketch=${encodeURIComponent(path)}`;
  link.target = '_blank';
  link.textContent = path.replace(/^sketches\//, '');
  label.appendChild(link);

  cell.append(iframe, label);
  frag.appendChild(cell);
}

grid.appendChild(frag);
document.title = `Gallery — ${sketches.length} sketches`;
