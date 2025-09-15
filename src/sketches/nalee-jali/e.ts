import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee/nalee-system';
import Random from 'canvas-sketch-util/random';
import { Delaunay } from 'd3-delaunay';
import PoissonDiskSampling from 'poisson-disk-sampling';
import { makeDomain, clipDomain } from '../nalee/domain';
import { Config } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';
import { drawShape } from '../nalee/paths';
import { color, keys, ColorType } from '../../colors/radix';

const bg = color('mauve', 2);
const colors: [string[], string][] = Random.shuffle(keys).map(
  (k: ColorType) => [[color(k, 11)], color(k, 3)]
);

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
    pathStyle: 'infinitePipeStyle',
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );

  const domain = makeDomain(config.resolution, domainToWorld);

  const points = new PoissonDiskSampling({
    shape: [config.resolution[0], config.resolution[1]],
    tries: 20,
    minDistance: Math.round(Math.max(...config.resolution) * 0.25),
    maxDistance: Math.max(...config.resolution),
  })
    .fill()
    .concat([
      [0, 0],
      [0, config.resolution[1]],
      [config.resolution[0], 0],
      [config.resolution[0], config.resolution[1]],
    ]);

  let delaunay: Delaunay<number[]> = Delaunay.from(points as Point[]);

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
