import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee/nalee-system';
import Random from 'canvas-sketch-util/random';
import { Delaunay } from 'd3-delaunay';
import { makeDomain, clipDomain } from '../nalee/domain';
import { Config } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';
import { drawShape } from '../nalee/paths';

const bg = '#FDFCF3';
const colors: [string[], string][] = [
  [['#002500'], '#CEFF00'],
  [['#2A42FF'], '#CEFF00'],
  [['#EB562F'], '#ECE5F0'],
  [['#002500'], '#ECE5F0'],
] as const;

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 9;
  const config = {
    resolution: [Math.floor(width / size), Math.floor(height / size)],
    size: size - 1,
    stepSize: size / 3,
    walkerCount: 30,
    padding: 1 / 16,
    pathStyle: 'pipeStyle',
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );

  const domain = makeDomain(config.resolution, domainToWorld);

  let points: Point[] = Array.from({ length: 5 }).map(() => [
    Random.rangeFloor(0, config.resolution[0]),
    Random.rangeFloor(0, config.resolution[1]),
  ]);
  let delaunay: Delaunay<number[]> = Delaunay.from(points);

  const { points: dPoints, triangles } = delaunay;
  const polygons: Point[][] = [];

  for (let i = 0; i < triangles.length / 3; i++) {
    const t0 = triangles[i * 3 + 0];
    const t1 = triangles[i * 3 + 1];
    const t2 = triangles[i * 3 + 2];
    polygons.push([
      [dPoints[t0 * 2], dPoints[t0 * 2 + 1]],
      [dPoints[t1 * 2], dPoints[t1 * 2 + 1]],
      [dPoints[t2 * 2], dPoints[t2 * 2 + 1]],
    ]);
  }

  const worldPolygons: { polygon: Point[]; color: string }[] = [];

  const systems = polygons
    .map((p) => shrinkTriangle(p, 0.05))
    .map((p, idx) => {
      const cd = clipDomain(domain, p);
      const color = colors[idx % colors.length];

      worldPolygons.push({
        polygon: polygons[idx].map((p) => domainToWorld(...p)),
        color: color[1],
      });

      return createNaleeSystem(cd, config, domainToWorld, color[0], color[1]);
    });

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    systems.forEach((system, idx) => {
      const { polygon, color } = worldPolygons[idx];
      context.strokeStyle = '#002500';
      context.fillStyle = color;
      context.lineWidth = 2;
      context.lineCap = 'round';
      context.lineJoin = 'round';
      drawShape(context, polygon);
      context.stroke();
      context.fill();

      context.save();
      system(props);
      context.restore();
    });
  };
};

function shrinkTriangle(triangle: Point[], padding: number): Point[] {
  // Calculate centroid
  const cx = (triangle[0][0] + triangle[1][0] + triangle[2][0]) / 3;
  const cy = (triangle[0][1] + triangle[1][1] + triangle[2][1]) / 3;

  // Shrink each vertex toward centroid
  return triangle.map(([x, y]) => [
    cx + (x - cx) * (1 - padding),
    cy + (y - cy) * (1 - padding),
  ]);
}

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
