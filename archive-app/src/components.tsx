import type { ReactNode } from 'react';
import type { Sketch } from './model.ts';

const GITHUB_REPO = 'winkerVSbecks/sketchbook-ssam';

export type View = 'year' | 'series';

/** Anchor names come from file paths; percent-encode hrefs so an unusual
 * character can't break the link. Browsers decode fragments before the id
 * lookup, so raw ids on elements still match. */
export const frag = (name: string) => encodeURIComponent(name);

// The drawer mark: an empty Ink-stroked frame, white-filled so it reads on
// dark tab strips too.
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Crect x='2.5' y='2.5' width='11' height='11' fill='%23fff' stroke='%23111' stroke-width='1.5'/%3E%3C/svg%3E";

export function Page({
  title,
  description,
  basePath,
  stamp,
  ogImage,
  children,
}: {
  title: string;
  description: string;
  basePath: string;
  /** cache-busting query for the unhashed static assets, e.g. "?v=1a2b3c4d" */
  stamp: string;
  ogImage: string | null;
  children: ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="theme-color" content="#ffffff" />
        <link rel="icon" type="image/svg+xml" href={FAVICON} />
        <meta property="og:type" content="website" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {ogImage && <meta property="og:image" content={ogImage} />}
        {ogImage && <meta property="og:image:width" content="1200" />}
        {ogImage && <meta property="og:image:height" content="630" />}
        {ogImage && <meta name="twitter:card" content="summary_large_image" />}
        <link rel="preconnect" href="https://res.cloudinary.com" />
        <link rel="stylesheet" href={`${basePath}style.css${stamp}`} />
      </head>
      <body>
        {children}
        <script type="module" src={`${basePath}filter.js${stamp}`} />
      </body>
    </html>
  );
}

export function Masthead({
  total,
  generatedLabel,
  view,
}: {
  total: number;
  generatedLabel: string;
  view: View;
}) {
  return (
    <header>
      <h1>Sketchbook</h1>
      <p className="meta">
        By <a href="https://varun.ca">Varun Vachhar</a> · {total} sketches · Generated{' '}
        {generatedLabel}
      </p>
      <nav className="views" aria-label="Archive views">
        {view === 'year' ? (
          <span aria-current="page">By year</span>
        ) : (
          <a href="../">By year</a>
        )}
        <span className="views-sep" aria-hidden="true">
          ·
        </span>
        {view === 'series' ? (
          <span aria-current="page">By series</span>
        ) : (
          <a href="series/">By series</a>
        )}
      </nav>
      {/* The filter island mounts here; without JS this stays hidden. */}
      <div className="filter" data-filter-root hidden />
    </header>
  );
}

function VsCodeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
    </svg>
  );
}

export function SketchCard({
  sketch,
  projectRoot,
  eager = false,
  /** base href to the series page from the current page, e.g. "series/"; null disables the prefix link */
  seriesLinkBase,
  /** series pages show the leaf name; the section header already names the drawer */
  leafNameOnly = false,
}: {
  sketch: Sketch;
  projectRoot: string;
  eager?: boolean;
  seriesLinkBase: string | null;
  leafNameOnly?: boolean;
}) {
  const s = sketch;
  const source = `https://github.com/${GITHUB_REPO}/blob/${s.lastCommitSha || 'main'}/${s.path}`;
  const vscode = `vscode://file${projectRoot}/${s.path}`;
  // Within a series section the drawer already names the series; also drop a
  // redundant inner sketches/ folder (e.g. nalee/sketches/polar → polar) while
  // keeping meaningful sub-groups (domain-polygon/window/… stays window/…).
  const leaf = s.series
    ? s.displayName.slice(s.series.length + 1).replace(/^sketches\//, '')
    : s.displayName;

  return (
    <div className="card" id={s.displayName} data-name={s.displayName.toLowerCase()}>
      <a className="thumb" href={s.fullUrl} target="_blank" rel="noopener">
        <img
          src={s.thumbUrl}
          alt={s.displayName}
          loading={eager ? 'eager' : 'lazy'}
          width="400"
          height="400"
        />
      </a>
      <div className="caption">
        <div className="name-row">
          <div className="name" title={s.displayName}>
            {leafNameOnly && s.series ? (
              leaf
            ) : s.series && seriesLinkBase !== null ? (
              <>
                <a href={`${seriesLinkBase}#${frag(s.series)}`}>{s.series}</a>
                {'/'}
                {leaf}
              </>
            ) : (
              s.displayName
            )}
          </div>
          <a className="icon" href={vscode} aria-label="Open in VS Code">
            <VsCodeIcon />
          </a>
          <a className="icon" href={source} target="_blank" rel="noopener" aria-label="View source on GitHub">
            <GitHubIcon />
          </a>
        </div>
        <div className="date">{s.dateLabel}</div>
      </div>
    </div>
  );
}

export function SectionHead({
  label,
  count,
  children,
}: {
  label: string;
  count?: number;
  children?: ReactNode;
}) {
  return (
    <div className="section-head">
      <h2>
        {label}
        {count !== undefined && <span className="count"> · {count}</span>}
      </h2>
      {children}
    </div>
  );
}
