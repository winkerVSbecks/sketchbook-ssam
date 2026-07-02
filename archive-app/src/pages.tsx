import type { Model } from './model.ts';
import { frag, Masthead, Page, SectionHead, SketchCard } from './components.tsx';

/** How many thumbnails load eagerly (roughly the first visible row). */
const EAGER_COUNT = 4;

const describe = (model: Model, angle: string) =>
  `Generative art sketchbook by Varun Vachhar — ${model.total} sketches archived ${angle}.`;

type PageProps = { model: Model; projectRoot: string; stamp: string };

export function YearPage({ model, projectRoot, stamp }: PageProps) {
  const linkableSeries = new Set(model.series.map((s) => s.name));
  let cardIndex = 0;

  return (
    <Page
      title="Sketchbook"
      description={describe(model, 'by year')}
      basePath="./"
      stamp={stamp}
      ogImage={model.ogImage}
    >
      <Masthead total={model.total} generatedLabel={model.generatedLabel} view="year" />
      <main>
        {model.years.length === 0 && (
          <p className="empty">
            No sketches archived yet. Run <code>npm run archive</code>.
          </p>
        )}
        {model.years.map(({ year, sketches }) => (
          <section className="year" id={String(year)} data-section key={year}>
            <SectionHead label={String(year)}>
              <nav className="jump" aria-label="Jump to year">
                {model.years
                  .filter((y) => y.year !== year)
                  .map((y) => (
                    <a key={y.year} href={`#${y.year}`}>
                      {y.year}
                    </a>
                  ))}
                {/* "#top" needs no target element — the spec scrolls to the document top. */}
                <a href="#top" aria-label="Back to top">
                  top
                </a>
              </nav>
            </SectionHead>
            <div className="grid">
              {sketches.map((s) => (
                <SketchCard
                  key={s.id}
                  sketch={s}
                  projectRoot={projectRoot}
                  eager={cardIndex++ < EAGER_COUNT}
                  seriesLinkBase={s.series && linkableSeries.has(s.series) ? 'series/' : null}
                />
              ))}
            </div>
          </section>
        ))}
      </main>
    </Page>
  );
}

export function SeriesPage({ model, projectRoot, stamp }: PageProps) {
  let cardIndex = 0;

  return (
    <Page
      title="Sketchbook · by series"
      description={describe(model, 'by series')}
      basePath="../"
      stamp={stamp}
      ogImage={model.ogImage}
    >
      <Masthead total={model.total} generatedLabel={model.generatedLabel} view="series" />
      <main>
        {model.total === 0 && (
          <p className="empty">
            No sketches archived yet. Run <code>npm run archive</code>.
          </p>
        )}
        {model.total > 0 && (
        <nav className="index" id="index" aria-label="Series index">
          <ul>
            {model.index.map(({ name, count }) => (
              <li key={name} data-series={name}>
                <a href={`#${frag(name)}`}>{name}</a>
                <span className="count">{count}</span>
              </li>
            ))}
            {model.oneOffs.length > 0 && (
              <li data-series="one-offs">
                <a href="#one-offs">one-offs</a>
                <span className="count">{model.oneOffs.length}</span>
              </li>
            )}
          </ul>
        </nav>
        )}
        {model.series.map(({ name, sketches }) => (
          <section className="series" id={name} data-section key={name}>
            <SectionHead label={name} count={sketches.length}>
              <a className="jump" href="#index">
                index
              </a>
            </SectionHead>
            <div className="grid">
              {sketches.map((s) => (
                <SketchCard
                  key={s.id}
                  sketch={s}
                  projectRoot={projectRoot}
                  eager={cardIndex++ < EAGER_COUNT}
                  seriesLinkBase={null}
                  leafNameOnly
                />
              ))}
            </div>
          </section>
        ))}
        {model.oneOffs.length > 0 && (
          <section className="series" id="one-offs" data-section>
            <SectionHead label="one-offs" count={model.oneOffs.length}>
              <a className="jump" href="#index">
                index
              </a>
            </SectionHead>
            <div className="grid">
              {model.oneOffs.map((s) => (
                <SketchCard
                  key={s.id}
                  sketch={s}
                  projectRoot={projectRoot}
                  eager={false}
                  seriesLinkBase={null}
                />
              ))}
            </div>
          </section>
        )}
      </main>
    </Page>
  );
}
