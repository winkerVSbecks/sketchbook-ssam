import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { createNaleeSystem } from '../nalee/nalee-system';
import Random from 'canvas-sketch-util/random';
import { mapRange, lerpFrames } from 'canvas-sketch-util/math';
import { makeDomain, clipDomain } from '../nalee/domain';
import { Config, Walker } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';
import { drawShape } from '../nalee/paths';

const palettes = [
  {
    stroke: '#2B0404',
    highlight: '#FDFCF3',
    single: '#2A42FF',
    bg: '#ECE5F0',
  },
  {
    stroke: '#2B0404',
    highlight: '#FDFCF3',
    single: '#CEFF00',
    bg: '#ECE5F0',
  },
  {
    stroke: '#002500',
    highlight: '#CEFF00',
    single: '#2A42FF',
    bg: '#FDFCF3',
  },
  {
    stroke: '#002500',
    highlight: '#CEFF00',
    single: '#EB562F',
    bg: '#FDFCF3',
  },
  {
    stroke: '#1A1110',
    highlight: '#E4DB55',
    single: '#DE5346',
    bg: '#F4EFEE',
  },
  {
    stroke: '#1A1110',
    highlight: '#E4DB55',
    single: '#792445',
    bg: '#F4EFEE',
  },
  {
    stroke: '#020703',
    highlight: '#EAF5BD',
    single: '#367AED',
    bg: '#FEFEfE',
  },
  {
    stroke: '#002233',
    highlight: '#DDFF55',
    single: '#11425D',
    bg: '#F6F2E8',
  },
];

// const {
//   stroke: strokeColor,
//   highlight: highlightColor,
//   single: singleColor,
//   bg,
// } = Random.pick(palettes);

const clrs = ['#CEFF00', '#2A42FF', '#AB2A00', '#EB562F', '#C15F3D'];

const strokeColor = '#2B0404';
const highlightColor = '#CEFF00';
const singleColor = '#2A42FF';
const bg = '#FDFCF3';

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 18;
  const config = {
    // resolution: [Math.floor(width / size), Math.floor(height / size)],
    resolution: [16, 25],
    size: size,
    stepSize: size / 3,
    walkerCount: 6,
    padding: 1 / 8,
    pathStyle: function customPathStyle(
      context: CanvasRenderingContext2D,
      walker: Walker,
      pts: Point[],
      playhead: number
    ) {
      context.lineCap = 'round';
      context.lineJoin = 'round';

      if (pts.length < 2) {
        const pt = pts[0];
        const s = (walker.size - walker.stepSize) * 1.25;
        context.fillStyle = singleColor;
        context.beginPath();
        context.roundRect(pt[0] - s / 2, pt[1] - s / 2, s, s, [s / 4]);
        context.fill();
      }

      context.strokeStyle = highlightColor;
      context.lineWidth = walker.size - walker.stepSize + 8;
      drawShape(context, pts, false);
      context.stroke();

      context.strokeStyle = walker.color;
      context.lineWidth = walker.size - walker.stepSize;
      drawShape(context, pts, false);
      context.stroke();

      context.save();
      context.setLineDash([50, 100]);
      context.lineDashOffset = lerpFrames([0, 150], playhead);
      context.strokeStyle = highlightColor;
      context.lineWidth = 1;
      drawShape(context, pts, false);
      context.stroke();
      context.restore();
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
  const y2 = p + 2;
  const y3 = config.resolution[1] - 7;
  const y4 = config.resolution[1];

  const polygons: Point[][] = [
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
      [x3, y2],
      [x4, y2],
      [x4, y4],
      [x3, y4],
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
    return createNaleeSystem(cd, config, domainToWorld, [strokeColor], bg);
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
  // dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
