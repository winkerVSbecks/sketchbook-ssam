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
 *
 * One shared server also means one stop control, not one per card: a toolbar
 * button that appears only while a server *we own* is up (stopVite refuses to
 * touch anything else, e.g. a dev server from the VS Code task). The dev
 * server is spawned detached and outlives this page, so without this the only
 * way to stop it is the shell.
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

function svgIcon(draw: (svg: SVGSVGElement, NS: string) => void): SVGSVGElement {
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
  draw(svg, NS);
  return svg;
}

function playIcon(): SVGSVGElement {
  return svgIcon((svg, NS) => {
    const tri = document.createElementNS(NS, 'polygon');
    tri.setAttribute('points', '6 4 20 12 6 20');
    svg.append(tri);
  });
}

function stopIcon(): SVGSVGElement {
  return svgIcon((svg, NS) => {
    const square = document.createElementNS(NS, 'rect');
    square.setAttribute('x', '6');
    square.setAttribute('y', '6');
    square.setAttribute('width', '12');
    square.setAttribute('height', '12');
    svg.append(square);
  });
}

const DEFAULT_TITLE = 'Run sketch (⌥-click to restart the dev server)';
const STOP_TITLE = 'Stop the sketch dev server';

function fail(
  button: HTMLButtonElement,
  message: string,
  restoreTitle: string,
): void {
  button.classList.add('is-error');
  button.title = message;
  window.setTimeout(() => {
    button.classList.remove('is-error');
    button.title = restoreTitle;
  }, ERROR_LINGER_MS);
}

/** The toolbar stop button; null until mounted. */
let stopButton: HTMLButtonElement | null = null;

/** Show the stop button only while there is a server stopVite could stop. */
function reflect(status: RunnerStatus): void {
  if (!stopButton) return;
  const stoppable = status.running && status.owned;
  stopButton.hidden = !stoppable;
  if (stoppable) {
    stopButton.title = status.sketch
      ? `${STOP_TITLE} (started for ${status.sketch})`
      : STOP_TITLE;
  }
}

async function refreshStatus(): Promise<void> {
  try {
    const res = await fetch('/api/runner', {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return;
    reflect((await res.json()) as RunnerStatus);
  } catch {
    /* preview server gone — leave the UI as it was */
  }
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
    reflect(data);
    if (tab) tab.location.href = data.url;
    else location.href = data.url; // popup blocked — take this tab instead
  } catch (err) {
    tab?.close();
    fail(button, String(err), DEFAULT_TITLE);
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
  }
}

async function stop(button: HTMLButtonElement): Promise<void> {
  if (button.disabled) return;
  button.disabled = true;
  button.classList.add('is-busy');
  try {
    const res = await fetch('/api/runner/stop', { method: 'POST' });
    const data = (await res.json()) as { stopped: unknown; error?: string };
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    button.hidden = true;
  } catch (err) {
    fail(button, String(err), STOP_TITLE);
  } finally {
    button.disabled = false;
    button.classList.remove('is-busy');
  }
}

function mountStopControl(status: RunnerStatus): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'runner-stop';
  button.title = STOP_TITLE;
  button.hidden = true;

  const label = document.createElement('span');
  label.textContent = 'Stop server';
  button.append(stopIcon(), label);
  button.addEventListener('click', () => void stop(button));

  // The filter cluster is the toolbar's right edge — the status corner. Fall
  // back to the toolbar itself on a page where the filter never mounted.
  const home =
    document.querySelector('.filter:not([hidden])') ??
    document.querySelector('.toolbar');
  if (!home) return;
  home.append(button);
  stopButton = button;
  reflect(status);

  // The server changes state behind this page's back — a play click opens a
  // new tab, and the server can be stopped or started from anywhere. Coming
  // back to this tab is the natural moment to re-sync.
  window.addEventListener('focus', () => void refreshStatus());
}

export async function mountRunner(): Promise<void> {
  // No plugin, no buttons. A bare static server answers 404 here; `vite
  // preview` without our plugin falls back to index.html, which fails the
  // JSON parse — both land in the same silent return.
  let status: RunnerStatus;
  try {
    const res = await fetch('/api/runner', { headers: { Accept: 'application/json' } });
    if (!res.ok) return;
    status = (await res.json()) as RunnerStatus;
  } catch {
    return;
  }

  mountStopControl(status);

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
