import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Heerich } from 'heerich';
import { converter } from 'culori';
import Random from 'canvas-sketch-util/random';
import { randomPalette } from '../../colors';
import { mapMaker } from './algorithm';

Random.setSeed(Random.getRandomSeed());
console.log({ seed: Random.getSeed() });

const config = {
  // side of the street plan, in map-maker's pixel units
  plan: 1080,
  // voxel cells per side of the plan
  grid: 96,
  // street width in cells (rasterised as a disc swept along each street)
  streetWidth: 1.4,
  // tallest tower, in voxels
  maxHeight: 34,
  // blocks this small (in cells) are left as plazas at street level
  plaza: 3,
  tileSize: 10,
  sw: 0.6,
  margin: 0.08,
};

// lightest swatch is the paper; the rest run light to dark with height,
// so the low blocks stay pale and the towers are the darkest ink
const toOklch = converter('oklch');
const lightness = (c: string) => toOklch(c)?.l ?? 0;
const palette = [...randomPalette()].sort((a, b) => lightness(b) - lightness(a));
const bg = palette[0];
const blockColors = palette.length > 2 ? palette.slice(1) : palette;
const street = `oklch(from ${bg} calc(l * 0.8) c h)`;

const shade = (c: string, amount: number) => `oklch(from ${c} calc(l * ${amount}) c h)`;

type City = {
  // per-cell block id, -1 for street
  blockOf: Int32Array;
  // per-cell building height in voxels
  heightOf: Int32Array;
  blockColor: string[];
};

// Run map-maker until no street grows any more (it resolves intersections
// and prunes near-parallel streets over many calls).
function growStreets(): Point[][] {
  const grow = mapMaker([config.plan, config.plan], [0, 0], {
    minDistance: 50,
    maxDistance: 110,
    step: 4,
  });
  let streets = grow();
  let last = -1;
  let still = 0;
  for (let i = 0; i < 3000 && still < 4; i++) {
    streets = grow();
    const size = streets.reduce((n, s) => n + s.points.length, streets.length * 10_000);
    still = size === last ? still + 1 : 0;
    last = size;
  }
  return streets.map((s) => s.points);
}

// Sweep a disc along every street and mark the cells it covers.
function rasteriseStreets(streets: Point[][], G: number): Uint8Array {
  const isStreet = new Uint8Array(G * G);
  const cell = config.plan / G;
  const r = config.streetWidth / 2;
  const reach = Math.ceil(r);

  const stamp = (px: number, py: number) => {
    const cx = px / cell;
    const cy = py / cell;
    for (let y = Math.floor(cy) - reach; y <= Math.floor(cy) + reach; y++) {
      for (let x = Math.floor(cx) - reach; x <= Math.floor(cx) + reach; x++) {
        if (x < 0 || y < 0 || x >= G || y >= G) continue;
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= r) isStreet[y * G + x] = 1;
      }
    }
  };

  for (const pts of streets) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[i + 1];
      const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / (cell / 4)));
      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        stamp(ax + (bx - ax) * t, ay + (by - ay) * t);
      }
    }
  }

  // a ring road round the plinth closes the edge blocks
  for (let i = 0; i < G; i++) {
    isStreet[i] = isStreet[(G - 1) * G + i] = 1;
    isStreet[i * G] = isStreet[i * G + G - 1] = 1;
  }
  return isStreet;
}

// 4-connected flood fill of the non-street cells into blocks, then a height
// per block from its area: the smaller the plot, the taller the tower.
function buildCity(isStreet: Uint8Array, G: number): City {
  const blockOf = new Int32Array(G * G).fill(-1);
  const areas: number[] = [];
  const stack: number[] = [];

  for (let start = 0; start < G * G; start++) {
    if (isStreet[start] || blockOf[start] !== -1) continue;
    const id = areas.length;
    let area = 0;
    blockOf[start] = id;
    stack.push(start);
    while (stack.length) {
      const i = stack.pop()!;
      area++;
      const x = i % G;
      const y = (i - x) / G;
      const next = [
        x > 0 ? i - 1 : -1,
        x < G - 1 ? i + 1 : -1,
        y > 0 ? i - G : -1,
        y < G - 1 ? i + G : -1,
      ];
      for (const n of next) {
        if (n < 0 || isStreet[n] || blockOf[n] !== -1) continue;
        blockOf[n] = id;
        stack.push(n);
      }
    }
    areas.push(area);
  }

  // rank blocks by area so heights spread evenly whatever the plan's scale
  const order = areas.map((_, i) => i).sort((a, b) => areas[a] - areas[b]);
  const rank = new Float32Array(areas.length);
  order.forEach((id, k) => (rank[id] = k / Math.max(1, order.length - 1)));

  const blockHeight = areas.map((area, id) => {
    if (area <= config.plaza) return 0;
    const t = 1 - rank[id];
    return 1 + Math.round(Math.pow(t, 2.8) * (config.maxHeight - 1) * Random.range(0.75, 1));
  });
  const blockColor = blockHeight.map((hgt) => {
    if (hgt === 0) return street;
    const tier = Math.min(1, (hgt - 1) / (config.maxHeight * 0.6));
    return blockColors[Math.round(tier * (blockColors.length - 1))];
  });

  const heightOf = new Int32Array(G * G);
  for (let i = 0; i < G * G; i++) heightOf[i] = blockOf[i] < 0 ? 0 : blockHeight[blockOf[i]];
  return { blockOf, heightOf, blockColor };
}

// heerich's y axis points down: the street plinth fills y = 0..1,
// buildings stack upward into negative y, and the plan's rows run along z.
function buildScene(city: City, G: number): Face[] {
  const h = new Heerich({
    tile: [config.tileSize, config.tileSize],
    camera: { type: 'isometric', angle: 45 },
  });

  // roofs and the plinth top read as one surface; facades show their floors
  const faceStyle = (base: string, top: string) => {
    const side = (k: number) => ({
      fill: shade(base, k),
      stroke: shade(base, 0.5),
      strokeWidth: config.sw,
    });
    return {
      default: side(0.64),
      top: { fill: top, stroke: top, strokeWidth: config.sw },
      front: side(0.82),
      back: side(0.82),
      left: side(0.64),
      right: side(0.64),
      bottom: side(0.5),
    };
  };

  h.applyGeometry({
    type: 'box',
    position: [0, 0, 0],
    size: [G, 2, G],
    style: faceStyle(street, street),
  });

  const styles = city.blockColor.map((c) => faceStyle(c, shade(c, 1.08)));
  for (let z = 0; z < G; z++) {
    for (let x = 0; x < G; x++) {
      const i = z * G + x;
      const hgt = city.heightOf[i];
      if (hgt <= 0) continue;
      h.applyGeometry({
        type: 'box',
        position: [x, -hgt, z],
        size: [1, hgt, 1],
        style: styles[city.blockOf[i]],
      });
    }
  }

  return h.getFaces();
}

function drawFaces(ctx: CanvasRenderingContext2D, faces: Face[]) {
  for (const face of faces) {
    if (face.type === 'content') continue;
    const d = face.points.data;
    ctx.beginPath();
    ctx.moveTo(d[0], d[1]);
    for (let i = 2; i < d.length; i += 2) ctx.lineTo(d[i], d[i + 1]);
    ctx.closePath();
    if (face.style?.fill) {
      ctx.fillStyle = face.style.fill;
      ctx.fill();
    }
    if (face.style?.stroke) {
      ctx.strokeStyle = face.style.stroke;
      ctx.lineWidth = face.style.strokeWidth ?? 1;
      ctx.stroke();
    }
  }
}

function sceneBounds(faces: Face[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const face of faces) {
    if (face.type === 'content') continue;
    const d = face.points.data;
    for (let i = 0; i < d.length; i += 2) {
      if (d[i] < minX) minX = d[i];
      if (d[i + 1] < minY) minY = d[i + 1];
      if (d[i] > maxX) maxX = d[i];
      if (d[i + 1] > maxY) maxY = d[i + 1];
    }
  }
  return { minX, minY, maxX, maxY };
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const G = config.grid;
  const streets = growStreets();
  const city = buildCity(rasteriseStreets(streets, G), G);
  const faces = buildScene(city, G);
  const { minX, minY, maxX, maxY } = sceneBounds(faces);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const avail = Math.min(width, height) * (1 - config.margin * 2);
    const scale = avail / Math.max(maxX - minX, maxY - minY);
    context.save();
    context.translate(
      (width - (maxX - minX) * scale) / 2,
      (height - (maxY - minY) * scale) / 2,
    );
    context.scale(scale, scale);
    context.translate(-minX, -minY);
    context.lineJoin = 'round';
    drawFaces(context, faces);
    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
