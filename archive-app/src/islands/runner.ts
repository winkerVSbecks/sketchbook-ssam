/**
 * The play button — run a sketch straight from the archive.
 *
 * Local-only, and loaded only on localhost (see filter.ts): the deployed site
 * never fetches this chunk, so a visitor is never shown a control that can't
 * do anything. Even on localhost the buttons stay absent unless the preview
 * server answers /api/runner, i.e. unless ../runner/plugin.ts is mounted.
 *
 * Clicking navigates a new tab to the dev server with ?sketch=<id>, which
 * src/index.ts honours over VITE_SKETCH — so one server serves every sketch
 * and the common case costs no process churn at all. ⌥-click forces a restart
 * for when the server is wedged or is running something we can't steer.
 */
type RunnerStatus = {
  port: number;
  running: boolean;
  sketch: string | null;
  pid: number | null;
  owned: boolean;
};

type RunResponse = RunnerStatus & { status: string; url: string };

const ERROR_LINGER_MS = 4_000;

function playIcon(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '14');
  svg.setAttribute('height', '14');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const tri = document.createElementNS(NS, 'polygon');
  tri.setAttribute('points', '6 4 20 12 6 20');
  svg.append(tri);
  return svg;
}

const DEFAULT_TITLE = 'Run sketch (⌥-click to restart the dev server)';

function fail(button: HTMLButtonElement, message: string): void {
  button.classList.add('is-error');
  button.title = message;
  window.setTimeout(() => {
    button.classList.remove('is-error');
    button.title = DEFAULT_TITLE;
  }, ERROR_LINGER_MS);
}

async function run(
  button: HTMLButtonElement,
  id: string,
  restart: boolean,
): Promise<void> {
  if (button.disabled) return;
  // Opened synchronously inside the click, or the popup blocker eats it —
  // the fetch below can take seconds when the server is cold.
  const tab = window.open('', '_blank');
  button.disabled = true;
  button.classList.add('is-busy');
  try {
    const res = await fetch('/api/runner', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, restart }),
    });
    const data = (await res.json()) as RunResponse & { error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    if (tab) tab.location.href = data.url;
    else location.href = data.url; // popup blocked — take this tab instead
  } catch (err) {
    tab?.close();
    fail(button, String(err));
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
  }
}

export async function mountRunner(): Promise<void> {
  // No plugin, no buttons. A bare static server answers 404 here; `vite
  // preview` without our plugin falls back to index.html, which fails the
  // JSON parse — both land in the same silent return.
  try {
    const res = await fetch('/api/runner', { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    (await res.json()) as RunnerStatus;
  } catch {
    return;
  }

  for (const card of document.querySelectorAll<HTMLElement>('.card[data-id]')) {
    const id = card.dataset.id;
    const row = card.querySelector('.name-row');
    if (!id || !row) continue;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'icon icon-run';
    button.title = DEFAULT_TITLE;
    button.setAttribute('aria-label', `Run ${id}`);
    button.append(playIcon());
    button.addEventListener('click', (e) => void run(button, id, e.altKey));

    row.insertBefore(button, row.querySelector('.icon'));
  }
}
