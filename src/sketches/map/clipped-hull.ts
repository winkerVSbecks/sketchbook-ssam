import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { clipPolylinePoly } from '@thi.ng/geom-clip-line';
import { drawPath } from '@daeinc/draw';
import clustering from 'density-clustering';
import convexHull from 'convex-hull';
import Random from 'canvas-sketch-util/random';
import { mapRange } from 'canvas-sketch-util/math';
import { randomPalette } from '../../colors';
import { mapMaker } from './algorithm';

const config = {
  size: 5,
};

const colors = randomPalette();
const bg = colors.pop()!;
const fg = colors.shift()!;

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  // A large point count will produce more defined results
  const pointCount = 50000;
  let points: Point[] = Array.from(new Array(pointCount)).map(() => {
    const margin = -20; // width * 0.1;
    return [
      Random.range(margin, width - margin),
      Random.range(margin, height - margin),
    ];
  });

  // We will add to this over time
  const polygons: Line[] = [];

  // The N value for k-means clustering
  // Lower values will produce bigger chunks
  const clusterCount = 2;
  function integrate() {
    // Not enough points in our data set
    if (points.length <= clusterCount * 500) return false;

    // k-means cluster our data
    const scan = new clustering.KMEANS();
    const clusters = scan
      .run(points, clusterCount)
      .filter((c: number[]) => c.length >= 3);

    // Ensure we resulted in some clusters
    if (clusters.length === 0) return false;

    // Sort clusters by density
    clusters.sort((a: number[], b: number[]) => a.length - b.length);

    // Select the least dense cluster
    const cluster = clusters[0];
    const positions = cluster.map((i: number) => points[i]);

    // Find the hull of the cluster
    const edges = convexHull(positions);

    // Ensure the hull is large enough
    if (edges.length <= 2) return false;

    // Create a closed polyline from the hull
    let path = edges.map((c: number[]) => positions[c[0]]);
    path.push(path[0]);

    // Add to total list of polylines
    polygons.push(path);

    // Remove those points from our data set
    points = points.filter((p) => !positions.includes(p));

    return true;
  }

  let remaining = true;

  while (remaining) {
    remaining = integrate();
  }

  const maxArea = width * height;
  const sections = polygons.map((polygon) => {
    const xS = polygon.map((p) => p[0]);
    const yS = polygon.map((p) => p[1]);

    const xMin = Math.min(...xS);
    const xMax = Math.max(...xS);
    const yMin = Math.min(...yS);
    const yMax = Math.max(...yS);

    const w = xMax - xMin;
    const h = yMax - yMin;
    const area = w * h;

    const mapSystem = mapMaker([w, h], [xMin, yMin], {
      minDistance: mapRange(area, 0, maxArea, 50 * 2, 50 * 0.25, true),
      maxDistance: mapRange(area, 0, maxArea, 100 * 2, 100 * 0.25, true),
      step: 5,
      jitter: true,
    });

    return {
      clip: polygon,
      mapSystem,
    };
  });

  const margin = width * 0.05;
  const globalClip = [
    [margin, margin],
    [width - margin, margin],
    [width - margin, height - margin],
    [margin, height - margin],
  ];

  const clippedPolygons = polygons
    .map((poly) => clipPolylinePoly(poly, globalClip))
    .flat() as Point[][];

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.lineWidth = config.size;
    context.strokeStyle = fg;
    sections.forEach(({ clip, mapSystem }) => {
      const streets = mapSystem();
      const regions = streets.map((street) => street.points);

      const output = regions
        .map((r) => clipPolylinePoly(r, clip as any))
        .flat()
        .map((r) => clipPolylinePoly(r as any, globalClip))
        .flat();

      output.forEach((region, idx) => {
        const cIdx = Math.floor(
          mapRange(region.length, 0, 50, 0, colors.length)
        );
        context.strokeStyle = colors[cIdx % colors.length];
        drawPath(context, region as Point[], false);
        context.stroke();
      });
    });

    context.lineWidth = config.size * 4;
    context.strokeStyle = fg;
    clippedPolygons.forEach((poly) => {
      drawPath(context, poly);
      context.stroke();
    });
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
