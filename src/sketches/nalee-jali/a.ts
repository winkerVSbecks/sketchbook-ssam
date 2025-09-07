import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee/nalee-system';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import { formatHex } from 'culori';
import { makeDomain, clipDomain } from '../nalee/domain';
import { Config } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';
// import { randomPalette } from '../../../colors';
import { randomPalette } from '../../colors/riso';
import { carmen } from '../../colors/found';

function generateColors(count: number) {
  const colors = generateColorRamp({
    total: count,
    sRange: [0.6, 0.9], // [s, s],
    lRange: [0.2, 0.8], // [l, l], // [0.2, 0.6],
  })
    .reverse()
    .map((color) => formatHex(colorToCSS(color, 'hsl')));

  return colors;
}
// const colors = generateColors(5);
// const bg = colors.shift()!;

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

// const colors = ['#fff'];
// const bg = '#000';

// const { bg, inkColors: colors } = randomPalette();
// const colors = randomPalette();
// const bg = colors.shift()!;

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
  const s = 1;
  const yStep = Math.floor(config.resolution[1] / 4);
  const x1 = 0;
  const x2 = Math.floor(config.resolution[0] / 2);
  const x3 = config.resolution[0];

  const triangles = [];

  for (let idx = 0, y = 0; y < config.resolution[1]; y += yStep, idx++) {
    if (idx % 2 === 0) {
      triangles.push([
        [x1, y + s],
        [x2 - s, y + s],
        [x1, y + yStep - s],
      ] as Point[]);
      triangles.push([
        [x1 + s, y + yStep - s],
        [x2, y + s],
        [x3 - s, y + yStep - s],
      ] as Point[]);
      triangles.push([
        [x3, y + s],
        [x2 + s, y + s],
        [x3, y + yStep - s],
      ] as Point[]);
    } else {
      // flip triangles vertically
      triangles.push([
        [x1, y + s],
        [x2 - s, y + yStep - s],
        [x1, y + yStep - s],
      ] as Point[]);
      triangles.push([
        [x1 + s, y + s],
        [x3 - s, y + s],
        [x2, y + yStep - s],
      ] as Point[]);
      triangles.push([
        [x3, y + s],
        [x3, y + yStep - s],
        [x2 + s, y + yStep - s],
      ] as Point[]);
    }
  }

  const systems = triangles.map((t, idx) => {
    const cd = clipDomain(domain, t);
    const color = Random.pick([
      [['#002500'], '#CEFF00'],
      [['#2A42FF'], '#CEFF00'],
      [['#EB562F'], '#ECE5F0'],
      [['#002500'], '#ECE5F0'],
    ]);

    return createNaleeSystem(
      cd,
      config,
      domainToWorld,
      color[0],
      color[1]
      // ['#002500', '#2B0404'],
      // Random.pick(['#CEFF00', '#ECE5F0', '#2A42FF', '#AB2A00'])
      // [colors[idx % colors.length]],
      // Random.pick(['#CEFF00', '#ECE5F0'])
      // bg
    );
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
