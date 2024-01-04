import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS, colorHarmonies } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import clustering from 'density-clustering';
import convexHull from 'convex-hull';
import eases from 'eases';
import { mapRange } from 'canvas-sketch-util/math';
import { formatCss, oklch } from 'culori';
import { generateColors } from '../subtractive-color';

interface Polygon {
  points: Line;
  color: string;
}

const randomEase = () => Random.pick(Object.values(eases));

const config = {
  animate: true,
  domainCount: 12,
  pointCount: 10000, //50000
  clusterCount: 3,
  hEasing: randomEase(),
  sEasing: randomEase(),
  sRange: [0.6, 0.8],
  lEasing: randomEase(),
  lRange: [0.4, 0.4],
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const gap = width * 0.05;
  const domains = [[0, 0, width, height]];
  let curr = gap;

  const x1 = gap; // Random.rangeFloor(gap, width - gap);
  const x2 = width - gap; // Random.rangeFloor(x1, width - gap);

  do {
    const y1 = curr; // Random.rangeFloor(gap, height - gap);
    const y2 = Math.min(Random.rangeFloor(curr, height - gap), height - gap);
    domains.push([x1, y1, x2, y2]);
    curr = y2 + gap / 2;
  } while (curr < height - gap);

  const hStart = Random.range(0, 360);
  const hCycles = 1;
  const hues = domains.map((_, i) => {
    const relI = i / (domains.length - 1);
    const fraction = 1 / domains.length;

    return ((360 + // Ensure the hue is always positive
      hStart + // Add the starting hue
      (1 - config.hEasing(relI, fraction) - 0.5) * (360 * hCycles)) % // Calculate the hue based on the easing function
      360) as number;
  });

  const polygonClusters = domains.map((domain, idx) =>
    generatePolygons(domain, hues.pop()!, width)
  );
  const counts = polygonClusters.map((p) => p.length);
  const polygons = polygonClusters.flat();
  const polygonCount = polygons.length;

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = 'oklch(93.08% 0.02 90)'; // '#000';
    context.fillRect(0, 0, width, height);

    const t = mapRange(playhead, 0, 0.75, 0, 1, true);

    const visibleLimit = config.animate
      ? Math.floor(t * polygonCount)
      : polygonCount;

    polygons.forEach(({ points, color }, idx) => {
      if (idx < visibleLimit) {
        context.beginPath();
        points.forEach((p) => context.lineTo(p[0], p[1]));
        context.fillStyle = color;
        context.fill();
      }
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [600 * 2, 800 * 2],
  pixelRatio: window.devicePixelRatio,
  animate: config.animate,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  numLoops: 1,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch, settings);

// Polygons
function generatePolygons(
  [minX, minY, maxX, maxY]: number[],
  hStart: number,
  width: number
): Polygon[] {
  // A large point count will produce more defined results
  const pointCount = config.pointCount;
  let points: Point[] = Array.from(new Array(pointCount)).map(() => {
    return [Random.range(minX, maxX), Random.range(minY, maxY)];
  });

  // We will add to this over time
  const lines: Line[] = [];

  // The N value for k-means clustering
  // Lower values will produce bigger chunks
  const clusterCount = config.clusterCount;

  function integrate() {
    // Not enough points in our data set
    if (points.length <= clusterCount) return false;

    // k-means cluster our data
    const scan = new clustering.KMEANS();
    const clusters = scan
      .run(points, clusterCount)
      .filter((c) => c.length >= 3);

    // Ensure we resulted in some clusters
    if (clusters.length === 0) return false;

    // Sort clusters by density
    clusters.sort((a, b) => a.length - b.length);

    // Select the least dense cluster
    const cluster = clusters[0];
    const positions = cluster.map((i) => points[i]);

    // Find the hull of the cluster
    const edges = convexHull(positions);

    // Ensure the hull is large enough
    if (edges.length <= 2) return false;

    // Create a closed polyline from the hull
    let path = edges.map((c) => positions[c[0]]);
    path.push(path[0]);

    // Add to total list of polylines
    lines.push(path);

    // Remove those points from our data set
    points = points.filter((p) => !positions.includes(p));

    return true;
  }

  let remaining = true;

  while (remaining) {
    remaining = integrate();
  }

  const count = lines.length;
  const colors = generateColors(); //generateColors(hStart, count).reverse();

  const polygons: Polygon[] = lines.map((path, idx) => ({
    points: path,
    color: colors[idx],
  }));

  return polygons;
}

// Colors
// function generateColors(hStart: number, count: number = 8) {
//   const colors = generateColorRamp({
//     total: count,
//     hStart,
//     hEasing: config.hEasing,
//     hCycles: 0,
//     sRange: config.sRange as [number, number],
//     sEasing: config.sEasing,
//     lRange: config.lRange as [number, number],
//     lEasing: config.lEasing,
//   })
//     .reverse()
//     .map((hsl) =>
//       formatCss(oklch({ mode: 'hsl', h: hsl[0], s: hsl[1], l: hsl[2] }))
//     );

//   return colors;
// }
