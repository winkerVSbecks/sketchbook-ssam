import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import clustering from 'density-clustering';
import convexHull from 'convex-hull';
import eases from 'eases';
import { mapRange } from 'canvas-sketch-util/math';

const debug = false;

interface Polygon {
  points: Line;
  color: string;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // A large point count will produce more defined results
  const pointCount = 50000;
  let points: Point[] = Array.from(new Array(pointCount)).map(() => {
    const margin = width * 0.2;
    return [
      Random.range(margin, width - margin),
      Random.range(margin, height - margin),
    ];
  });

  // We will add to this over time
  const lines: Line[] = [];

  // The N value for k-means clustering
  // Lower values will produce bigger chunks
  const clusterCount = 3;

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
  const colors = generateColors(Random.range(0, 360), count).reverse();
  const bg = colors.shift()!;

  const polygons: Polygon[] = lines.map((path, idx) => ({
    points: path,
    color: colors[idx],
  }));

  wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const t = mapRange(playhead, 0.25, 0.75, 0, 1, true);
    const visibleLimit = Math.floor(t * count);

    polygons.forEach(({ points, color }, idx) => {
      if (idx < visibleLimit) {
        context.beginPath();
        points.forEach((p) => context.lineTo(p[0], p[1]));
        context.fillStyle = color;
        context.fill();
      }
    });

    // Turn on debugging if you want to see the points
    if (debug) {
      points.forEach((p) => {
        context.beginPath();
        context.arc(p[0], p[1], 2, 0, Math.PI * 2);
        context.fillStyle = 'red';
        context.fill();
      });
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

// Colors
function generateColors(hStart: number, count: number = 8) {
  const s = 0.6; // 0.2, 0.4, 0.6, 0.8
  const l = 0.6; // 0.2, 0.4, 0.6, 0.8

  const colors = generateColorRamp({
    total: count,
    hStart,
    hEasing: (x) => x,
    hCycles: 1,
    sRange: [0.4, 0.8],
    lRange: [0.1, 0.8], // [0.2, 0.6],
    lEasing: eases.quadOut,
  })
    .reverse()
    .map((color) => colorToCSS(color, 'oklch'));

  return colors;
}
