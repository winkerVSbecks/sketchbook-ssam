import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee/nalee-system';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import { formatHex } from 'culori';
import { makeDomain, clipDomain } from '../nalee/domain';
import { Config } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';

const colors = [
  '#FDFCF3',
  '#002500',
  '#2A42FF',
  '#2B0404',
  '#AB2A00',
  '#C15F3D',
  '#EB562F',
];
const bg = colors.shift()!;

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

  const polygons: Point[][] = [];

  // Randomly generate polygons across the domain
  const polygonCount = Random.rangeFloor(3, 7);
  for (let i = 0; i < polygonCount; i++) {
    const vertexCount = Random.rangeFloor(3, 6);
    const poly: Point[] = [];
    for (let j = 0; j < vertexCount; j++) {
      const x = Random.range(0, config.resolution[0]);
      const y = Random.range(0, config.resolution[1]);
      poly.push([x, y]);
    }
    // sort points clockwise
    poly.sort(
      (a, b) =>
        Math.atan2(
          a[1] - config.resolution[1] / 2,
          a[0] - config.resolution[0] / 2
        ) -
        Math.atan2(
          b[1] - config.resolution[1] / 2,
          b[0] - config.resolution[0] / 2
        )
    );
    polygons.push(poly);
  }

  const systems = polygons.map((t) => {
    const cd = clipDomain(domain, t);
    const color = Random.pick([
      [['#002500'], '#CEFF00'],
      [['#2A42FF'], '#CEFF00'],
      [['#EB562F'], '#ECE5F0'],
      [['#002500'], '#ECE5F0'],
    ]);

    return createNaleeSystem(cd, config, domainToWorld, color[0], color[1]);
  });

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    systems.forEach((system) => system(props));
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [600, 800],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
