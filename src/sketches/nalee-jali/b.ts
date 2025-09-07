import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee/nalee-system';
import Random from 'canvas-sketch-util/random';
import { makeDomain, clipDomain } from '../nalee/domain';
import { Config, Walker } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';
import { carmen } from '../../colors/found';
import { drawShape } from '../nalee/paths';

const colors = [
  // '#FDFCF3',
  '#ECE5F0',
  '#002500',
  '#CEFF00',
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

  const singleColor = Random.pick(['#C15F3D', '#EB562F', '#2A42FF']);
  const highlightColor = Random.pick(['#EB562F', '#CEFF00']);

  const size = 18;
  const config = {
    // resolution: [Math.floor(width / size), Math.floor(height / size)],
    resolution: [16, 25],
    size: size,
    stepSize: size / 3,
    walkerCount: 6,
    padding: 1 / 8,
    pathStyle: function solidStyle(
      context: CanvasRenderingContext2D,
      walker: Walker,
      pts: Point[]
    ) {
      context.lineCap = 'round';
      context.lineJoin = 'round';

      if (pts.length < 2) {
        const pt = pts[0];
        context.fillStyle = singleColor;
        const s = walker.size - walker.stepSize;
        context.beginPath();
        context.roundRect(pt[0] - s / 2, pt[1] - s / 2, s, s, [s / 4]);
        context.fill();
      }

      context.save();
      context.translate(-4, -4);
      context.strokeStyle = highlightColor;
      context.lineWidth = walker.size - walker.stepSize;
      drawShape(context, pts, false);
      context.stroke();
      context.restore();

      context.strokeStyle = walker.color;
      context.lineWidth = walker.size - walker.stepSize;
      drawShape(context, pts, false);
      context.stroke();
    },
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );

  const domain = makeDomain(config.resolution, domainToWorld);

  const p = 2;
  const x1 = 0;
  const x2 = p;
  const x3 = p + 1 + p;
  const x4 = x3 + 5;
  const x5 = x4 + p + 1;
  const x6 = config.resolution[0];
  const y1 = 0;
  const y2 = p + 3;
  const y3 = config.resolution[1] - 7;
  const y4 = config.resolution[1];

  const polygons: Point[][] = [
    // [
    //   [x1, y1],
    //   [x6, y1],
    //   [x6, y4],
    //   [x1, y4],
    // ],
    [
      [x1, y3],
      [x2, y3],
      [x2, y4],
      [x1, y4],
    ],
    [
      [x2 + 1, y1],
      [x2 + 2, y1 + 2],
      [x3, y1 + 3],
      [x3, y4],
      [x2 + 1, y4],
    ],
    [
      [x3 + 1, y2],
      [x4, y2],
      [x4, y4],
      [x3 + 1, y4],
    ],
    [
      [x4 + 1, y1 + 3],
      [x4 + 2, y1 + 2],
      [x5, y1],
      [x5, y4],
      [x4 + 1, y4],
    ],
    [
      [x5, y3],
      [x6, y3],
      [x6, y4],
      [x5, y4],
    ],
  ];

  const systems = polygons.map((t) => {
    const cd = clipDomain(domain, t);
    return createNaleeSystem(cd, config, domainToWorld, ['#002500'], bg);
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
