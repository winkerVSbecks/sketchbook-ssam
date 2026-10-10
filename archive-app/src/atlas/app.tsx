/**
 * The Atlas — a card catalogue over the whole body of work.
 *
 * Three fixed columns, nothing to pan or zoom. The ledger (left) is the
 * overview: clusters, colour systems, threads and insights as counted lists,
 * plus a sketches-per-month histogram. Picking one row sets the centre to
 * that set, grouped by cluster, series, month or colour system at a fixed
 * size. Selecting a sketch opens the drawer (right): its facts, its kin
 * across series, its thread, and the run command. Picks replace each other;
 * the whole view lives in the URL hash. Keyboard-first: `?` shows shortcuts.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import rawData from '../../atlas.json';
import {
  DEFAULT_VIEW,
  countByMonth,
  groupNodes,
  isSequence,
  matchesQuery,
  monthSpan,
  nodesFor,
  runCommand,
  sharedTags,
  thumbUrl,
  viewFromHash,
  viewToHash,
  type AtlasData,
  type AtlasNode,
  type GroupBy,
  type Pick,
  type TagField,
  type ViewState,
} from './model.ts';

const data = rawData as unknown as AtlasData;
const nodesById = new Map(data.nodes.map((n) => [n.id, n]));
const months = monthSpan(data.nodes);
const corpusByMonth = countByMonth(data.nodes);
const monthMax = Math.max(1, ...corpusByMonth.values());
const clusterMax = Math.max(1, ...data.clusters.map((c) => c.count));
const systemUses = new Map(
  data.colorSystems.map((s) => [
    s.key,
    data.nodes.filter((n) => n.colorSystems.includes(s.key)).length,
  ]),
);
const systemsByUse = data.colorSystems
  .slice()
  .sort((a, b) => (systemUses.get(b.key) ?? 0) - (systemUses.get(a.key) ?? 0));
const systemMax = Math.max(1, ...systemUses.values());

const kinOf = (() => {
  const m = new Map<string, { id: string; w: number }[]>();
  for (const [a, b, w] of data.edges) {
    if (!m.has(a)) m.set(a, []);
    if (!m.has(b)) m.set(b, []);
    m.get(a)!.push({ id: b, w });
    m.get(b)!.push({ id: a, w });
  }
  for (const list of m.values()) list.sort((x, y) => y.w - x.w);
  return (id: string) => (m.get(id) ?? []).map((k) => nodesById.get(k.id)!).filter(Boolean);
})();

const GROUP_LABELS: [GroupBy, string][] = [
  ['cluster', 'Cluster'],
  ['series', 'Series'],
  ['month', 'Month'],
  ['system', 'Colour system'],
];

const KIND_LABEL: Record<string, string> = {
  'unexplored-combination': 'combine',
  'technique-transfer': 'transfer',
  'abandoned-thread': 'revive',
  'deepen-series': 'deepen',
  bridge: 'bridge',
  'scale-shift': 'scale',
  'series-opportunity': 'series',
  'outlier-worth-revisiting': 'outlier',
};

const FIELD_LABEL: Record<TagField, string> = {
  concepts: 'concept',
  techniques: 'technique',
  forms: 'form',
};

const SHORTCUTS: [string[], string][] = [
  [['←', '→'], 'previous / next sketch'],
  [['↑', '↓'], 'sketch above / below'],
  [['1', '…', '4'], 'group by cluster · series · month · colour system'],
  [['p'], 'sheet / plates'],
  [['/'], 'search'],
  [['c'], 'copy the run command'],
  [['esc'], 'close the drawer, clear search, then show everything'],
  [['?'], 'shortcuts'],
];

const sameView = (a: ViewState, b: ViewState) => viewToHash(a) === viewToHash(b);
const samePick = (a: Pick, b: Pick) =>
  viewToHash({ ...DEFAULT_VIEW, pick: a }) === viewToHash({ ...DEFAULT_VIEW, pick: b });

/** Heading, count line and prose for whatever the ledger has picked. */
function describe(pick: Pick): { title: string; kind: string | null; body: string | null } {
  switch (pick.kind) {
    case 'all':
      return { title: 'All sketches', kind: null, body: null };
    case 'cluster': {
      const c = data.clusters.find((c) => c.key === pick.key);
      return { title: c?.name ?? pick.key, kind: 'cluster', body: c?.blurb ?? null };
    }
    case 'system': {
      const s = data.colorSystems.find((s) => s.key === pick.key);
      return {
        title: s?.name ?? pick.key,
        kind: `colour system · ${s?.source ?? ''}`,
        body: s?.blurb ?? null,
      };
    }
    case 'thread': {
      const t = data.threads.find((t) => t.key === pick.key);
      return { title: t?.name ?? pick.key, kind: 'thread, in order', body: t?.note ?? null };
    }
    case 'insight': {
      const i = data.insights[pick.index];
      return {
        title: i?.title ?? 'Insight',
        kind: `insight · ${KIND_LABEL[i?.kind ?? ''] ?? i?.kind ?? ''}`,
        body: i?.body ?? null,
      };
    }
    case 'month':
      return { title: pick.month.replace('-', '.'), kind: 'month', body: null };
    case 'tag':
      return { title: pick.tag, kind: FIELD_LABEL[pick.field], body: null };
  }
}

// ---------- ledger ----------

function LedgerRow({
  label,
  count,
  part,
  max,
  active,
  onClick,
}: {
  label: string;
  count: number;
  /** how many of the current pick fall in this row; inked over the bar */
  part?: number;
  max?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`lrow${active ? ' is-active' : ''}${part !== undefined ? ' has-part' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      <span className="lrow-label">{label}</span>
      {max !== undefined && (
        <span className="lrow-track" aria-hidden>
          <span className="lrow-bar" style={{ width: `${(count / max) * 100}%` }} />
          {part !== undefined && part > 0 && (
            <span className="lrow-part" style={{ width: `${(part / max) * 100}%` }} />
          )}
        </span>
      )}
      <span className="lrow-count">
        {part !== undefined && part > 0 && <span className="lrow-of">{part} / </span>}
        {count}
      </span>
    </button>
  );
}

/** A ledger section whose rows fold away; remembered across visits. */
function Fold({
  id,
  title,
  count,
  forceOpen,
  children,
}: {
  id: string;
  title: string;
  count: number;
  forceOpen: boolean;
  children: React.ReactNode;
}) {
  const storeKey = `atlas.fold.${id}`;
  const [open, setOpen] = useState(() => localStorage.getItem(storeKey) === 'open');
  const shown = open || forceOpen;
  return (
    <section className="lsec">
      <h2 className="label">
        <button
          type="button"
          className="fold"
          aria-expanded={shown}
          onClick={() => {
            const next = !shown;
            setOpen(next);
            localStorage.setItem(storeKey, next ? 'open' : 'closed');
          }}
        >
          <svg viewBox="0 0 10 10" width="10" height="10" aria-hidden>
            <path d={shown ? 'M2 3.5l3 3 3-3' : 'M3.5 2l3 3-3 3'} />
          </svg>
          {title}
          <span className="fold-count">{count}</span>
        </button>
      </h2>
      {shown && children}
    </section>
  );
}

function Histogram({
  setByMonth,
  pick,
  onPick,
}: {
  setByMonth: Map<string, number>;
  pick: Pick;
  onPick: (p: Pick) => void;
}) {
  const showSet = pick.kind !== 'all';
  return (
    <div className="hist" role="group" aria-label="Sketches per month">
      <div className="hist-bars">
        {months.map((m) => {
          const all = corpusByMonth.get(m) ?? 0;
          const inSet = setByMonth.get(m) ?? 0;
          const active = pick.kind === 'month' && pick.month === m;
          return (
            <button
              key={m}
              type="button"
              className={`hist-col${active ? ' is-active' : ''}`}
              title={`${m.replace('-', '.')} · ${all} sketch${all === 1 ? '' : 'es'}`}
              aria-label={`${m}, ${all} sketches`}
              disabled={all === 0}
              onClick={() => onPick(active ? { kind: 'all' } : { kind: 'month', month: m })}
            >
              <span className="hist-all" style={{ height: `${(all / monthMax) * 100}%` }} />
              {showSet && inSet > 0 && (
                <span className="hist-set" style={{ height: `${(inSet / monthMax) * 100}%` }} />
              )}
            </button>
          );
        })}
      </div>
      <div className="hist-years" aria-hidden>
        {months.map((m, i) =>
          m.endsWith('-01') ? (
            <span key={m} style={{ left: `${(i / months.length) * 100}%` }}>
              {m.slice(0, 4)}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

function Ledger({
  pick,
  setNodes,
  onPick,
}: {
  pick: Pick;
  setNodes: AtlasNode[];
  onPick: (p: Pick) => void;
}) {
  const setByMonth = useMemo(() => countByMonth(setNodes), [setNodes]);
  // The current pick, cross-tabulated: how it spreads over clusters and
  // colour systems. Shown on every list except the one the pick came from.
  const parts = useMemo(() => {
    if (pick.kind === 'all') return null;
    const cluster = new Map<string, number>();
    const system = new Map<string, number>();
    for (const n of setNodes) {
      cluster.set(n.cluster, (cluster.get(n.cluster) ?? 0) + 1);
      for (const k of n.colorSystems) system.set(k, (system.get(k) ?? 0) + 1);
    }
    return { cluster, system };
  }, [pick, setNodes]);
  const toggle = (p: Pick) => onPick(samePick(pick, p) ? { kind: 'all' } : p);
  return (
    <nav className="ledger" aria-label="Catalogue">
      <LedgerRow
        label="All sketches"
        count={data.nodes.length}
        active={pick.kind === 'all'}
        onClick={() => onPick({ kind: 'all' })}
      />

      <section className="lsec">
        <h2 className="label">Made</h2>
        <Histogram setByMonth={setByMonth} pick={pick} onPick={onPick} />
      </section>

      <section className="lsec">
        <h2 className="label">Cluster</h2>
        {data.clusters.map((c) => (
          <LedgerRow
            key={c.key}
            label={c.name}
            count={c.count}
            part={pick.kind === 'cluster' ? undefined : (parts?.cluster.get(c.key) ?? 0)}
            max={clusterMax}
            active={pick.kind === 'cluster' && pick.key === c.key}
            onClick={() => toggle({ kind: 'cluster', key: c.key })}
          />
        ))}
      </section>

      <Fold
        id="threads"
        title="Threads"
        count={data.threads.length}
        forceOpen={pick.kind === 'thread'}
      >
        {data.threads.map((t) => (
          <LedgerRow
            key={t.key}
            label={t.name}
            count={t.members.length}
            active={pick.kind === 'thread' && pick.key === t.key}
            onClick={() => toggle({ kind: 'thread', key: t.key })}
          />
        ))}
      </Fold>

      <Fold
        id="insights"
        title="Insights"
        count={data.insights.length}
        forceOpen={pick.kind === 'insight'}
      >
        {data.insights.map((ins, i) => {
          const active = pick.kind === 'insight' && pick.index === i;
          return (
            <button
              key={`${ins.title}-${i}`}
              type="button"
              className={`irow${active ? ' is-active' : ''}`}
              aria-pressed={active}
              onClick={() => toggle({ kind: 'insight', index: i })}
            >
              <span className="irow-title">
                {ins.title}
                <span className="irow-kind"> · {KIND_LABEL[ins.kind] ?? ins.kind}</span>
              </span>
            </button>
          );
        })}
      </Fold>

      <section className="lsec">
        <h2 className="label">Colour system</h2>
        {systemsByUse.map((s) => (
          <LedgerRow
            key={s.key}
            label={s.name}
            count={systemUses.get(s.key) ?? 0}
            part={pick.kind === 'system' ? undefined : (parts?.system.get(s.key) ?? 0)}
            max={systemMax}
            active={pick.kind === 'system' && pick.key === s.key}
            onClick={() => toggle({ kind: 'system', key: s.key })}
          />
        ))}
      </section>
    </nav>
  );
}

// ---------- drawer ----------

function useCopy(resetKey: string) {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => setCopied(null), [resetKey]);
  const copy = useCallback((label: string, text: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => setCopied(label))
      .catch(() => {});
  }, []);
  return { copied, copy };
}

function Thumb({ node, onSelect }: { node: AtlasNode; onSelect: (id: string) => void }) {
  return (
    <button type="button" className="kin-thumb" onClick={() => onSelect(node.id)} title={node.id}>
      <img src={thumbUrl(node.url, 160)} alt="" loading="lazy" decoding="async" />
    </button>
  );
}

function Drawer({
  node,
  onSelect,
  onPick,
  onClose,
}: {
  node: AtlasNode;
  onSelect: (id: string) => void;
  onPick: (p: Pick) => void;
  onClose: () => void;
}) {
  const { copied, copy } = useCopy(node.id);
  const kin = kinOf(node.id).slice(0, 6);
  const threads = data.threads.filter((t) => t.members.includes(node.id));
  const primarySystem = data.colorSystems.find((s) => s.key === node.colorSystems[0]);
  const sameSystem = primarySystem
    ? data.nodes
        .filter((n) => n.id !== node.id && n.colorSystems[0] === primarySystem.key)
        .slice(-6)
    : [];

  const chips = (field: TagField) =>
    node[field].map((t) => (
      <button
        key={`${field}-${t}`}
        type="button"
        className="chip"
        title={`Show every sketch tagged ${t}`}
        onClick={() => onPick({ kind: 'tag', field, tag: t })}
      >
        {t}
      </button>
    ));

  const facts: [string, string | null][] = [
    ['medium', `${node.medium} · ${node.motion}`],
    ['colours', node.colorSystems.join(', ') || null],
    ['palette', node.palette],
    ['engine', node.system],
    ['influence', node.influences.join(', ') || null],
  ];

  return (
    <aside className="drawer" aria-label={node.id}>
      <div className="drawer-head">
        <div>
          <h2 className="drawer-title">{node.name}</h2>
          <p className="drawer-sub">
            {node.seriesLabel ? `${node.seriesLabel} · ` : ''}
            {node.created.replaceAll('-', '.')}
          </p>
        </div>
        <button type="button" className="icon-btn" aria-label="Close (esc)" onClick={onClose}>
          <svg viewBox="0 0 14 14" width="14" height="14" aria-hidden>
            <path d="M3 3l8 8M11 3l-8 8" />
          </svg>
        </button>
      </div>
      <a className="drawer-hero" href={node.url} target="_blank" rel="noreferrer">
        <img
          src={thumbUrl(node.url, 720)}
          alt={node.id}
          style={{ aspectRatio: `${node.w} / ${node.h}` }}
        />
      </a>
      {node.description && <p className="drawer-desc">{node.description}</p>}
      <div className="chips">
        {chips('concepts')}
        {chips('techniques')}
        {chips('forms')}
      </div>
      <dl className="facts">
        {facts.map(
          ([k, v]) =>
            v && (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ),
        )}
      </dl>
      {node.notable && <p className="drawer-notable">{node.notable}</p>}

      <section className="dsec">
        <h3 className="label">Run</h3>
        <button
          type="button"
          className="copy"
          title="Copy the run command (c)"
          onClick={() => copy('run', runCommand(node.id))}
        >
          <code>{runCommand(node.id)}</code>
          <span className="copy-state">{copied === 'run' ? 'copied' : 'copy'}</span>
        </button>
        <button
          type="button"
          className="copy"
          title="Copy the file path"
          onClick={() => copy('file', `src/${node.id}.ts`)}
        >
          <code>src/{node.id}.ts</code>
          <span className="copy-state">{copied === 'file' ? 'copied' : 'copy'}</span>
        </button>
      </section>

      <section className="dsec">
        <h3 className="label">Kin across series</h3>
        {kin.length === 0 ? (
          <p className="drawer-quiet">No close kin outside its own series.</p>
        ) : (
          <ul className="kin">
            {kin.map((k) => {
              const shared = sharedTags(node, k);
              return (
                <li key={k.id}>
                  <button
                    type="button"
                    title={`${k.id}${shared.length ? `\nshares ${shared.join(', ')}` : ''}`}
                    onClick={() => onSelect(k.id)}
                  >
                    <img src={thumbUrl(k.url, 200)} alt="" loading="lazy" decoding="async" />
                    <span className="kin-name">{k.name}</span>
                    {shared[0] && <span className="kin-shared">{shared[0]}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {threads.map((t) => {
        const i = t.members.indexOf(node.id);
        const near = t.members
          .slice(Math.max(0, i - 2), i + 3)
          .map((id) => nodesById.get(id))
          .filter((n): n is AtlasNode => !!n);
        return (
          <section className="dsec" key={t.key}>
            <h3 className="label dsec-head">
              <button type="button" onClick={() => onPick({ kind: 'thread', key: t.key })}>
                Thread · {t.name}
              </button>
              <span>
                {i + 1} / {t.members.length}
              </span>
            </h3>
            <div className="kin-row">
              {near.map((n) =>
                n.id === node.id ? (
                  <span key={n.id} className="kin-thumb is-current">
                    <img src={thumbUrl(n.url, 160)} alt="" />
                  </span>
                ) : (
                  <Thumb key={n.id} node={n} onSelect={onSelect} />
                ),
              )}
            </div>
          </section>
        );
      })}

      {primarySystem && sameSystem.length > 0 && (
        <section className="dsec">
          <h3 className="label dsec-head">
            <button
              type="button"
              onClick={() => onPick({ kind: 'system', key: primarySystem.key })}
            >
              Also {primarySystem.name}
            </button>
            <span>{systemUses.get(primarySystem.key)}</span>
          </h3>
          <div className="kin-row">
            {sameSystem.map((n) => (
              <Thumb key={n.id} node={n} onSelect={onSelect} />
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}

// ---------- help ----------

function Help({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    else if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="help"
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      aria-label="Keyboard shortcuts"
    >
      <table>
        <tbody>
          {SHORTCUTS.map(([keys, action]) => (
            <tr key={action}>
              <th scope="row">
                {keys.map((k, i) => (
                  <kbd key={k} className={i > 0 ? 'kbd-alt' : undefined}>
                    {k}
                  </kbd>
                ))}
              </th>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </dialog>
  );
}

// ---------- app ----------

function useHashView(): [ViewState, (next: Partial<ViewState>) => void] {
  const [view, setView] = useState<ViewState>(() => viewFromHash(location.hash));
  useEffect(() => {
    const onHash = () =>
      setView((v) => {
        const next = viewFromHash(location.hash);
        return sameView(v, next) ? v : next;
      });
    // Back/forward through pushState entries fires popstate, not hashchange.
    window.addEventListener('hashchange', onHash);
    window.addEventListener('popstate', onHash);
    return () => {
      window.removeEventListener('hashchange', onHash);
      window.removeEventListener('popstate', onHash);
    };
  }, []);
  // The history write lives outside the state updater: updaters must stay
  // pure (StrictMode runs them twice, which would push every pick twice).
  const viewRef = useRef(view);
  viewRef.current = view;
  const update = useCallback((patch: Partial<ViewState>) => {
    const v = viewRef.current;
    const next = { ...v, ...patch };
    // A new pick is a place you can go back to; selection and search are not.
    const push = patch.pick !== undefined && !samePick(v.pick, next.pick);
    const url = `${location.pathname}${location.search}${viewToHash(next)}`;
    if (push) history.pushState(null, '', url);
    else history.replaceState(null, '', url);
    viewRef.current = next;
    setView(next);
  }, []);
  return [view, update];
}

export function App() {
  const [view, update] = useHashView();
  const [helpOpen, setHelpOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const setRef = useRef<HTMLElement>(null);
  const { copy } = useCopy(view.sel ?? '');

  const pickNodes = useMemo(() => nodesFor(data, view.pick), [view.pick]);
  const shown = useMemo(
    () => (view.query ? pickNodes.filter((n) => matchesQuery(n, view.query)) : pickNodes),
    [pickNodes, view.query],
  );
  const sequence = isSequence(view.pick);
  const groups = useMemo(
    () =>
      sequence
        ? [{ key: 'sequence', label: '', nodes: shown }]
        : groupNodes(data, shown, view.group),
    [sequence, shown, view.group],
  );
  const order = useMemo(() => groups.flatMap((g) => g.nodes.map((n) => n.id)), [groups]);
  const selNode = view.sel ? nodesById.get(view.sel) : undefined;
  const { title, kind, body } = describe(view.pick);
  const seriesCount = new Set(shown.flatMap((n) => (n.seriesLabel ? [n.seriesLabel] : []))).size;

  const pick = useCallback(
    (p: Pick) => {
      update({ pick: p, query: '' });
      setRef.current?.scrollTo({ top: 0 });
    },
    [update],
  );
  const select = useCallback((id: string | null) => update({ sel: id }), [update]);

  // Keep the selection in view when it moves by keyboard or from the drawer.
  useEffect(() => {
    if (!view.sel) return;
    const el = setRef.current?.querySelector(`[data-id="${CSS.escape(view.sel)}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [view.sel]);

  /** The sketch one row up or down: the nearest thumb in the row above/below. */
  const vertical = (dir: 1 | -1): string | null => {
    const root = setRef.current;
    if (!root || !view.sel) return null;
    const cur = root.querySelector<HTMLElement>(`[data-id="${CSS.escape(view.sel)}"]`);
    if (!cur) return null;
    const r = cur.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    let best: { id: string; d: number } | null = null;
    for (const el of root.querySelectorAll<HTMLElement>('[data-id]')) {
      const b = el.getBoundingClientRect();
      const dy = dir > 0 ? b.top - r.bottom : r.top - b.bottom;
      if (dy < 0) continue;
      const d = dy * 4 + Math.abs(b.left + b.width / 2 - cx);
      if (!best || d < best.d) best = { id: el.dataset.id!, d };
    }
    return best?.id ?? null;
  };

  const onKey = (e: KeyboardEvent) => {
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (typing) {
      if (e.key === 'Escape') {
        if (view.query) update({ query: '' });
        (e.target as HTMLElement).blur();
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey || helpOpen) return;
    const i = view.sel ? order.indexOf(view.sel) : -1;
    const step = (d: number) => {
      if (order.length === 0) return;
      e.preventDefault();
      select(order[i === -1 ? 0 : Math.min(order.length - 1, Math.max(0, i + d))]!);
    };
    switch (e.key) {
      case 'ArrowRight':
      case 'j':
        step(1);
        break;
      case 'ArrowLeft':
      case 'k':
        step(-1);
        break;
      case 'ArrowDown':
      case 'ArrowUp': {
        e.preventDefault();
        if (i === -1) return step(0);
        const id = vertical(e.key === 'ArrowDown' ? 1 : -1);
        if (id) select(id);
        break;
      }
      case '1':
      case '2':
      case '3':
      case '4':
        if (!sequence) update({ group: GROUP_LABELS[Number(e.key) - 1]![0] });
        break;
      case 'p':
        update({ plates: !view.plates });
        break;
      case 'c':
        if (view.sel) copy('run', runCommand(view.sel));
        break;
      case '/':
        e.preventDefault();
        searchRef.current?.focus();
        break;
      case 'Escape':
        if (view.sel) select(null);
        else if (view.query) update({ query: '' });
        else if (view.pick.kind !== 'all') pick({ kind: 'all' });
        break;
      case '?':
        setHelpOpen(true);
        break;
    }
  };
  const onKeyRef = useRef(onKey);
  onKeyRef.current = onKey;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKeyRef.current(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  if (data.nodes.length === 0) {
    return (
      <p className="empty">
        <code>atlas.json</code> is empty. Run the corpus analysis, then{' '}
        <code>scripts/atlas/assemble.ts</code>.
      </p>
    );
  }

  const years = `${data.nodes.reduce((m, n) => Math.min(m, n.year), 9999)}–${data.nodes.reduce(
    (m, n) => Math.max(m, n.year),
    0,
  )}`;

  return (
    <div className={`app${selNode ? ' has-drawer' : ''}`}>
      <header className="bar">
        <div className="bar-brand">
          Atlas{' '}
          <span className="quiet">
            · {data.nodes.length} sketches · {years}
          </span>
        </div>
        <input
          ref={searchRef}
          className="search"
          type="search"
          placeholder="search"
          aria-label="Search sketches"
          value={view.query}
          onChange={(e) => update({ query: e.target.value })}
        />
        <button
          type="button"
          className="help-btn"
          aria-label="Keyboard shortcuts (?)"
          onClick={() => setHelpOpen(true)}
        >
          ?
        </button>
      </header>

      <Ledger pick={view.pick} setNodes={pickNodes} onPick={pick} />

      <main ref={setRef} className="set" aria-label={title}>
        <header className="set-head">
          <h1 className="set-title">{title}</h1>
          <p className="set-meta">
            {kind && `${kind} · `}
            {view.query ? `${shown.length} of ${pickNodes.length}` : shown.length} sketch
            {shown.length === 1 ? '' : 'es'}
            {!sequence && seriesCount > 1 && ` · ${seriesCount} series`}
          </p>
          {body && <p className="set-body">{body}</p>}
          <div className="set-tools">
            <div className="seg" role="group" aria-label="Group by">
              {sequence ? (
                <span className="quiet">
                  in {view.pick.kind === 'thread' ? 'lineage' : 'note'} order
                </span>
              ) : (
                <>
                  <span className="quiet">Group by</span>
                  {GROUP_LABELS.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      aria-pressed={view.group === key}
                      onClick={() => update({ group: key })}
                    >
                      {label}
                    </button>
                  ))}
                </>
              )}
            </div>
            <div className="seg" role="group" aria-label="Thumbnail size">
              <button
                type="button"
                aria-pressed={!view.plates}
                onClick={() => update({ plates: false })}
              >
                Sheet
              </button>
              <button
                type="button"
                aria-pressed={view.plates}
                onClick={() => update({ plates: true })}
              >
                Plates
              </button>
            </div>
          </div>
        </header>

        {shown.length === 0 ? (
          <p className="empty">
            Nothing here matches “{view.query}”. Press <kbd>esc</kbd> to clear the search.
          </p>
        ) : (
          // Keyed on the pick so a new set eases in rather than cutting over.
          <div className="groups" key={viewToHash({ ...DEFAULT_VIEW, pick: view.pick })}>
            {groups.map((g) => (
              <section
                key={g.key}
                className={`group${groups.length > 1 && g.nodes.length <= (view.plates ? 2 : 5) ? ' is-small' : ''}`}
              >
                {g.label && (
                  <h2 className="group-head">
                    <span>{g.label}</span>
                    <span className="quiet">{g.nodes.length}</span>
                  </h2>
                )}
                <div
                  className={`thumbs${view.plates ? ' is-plates' : ''}`}
                  style={{ '--n': g.nodes.length } as React.CSSProperties}
                >
                  {g.nodes.map((n, i) => (
                    <button
                      key={n.id}
                      type="button"
                      data-id={n.id}
                      className={`thumb${view.sel === n.id ? ' is-selected' : ''}`}
                      aria-label={n.id}
                      aria-current={view.sel === n.id || undefined}
                      title={
                        view.plates
                          ? undefined
                          : `${n.seriesLabel ? `${n.seriesLabel} / ` : ''}${n.name}`
                      }
                      onClick={() => select(view.sel === n.id ? null : n.id)}
                    >
                      <img
                        src={thumbUrl(n.url, view.plates ? 400 : 160)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      {view.plates && (
                        <span className="thumb-cap">
                          {sequence && <span className="quiet">{i + 1} </span>}
                          {n.name}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {selNode && (
        <Drawer node={selNode} onSelect={select} onPick={pick} onClose={() => select(null)} />
      )}

      <Help open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
