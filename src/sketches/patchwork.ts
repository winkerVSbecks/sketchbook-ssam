import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
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

const randomEase = () => Random.pick(Object.values(eases));

const config = {
  bg: 'oklch(93.08% 0.02 90)',
  animate: false,
  pointCount: 50000,
  clusterCount: 6,
  hStart: Random.range(0, 360),
  hCycles: Random.range(1 / 3, 1), // 1 / 3;
  hEasing: randomEase(),
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // A large point count will produce more defined results
  const pointCount = config.pointCount;
  let points: Point[] = Array.from(new Array(pointCount)).map(() => {
    const margin = width * 0.1;
    const r = width * 0.5 - margin;
    const h = (3 / 2) * r;
    return randomPointInEquilateralTriangle(r, [width / 2, height / 2 + h / 6]);
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
      .filter((c: any[]) => c.length >= 3);

    // Ensure we resulted in some clusters
    if (clusters.length === 0) return false;

    // Sort clusters by density
    clusters.sort((a: any[], b: any[]) => a.length - b.length);

    // Select the least dense cluster
    const cluster = clusters[0];
    const positions = cluster.map((i: number) => points[i]);

    // Find the hull of the cluster
    const edges = convexHull(positions);

    // Ensure the hull is large enough
    if (edges.length <= 2) return false;

    // Create a closed polyline from the hull
    let path = edges.map((c: any[]) => positions[c[0]]);
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
  const bg = config.bg;

  const polygonDefs = lines.map((path) => {
    const ys = path.map((p) => p[1]);
    return {
      points: path,
      ys,
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
    };
  });

  const yRange = [
    Math.min(...polygonDefs.map((p) => p.ys).flat()),
    Math.max(...polygonDefs.map((p) => p.ys).flat()),
  ];

  const polygons: Polygon[] = polygonDefs
    .map((p) => {
      const t = 1 - mapRange(p.yMax, yRange[1], yRange[0], 0, 1);
      const hue =
        (360 +
          config.hStart +
          (1 - config.hEasing(t)) * (360 * config.hCycles)) %
        360;

      return {
        ...p,
        color: `oklch(60% 0.6 ${hue})`,
      };
    })
    .sort((a, b) => b.yMax - a.yMax);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const t = mapRange(playhead, 0.0, 0.5, 0, 1, true);
    const visibleLimit = config.animate ? Math.floor(t * count) : count;

    polygons.forEach(({ points, color }, idx) => {
      if (idx < visibleLimit) {
        context.beginPath();
        points.forEach((p) => context.lineTo(p[0], p[1]));
        context.fillStyle = color;
        context.fill();
        context.strokeStyle = bg;
        context.lineWidth = 1;
        context.stroke();
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
  animate: config.animate,
  duration: 3_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

function randomPointInEquilateralTriangle(
  r: number,
  [cx, cy]: Point = [0, 0]
): Point {
  // Vertices of the equilateral triangle
  let A = [0, -r];
  let B = [r * Math.sin(Math.PI / 3), r * Math.cos(Math.PI / 3)];
  let C = [-r * Math.sin(Math.PI / 3), r * Math.cos(Math.PI / 3)];

  // Generate three random numbers
  let t1 = Math.random();
  let t2 = Math.random();
  let t3 = Math.random();

  // Normalize so that t1 + t2 + t3 = 1
  let sum = t1 + t2 + t3;
  t1 /= sum;
  t2 /= sum;
  t3 /= sum;

  // Calculate the random point
  let x = t1 * A[0] + t2 * B[0] + t3 * C[0];
  let y = t1 * A[1] + t2 * B[1] + t3 * C[1];

  return [cx + x, cy + y];
}
