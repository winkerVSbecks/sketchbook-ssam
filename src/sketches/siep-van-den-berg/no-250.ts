import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import { generateColors } from '../../colors/subtractive-hue';
import { logColors } from '../../colors';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface ColoredRect extends Rect {
  color: string;
}

const hue = Random.range(0, 360);
const ramp = generateColors('hex', hue);
logColors(ramp);

const config = {
  columns: Random.rangeFloor(3, 11),
  columnWidthVariance: Random.range(0, 1),
  minRowsPerColumn: Random.rangeFloor(1, 6),
  maxRowsPerColumn: Random.rangeFloor(1, 7),
  rowHeightVariance: Random.range(0, 1),
  quietZoneSize: Random.range(0.3, 0.5),
  clusterSpread: Random.range(0.3, 0.8),
  anchorJitter: Random.range(0, 0.1),
  baseMinCols: Random.rangeFloor(1, 6),
  baseMaxCols: Random.rangeFloor(1, 6),
  baseMinHeight: Random.range(0.1, 1),
  baseMaxHeight: Random.range(0.1, 1),
  extensionChance: Random.range(0, 1),
  extensionInsideChance: Random.range(0, 1),
  extensionMinHeight: Random.range(0.1, 1),
  extensionMaxHeight: Random.range(0.1, 1),
  extensionOffset: Random.range(0, 0.5),
  accentChance: Random.range(0, 1),
  accentMinCols: Random.rangeFloor(1, 5),
  accentMaxCols: Random.rangeFloor(1, 5),
  accentMinHeight: Random.range(0.05, 0.5),
  accentMaxHeight: Random.range(0.05, 0.5),
  accentAttachment: Random.range(0, 1),
  red: ramp[1],
  blue: ramp[2],
  yellow: ramp[3],
  lightBlue: ramp[4],
  black: ramp[5],
  white: ramp[0],
  grey: ramp[3],
};

const pane = new Pane() as any;
if (pane.containerElem_) pane.containerElem_.style.zIndex = '1';

const bgFolder = pane.addFolder({ title: 'Background' });
bgFolder.addBinding(config, 'columns', { min: 3, max: 10, step: 1 });
bgFolder.addBinding(config, 'columnWidthVariance', {
  min: 0,
  max: 1,
  step: 0.01,
});
bgFolder.addBinding(config, 'minRowsPerColumn', { min: 1, max: 5, step: 1 });
bgFolder.addBinding(config, 'maxRowsPerColumn', { min: 1, max: 6, step: 1 });
bgFolder.addBinding(config, 'rowHeightVariance', {
  min: 0,
  max: 1,
  step: 0.01,
});

const clusterFolder = pane.addFolder({ title: 'Clusters' });
clusterFolder.addBinding(config, 'quietZoneSize', {
  min: 0.2,
  max: 0.55,
  step: 0.01,
});
clusterFolder.addBinding(config, 'clusterSpread', {
  min: 0.1,
  max: 0.9,
  step: 0.01,
});
clusterFolder.addBinding(config, 'anchorJitter', {
  min: 0,
  max: 0.15,
  step: 0.005,
});

const baseFolder = pane.addFolder({ title: 'Base form' });
baseFolder.addBinding(config, 'baseMinCols', { min: 1, max: 5, step: 1 });
baseFolder.addBinding(config, 'baseMaxCols', { min: 1, max: 5, step: 1 });
baseFolder.addBinding(config, 'baseMinHeight', {
  min: 0.1,
  max: 1,
  step: 0.01,
});
baseFolder.addBinding(config, 'baseMaxHeight', {
  min: 0.1,
  max: 1,
  step: 0.01,
});

const extFolder = pane.addFolder({ title: 'Extension' });
extFolder.addBinding(config, 'extensionChance', { min: 0, max: 1, step: 0.05 });
extFolder.addBinding(config, 'extensionInsideChance', {
  min: 0,
  max: 1,
  step: 0.05,
});
extFolder.addBinding(config, 'extensionMinHeight', {
  min: 0.1,
  max: 1,
  step: 0.01,
});
extFolder.addBinding(config, 'extensionMaxHeight', {
  min: 0.1,
  max: 1,
  step: 0.01,
});
extFolder.addBinding(config, 'extensionOffset', {
  min: 0,
  max: 0.5,
  step: 0.01,
});

const accFolder = pane.addFolder({ title: 'Accent' });
accFolder.addBinding(config, 'accentChance', { min: 0, max: 1, step: 0.05 });
accFolder.addBinding(config, 'accentMinCols', { min: 1, max: 4, step: 1 });
accFolder.addBinding(config, 'accentMaxCols', { min: 1, max: 4, step: 1 });
accFolder.addBinding(config, 'accentMinHeight', {
  min: 0.05,
  max: 0.5,
  step: 0.01,
});
accFolder.addBinding(config, 'accentMaxHeight', {
  min: 0.05,
  max: 0.5,
  step: 0.01,
});
accFolder.addBinding(config, 'accentAttachment', {
  min: 0,
  max: 1,
  step: 0.01,
});

const palFolder = pane.addFolder({ title: 'Palette', expanded: false });
palFolder.addBinding(config, 'red');
palFolder.addBinding(config, 'blue');
palFolder.addBinding(config, 'yellow');
palFolder.addBinding(config, 'lightBlue');
palFolder.addBinding(config, 'black');
palFolder.addBinding(config, 'white');
palFolder.addBinding(config, 'grey');

const regenBtn = pane.addButton({ title: 'Regenerate' });

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  let bg: ColoredRect[] = [];
  let forms: Rect[] = [];
  let seed = Random.getRandomSeed();

  const rebuild = () => {
    Random.setSeed(seed);
    const { cells, xs } = buildBackground(width, height);
    bg = cells;

    const quietOnTop = Random.chance(0.5);
    const qSize = config.quietZoneSize;
    const activeYmin = quietOnTop ? height * qSize : 0;
    const activeYmax = quietOnTop ? height : height * (1 - qSize);
    const activeH = activeYmax - activeYmin;
    const activeCX = width / 2;
    const activeCY = (activeYmin + activeYmax) / 2;

    const baseMin = Math.min(config.baseMinCols, config.baseMaxCols);
    const baseMax = Math.max(config.baseMinCols, config.baseMaxCols);
    const sharedBaseCols = Random.rangeFloor(baseMin, baseMax + 1);
    const rawBaseH =
      height * Random.range(config.baseMinHeight, config.baseMaxHeight);
    const sharedBaseH = Math.min(rawBaseH, activeH);

    const spreadAngle = Random.range(-Math.PI / 8, Math.PI / 8);
    const offsetX =
      width * 0.5 * config.clusterSpread * Math.cos(spreadAngle);
    const offsetY =
      activeH * 0.3 * config.clusterSpread * Math.sin(spreadAngle);

    const jx = width * config.anchorJitter;
    const jy = activeH * config.anchorJitter;

    forms = [
      ...buildCluster(
        width,
        height,
        xs,
        activeCX - offsetX + Random.range(-jx, jx),
        activeCY - offsetY + Random.range(-jy, jy),
        sharedBaseCols,
        sharedBaseH,
        activeYmin,
        activeYmax,
      ),
      ...buildCluster(
        width,
        height,
        xs,
        activeCX + offsetX + Random.range(-jx, jx),
        activeCY + offsetY + Random.range(-jy, jy),
        sharedBaseCols,
        sharedBaseH,
        activeYmin,
        activeYmax,
      ),
    ];
  };

  rebuild();
  pane.on('change', rebuild);
  regenBtn.on('click', () => {
    seed = Random.getRandomSeed();
    rebuild();
  });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = config.black;
    context.fillRect(0, 0, width, height);

    for (const r of bg) {
      context.fillStyle = r.color;
      context.fillRect(r.x, r.y, r.w, r.h);
    }

    for (const f of forms) {
      context.fillStyle = config.black;
      context.fillRect(f.x, f.y, f.w, f.h);
    }

    for (let i = 0; i < forms.length; i++) {
      for (let j = i + 1; j < forms.length; j++) {
        const inter = intersect(forms[i], forms[j]);
        if (inter) {
          context.fillStyle = config.white;
          context.fillRect(inter.x, inter.y, inter.w, inter.h);
        }
      }
    }

    for (let i = 0; i < forms.length; i++) {
      for (let j = i + 1; j < forms.length; j++) {
        const ij = intersect(forms[i], forms[j]);
        if (!ij) continue;
        for (let k = j + 1; k < forms.length; k++) {
          const inter = intersect(ij, forms[k]);
          if (inter) {
            context.fillStyle = config.grey;
            context.fillRect(inter.x, inter.y, inter.w, inter.h);
          }
        }
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
};

ssam(sketch as Sketch<'2d'>, settings);

function distribute(total: number, n: number, variance: number): number[] {
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.max(0.6, 1 + Random.range(-variance, variance));
    weights.push(w);
    sum += w;
  }
  return weights.map((w) => (w / sum) * total);
}

function cumulative(sizes: number[]): number[] {
  const out: number[] = [0];
  for (let i = 0; i < sizes.length; i++) out.push(out[i] + sizes[i]);
  return out;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function clampAspect(w: number, h: number): number {
  const maxAspect = 3;
  return clamp(h, w / maxAspect, w * maxAspect);
}

function intersect(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.w, b.x + b.w);
  const bottom = Math.min(a.y + a.h, b.y + b.h);
  if (right <= x || bottom <= y) return null;
  return { x, y, w: right - x, h: bottom - y };
}

function buildBackground(
  width: number,
  height: number,
): { cells: ColoredRect[]; xs: number[] } {
  const palette = [config.red, config.blue, config.yellow, config.lightBlue];
  const colWidths = distribute(
    width,
    config.columns,
    config.columnWidthVariance,
  );
  const xs = cumulative(colWidths);
  const cells: ColoredRect[] = [];
  const columnCells: ColoredRect[][] = [];

  const lo = Math.min(config.minRowsPerColumn, config.maxRowsPerColumn);
  const hi = Math.max(config.minRowsPerColumn, config.maxRowsPerColumn);

  for (let i = 0; i < config.columns; i++) {
    const nRows = Random.rangeFloor(lo, hi + 1);
    const rowHeights = distribute(height, nRows, config.rowHeightVariance);
    const ys = cumulative(rowHeights);
    let prevInColumn: string | null = null;
    const thisColumn: ColoredRect[] = [];

    for (let j = 0; j < nRows; j++) {
      const y = ys[j];
      const h = rowHeights[j];
      const forbidden = new Set<string>();
      if (prevInColumn) forbidden.add(prevInColumn);
      if (i > 0) {
        for (const left of columnCells[i - 1]) {
          if (left.y < y + h && left.y + left.h > y) forbidden.add(left.color);
        }
      }
      const pool = palette.filter((c) => !forbidden.has(c));
      const color = Random.pick(pool.length ? pool : palette);
      prevInColumn = color;
      const cell = { x: xs[i], y, w: colWidths[i], h, color };
      cells.push(cell);
      thisColumn.push(cell);
    }

    columnCells.push(thisColumn);
  }

  return { cells, xs };
}

function buildCluster(
  width: number,
  height: number,
  xs: number[],
  anchorX: number,
  anchorY: number,
  sharedBaseCols: number,
  sharedBaseH: number,
  activeYmin: number,
  activeYmax: number,
): Rect[] {
  const cols = xs.length - 1;
  let anchorCol = 0;
  for (let i = 0; i < cols; i++) {
    if (anchorX >= xs[i] && anchorX < xs[i + 1]) {
      anchorCol = i;
      break;
    }
  }

  const forms: Rect[] = [];
  const activeH = activeYmax - activeYmin;

  const baseCols = Math.min(sharedBaseCols, cols);
  const baseColStart = clamp(
    anchorCol - Math.floor(baseCols / 2) + Random.rangeFloor(-1, 2),
    0,
    cols - baseCols,
  );
  const baseX = xs[baseColStart];
  const baseW = xs[baseColStart + baseCols] - baseX;
  const baseH = Math.min(clampAspect(baseW, sharedBaseH), activeH);
  const baseY = clamp(anchorY - baseH / 2, activeYmin, activeYmax - baseH);
  const base: Rect = { x: baseX, y: baseY, w: baseW, h: baseH };
  forms.push(base);

  if (Random.chance(config.extensionChance)) {
    const insideBase = Random.chance(config.extensionInsideChance);
    let extCol: number;
    if (insideBase) {
      extCol = Random.pick([baseColStart, baseColStart + baseCols - 1]);
    } else {
      extCol = Random.pick([baseColStart - 1, baseColStart + baseCols]);
    }
    extCol = clamp(extCol, 0, cols - 1);

    const extX = xs[extCol];
    const extW = xs[extCol + 1] - extX;
    const extHRaw =
      height *
      Random.range(config.extensionMinHeight, config.extensionMaxHeight);
    const extH = Math.min(clampAspect(extW, extHRaw), activeH);
    const extOffset =
      height * Random.range(-config.extensionOffset, config.extensionOffset);
    const extY = clamp(
      baseY + (baseH - extH) / 2 + extOffset,
      activeYmin,
      activeYmax - extH,
    );
    forms.push({ x: extX, y: extY, w: extW, h: extH });
  }

  if (Random.chance(config.accentChance)) {
    const accMin = Math.min(config.accentMinCols, config.accentMaxCols);
    const accMax = Math.max(config.accentMinCols, config.accentMaxCols);
    const accentCols = Random.rangeFloor(accMin, accMax + 1);
    const accentColStart = clamp(
      baseColStart + Random.rangeFloor(-1, baseCols),
      0,
      cols - accentCols,
    );
    const accentX = xs[accentColStart];
    const accentW = xs[accentColStart + accentCols] - accentX;
    const accentHRaw =
      height * Random.range(config.accentMinHeight, config.accentMaxHeight);
    const accentH = Math.min(clampAspect(accentW, accentHRaw), activeH);
    const attachTop = Random.chance(0.5);
    const attach = config.accentAttachment;
    const accentY = attachTop
      ? clamp(
          baseY - accentH * attach * 0.5,
          activeYmin,
          activeYmax - accentH,
        )
      : clamp(
          baseY + baseH - accentH * (1 - attach * 0.5),
          activeYmin,
          activeYmax - accentH,
        );
    forms.push({ x: accentX, y: accentY, w: accentW, h: accentH });
  }

  return forms;
}
