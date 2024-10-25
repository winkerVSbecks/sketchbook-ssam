import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import clustering from 'density-clustering';
import convexHull from 'convex-hull';
import eases from 'eases';
import { mapRange } from 'canvas-sketch-util/math';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

interface Polygon {
  points: Line;
  color: string;
}

type Triangle = [Point, Point, Point];

const randomEase = () => Random.pick(Object.values(eases));

const config = {
  // bg: 'oklch(93.08% 0.02 90)',
  bg: 'oklch(0% 0.02 90)',
  animate: false,
  pointCount: 1000,
  // clusterCount: 6,
  dither: true,
  // colors: Random.shuffle([...mindfulPalettes, ...autoAlbersPalettes]),
  colors: Random.shuffle(mindfulPalettes),
  // colors: Random.shuffle(autoAlbersPalettes),
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const bg = config.bg;

  const triangles = generateTriangleGrid(width, height, width / 3);
  const polygons: Polygon[] = Random.shuffle(
    triangles
      .map((triangle, idx) =>
        fracture(
          triangle,
          config.colors[idx % config.colors.length],
          Random.rangeFloor(2, 7)
        )
      )
      .flat()
  );
  const count = polygons.length;

  wrap.render = ({ width, height, playhead, canvas }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const t = mapRange(playhead, 0.0, 0.5, 0, 1, true);
    const visibleLimit = config.animate ? Math.floor(t * count) : count;

    polygons.forEach(({ points, color }, idx) => {
      if (idx < visibleLimit) {
        // if (Random.boolean()) {
        context.beginPath();
        points.forEach((p) => context.lineTo(p[0], p[1]));
        context.fillStyle = color;
        context.fill();
        context.strokeStyle = bg;
        context.lineWidth = 1;
        context.stroke();
      }
    });

    // triangles.forEach((triangle) => {
    //   context.beginPath();
    //   context.moveTo(triangle[0][0], triangle[0][1]);
    //   context.lineTo(triangle[1][0], triangle[1][1]);
    //   context.lineTo(triangle[2][0], triangle[2][1]);
    //   context.closePath();

    //   context.strokeStyle = 'oklch(93.08% 0.02 90)';
    //   context.lineWidth = 4;
    //   context.stroke();
    // });

    if (config.dither) {
      const ditheredImage = scaleCanvasAndApplyDither(
        width,
        height,
        0.25,
        canvas,
        (data) =>
          dither(data, {
            greyscaleMethod: 'none',
            ditherMethod: 'atkinson',
          })
      );

      context.drawImage(ditheredImage, 0, 0, width, height);
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: config.animate,
  duration: 6_000,
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

function randomPointInTriangle(A: Point, B: Point, C: Point): Point {
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

  return [x, y];
}

function generateTriangleGrid(
  width: number,
  height: number,
  circumradius: number
): Triangle[] {
  const sin60 = Math.sin(Math.PI / 3);
  const triangleSize = 2 * circumradius * sin60; // Side length from circumradius
  const triangleHeight = (triangleSize * Math.sqrt(3)) / 2;
  const triangles: Triangle[] = [];

  for (
    let y = -triangleHeight;
    y < height + triangleHeight;
    y += triangleHeight
  ) {
    for (let x = -triangleSize; x < width + triangleSize; x += triangleSize) {
      const isEvenRow = Math.floor(y / triangleHeight) % 2 === 0;
      if (isEvenRow) {
        // Upright triangle
        triangles.push([
          [x, y],
          [x + triangleSize, y],
          [x + triangleSize / 2, y + triangleHeight],
        ]);
        // Inverted triangle
        triangles.push([
          [x + triangleSize / 2, y + triangleHeight],
          [x + triangleSize * 1.5, y + triangleHeight],
          [x + triangleSize, y],
        ]);
      } else {
        // Inverted triangle
        triangles.push([
          [x, y + triangleHeight],
          [x + triangleSize, y + triangleHeight],
          [x + triangleSize / 2, y],
        ]);
        // Upright triangle
        triangles.push([
          [x + triangleSize / 2, y],
          [x + triangleSize * 1.5, y],
          [x + triangleSize, y + triangleHeight],
        ]);
      }
    }
  }

  return triangles;
}

function fracture(
  triangle: Point[],
  colors: string[],
  clusterCount: number
): Polygon[] {
  // A large point count will produce more defined results
  const pointCount = config.pointCount;
  let points: Point[] = Array.from(new Array(pointCount)).map(() => {
    return randomPointInTriangle(triangle[0], triangle[1], triangle[2]);
  });

  // We will add to this over time
  const lines: Line[] = [];

  // The N value for k-means clustering
  // Lower values will produce bigger chunks
  // const clusterCount = config.clusterCount;

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
    .map((p, idx) => {
      return {
        ...p,
        color: colors[idx % colors.length],
      };
    })
    .sort((a, b) => b.yMax - a.yMax);

  return polygons;
}
