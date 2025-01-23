import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Vector } from 'p5';
import clustering from 'density-clustering';
import convexHull from 'convex-hull';
import classifyPoint from 'robust-point-in-polygon';
import {
  polygon,
  calculateMtv,
  movePolygon,
  checkScreenBounds,
  drawPolygon,
  Polygon,
  resolveCollision,
  updatePolygon,
} from './SAT';
import { clrs } from '../../colors/clrs';

const config = {
  pointCount: 100,
  clusterCount: 4,
  polygonCount: 6,
};

const colors = Random.pick(clrs);
const bg = colors.pop()!;

export const sketch = async ({ wrap, width, height, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  let polygons: Polygon[] = [];
  for (let index = 0; index < config.polygonCount; index++) {
    const location = new Vector(
      Random.range(0, width),
      Random.range(0, height)
    );

    const p = polygon(
      location,
      100,
      Random.rangeFloor(3, 8),
      new Vector(width / 2, height / 2).sub(location).normalize().mult(2),
      Random.pick(colors)
    );

    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    while (attempts < MAX_ATTEMPTS) {
      let hasOverlap = false;
      checkScreenBounds(p, width, height);

      // Check against existing polygons
      for (const existingPoly of polygons) {
        const translationVector = calculateMtv(existingPoly, p);
        if (translationVector) {
          hasOverlap = true;
          movePolygon(p, translationVector);
        }
      }

      if (!hasOverlap) {
        polygons.push(p);
        break;
      }

      attempts++;
    }
  }
  const initialPolygons = polygons.map((p) => ({ ...p }));

  wrap.render = ({ width, height, frame }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      polygons = initialPolygons.map((p) => ({ ...p }));
    }

    polygons.forEach((p) => {
      if (p.state === 'dead') return;
      updatePolygon(p);
    });

    polygons.forEach((p, i) => {
      if (p.state === 'dead') return;
      checkScreenBounds(p, width, height);

      for (let j = i + 1; j < polygons.length; j++) {
        const poly2 = polygons[j];
        resolveCollision(p, poly2, 0.5, (p1, p2) => {
          if (
            p1.state === 'dead' ||
            p1.state === 'other' ||
            p2.state === 'dead'
          )
            return;
          // remove the original polygons
          p.state = 'dead';
          poly2.state = 'dead';
          const parts1 = fracture(p1);
          const parts2 = fracture(p2);

          // add the fractured polygons
          polygons.push(...parts1, ...parts2);
        });
      }
    });

    polygons.forEach((p) => {
      if (p.state === 'dead') return;
      drawPolygon(context, p);
    });
  };
};

function fracture(polygonToExplode: Polygon): Polygon[] {
  const pCenter = calculateCentroid(
    polygonToExplode.vertices.map((v) => v.array()) as Point[]
  );

  let points: Point[] = Array.from({ length: config.pointCount }, () => {
    const pt = Random.insideCircle(polygonToExplode.radius);
    return [pt[0] + pCenter[0], pt[1] + pCenter[1]] as Point;
  }).filter(
    (p) =>
      classifyPoint(
        polygonToExplode.vertices.map((v) => v.array()) as Point[],
        p
      ) <= 0
  );

  // We will add to this over time
  const lines: Line[] = [];

  // The N value for k-means clustering
  // Lower values will produce bigger chunks
  function integrate() {
    // Not enough points in our data set
    if (points.length <= config.clusterCount) return false;

    // k-means cluster our data
    const scan = new clustering.KMEANS();
    const clusters = scan
      .run(points, config.clusterCount)
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

  const polygons = lines
    .map((path) => {
      const center = calculateCentroid(path);
      const location = new Vector(center[0], center[1]);

      const rawVertices = path
        .map((p) => new Vector(p[0], p[1]))
        // sort vertices in clockwise order
        .sort((a, b) =>
          Math.atan2(a.y - location.y, a.x - location.x) >
          Math.atan2(b.y - location.y, b.x - location.x)
            ? -1
            : 1
        );

      // filter out vertices that are too close to each other
      const minDist = 0.1;
      const vertices = rawVertices.filter((v, idx, arr) => {
        const next = arr[(idx + 1) % arr.length];
        return v.dist(next) > minDist;
      });

      const edges = vertices.map((v, idx, arr) => {
        const next = arr[(idx + 1) % arr.length];
        return next.copy().sub(v);
      });

      // Calculate normals
      const normals = edges.map((e) => {
        const normal = new Vector(e.y, -e.x);
        return normal.normalize();
      });

      return {
        color: polygonToExplode.color,
        state: 'other',
        location,
        velocity: polygonToExplode.velocity
          .copy()
          .mult(2)
          .rotate(Random.gaussian(0, Math.PI / 4)),
        vertices,
        edges,
        normals,
      } as Polygon;
    })
    .filter((p) => p.vertices.length >= 3);

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

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 5_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
