/**
 * The archive's client JavaScript: a quiet type-to-filter.
 * Progressive enhancement — the [data-filter-root] placeholder ships hidden;
 * this module builds the input, reveals it, and filters cards by substring
 * match on their full sketch id. Without JS the page is fully usable.
 *
 * It is also the entry point for the local-only play button, which is loaded
 * on demand so the deployed site never fetches it (see the tail of this file).
 */
/** A 404'd thumbnail would otherwise sit as a blank gray box forever; mark it
 * so the CSS can name the failure quietly. Capture phase catches error events
 * from every img; the sweep covers any that failed before this script ran. */
function watchBrokenImages(): void {
  const mark = (img: HTMLImageElement) =>
    img.closest('.card')?.classList.add('img-failed');
  document.addEventListener(
    'error',
    (e) => {
      if (e.target instanceof HTMLImageElement) mark(e.target);
    },
    true,
  );
  for (const img of document.querySelectorAll<HTMLImageElement>('.card img')) {
    if (img.complete && img.naturalWidth === 0 && img.src) mark(img);
  }
}

function mount(): void {
  watchBrokenImages();
  const root = document.querySelector<HTMLElement>('[data-filter-root]');
  const main = document.querySelector('main');
  if (!root || !main) return;

  const cards = Array.from(document.querySelectorAll<HTMLElement>('.card'));
  if (cards.length === 0) return;
  const sections = Array.from(document.querySelectorAll<HTMLElement>('[data-section]'));
  const indexItems = Array.from(
    document.querySelectorAll<HTMLElement>('.index li[data-series]'),
  );
  const index = document.querySelector<HTMLElement>('.index');
  const total = cards.length;

  const input = document.createElement('input');
  input.type = 'search';
  input.placeholder = 'Filter by name…';
  input.setAttribute('aria-label', 'Filter sketches by name');
  input.title = 'Press / to focus';
  input.autocomplete = 'off';
  input.spellcheck = false;

  const count = document.createElement('span');
  count.className = 'result-count';
  count.setAttribute('role', 'status');

  const emptyMsg = document.createElement('p');
  emptyMsg.className = 'filter-empty';
  emptyMsg.hidden = true;
  main.prepend(emptyMsg);

  root.append(input, count);
  root.hidden = false;

  const apply = () => {
    const q = input.value.trim().toLowerCase();
    let matches = 0;
    for (const card of cards) {
      const match = q === '' || (card.dataset.name ?? '').includes(q);
      card.hidden = !match;
      if (match) matches++;
    }
    for (const section of sections) {
      section.hidden = q !== '' && !section.querySelector('.card:not([hidden])');
    }
    for (const item of indexItems) {
      const target = document.getElementById(item.dataset.series ?? '');
      item.hidden = q !== '' && (!target || target.hidden);
    }
    if (index) index.hidden = q !== '' && matches === 0;
    count.textContent = q === '' ? '' : `${matches} of ${total}`;
    emptyMsg.hidden = !(q !== '' && matches === 0);
    if (!emptyMsg.hidden) emptyMsg.textContent = `No sketches match “${q}”.`;
  };

  input.addEventListener('input', apply);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      apply();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (
      e.key === '/' &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey &&
      document.activeElement !== input
    ) {
      e.preventDefault();
      input.focus();
    }
  });
}

mount();

/**
 * The play button is dev tooling, not part of the archive: only pull in the
 * chunk when the page is being served locally. A visitor on the deployed site
 * makes no extra request and sees no control they couldn't use.
 */
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '']);
if (LOCAL_HOSTS.has(location.hostname)) {
  void import('./runner.ts')
    .then((runner) => runner.mountRunner())
    .catch(() => {
      /* built without the runner island — no play buttons, nothing else changes */
    });
}
