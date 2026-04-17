#!/usr/bin/env node
// Standalone terminal renderer for the layered-compositions sketch.
// Run: node layered-compositions-terminal.mjs
// Ctrl-C to quit.

// --- Seeded RNG (mulberry32) ---
let rngState = (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0;
function rand() {
  let t = (rngState += 0x6d2b79f5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const Random = {
  value: () => rand(),
  range: (min, max) => min + rand() * (max - min),
  rangeFloor: (min, max) => Math.floor(min + rand() * (max - min)),
  chance: (p = 0.5) => rand() < p,
  pick: (arr) => arr[Math.floor(rand() * arr.length)],
  shuffle: (arr) => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  getRandomSeed: () => Math.floor(Math.random() * 1e9) >>> 0,
  setSeed: (s) => {
    rngState = (s >>> 0) || 1;
  },
};

// --- Palettes (bg first, then foreground colors) ---
const PALETTES = [
  ['#0f0f12', '#ff6b6b', '#ffd166', '#06d6a0', '#118ab2', '#ef476f'],
  ['#1a1a2e', '#e94560', '#f5f5f5', '#16a6b5', '#ffa630'],
  ['#0d1b2a', '#e0e1dd', '#778da9', '#f4a261', '#e76f51'],
  ['#121212', '#ef233c', '#edf2f4', '#8d99ae', '#ffb703'],
  ['#000000', '#fca311', '#e5e5e5', '#7dd3fc', '#f472b6'],
  ['#1b1b1b', '#9bf6ff', '#ffadad', '#caffbf', '#fdffb6', '#bdb2ff'],
];
function randomPalette() {
  return PALETTES[Math.floor(rand() * PALETTES.length)];
}

// --- ANSI helpers ---
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
function fgCode(hex) {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
}
function bgCode(hex) {
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
}
const RESET = '\x1b[0m';
const HIDE_CURSOR = '\x1b[?25l';
const SHOW_CURSOR = '\x1b[?25h';
const HOME = '\x1b[H';
const CLEAR = '\x1b[2J\x1b[H';

// --- Config ---
const config = {
  gutter: 1,
  weftDensity: 0.42,
  warpDensity: 0.28,
  densityMix: 0.35,
  asciiMix: 0.3,
  randomartMix: 0.25,
  warpAmplitude: 2,
  marginRows: 2,
  marginCols: 4,
};

const PLOT_ROWS = 5;

// --- Generators ---
function genWave(n, amplitude, periods) {
  const p = Math.max(1, Math.round(periods));
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    return (
      amplitude *
      (0.5 + 0.4 * Math.sin(t * Math.PI * 2 * p)) *
      Random.range(0.92, 1.08)
    );
  });
}
function genTrending(n, start, end) {
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const s = 0.5 - 0.5 * Math.cos(t * Math.PI * 2);
    return Math.max(0, (start + (end - start) * s) * Random.range(0.85, 1.15));
  });
}
function genFlat(n, val) {
  return Array.from({ length: n }, () =>
    Math.max(0, val * Random.range(0.8, 1.2)),
  );
}
function genWarpWave(n, phase, periods) {
  const p = Math.max(1, Math.round(periods));
  return Array.from({ length: n }, (_, i) => {
    const t = i / n;
    const primary = Math.sin(t * Math.PI * 2 * p + phase);
    const harmonic = 0.25 * Math.sin(t * Math.PI * 4 * p + phase * 1.3);
    return 0.5 + 0.45 * (primary + harmonic);
  });
}
function extendCyclic(arr, extra) {
  return arr.concat(arr.slice(0, extra));
}

// --- Grid / bounds ---
function makeGrid(rows, cols) {
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );
}
function inBounds(r, c, b) {
  return r >= b.rowMin && r <= b.rowMax && c >= b.colMin && c <= b.colMax;
}
function put(grid, row, col, char, color, clip) {
  if (!inBounds(row, col, clip)) return;
  if (row < 0 || row >= grid.length || col < 0 || col >= grid[0].length) return;
  grid[row][col] = { char, color };
}

// --- Drawing ---
function drawWeftSeries(
  grid,
  values,
  color,
  baseRow,
  plotStartCol,
  plotEndCol,
  axisMax,
  weftIdxGrid,
  weftIdx,
  clip,
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  if (W <= 1 || N < 2 || axisMax <= 0) return;
  const colAt = (i) => Math.round((i * (W - 1)) / (N - 1));
  const rowAt = (v) =>
    baseRow + Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  const mark = (r, c, ch) => {
    if (!inBounds(r, c, clip)) return;
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
    weftIdxGrid[r][c] = weftIdx;
  };

  for (let i = 0; i < N; i++) {
    const r = rows[i];
    const cEnd = i < N - 1 ? cols[i + 1] : W;
    for (let c = cols[i]; c < cEnd; c++) mark(r, plotStartCol + c, '─');
  }

  for (let i = 1; i < N; i++) {
    const absC = plotStartCol + cols[i];
    const r1 = rows[i - 1];
    const r2 = rows[i];
    if (r1 === r2) continue;
    const top = Math.min(r1, r2);
    const bot = Math.max(r1, r2);
    if (r2 < r1) {
      mark(r1, absC, '╯');
      mark(r2, absC, '╭');
    } else {
      mark(r1, absC, '╮');
      mark(r2, absC, '╰');
    }
    for (let r = top + 1; r < bot; r++) mark(r, absC, '│');
  }
}

function drawWarpSeries(
  grid,
  values,
  color,
  baseCol,
  amplitude,
  warpIdx,
  rowStart,
  weftIdxGrid,
  clip,
) {
  const H = values.length;
  if (H < 2) return;
  const cols = values.map(
    (v) => baseCol + Math.round((v - 0.5) * 2 * amplitude),
  );

  const canDraw = (r, c) => {
    if (!inBounds(r, c, clip)) return false;
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return false;
    const wi = weftIdxGrid[r][c];
    if (wi === -1) return true;
    return (wi + warpIdx) % 2 !== 0;
  };

  const tryPut = (r, c, ch) => {
    if (canDraw(r, c)) put(grid, r, c, ch, color, clip);
  };

  for (let i = 0; i < H; i++) {
    const r = rowStart + i;
    const hasTransition = i > 0 && cols[i] !== cols[i - 1];
    if (hasTransition) continue;
    tryPut(r, cols[i], '│');
  }

  for (let i = 1; i < H; i++) {
    const r = rowStart + i;
    const c1 = cols[i - 1];
    const c2 = cols[i];
    if (c1 === c2) continue;
    const left = Math.min(c1, c2);
    const right = Math.max(c1, c2);
    if (c2 > c1) {
      tryPut(r, c1, '╰');
      tryPut(r, c2, '╮');
    } else {
      tryPut(r, c2, '╭');
      tryPut(r, c1, '╯');
    }
    for (let c = left + 1; c < right; c++) tryPut(r, c, '─');
  }
}

function drawDensityWeftSeries(
  grid,
  values,
  color,
  baseRow,
  plotStartCol,
  plotEndCol,
  axisMax,
  weftIdxGrid,
  weftIdx,
  clip,
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  if (W <= 1 || N < 2 || axisMax <= 0) return;
  const colAt = (i) => Math.round((i * (W - 1)) / (N - 1));
  const rowAt = (v) =>
    baseRow + Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  const mark = (r, c, ch) => {
    if (!inBounds(r, c, clip)) return;
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
    weftIdxGrid[r][c] = weftIdx;
  };

  const gradient = ['░', '▒', '█', '▒', '░'];
  const center = 2;

  for (let i = 0; i < N; i++) {
    const r = rows[i];
    const cEnd = i < N - 1 ? cols[i + 1] : W;
    for (let c = cols[i]; c < cEnd; c++) {
      const absC = plotStartCol + c;
      for (let d = -2; d <= 2; d++) {
        mark(r + d, absC, gradient[center + d]);
      }
    }
  }

  for (let i = 1; i < N; i++) {
    const absC = plotStartCol + cols[i];
    const r1 = rows[i - 1];
    const r2 = rows[i];
    if (r1 === r2) continue;
    const top = Math.min(r1, r2);
    const bot = Math.max(r1, r2);
    for (let r = top; r <= bot; r++) mark(r, absC, '█');
    mark(top - 1, absC, '▓');
    mark(bot + 1, absC, '▓');
  }
}

function drawAsciiWeftSeries(
  grid,
  values,
  color,
  baseRow,
  plotStartCol,
  plotEndCol,
  axisMax,
  weftIdxGrid,
  weftIdx,
  clip,
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  if (W <= 1 || N < 2 || axisMax <= 0) return;
  const colAt = (i) => Math.round((i * (W - 1)) / (N - 1));
  const rowAt = (v) =>
    baseRow + Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  const mark = (r, c, ch) => {
    if (!inBounds(r, c, clip)) return;
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
    weftIdxGrid[r][c] = weftIdx;
  };

  for (let i = 0; i < N; i++) {
    const r = rows[i];
    const cEnd = i < N - 1 ? cols[i + 1] : W;
    for (let c = cols[i]; c < cEnd; c++) mark(r, plotStartCol + c, '=');
  }

  for (let i = 1; i < N; i++) {
    const absC = plotStartCol + cols[i];
    const r1 = rows[i - 1];
    const r2 = rows[i];
    if (r1 === r2) continue;
    const top = Math.min(r1, r2);
    const bot = Math.max(r1, r2);
    mark(r1, absC, '+');
    mark(r2, absC, '+');
    for (let r = top + 1; r < bot; r++) mark(r, absC, '|');
  }
}

function drawRandomartWeftSeries(
  grid,
  values,
  color,
  baseRow,
  plotStartCol,
  plotEndCol,
  axisMax,
  weftIdxGrid,
  weftIdx,
  clip,
) {
  const W = plotEndCol - plotStartCol;
  const N = values.length;
  if (W <= 1 || N < 2 || axisMax <= 0) return;
  const H = PLOT_ROWS + 1;
  const colAt = (i) => Math.round((i * (W - 1)) / (N - 1));
  const rowAt = (v) =>
    Math.round((1 - Math.min(v, axisMax) / axisMax) * PLOT_ROWS);

  const cols = values.map((_, i) => colAt(i));
  const rows = values.map(rowAt);

  const visits = Array.from({ length: H }, () => new Array(W).fill(0));

  if (rows[0] >= 0 && rows[0] < H && cols[0] >= 0 && cols[0] < W) {
    visits[rows[0]][cols[0]]++;
  }
  for (let i = 0; i < N - 1; i++) {
    const c0 = cols[i];
    const r0 = rows[i];
    const c1 = cols[i + 1];
    const r1 = rows[i + 1];
    const dc = c1 - c0;
    const dr = r1 - r0;
    const steps = Math.max(Math.abs(dc), Math.abs(dr), 1);
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      const c = Math.round(c0 + dc * t);
      const r = Math.round(r0 + dr * t);
      if (r >= 0 && r < H && c >= 0 && c < W) visits[r][c]++;
    }
  }

  const ramp = ' .o+=*BOX@%&#/^';

  const mark = (r, c, ch) => {
    if (!inBounds(r, c, clip)) return;
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
    weftIdxGrid[r][c] = weftIdx;
  };

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const v = visits[r][c];
      if (v === 0) continue;
      const idx = Math.min(v, ramp.length - 1);
      mark(baseRow + r, plotStartCol + c, ramp[idx]);
    }
  }

  mark(baseRow + rows[0], plotStartCol + cols[0], 'S');
  mark(baseRow + rows[N - 1], plotStartCol + cols[N - 1], 'E');
}

function drawRectBorder(grid, rect, color) {
  const r0 = rect.row;
  const r1 = rect.row + rect.rows - 1;
  const c0 = rect.col;
  const c1 = rect.col + rect.cols - 1;
  if (r1 <= r0 || c1 <= c0) return;

  const setCell = (r, c, ch) => {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return;
    grid[r][c] = { char: ch, color };
  };

  for (let c = c0 + 1; c < c1; c++) {
    setCell(r0, c, '─');
    setCell(r1, c, '─');
  }
  for (let r = r0 + 1; r < r1; r++) {
    setCell(r, c0, '│');
    setCell(r, c1, '│');
  }
  setCell(r0, c0, '┌');
  setCell(r0, c1, '┐');
  setCell(r1, c0, '└');
  setCell(r1, c1, '┘');
}

// --- Layouts ---
function modularGrid(ROWS, COLS) {
  const gmR = Math.max(2, Math.floor(ROWS / 18));
  const gmC = Math.max(3, Math.floor(COLS / 18));
  const mW = Math.floor((COLS - 4 * gmC) / 3);
  const mH = Math.floor((ROWS - 5 * gmR) / 4);
  return { gmR, gmC, mW, mH };
}
const cellCol = (c, gmC, mW) => gmC + c * (mW + gmC);
const cellRow = (r, gmR, mH) => gmR + r * (mH + gmR);
const spanCols = (span, mW, gmC) => span * mW + (span - 1) * gmC;
const spanRows = (span, mH, gmR) => span * mH + (span - 1) * gmR;

function layoutA(ROWS, COLS) {
  const { gmR, gmC, mW, mH } = modularGrid(ROWS, COLS);
  const rects = [];
  const centralSpanC = Random.rangeFloor(2, 4);
  const centralSpanR = Random.rangeFloor(2, 4);
  const centralStartC = Random.rangeFloor(0, 4 - centralSpanC);
  const centralStartR = Random.rangeFloor(0, 5 - centralSpanR);
  rects.push({
    col: cellCol(centralStartC, gmC, mW),
    row: cellRow(centralStartR, gmR, mH),
    cols: spanCols(centralSpanC, mW, gmC),
    rows: spanRows(centralSpanR, mH, gmR),
  });
  const topSpanC = Random.rangeFloor(2, 4);
  const topThick = Math.max(2, Math.floor(mH * Random.range(0.25, 0.75)));
  rects.push({
    col: gmC,
    row: gmR,
    cols: spanCols(topSpanC, mW, gmC),
    rows: topThick,
  });
  const botSpanC = Random.rangeFloor(1, 3);
  const botSpanR = Random.rangeFloor(1, 3);
  rects.push({
    col: gmC,
    row: cellRow(4 - botSpanR, gmR, mH),
    cols: spanCols(botSpanC, mW, gmC),
    rows: spanRows(botSpanR, mH, gmR),
  });
  if (Random.chance(0.35)) {
    const accentSpan = Random.rangeFloor(1, 3);
    rects.push({
      col: cellCol(3 - accentSpan, gmC, mW),
      row: cellRow(3, gmR, mH),
      cols: spanCols(accentSpan, mW, gmC),
      rows: Math.max(2, Math.floor(mH * Random.range(0.3, 0.7))),
    });
  }
  return rects;
}

function layoutB(ROWS, COLS) {
  const { gmR, gmC, mW, mH } = modularGrid(ROWS, COLS);
  const rects = [];
  const leftSpanC = Random.rangeFloor(2, 4);
  const leftSpanR = Random.rangeFloor(2, 4);
  rects.push({
    col: gmC,
    row: gmR,
    cols: spanCols(leftSpanC, mW, gmC),
    rows: spanRows(leftSpanR, mH, gmR),
  });
  const smallSpanC = Random.rangeFloor(1, 3);
  const smallSpanR = Random.rangeFloor(1, 3);
  rects.push({
    col: cellCol(3 - smallSpanC, gmC, mW),
    row: cellRow(4 - smallSpanR, gmR, mH),
    cols: spanCols(smallSpanC, mW, gmC),
    rows: spanRows(smallSpanR, mH, gmR),
  });
  const barRow = Random.rangeFloor(1, 4);
  const barThick = Math.max(2, Math.floor(gmR * Random.range(0.8, 2.2)));
  rects.push({
    col: gmC,
    row: cellRow(barRow, gmR, mH) - Math.floor(barThick / 2),
    cols: spanCols(3, mW, gmC),
    rows: barThick,
  });
  return rects;
}

function layoutC(ROWS, COLS) {
  const { gmR, gmC, mW, mH } = modularGrid(ROWS, COLS);
  const rects = [];
  const topSpanC = Random.rangeFloor(1, 4);
  const topThick = Math.max(2, Math.floor(gmR * Random.range(0.8, 2.4)));
  rects.push({
    col: gmC,
    row: gmR,
    cols: spanCols(topSpanC, mW, gmC),
    rows: topThick,
  });
  if (topSpanC < 3 && Random.chance(0.7)) {
    rects.push({
      col: cellCol(topSpanC, gmC, mW),
      row: gmR,
      cols: spanCols(3 - topSpanC, mW, gmC),
      rows: Math.max(2, Math.floor(mH * Random.range(0.5, 1.1))),
    });
  }
  const midRow = Random.rangeFloor(1, 3);
  const cellCount = Random.rangeFloor(2, 4);
  const cellHeight = Random.rangeFloor(1, 3);
  const staggerStep = Random.chance(0.5) ? 1 : -1;
  for (let i = 0; i < cellCount; i++) {
    const slot = Math.floor((i * 3) / cellCount);
    const stagger = i % 2 === 1 ? staggerStep * Math.floor(gmR * 0.6) : 0;
    rects.push({
      col: cellCol(slot, gmC, mW),
      row: cellRow(midRow, gmR, mH) + stagger,
      cols: mW,
      rows: spanRows(cellHeight, mH, gmR),
    });
  }
  return rects;
}

function layoutD(ROWS, COLS) {
  const mR = Math.max(2, Math.floor(ROWS / 5));
  const mC = Math.max(3, Math.floor(COLS / 5));
  const mW = COLS - 2 * mC;
  const mH = Math.floor((ROWS - 2 * mR) / 2);
  const rects = [];
  const barOffset = Random.range(0.3, 0.85);
  const barThick = Math.max(2, Math.floor(mR * Random.range(0.1, 0.3)));
  const barInset = Math.floor(mW * Random.range(0, 0.2));
  rects.push({
    col: mC + barInset,
    row: Math.max(0, Math.floor(mR * barOffset)),
    cols: Math.max(8, mW - 2 * barInset),
    rows: barThick,
  });
  const midHeight = Math.floor(mH * Random.range(0.8, 1.15));
  rects.push({ col: mC, row: mR, cols: mW, rows: midHeight });
  const bottomHeight = Math.floor(mH * Random.range(0.5, 1.1));
  const bottomGap = Math.floor(mH * Random.range(0.1, 0.35));
  rects.push({
    col: mC,
    row: mR + midHeight + bottomGap,
    cols: mW,
    rows: Math.max(2, bottomHeight),
  });
  return rects;
}

function layoutE(ROWS, COLS) {
  const mW = Math.floor(COLS / 3);
  const mH = Math.floor(ROWS / 4);
  const rects = [];
  const aSpanR = Random.rangeFloor(2, 4);
  rects.push({ col: 0, row: 0, cols: 2 * mW, rows: aSpanR * mH });
  const bSpanR = Random.rangeFloor(2, 4);
  rects.push({
    col: mW,
    row: (4 - bSpanR) * mH,
    cols: 2 * mW,
    rows: bSpanR * mH,
  });
  const accentRow = Random.rangeFloor(1, 3);
  rects.push({
    col: mW,
    row: accentRow * mH,
    cols: 2 * mW,
    rows: Math.max(2, Math.floor(mH * Random.range(0.15, 0.4))),
  });
  return rects;
}

function buildLayout(name, ROWS, COLS) {
  if (name === 'A') return layoutA(ROWS, COLS);
  if (name === 'B') return layoutB(ROWS, COLS);
  if (name === 'C') return layoutC(ROWS, COLS);
  if (name === 'D') return layoutD(ROWS, COLS);
  return layoutE(ROWS, COLS);
}

function rectValid(rect, ROWS, COLS) {
  return (
    rect.rows >= 2 &&
    rect.cols >= 4 &&
    rect.row >= 0 &&
    rect.col >= 0 &&
    rect.row + rect.rows <= ROWS &&
    rect.col + rect.cols <= COLS
  );
}

function pickWeftBuffer(bufferN) {
  const kind = Random.rangeFloor(0, 4);
  if (kind === 0) return genFlat(bufferN, Random.rangeFloor(3, 9));
  if (kind === 1)
    return genWave(bufferN, Random.rangeFloor(5, 10), Random.rangeFloor(1, 3));
  if (kind === 2)
    return genTrending(
      bufferN,
      Random.rangeFloor(1, 5),
      Random.rangeFloor(5, 10),
    );
  return genWave(bufferN, Random.rangeFloor(6, 10), Random.rangeFloor(1, 4));
}

function buildPattern(rect, palette, bufferN, weftIdxBase) {
  const plotStartCol = rect.col + config.gutter;
  const plotEndCol = rect.col + rect.cols - config.gutter;
  const plotStartRow = rect.row + config.gutter;
  const innerRows = Math.max(1, rect.rows - config.gutter * 2);
  const innerCols = Math.max(1, plotEndCol - plotStartCol);

  const bounds = {
    rowMin: plotStartRow,
    rowMax: plotStartRow + innerRows - 1,
    colMin: plotStartCol,
    colMax: plotEndCol - 1,
  };

  const weftCount = Math.max(
    1,
    Math.min(
      Math.floor(innerRows * config.weftDensity),
      Math.max(1, innerRows - 1),
    ),
  );
  const warpCount = Math.max(
    1,
    Math.min(
      Math.floor(innerCols * config.warpDensity),
      Math.max(1, Math.floor(innerCols / 2)),
    ),
  );

  const weftBuffers = [];
  const weftKinds = [];
  const localDensityMix = Random.range(
    Math.max(0, config.densityMix - 0.2),
    Math.min(1, config.densityMix + 0.2),
  );
  const localAsciiMix = Random.range(
    Math.max(0, config.asciiMix - 0.2),
    Math.min(1, config.asciiMix + 0.2),
  );
  const localRandomartMix = Random.range(
    Math.max(0, config.randomartMix - 0.2),
    Math.min(1, config.randomartMix + 0.2),
  );

  for (let i = 0; i < weftCount; i++) {
    const base = pickWeftBuffer(bufferN);
    weftBuffers.push(extendCyclic(base, bufferN));
    const roll = Random.value();
    const tAscii = localAsciiMix;
    const tDensity = tAscii + localDensityMix;
    const tRandomart = tDensity + localRandomartMix;
    let kind;
    if (roll < tAscii) kind = 'ascii';
    else if (roll < tDensity) kind = 'density';
    else if (roll < tRandomart) kind = 'randomart';
    else kind = 'line';
    weftKinds.push(kind);
  }

  const availRows = Math.max(0, innerRows - PLOT_ROWS - 1);
  const weftBaseRows = [];
  for (let i = 0; i < weftCount; i++) {
    const offsetRow =
      weftCount === 1
        ? Math.floor(availRows / 2)
        : Math.floor((i * availRows) / (weftCount - 1));
    weftBaseRows.push(plotStartRow + offsetRow);
  }

  const rectPalette = Random.shuffle(palette.slice()).slice(
    0,
    Math.min(palette.length, Random.rangeFloor(2, 4)),
  );
  const weftColors = Array.from(
    { length: weftCount },
    (_, i) => rectPalette[i % rectPalette.length],
  );
  const weftAxisMaxes = weftBuffers.map((b) => Math.max(...b, 1));

  const warpAmpRoom = Math.max(0, Math.floor(innerCols / warpCount / 2) - 1);
  const warpAmplitude = Math.min(config.warpAmplitude, warpAmpRoom);

  const warpBuffers = [];
  const warpCols = [];
  const warpColors = [];
  for (let i = 0; i < warpCount; i++) {
    const phase = (i / warpCount) * Math.PI * 2 + Random.range(0, Math.PI);
    const periods = Random.rangeFloor(1, 4);
    warpBuffers.push(
      extendCyclic(genWarpWave(bufferN, phase, periods), innerRows),
    );
    warpCols.push(
      plotStartCol + Math.round(((i + 0.5) * innerCols) / warpCount),
    );
    warpColors.push(rectPalette[(i + 1) % rectPalette.length]);
  }

  return {
    rect,
    bounds,
    weftBuffers,
    weftKinds,
    weftColors,
    weftBaseRows,
    weftAxisMaxes,
    warpBuffers,
    warpCols,
    warpColors,
    warpAmplitude,
    plotStartCol,
    plotEndCol,
    plotStartRow,
    innerRows,
    weftIdxBase,
    borderColor: rectPalette[0],
  };
}

// --- Main ---
const DURATION_MS = 8000;
const FPS = 24;
const N = 64;
const BUFFER_N = N + 16;

let COLS = process.stdout.columns || 120;
let ROWS = process.stdout.rows || 40;

let seed = Random.getRandomSeed();
let rawPalette = [];
let BG_HEX = '#000000';
let PALETTE = [];
let patterns = [];

function rebuild() {
  Random.setSeed(seed);
  rawPalette = randomPalette();
  BG_HEX = rawPalette[0];
  PALETTE = rawPalette.length > 1 ? rawPalette.slice(1) : rawPalette.slice();

  const layoutName = Random.pick(['A', 'B', 'C', 'D', 'E']);
  const mR = config.marginRows;
  const mC = config.marginCols;
  const innerROWS = Math.max(4, ROWS - 2 * mR);
  const innerCOLS = Math.max(8, COLS - 2 * mC);
  const rects = buildLayout(layoutName, innerROWS, innerCOLS)
    .map((r) => ({
      row: r.row + mR,
      col: r.col + mC,
      rows: r.rows,
      cols: r.cols,
    }))
    .filter(
      (r) => rectValid(r, ROWS - mR, COLS - mC) && r.row >= mR && r.col >= mC,
    );

  let weftIdxCursor = 0;
  patterns = rects.map((rect) => {
    const pat = buildPattern(rect, PALETTE, BUFFER_N, weftIdxCursor);
    weftIdxCursor += pat.weftBuffers.length;
    return pat;
  });
}

function render(playhead) {
  const offset = Math.floor(playhead * BUFFER_N) % BUFFER_N;
  const grid = makeGrid(ROWS, COLS);
  const weftIdxGrid = Array.from({ length: ROWS }, () =>
    new Array(COLS).fill(-1),
  );

  for (const pat of patterns) {
    for (let i = 0; i < pat.weftBuffers.length; i++) {
      const values = pat.weftBuffers[i].slice(offset, offset + N);
      const kind = pat.weftKinds[i];
      const fn =
        kind === 'density'
          ? drawDensityWeftSeries
          : kind === 'ascii'
            ? drawAsciiWeftSeries
            : kind === 'randomart'
              ? drawRandomartWeftSeries
              : drawWeftSeries;
      fn(
        grid,
        values,
        pat.weftColors[i],
        pat.weftBaseRows[i],
        pat.plotStartCol,
        pat.plotEndCol,
        pat.weftAxisMaxes[i],
        weftIdxGrid,
        pat.weftIdxBase + i,
        pat.bounds,
      );
    }
    for (let i = 0; i < pat.warpBuffers.length; i++) {
      const waveVals = pat.warpBuffers[i].slice(offset, offset + pat.innerRows);
      drawWarpSeries(
        grid,
        waveVals,
        pat.warpColors[i],
        pat.warpCols[i],
        pat.warpAmplitude,
        i,
        pat.plotStartRow,
        weftIdxGrid,
        pat.bounds,
      );
    }
    drawRectBorder(grid, pat.rect, pat.borderColor);
  }

  const bgPaint = bgCode(BG_HEX);
  const out = [HOME, bgPaint];
  let curColor = null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = grid[r][c];
      if (cell) {
        if (cell.color !== curColor) {
          out.push(fgCode(cell.color));
          curColor = cell.color;
        }
        out.push(cell.char);
      } else {
        out.push(' ');
      }
    }
    if (r < ROWS - 1) out.push('\n');
  }
  out.push(RESET);
  process.stdout.write(out.join(''));
}

function handleResize() {
  const newCols = process.stdout.columns || 120;
  const newRows = process.stdout.rows || 40;
  if (newCols !== COLS || newRows !== ROWS) {
    COLS = newCols;
    ROWS = newRows;
    process.stdout.write(CLEAR);
    rebuild();
  }
}

function cleanup() {
  process.stdout.write(RESET + SHOW_CURSOR + '\n');
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.stdout.on('resize', handleResize);

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (key) => {
    if (key === '\u0003' || key === 'q') cleanup();
    if (key === 'r' || key === 'R') {
      seed = Random.getRandomSeed();
      rebuild();
      lastSeedTime = Date.now();
      process.stdout.write(CLEAR);
    }
  });
}

process.stdout.write(HIDE_CURSOR + CLEAR);
rebuild();

const startTime = Date.now();
let lastSeedTime = startTime;

setInterval(() => {
  const now = Date.now();
  // Reseed with a new layout/palette every duration
  if (now - lastSeedTime >= DURATION_MS) {
    seed = Random.getRandomSeed();
    rebuild();
    lastSeedTime = now;
  }
  const playhead = ((now - lastSeedTime) / DURATION_MS) % 1;
  render(playhead);
}, Math.round(1000 / FPS));
