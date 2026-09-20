/**
 * palette-picker on the terminal desktop: a browser for the colour systems in
 * `src/colors`, laid out as five windows. `systems` picks a system, `library`
 * lists its palettes as glyph strips, `swatches` reads the chosen palette
 * (hex · OKLCH · contrast on the ground · the theme role each entry gets),
 * `theme` shows the `TuiTheme` that `themeFromPalette` derives from it, and
 * `code` holds the palette as a sketch would declare it, with a copy button.
 * The desktop is the specimen: choosing a palette retints every window, the
 * bar and the popup through it (`retint desktop` in `≡ settings` turns that
 * off and falls back to the neutral terminal theme). Clicking a swatch makes
 * that colour the ground and re-derives the roles; clicking the palette again
 * restores its own order.
 *
 * Keys: ↑/↓ (j/k) palette · ←/→ ([/]) system · r random · s reseed · c copy ·
 * 0 restore order · plus the desktop's Tab / Esc / h.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { logColors } from '../../colors';
import {
  AA_CONTRAST,
  cellRect,
  cellRectContains,
  composite,
  contrastRatio,
  createButton,
  createDesktop,
  createToggleGroup,
  fallbackTheme,
  MIN_CONTRAST,
  SHADES,
  themeFromPalette,
  type CellRect,
  type Desktop,
  type GlyphBuffer,
  type TuiContent,
  type TuiControl,
  type TuiTheme,
  type TuiWindow,
} from '../../tui';
import {
  ratio,
  readout,
  rolesFor,
  snippet,
  SYSTEMS,
  withBackground,
  type PaletteEntry,
  type PaletteSystem,
} from './palette-systems';

/** Initial windows, in cells: a systems → library column on the left, swatches → theme → code on the right. */
const WINDOWS: { title: string; rect: CellRect }[] = [
  { title: 'systems', rect: cellRect(1, 1, 11, 46) },
  { title: 'library', rect: cellRect(13, 1, 38, 46) },
  { title: 'swatches', rect: cellRect(1, 49, 16, 58) },
  { title: 'theme', rect: cellRect(18, 49, 13, 58) },
  { title: 'code', rect: cellRect(32, 49, 20, 58) },
];

/** Six cells of `█`: the swatch block every table row starts with. */
const BLOCK = '██████';
/** The ground's own block: its colour is the window, so a hatched outline stands in for it. */
const GROUND = '▒▒▒▒▒▒';
const ROLE_ORDER: (keyof TuiTheme)[] = [
  'bg',
  'fg',
  'dim',
  'accent',
  'chromeBg',
  'chromeFg',
  'frame',
  'frameActive',
  'selectionBg',
];

export const sketch = ({
  wrap,
  context,
  canvas,
  width,
  height,
  ...props
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      desktop.dispose();
      window.removeEventListener('keydown', onKey);
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  // ─── Selection state ────────────────────────────────────────────────────

  let seed = Random.getRandomSeed();
  let systemIndex = 0;
  let entryIndex = 0;
  /** Index into the entry's own colours that plays the ground (0 = the palette's own order). */
  let bgIndex = 0;
  /** First library row shown. */
  let scroll = 0;
  let copied = false;
  let retint = true;
  let hexOutput = false;

  /** Generated systems are dealt once per seed; `reseed` empties the cache. */
  const dealt = new Map<string, PaletteEntry[]>();
  const entriesOf = (system: PaletteSystem): PaletteEntry[] => {
    const key = system.generated ? `${system.id}/${seed}` : system.id;
    let list = dealt.get(key);
    if (!list) dealt.set(key, (list = system.entries(seed)));
    return list;
  };

  const system = (): PaletteSystem => SYSTEMS[systemIndex];
  const entries = (): PaletteEntry[] => entriesOf(system());
  const entry = (): PaletteEntry => entries()[entryIndex];
  /** The palette as picked: the chosen ground first. */
  const current = (): string[] => withBackground(entry().colors, bgIndex);

  const applyTheme = () => {
    desktop.setTheme(retint ? current() : { ...fallbackTheme });
  };

  /** Every selection change funnels through here: reset the ground pick, drop the copied mark, retint. */
  const select = (sys: number, ent: number, bg = 0) => {
    systemIndex = Math.max(0, Math.min(SYSTEMS.length - 1, sys));
    const list = entries();
    entryIndex = Math.max(0, Math.min(list.length - 1, ent));
    bgIndex = bg;
    copied = false;
    applyTheme();
  };

  const stepEntry = (dir: 1 | -1) =>
    select(
      systemIndex,
      (entryIndex + dir + entries().length) % entries().length,
    );
  const stepSystem = (dir: 1 | -1) =>
    select((systemIndex + dir + SYSTEMS.length) % SYSTEMS.length, 0);

  const random = () => {
    Random.setSeed(Random.getRandomSeed());
    const sys = Random.rangeFloor(0, SYSTEMS.length);
    select(sys, Random.rangeFloor(0, entriesOf(SYSTEMS[sys]).length));
  };

  const reseed = () => {
    seed = Random.getRandomSeed();
    dealt.clear();
    select(systemIndex, entryIndex);
  };

  const code = () =>
    snippet({
      system: system(),
      entry: entry(),
      colors: current(),
      hex: hexOutput,
    });

  const copy = () => {
    const text = code();
    logColors(current());
    const clipboard =
      typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard) return;
    clipboard
      .writeText(text)
      .then(() => {
        copied = true;
        props.render();
      })
      .catch(() => {});
  };

  // ─── systems window ─────────────────────────────────────────────────────

  const drawSystems = (buf: GlyphBuffer, inner: CellRect) => {
    const t = desktop.theme;
    SYSTEMS.forEach((s, i) => {
      const row = inner.row + i;
      if (row >= inner.row + inner.rows) return;
      const on = i === systemIndex;
      const n = entriesOf(s).length;
      const fg = on ? t.accent : t.fg;
      buf.text(
        row,
        inner.col + 1,
        `${on ? '(●)' : '( )'} ${s.id.padEnd(12)}`,
        fg,
        undefined,
        inner.cols - 1,
      );
      buf.text(row, inner.col + 18, String(n).padStart(3), on ? t.fg : t.dim);
      buf.text(
        row,
        inner.col + 23,
        s.generated ? 'generated' : 'static',
        t.dim,
        undefined,
        Math.max(0, inner.cols - 24),
      );
    });
  };

  const systemsContent: TuiContent = {
    pointerDown(cell, inner) {
      const i = cell.row - inner.row;
      if (i < 0 || i >= SYSTEMS.length) return false;
      select(i, i === systemIndex ? entryIndex : 0);
      return true;
    },
    pointerMove: () => false,
    pointerUp: () => false,
    cursorAt: (cell, inner) =>
      cell.row - inner.row < SYSTEMS.length ? 'pointer' : null,
  };

  // ─── library window ─────────────────────────────────────────────────────

  /** Header row + one row per palette; the list scrolls when the window is shorter. */
  const libraryRows = (inner: CellRect) => Math.max(0, inner.rows - 1);

  const clampScroll = (inner: CellRect) => {
    const visible = libraryRows(inner);
    const n = entries().length;
    scroll = Math.max(0, Math.min(scroll, n - visible));
    // Keep the selected palette in view.
    if (entryIndex < scroll) scroll = entryIndex;
    else if (visible > 0 && entryIndex >= scroll + visible)
      scroll = entryIndex - visible + 1;
  };

  const drawLibrary = (buf: GlyphBuffer, inner: CellRect) => {
    const t = desktop.theme;
    const list = entries();
    clampScroll(inner);
    const visible = libraryRows(inner);
    const head = `${system().id} · ${list.length} palettes`;
    buf.text(inner.row, inner.col + 1, head, t.dim, undefined, inner.cols - 1);
    if (scroll > 0) buf.put(inner.row, inner.col + inner.cols - 1, '▴', t.fg);
    if (scroll + visible < list.length)
      buf.put(
        inner.row + inner.rows - 1,
        inner.col + inner.cols - 1,
        '▾',
        t.fg,
      );

    const nameW = 14;
    const stripCol = inner.col + 3 + nameW;
    for (let r = 0; r < visible; r++) {
      const i = scroll + r;
      const e = list[i];
      if (!e) break;
      const row = inner.row + 1 + r;
      const on = i === entryIndex;
      const label =
        e.name.length > nameW ? e.name.slice(0, nameW - 1) + '…' : e.name;
      buf.text(row, inner.col + 1, on ? '▸' : ' ', t.accent);
      buf.text(row, inner.col + 3, label, on ? t.fg : t.dim, undefined, nameW);
      // Two cells per colour while they fit, one when the palette is long for the window.
      const room = Math.max(0, inner.col + inner.cols - 4 - stripCol);
      const w = e.colors.length * 2 <= room ? 2 : 1;
      e.colors.forEach((c, k) => {
        if (k * w + w > room) return;
        buf.text(row, stripCol + k * w, '█'.repeat(w), c);
      });
      buf.text(
        row,
        inner.col + inner.cols - 3,
        String(e.colors.length).padStart(2),
        on ? t.fg : t.dim,
      );
    }
  };

  const libraryContent: TuiContent = {
    pointerDown(cell, inner) {
      const visible = libraryRows(inner);
      const list = entries();
      const lastRow = inner.row + inner.rows - 1;
      const hintCol = inner.col + inner.cols - 1;
      // The ▴ / ▾ hints page the list.
      if (cell.row === inner.row && cell.col === hintCol && scroll > 0) {
        scroll = Math.max(0, scroll - visible);
        return true;
      }
      if (
        cell.row === lastRow &&
        cell.col === hintCol &&
        scroll + visible < list.length
      ) {
        scroll = Math.min(list.length - visible, scroll + visible);
        return true;
      }
      const i = scroll + (cell.row - inner.row - 1);
      if (cell.row === inner.row || i < 0 || i >= list.length) return false;
      // Re-clicking the selected palette restores its own order.
      select(systemIndex, i);
      return true;
    },
    pointerMove: () => false,
    pointerUp: () => false,
    cursorAt(cell, inner) {
      const i = scroll + (cell.row - inner.row - 1);
      return cell.row > inner.row && i < entries().length ? 'pointer' : null;
    },
  };

  // ─── swatches window ────────────────────────────────────────────────────

  const drawSwatches = (buf: GlyphBuffer, inner: CellRect) => {
    const t = desktop.theme;
    const colors = current();
    const bg = colors[0];
    const roles = rolesFor(colors);
    const head = `${entry().name}${bgIndex ? ' · reordered' : ''}`;
    buf.text(inner.row, inner.col + 1, head, t.dim, undefined, 24);
    buf.text(
      inner.row,
      inner.col + 26,
      '    L     C   h    :1  role',
      t.dim,
      undefined,
      Math.max(0, inner.cols - 26),
    );
    colors.forEach((c, i) => {
      const row = inner.row + 1 + i;
      if (row >= inner.row + inner.rows) return;
      const r = readout(c);
      if (i === 0) buf.text(row, inner.col + 1, GROUND, t.frame);
      else buf.text(row, inner.col + 1, BLOCK, c);
      buf.text(
        row,
        inner.col + 8,
        r ? r.hex : c,
        i === 0 ? t.fg : t.dim,
        undefined,
        16,
      );
      if (r) {
        buf.text(row, inner.col + 26, r.l.toFixed(1).padStart(5), t.fg);
        buf.text(row, inner.col + 32, r.c.toFixed(3), t.fg);
        buf.text(
          row,
          inner.col + 38,
          Math.round(r.h).toString().padStart(3),
          t.fg,
        );
      }
      const contrast = i === 0 ? '  bg' : ratio(c, bg);
      const ok = i === 0 || contrastRatio(c, bg) >= MIN_CONTRAST;
      buf.text(row, inner.col + 43, contrast, ok ? t.fg : t.dim);
      buf.text(
        row,
        inner.col + 49,
        roles[i].join('+'),
        roles[i].length ? t.accent : t.dim,
        undefined,
        Math.max(0, inner.cols - 50),
      );
    });
  };

  const swatchesContent: TuiContent = {
    pointerDown(cell, inner) {
      const i = cell.row - inner.row - 1;
      const colors = current();
      if (i <= 0 || i >= colors.length) return false;
      // Make this swatch the ground: map its position in the picked order back to the entry's own index.
      const own = entry().colors.indexOf(colors[i]);
      select(systemIndex, entryIndex, own < 0 ? 0 : own);
      return true;
    },
    pointerMove: () => false,
    pointerUp: () => false,
    cursorAt(cell, inner) {
      const i = cell.row - inner.row - 1;
      return i > 0 && i < current().length ? 'pointer' : null;
    },
  };

  // ─── theme window ───────────────────────────────────────────────────────

  const drawTheme = (buf: GlyphBuffer, inner: CellRect) => {
    const t = desktop.theme;
    const derived = themeFromPalette(current());
    buf.text(
      inner.row,
      inner.col + 1,
      'themeFromPalette(palette)',
      t.dim,
      undefined,
      Math.max(0, inner.cols - 24),
    );
    buf.text(inner.row, inner.col + inner.cols - 9, '  :1 min', t.dim);
    ROLE_ORDER.forEach((role, i) => {
      const row = inner.row + 1 + i;
      if (row >= inner.row + inner.rows - 1) return;
      const value = derived[role];
      buf.text(row, inner.col + 1, role.padEnd(12), t.fg);
      // Blocks sit on their real ground: bg for most, the chrome band for chromeFg, so
      // translucent roles (dim, chromeBg, selectionBg) show what they composite to.
      if (role === 'bg') buf.text(row, inner.col + 13, GROUND, t.frame);
      else
        buf.text(
          row,
          inner.col + 13,
          BLOCK,
          value,
          role === 'chromeFg' ? derived.chromeBg : derived.bg,
        );
      buf.text(
        row,
        inner.col + 20,
        value,
        t.dim,
        undefined,
        Math.max(0, inner.cols - 30),
      );
      if (role === 'bg') return;
      const against =
        role === 'chromeFg'
          ? composite(derived.chromeBg, derived.bg)
          : derived.bg;
      const min =
        role === 'frameActive'
          ? AA_CONTRAST
          : role === 'selectionBg'
            ? 0
            : MIN_CONTRAST;
      const ok =
        min === 0 ||
        contrastRatio(composite(value, derived.bg), against) >= min;
      buf.text(
        row,
        inner.col + inner.cols - 9,
        ratio(value, against),
        ok ? t.fg : t.accent,
      );
      buf.text(
        row,
        inner.col + inner.cols - 4,
        min ? min.toFixed(1) : '  –',
        t.dim,
      );
    });
    // Specimen: the density ramp and text in each ink, on the derived ground.
    const last = inner.row + inner.rows - 1;
    if (last > inner.row + 1) {
      buf.text(last, inner.col + 1, SHADES.join(''), derived.fg);
      buf.text(last, inner.col + 6, 'fg', derived.fg);
      buf.text(last, inner.col + 9, 'dim', derived.dim);
      buf.text(last, inner.col + 13, 'accent', derived.accent);
      buf.text(
        last,
        inner.col + 20,
        ' chrome ',
        derived.chromeFg,
        derived.chromeBg,
      );
      buf.text(last, inner.col + 29, '┌─ frame ─┐', derived.frame);
      buf.text(
        last,
        inner.col + 41,
        '╔═ active ═╗',
        derived.frameActive,
        undefined,
        Math.max(0, inner.cols - 42),
      );
    }
  };

  // ─── code window ────────────────────────────────────────────────────────

  const copyButton = createButton({ id: 'copy', label: 'copy', onPress: copy });
  /** Pointer over the copy button (the control host's `hot`, done by hand here). */
  let codeHot = false;
  const buttonRect = (inner: CellRect) =>
    cellRect(
      inner.row + inner.rows - 1,
      inner.col + 1,
      1,
      Math.min(8, inner.cols - 1),
    );

  const drawCode = (buf: GlyphBuffer, inner: CellRect) => {
    const t = desktop.theme;
    const lines = code().split('\n');
    const room = Math.max(0, inner.rows - 2);
    // A palette longer than the window collapses its middle so `];` stays in view.
    const shown =
      lines.length <= room
        ? lines
        : [
            ...lines.slice(0, room - 2),
            `  // … ${lines.length - room + 1} more`,
            lines[lines.length - 1],
          ];
    shown.forEach((line, i) => {
      const comment = line.trimStart().startsWith('//');
      const fg = comment ? t.dim : i === 1 || line === '];' ? t.fg : t.accent;
      buf.text(
        inner.row + i,
        inner.col + 1,
        line,
        fg,
        undefined,
        inner.cols - 1,
      );
      const at = line.indexOf('// bg');
      if (at >= 0 && !comment)
        buf.text(
          inner.row + i,
          inner.col + 1 + at,
          '// bg',
          t.dim,
          undefined,
          Math.max(0, inner.cols - 2 - at),
        );
    });
    if (inner.rows < 2) return;
    const br = buttonRect(inner);
    copyButton.draw(buf, br, t, codeHot);
    const note = copied
      ? 'copied'
      : `${hexOutput ? 'hex' : 'as written'} · c copies`;
    buf.text(
      br.row,
      br.col + 10,
      note,
      t.dim,
      undefined,
      Math.max(0, inner.cols - 11),
    );
  };

  const codeContent: TuiContent = {
    pointerDown: (cell, inner) =>
      copyButton.pointerDown(cell, buttonRect(inner)),
    pointerMove(cell, inner) {
      const br = buttonRect(inner);
      const hot = cellRectContains(br, cell.row, cell.col);
      const changed = hot !== codeHot;
      codeHot = hot;
      return copyButton.pointerMove(cell, br) || changed;
    },
    pointerUp: (cell, inner) => copyButton.pointerUp(cell, buttonRect(inner)),
    cursorAt: (cell, inner) => copyButton.cursorAt(cell, buttonRect(inner)),
  };

  // ─── Windows ────────────────────────────────────────────────────────────

  const bodies: Record<
    string,
    { draw: (buf: GlyphBuffer, inner: CellRect) => void; content: TuiContent }
  > = {
    systems: { draw: drawSystems, content: systemsContent },
    library: { draw: drawLibrary, content: libraryContent },
    swatches: { draw: drawSwatches, content: swatchesContent },
    theme: {
      draw: drawTheme,
      content: {
        pointerDown: () => false,
        pointerMove: () => false,
        pointerUp: () => false,
      },
    },
    code: { draw: drawCode, content: codeContent },
  };

  const drawWindow = (buf: GlyphBuffer, inner: CellRect, win: TuiWindow) => {
    if (inner.rows < 1 || inner.cols < 4) return;
    bodies[win.title]?.draw(buf, inner);
  };

  // ─── Settings controls ──────────────────────────────────────────────────

  const controls: TuiControl[] = [
    createToggleGroup({
      items: [
        { id: 'retint', label: 'retint desktop' },
        { id: 'hex', label: 'hex output' },
      ],
      active: ['retint'],
      onChange: (active) => {
        retint = active.includes('retint');
        hexOutput = active.includes('hex');
        copied = false;
        applyTheme();
      },
    }),
    createButton({ id: 'random', label: 'random palette', onPress: random }),
    createButton({ id: 'reseed', label: 'reseed generated', onPress: reseed }),
    createButton({ id: 'copy', label: 'copy palette', onPress: copy }),
  ];

  // ─── Desktop ────────────────────────────────────────────────────────────

  const desktop: Desktop = createDesktop({
    ctx: context,
    canvas,
    width,
    height,
    palette: current(),
    font: { size: 14, lineH: 20 },
    menuBar: 'bottom',
    settings: { controls, cols: 28 },
    status: () => `${system().id} · ${entry().name} · seed ${seed}`,
    onChange: () => props.render(),
  });

  for (const w of WINDOWS) {
    desktop.addWindow({
      title: w.title,
      rect: w.rect,
      minRows: 3,
      minCols: 12,
      draw: drawWindow,
      content: bodies[w.title]?.content,
      onClose: (win) => desktop.removeWindow(win),
    });
  }

  // ─── Keyboard ───────────────────────────────────────────────────────────

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    switch (e.key) {
      case 'ArrowDown':
      case 'j':
        stepEntry(1);
        break;
      case 'ArrowUp':
      case 'k':
        stepEntry(-1);
        break;
      case 'ArrowRight':
      case ']':
        stepSystem(1);
        break;
      case 'ArrowLeft':
      case '[':
        stepSystem(-1);
        break;
      case 'r':
        random();
        break;
      case 's':
        reseed();
        break;
      case 'c':
        copy();
        break;
      case '0':
        select(systemIndex, entryIndex, 0);
        break;
      default:
        return;
    }
    e.preventDefault();
    props.render();
  };
  window.addEventListener('keydown', onKey);

  if (import.meta.env.DEV) {
    (window as unknown as { __demo?: unknown }).__demo = {
      desktop,
      controls,
      systems: SYSTEMS,
      select,
      random,
      reseed,
      copy,
      current,
      repaint: () => props.render(),
    };
  }

  wrap.render = () => desktop.render();
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
