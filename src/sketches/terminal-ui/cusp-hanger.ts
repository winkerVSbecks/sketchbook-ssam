/**
 * cusp-hanger on the terminal desktop: an explorer for the `cusphanger`
 * colour system (`src/colors/cusphanger.ts`) — a tinted ground plus
 * foreground colours grouped by contrast into high (ink), mid (accent) and
 * low (wash) tiers, hues chosen by harmony and pulled together by a
 * monochromaticness knob, everything clamped to the Display-P3 shell.
 *
 * Windows: `parameters` (hue · monochromatic · saturation · cool/warm;
 * harmony · ground · gamut; random / reseed), `palette` (the ground and the
 * three tiers — block · oklch · hex · relC · contrast; click a row to focus
 * its hue), `hues` (a 360° strip with the chosen hues marked), `slice` (the
 * focused hue's chroma–lightness triangle in its real colours: the sRGB
 * shell solid, the extra P3 reach hatched, the paper's ramp as dots and the
 * tier picks as H · M · L), `specimen` (the tiers in use as random blocks;
 * click to reshuffle) and `code` (the palette as a sketch declares it; click
 * to copy). The chrome stays black and white so the palette is judged on its
 * own ground: colour appears only in the specimen and wherever a swatch is shown.
 *
 * Keys: ←/→ hue ±5 · ↑/↓ mono ±0.05 · [ ] harmony · d ground · g gamut ·
 * r random hue · s reseed · x reshuffle specimen · c copy · Tab / Esc / h.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { cusp, maxChromaAt } from 'cusphanger';
import { oklchP3, oklchSrgb, relch, toCss } from 'nutelch';

import { logColors } from '../../colors';
import {
  cuspPalette,
  describe,
  HARMONIES,
  snippet,
  spreadFor,
  TIER_TARGETS,
  TIERS,
  type CuspPalette,
  type CuspSwatch,
  type Gamut,
  type Ground,
  type Harmony,
  type Tier,
} from '../../colors/cusphanger';
import {
  cellRect,
  createButton,
  createControlHost,
  createDesktop,
  createRange,
  createToggleGroup,
  fallbackTheme,
  legibleOn,
  TUI_FONT_FAMILY,
  type CellRect,
  type Desktop,
  type GlyphBuffer,
  type TuiContent,
  type TuiControl,
  type TuiTheme,
  type TuiWindow,
} from '../../tui';

/** Initial windows, in cells: controls and the slice on the left, palette · hues · specimen · code on the right. */
const WINDOWS: { title: string; rect: CellRect }[] = [
  { title: 'parameters', rect: cellRect(1, 1, 31, 40) },
  { title: 'slice', rect: cellRect(32, 1, 20, 40) },
  { title: 'palette', rect: cellRect(1, 42, 22, 86) },
  { title: 'hues', rect: cellRect(23, 42, 6, 86) },
  { title: 'specimen', rect: cellRect(29, 42, 23, 36) },
  { title: 'code', rect: cellRect(29, 78, 23, 50) },
];

const BLOCK = '██████';

/** Paper-white chrome with black ink — the neutral ground the palettes are judged against. */
const PAPER_THEME: TuiTheme = {
  bg: '#f4f4f2',
  fg: '#111111',
  dim: 'rgba(0, 0, 0, 0.5)',
  frame: '#7a7a7a',
  frameActive: '#111111',
  accent: '#111111',
  chromeBg: '#111111',
  chromeFg: '#f4f4f2',
  selectionBg: 'rgba(0, 0, 0, 0.15)',
  font: TUI_FONT_FAMILY,
};
const TIER_NOTE: Record<Tier, string> = { high: 'ink', mid: 'accent', low: 'wash' };
const WORDS = ['CUSP', 'HANGER', 'ground', 'figure', 'shell', 'ramp', 'tension', 'paper', 'ink', 'wash', 'P3', 'oklch'];

type Format = 'oklch' | 'hex' | 'p3';

export const sketch = ({ wrap, context, canvas, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      desktop?.dispose();
      window.removeEventListener('keydown', onKey);
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  // ─── State ──────────────────────────────────────────────────────────────

  let seed = Random.getRandomSeed();
  const params: { hue: number; mono: number; saturation: number; coolWarm: number; harmony: Harmony; ground: Ground; gamut: Gamut } = {
    hue: Random.rangeFloor(0, 360),
    mono: 0.5,
    saturation: 0.6,
    coolWarm: 0,
    harmony: 'triadic',
    ground: 'light',
    gamut: 'p3',
  };
  let palette: CuspPalette = build();
  /** Which of `palette.hues` the slice shows. */
  let focus = 0;
  let shuffle = 0;
  let format: Format = 'oklch';
  let copied = false;
  let desktop: Desktop | null = null;

  function build(): CuspPalette {
    Random.setSeed(`${seed}/cusp`);
    return cuspPalette(params);
  }

  /** Every parameter change funnels through here. */
  const regenerate = () => {
    palette = build();
    focus = Math.min(focus, palette.hues.length - 1);
    copied = false;
  };

  // ─── Parameter controls ─────────────────────────────────────────────────

  const degrees = (v: number) => `${Math.round(v)}°`.padStart(4);

  const hueRange = createRange({
    id: 'hue',
    label: 'hue',
    min: 0,
    max: 359,
    value: params.hue,
    step: 1,
    format: degrees,
    onChange: (v) => {
      params.hue = v;
      regenerate();
    },
  });
  const monoRange = createRange({
    id: 'mono',
    label: 'monochromatic',
    min: 0,
    max: 1,
    value: params.mono,
    step: 0.01,
    onChange: (v) => {
      params.mono = v;
      regenerate();
    },
  });
  const saturationRange = createRange({
    id: 'saturation',
    label: 'saturation (tension)',
    min: 0,
    max: 1,
    value: params.saturation,
    step: 0.01,
    onChange: (v) => {
      params.saturation = v;
      regenerate();
    },
  });
  const warmRange = createRange({
    id: 'coolWarm',
    label: 'cool · warm drift',
    min: 0,
    max: 0.5,
    value: params.coolWarm,
    step: 0.01,
    onChange: (v) => {
      params.coolWarm = v;
      regenerate();
    },
  });
  const harmonyToggle = createToggleGroup({
    items: HARMONIES.map((h) => ({ id: h, label: h })),
    exclusive: true,
    active: params.harmony,
    onChange: ([id]) => {
      params.harmony = id as Harmony;
      regenerate();
    },
  });
  const groundToggle = createToggleGroup({
    items: [
      { id: 'light', label: 'light ground' },
      { id: 'dark', label: 'dark ground' },
    ],
    exclusive: true,
    active: params.ground,
    onChange: ([id]) => {
      params.ground = id as Ground;
      regenerate();
    },
  });
  const gamutToggle = createToggleGroup({
    items: [
      { id: 'p3', label: 'display-p3' },
      { id: 'srgb', label: 'srgb' },
    ],
    exclusive: true,
    active: params.gamut,
    onChange: ([id]) => {
      params.gamut = id as Gamut;
      regenerate();
    },
  });

  const randomHue = () => {
    Random.setSeed(Random.getRandomSeed());
    params.hue = Random.rangeFloor(0, 360);
    hueRange.value = params.hue;
    regenerate();
  };
  const reseed = () => {
    seed = Random.getRandomSeed();
    regenerate();
  };
  const setHarmony = (h: Harmony) => {
    params.harmony = h;
    harmonyToggle.setActive(h);
    regenerate();
  };
  const setGround = (g: Ground) => {
    params.ground = g;
    groundToggle.setActive(g);
    regenerate();
  };
  const setGamut = (g: Gamut) => {
    params.gamut = g;
    gamutToggle.setActive(g);
    regenerate();
  };
  const nudgeHue = (d: number) => {
    params.hue = (((params.hue + d) % 360) + 360) % 360;
    hueRange.value = params.hue;
    regenerate();
  };
  const nudgeMono = (d: number) => {
    params.mono = Math.max(0, Math.min(1, Number((params.mono + d).toFixed(2))));
    monoRange.value = params.mono;
    regenerate();
  };

  const parameterControls: TuiControl[] = [
    hueRange,
    monoRange,
    saturationRange,
    warmRange,
    harmonyToggle,
    groundToggle,
    gamutToggle,
    createButton({ id: 'random', label: 'random hue', onPress: randomHue }),
    createButton({ id: 'reseed', label: 'reseed ground + jitter', onPress: reseed }),
  ];
  const parameterHost = createControlHost(parameterControls, { rows: 0, cols: 1 });

  const copy = () => {
    const text = snippet(palette, format);
    logColors(palette.colors);
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard) return;
    clipboard
      .writeText(text)
      .then(() => {
        copied = true;
        props.render();
      })
      .catch(() => {});
  };

  // ─── palette window ─────────────────────────────────────────────────────

  /** One row per line of the table: the ground, then each tier's header and swatches. */
  type PaletteRow = { kind: 'ground' } | { kind: 'tier'; tier: Tier } | { kind: 'swatch'; swatch: CuspSwatch };
  const paletteRows = (): PaletteRow[] => {
    const rows: PaletteRow[] = [{ kind: 'ground' }];
    for (const tier of TIERS) {
      rows.push({ kind: 'tier', tier });
      for (const swatch of palette.tiers[tier]) rows.push({ kind: 'swatch', swatch });
    }
    return rows;
  };

  const drawSwatchRow = (buf: GlyphBuffer, row: number, inner: CellRect, s: CuspSwatch, block: string, blockColor: string) => {
    const t = desktop!.theme;
    const focused = s.hueIndex === focus || (s.tier === 'bg' && focus === 0);
    const c = inner.col;
    buf.text(row, c, focused ? '▸' : ' ', t.accent);
    buf.text(row, c + 2, block, blockColor);
    buf.text(row, c + 9, s.css, focused ? t.fg : t.dim, undefined, 30);
    buf.text(row, c + 40, s.hex, t.dim, undefined, 7);
    buf.text(row, c + 48, s.tier === 'bg' ? '    ' : s.relC.toFixed(2), t.fg, undefined, 4);
    buf.text(row, c + 54, s.tier === 'bg' ? '    bg' : `${s.contrast.toFixed(1)}:1`.padStart(6), t.fg, undefined, 6);
    buf.text(row, c + 62, `h ${String(Math.round(s.color.h)).padStart(3)}`, t.dim, undefined, Math.max(0, inner.cols - 62));
    if (s.tier === 'bg') buf.text(row, c + 69, `L ${s.color.l.toFixed(3)}`, t.dim, undefined, Math.max(0, inner.cols - 69));
  };

  const drawPalette = (buf: GlyphBuffer, inner: CellRect) => {
    const t = desktop!.theme;
    buf.text(inner.row, inner.col + 1, describe(palette), t.dim, undefined, inner.cols - 2);
    buf.text(inner.row + 1, inner.col + 9, 'oklch', t.dim);
    buf.text(inner.row + 1, inner.col + 40, 'hex', t.dim);
    buf.text(inner.row + 1, inner.col + 48, 'relC', t.dim);
    buf.text(inner.row + 1, inner.col + 53, 'contrast', t.dim);
    paletteRows().forEach((r, i) => {
      const row = inner.row + 2 + i;
      if (row >= inner.row + inner.rows) return;
      if (r.kind === 'ground') drawSwatchRow(buf, row, inner, palette.bg, BLOCK, palette.bg.css);
      else if (r.kind === 'tier') {
        buf.text(row, inner.col + 2, `${r.tier} · ${TIER_NOTE[r.tier]} · ≈${TIER_TARGETS[r.tier]}:1`, t.dim, undefined, inner.cols - 2);
      } else drawSwatchRow(buf, row, inner, r.swatch, BLOCK, r.swatch.css);
    });
  };

  const paletteContent: TuiContent = {
    pointerDown(cell, inner) {
      const r = paletteRows()[cell.row - inner.row - 2];
      if (!r || r.kind === 'tier') return false;
      focus = r.kind === 'ground' ? 0 : r.swatch.hueIndex;
      return true;
    },
    pointerMove: () => false,
    pointerUp: () => false,
    cursorAt(cell, inner) {
      const r = paletteRows()[cell.row - inner.row - 2];
      return r && r.kind !== 'tier' ? 'pointer' : null;
    },
  };

  // ─── hues window ────────────────────────────────────────────────────────

  const drawHues = (buf: GlyphBuffer, inner: CellRect) => {
    const t = desktop!.theme;
    const cols = inner.cols;
    const lut = palette.lut;
    for (let c = 0; c < cols; c++) {
      const h = ((c + 0.5) / cols) * 360;
      buf.put(inner.row, inner.col + c, '█', toCss(relch({ lut, l: 0.72, relC: 0.9, h })));
    }
    if (inner.rows < 2) return;
    const marks = palette.hues
      .map((h, i) => ({ i, col: inner.col + Math.min(cols - 1, Math.floor((h / 360) * cols)), label: `${Math.round(h)}°` }))
      .sort((a, b) => a.col - b.col);
    for (const m of marks) buf.put(inner.row + 1, m.col, m.i === focus ? '▲' : '▴', palette.tiers.mid[m.i].css);
    if (inner.rows > 2) {
      // Labels are centred under their marks and nudged right when neighbours would overlap.
      let next = inner.col;
      for (const m of marks) {
        const col = Math.max(next, Math.min(inner.col + cols - m.label.length, m.col - Math.floor(m.label.length / 2)));
        if (col + m.label.length > inner.col + cols) break;
        buf.text(inner.row + 2, col, m.label, m.i === focus ? t.fg : t.dim);
        next = col + m.label.length + 1;
      }
    }
    if (inner.rows > 3) {
      const spread = Math.round(spreadFor(params.mono) * 100);
      buf.text(inner.row + 3, inner.col, `${params.harmony} at ${spread}% spread · ground shares the base hue`, t.dim, undefined, cols);
    }
  };

  const huesContent: TuiContent = {
    pointerDown(cell, inner) {
      if (cell.row !== inner.row) return false;
      params.hue = Math.round(((cell.col - inner.col + 0.5) / inner.cols) * 360) % 360;
      hueRange.value = params.hue;
      regenerate();
      return true;
    },
    pointerMove: () => false,
    pointerUp: () => false,
    cursorAt: (cell, inner) => (cell.row === inner.row ? 'pointer' : null),
  };

  // ─── slice window ───────────────────────────────────────────────────────

  /** The focused hue's constant-hue slice: rows = lightness (1 at the top), cols = chroma. */
  const drawSlice = (buf: GlyphBuffer, inner: CellRect) => {
    const t = desktop!.theme;
    const hue = palette.hues[focus] ?? params.hue;
    const peak = cusp(hue, oklchP3);
    const cMax = peak.c * 1.08;
    buf.text(inner.row, inner.col, `h ${Math.round(hue)} · cusp L ${peak.l.toFixed(2)} C ${peak.c.toFixed(3)}`, t.dim, undefined, inner.cols);
    const chartRows = inner.rows - 2;
    const axis = 4;
    const chartCols = inner.cols - axis;
    if (chartRows < 2 || chartCols < 4) return;
    const top = inner.row + 1;
    const left = inner.col + axis;
    const rowOf = (l: number) => top + Math.min(chartRows - 1, Math.max(0, Math.floor((1 - l) * chartRows)));
    const colOf = (c: number) => left + Math.min(chartCols - 1, Math.max(0, Math.floor((c / cMax) * chartCols)));

    for (let r = 0; r < chartRows; r++) {
      const l = 1 - (r + 0.5) / chartRows;
      const srgbShell = maxChromaAt(hue, l, oklchSrgb);
      const p3Shell = maxChromaAt(hue, l, oklchP3);
      for (let c = 0; c < chartCols; c++) {
        const chroma = ((c + 0.5) / chartCols) * cMax;
        if (chroma > p3Shell) continue;
        const color = toCss({ mode: 'oklch', l, c: chroma, h: hue });
        buf.put(top + r, left + c, chroma <= srgbShell ? '█' : '▒', color);
      }
    }
    // Lightness axis on the left.
    buf.text(top, inner.col, '1.0', t.dim);
    buf.text(top + Math.floor(chartRows / 2), inner.col, '0.5', t.dim);
    buf.text(top + chartRows - 1, inner.col, '0.0', t.dim);
    // The paper's ramp for this hue, then the picks on top.
    const dotColor = (cell: string) => legibleOn(cell, palette.bg.css, t.fg);
    for (const c of palette.ramps[focus] ?? []) buf.put(rowOf(c.l), colOf(c.c), '·', dotColor(toCss(c)));
    for (const tier of TIERS) {
      const s = palette.tiers[tier][focus];
      if (!s) continue;
      buf.put(rowOf(s.color.l), colOf(s.color.c), tier[0].toUpperCase(), legibleOn(s.css, palette.bg.css, t.fg), s.css);
    }
    buf.put(rowOf(palette.bg.color.l), colOf(palette.bg.color.c), '○', t.fg);
    buf.text(top + chartRows, inner.col, 'C 0', t.dim);
    const legend = `█ srgb ▒ p3 only · ${cMax.toFixed(2)}`;
    buf.text(top + chartRows, inner.col + inner.cols - legend.length, legend, t.dim);
  };

  // ─── specimen window ────────────────────────────────────────────────────

  const drawSpecimen = (buf: GlyphBuffer, inner: CellRect) => {
    Random.setSeed(`${seed}/specimen/${shuffle}/${palette.colors.join()}`);
    const { high, mid, low } = palette.tiers;
    // The specimen sits on the palette's own ground — the one place the chrome gives way to colour.
    buf.fill(inner, ' ', high[0].css, palette.bg.css);
    const area = cellRect(inner.row + 1, inner.col, inner.rows - 1, inner.cols);
    if (area.rows < 3 || area.cols < 8) return;
    const rect = (minR: number, minC: number) => {
      const rows = Random.rangeFloor(minR, Math.max(minR + 1, Math.floor(area.rows / 2)));
      const cols = Random.rangeFloor(minC, Math.max(minC + 1, Math.floor(area.cols / 2)));
      return cellRect(area.row + Random.rangeFloor(0, area.rows - rows + 1), area.col + Random.rangeFloor(0, area.cols - cols + 1), rows, cols);
    };
    // Washes: solid fields of the low tier.
    for (let i = 0; i < Random.rangeFloor(3, 6); i++) buf.fill(rect(2, 6), ' ', high[0].css, Random.pick(low).css);
    // Textures: density glyphs in the mid tier.
    for (let i = 0; i < Random.rangeFloor(2, 5); i++) {
      const r = rect(1, 4);
      const ch = Random.pick(['░', '▒', '▓', '●', '○', '◆', '│', '─']);
      buf.fill(r, ch, Random.pick(mid).css);
    }
    // Words: the high tier as ink, sat on a wash so they always read.
    for (let i = 0; i < Random.rangeFloor(3, 6); i++) {
      const word = Random.pick(WORDS);
      const row = area.row + Random.rangeFloor(0, area.rows);
      const col = area.col + Random.rangeFloor(0, Math.max(1, area.cols - word.length));
      const ink = Random.pick(high);
      buf.text(row, col, word, ink.css, Random.chance(0.5) ? Random.pick(low).css : undefined);
    }
    // A rule in the mid tier and the tiers' names as a key.
    const ruleRow = area.row + Random.rangeFloor(0, area.rows);
    buf.hline(ruleRow, area.col, area.cols, Random.pick(mid).css, undefined, '━');
    buf.text(inner.row, inner.col, 'in use · click to reshuffle', high[0].css, palette.bg.css, inner.cols);
  };

  const specimenContent: TuiContent = {
    pointerDown() {
      shuffle++;
      return true;
    },
    pointerMove: () => false,
    pointerUp: () => false,
    cursorAt: () => 'pointer',
  };

  // ─── code window ────────────────────────────────────────────────────────

  const drawCode = (buf: GlyphBuffer, inner: CellRect) => {
    const t = desktop!.theme;
    const lines = snippet(palette, format).split('\n');
    buf.text(inner.row, inner.col, copied ? '✓ copied' : `${format} · click to copy`, copied ? t.accent : t.dim, undefined, inner.cols);
    lines.forEach((line, i) => {
      const row = inner.row + 1 + i;
      if (row >= inner.row + inner.rows) return;
      const swatch = i >= 2 && i - 2 < palette.colors.length ? [palette.bg, ...palette.fg][i - 2] : null;
      if (swatch) buf.put(row, inner.col, '█', swatch.css);
      buf.text(row, inner.col + (swatch ? 1 : 0), swatch ? line.slice(1) : line, i < 1 ? t.dim : t.fg, undefined, inner.cols - 1);
    });
  };

  const codeContent: TuiContent = {
    pointerDown() {
      copy();
      return true;
    },
    pointerMove: () => false,
    pointerUp: () => false,
    cursorAt: () => 'pointer',
  };

  // ─── Windows ────────────────────────────────────────────────────────────

  const bodies: Record<string, { draw: (buf: GlyphBuffer, inner: CellRect) => void; content: TuiContent }> = {
    parameters: { draw: (buf, inner) => parameterHost.draw(buf, inner, desktop!.theme), content: parameterHost },
    slice: { draw: drawSlice, content: { pointerDown: () => false, pointerMove: () => false, pointerUp: () => false } },
    palette: { draw: drawPalette, content: paletteContent },
    hues: { draw: drawHues, content: huesContent },
    specimen: { draw: drawSpecimen, content: specimenContent },
    code: { draw: drawCode, content: codeContent },
  };

  const drawWindow = (buf: GlyphBuffer, inner: CellRect, win: TuiWindow) => {
    if (inner.rows < 1 || inner.cols < 4) return;
    bodies[win.title]?.draw(buf, inner);
  };

  // ─── Settings popup ─────────────────────────────────────────────────────

  const settingsControls: TuiControl[] = [
    createToggleGroup({
      items: [
        { id: 'oklch', label: 'oklch() output' },
        { id: 'hex', label: 'hex output' },
        { id: 'p3', label: 'color(display-p3) output' },
      ],
      exclusive: true,
      active: format,
      onChange: ([id]) => {
        format = id as Format;
        copied = false;
      },
    }),
    createToggleGroup({
      items: [
        { id: 'paper', label: 'paper chrome' },
        { id: 'slate', label: 'slate chrome' },
      ],
      exclusive: true,
      active: 'paper',
      onChange: ([id]) => {
        desktop?.setTheme(id === 'slate' ? { ...fallbackTheme } : { ...PAPER_THEME });
      },
    }),
    createButton({ id: 'copy', label: 'copy palette', onPress: copy }),
  ];

  // ─── Desktop ────────────────────────────────────────────────────────────

  desktop = createDesktop({
    ctx: context,
    canvas,
    width,
    height,
    theme: { ...PAPER_THEME },
    font: { size: 14, lineH: 20 },
    menuBar: 'bottom',
    settings: { controls: settingsControls, cols: 30 },
    status: () => `cusp-hanger · ${params.gamut} · seed ${seed}`,
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
      onClose: (win) => desktop?.removeWindow(win),
    });
  }

  // ─── Keyboard ───────────────────────────────────────────────────────────

  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const step = (list: readonly Harmony[], dir: 1 | -1) => list[(list.indexOf(params.harmony) + dir + list.length) % list.length];
    switch (e.key) {
      case 'ArrowRight':
        nudgeHue(5);
        break;
      case 'ArrowLeft':
        nudgeHue(-5);
        break;
      case 'ArrowUp':
        nudgeMono(0.05);
        break;
      case 'ArrowDown':
        nudgeMono(-0.05);
        break;
      case ']':
        setHarmony(step(HARMONIES, 1));
        break;
      case '[':
        setHarmony(step(HARMONIES, -1));
        break;
      case 'd':
        setGround(params.ground === 'light' ? 'dark' : 'light');
        break;
      case 'g':
        setGamut(params.gamut === 'p3' ? 'srgb' : 'p3');
        break;
      case 'r':
        randomHue();
        break;
      case 's':
        reseed();
        break;
      case 'x':
        shuffle++;
        break;
      case 'c':
        copy();
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
      params,
      palette: () => palette,
      regenerate,
      randomHue,
      reseed,
      copy,
      repaint: () => props.render(),
    };
  }

  wrap.render = () => desktop?.render();
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  // Display-P3 canvas: the oklch() strings render without clipping to sRGB.
  attributes: { colorSpace: 'display-p3' },
};

ssam(sketch as Sketch<'2d'>, settings);
