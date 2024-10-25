import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import clustering from 'density-clustering';
import convexHull from 'convex-hull';
import { mapRange, lerpArray, lerp } from 'canvas-sketch-util/math';
import { palettes as autoAlbersPalettes } from '../colors/auto-albers';
import { palettes as mindfulPalettes } from '../colors/mindful-palettes';
import { drawPath } from '@daeinc/draw';
import Timeline from '@daeinc/timeline';
import { scaleCanvasAndApplyDither } from '../scale-canvas-dither';
import { dither } from '../dither';

const colors = Random.pick([...mindfulPalettes, ...autoAlbersPalettes]);
// const colors = [
//   '#F9BC4F',
//   '#4C4D78',
//   '#FFDE73',
//   '#2C7C79',
//   '#EE7744',
//   '#101019',
//   '#101019',
// ];

interface Polygon {
  points: Line;
}

interface ExplodingPart {
  translation: Point;
  rotation: number;
  centroid: Point;
  relativePoints: Line;
  timeShift: number;
}

const config = {
  bg: colors.pop(),
  fg1: colors.pop(),
  fg2: colors.pop(),
  animate: true,
  pointCount: 50000,
  clusterCount: 6,
  dither: false,
};

export const sketch = ({
  wrap,
  context,
  width,
  height,
  togglePlay,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const tl = Timeline.from({
    name: 'explode',
    properties: [
      {
        name: 'curtainL',
        keyframes: [
          { time: 0, value: -width / 2, ease: 'hold' },
          { time: 0.1, value: 0, ease: 'quintIn' },
        ],
      },
      {
        name: 'curtainR',
        keyframes: [
          { time: 0, value: width, ease: 'hold' },
          { time: 0.1, value: width / 2, ease: 'quintIn' },
        ],
      },
      {
        name: 'triangle',
        keyframes: [
          { time: 0, value: true },
          { time: 0.1, value: false },
        ],
      },
      {
        name: 'parts',
        keyframes: [
          { time: 0, value: 0, ease: 'hold' },
          { time: 0.1, value: 0, ease: 'hold' },
          { time: 0.3, value: 1, ease: 'expoOut' },
        ],
      },
    ],
  });

  const margin = height * 0.1;
  const triangleA = height * 0.4 - margin;
  const triangleH = (3 / 2) * triangleA;
  const triangleLocation: Point = [width / 2, height / 2 + triangleH / 6];

  const polygons = fracture(triangleA, triangleLocation);
  const explodingParts = explode(polygons, [width / 2, height / 2]);
  const triangle = equilateralTriangle(triangleA, triangleLocation);

  const partsTimeline = Timeline.from({
    name: 'parts',
    properties: explodingParts.map(({ timeShift }, idx) => ({
      name: `parts-${idx}`,
      keyframes: [
        { time: 0, value: 0, ease: 'hold' },
        { time: 0.1, value: 0, ease: 'hold' },
        { time: 0.2 + timeShift, value: 1, ease: 'expoOut' },
      ],
    })),
  });

  wrap.render = ({ width, height, playhead, canvas }: SketchProps) => {
    // playhead = 0.15;
    context.fillStyle = config.fg1;
    context.fillRect(0, 0, width, height);

    context.fillStyle = config.bg;
    const curtainL = tl.value('curtainL', playhead) as unknown as number;
    context.fillRect(curtainL, 0, width / 2, height);
    const curtainR = tl.value('curtainR', playhead) as unknown as number;
    context.fillRect(curtainR, 0, width / 2, height);

    const showTriangle = tl.value('triangle', playhead) as unknown as boolean;

    if (showTriangle) {
      drawPath(context, triangle);
      context.fillStyle = config.fg2;
      context.fill();
    } else {
      explodingParts.forEach(
        (
          { relativePoints, translation, rotation, centroid: [cx, cy] },
          idx
        ) => {
          const t = partsTimeline.value(
            `parts-${idx}`,
            playhead
          ) as unknown as number;
          const angle = lerp(0, rotation, t);
          const [tx, ty] = lerpArray(
            [cx, cy],
            [cx + translation[0], cy + translation[1]],
            t
          );

          context.save();
          context.translate(tx, ty);
          context.rotate(angle);

          drawPath(context, relativePoints);
          context.fillStyle = config.fg2;
          context.fill();
          context.strokeStyle = config.bg;
          context.lineWidth = 1;
          context.stroke();

          context.restore();
        }
      );
    }

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
  // dimensions: [1200 * 2, 630 * 2],
  pixelRatio: window.devicePixelRatio,
  animate: config.animate,
  duration: 2_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

function equilateralTriangle(r: number, [cx, cy]: Point = [0, 0]): Point[] {
  // Vertices of the equilateral triangle
  let A: Point = [0, -r];
  let B: Point = [r * Math.sin(Math.PI / 3), r * Math.cos(Math.PI / 3)];
  let C: Point = [-r * Math.sin(Math.PI / 3), r * Math.cos(Math.PI / 3)];

  return [A, B, C].map(([x, y]) => [cx + x, cy + y]);
}

function randomPointInEquilateralTriangle(
  r: number,
  [cx, cy]: Point = [0, 0]
): Point {
  // Vertices of the equilateral triangle
  const [A, B, C] = equilateralTriangle(r, [0, 0]);

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

function fracture(triangleSize: number, triangleLocation: Point): Polygon[] {
  // A large point count will produce more defined results
  const pointCount = config.pointCount;
  let points: Point[] = Array.from(new Array(pointCount)).map(() => {
    return randomPointInEquilateralTriangle(triangleSize, triangleLocation);
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

  const polygonDefs = lines.map((path) => {
    const ys = path.map((p) => p[1]);
    return {
      points: path,
      ys,
      yMin: Math.min(...ys),
      yMax: Math.max(...ys),
    };
  });

  const polygons: Polygon[] = polygonDefs.sort((a, b) => b.yMax - a.yMax);

  return polygons;
}

function calculateCentroid(points: Point[]): Point {
  const n = points.length;
  let [cx, cy] = [0, 0];

  for (let i = 0; i < n; i++) {
    cx += points[i][0];
    cy += points[i][1];
  }

  return [cx / n, cy / n];
}

function areaOfPolygon(vertices: Point[]): number {
  var total = 0;

  for (let i = 0, l = vertices.length; i < l; i++) {
    const addX = vertices[i][0];
    const addY = vertices[i == vertices.length - 1 ? 0 : i + 1][1];
    const subX = vertices[i == vertices.length - 1 ? 0 : i + 1][0];
    const subY = vertices[i][1];

    total += addX * addY * 0.5;
    total -= subX * subY * 0.5;
  }

  return Math.abs(total);
}

function explode(polygons: Polygon[], [cx, cy]: Point): ExplodingPart[] {
  const areas = polygons.map((polygon) => areaOfPolygon(polygon.points));
  const maxArea = Math.max(...areas);
  const minArea = Math.min(...areas);

  return polygons.map((polygon) => {
    const centroid = calculateCentroid(polygon.points);
    const dx = centroid[0] - cx;
    const dy = centroid[1] - cy;
    const angle = Math.atan2(dy, dx);
    const area = areaOfPolygon(polygon.points);

    const dist = mapRange(area, minArea, maxArea, 150, 50) * Random.range(1, 4);
    const translation: Point = [dist * Math.cos(angle), dist * Math.sin(angle)];

    const relativePoints = polygon.points.map(
      (pt) => [pt[0] - centroid[0], pt[1] - centroid[1]] as Point
    );

    const rotation =
      mapRange(area, minArea, maxArea, Math.PI * 2, Math.PI * 0.0625) *
      Random.sign() *
      Random.range(1, 1.5);

    return {
      translation,
      rotation,
      centroid,
      relativePoints,
      timeShift:
        mapRange(area, minArea, maxArea, 0, 0.1) * Random.range(0.5, 1.5),
    };
  });
}
