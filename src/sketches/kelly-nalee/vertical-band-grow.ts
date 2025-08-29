import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerpFrames } from 'canvas-sketch-util/math';
import {
  createNaleeSystem,
  makeDomain,
  xyToCoords,
  clipDomainWithWorldCoords,
} from '../nalee';
import type { Config } from '../nalee';

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

const bg = '#201c1d';
const colors = Random.shuffle([
  '#5f6ce0',
  '#ffad72',
  '#bafc9d',
  '#bf8dff',
  // '#2a1f38',
  '#ffb06b',
  // '#382718',
  '#fc9de7',
  // '#382333',
  '#d4ffff',
  '#ffffff',
  '#fff3d4',
]);
const fg1 = colors.pop()!;
const fg2 = colors.pop()!;

const config = {
  x: 0.5,
  w: 0.25,
};

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const edges = {
    a: [
      [config.x * width, 0],
      [config.x * width, height],
    ] as Point[],
    b: [
      [(config.x + config.w) * width, 0],
      [(config.x + config.w) * width, height],
    ] as Point[],
  };

  const clipRects: Point[][] = [
    [[0, 0], edges.a[0], edges.a[1], [0, height]],
    [edges.a[0], edges.b[0], edges.b[1], edges.a[1]],
    [edges.b[0], [width, 0], [width, height], edges.b[1]],
  ];

  const size = 8;
  const naleeConfig = {
    resolution: [Math.floor(width / size), Math.floor(height / size)],
    size: size,
    stepSize: size / 2,
    walkerCount: 30,
    padding: 0.03125, // 1 / 32
    pathStyle: 'solidStyle',
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    naleeConfig.resolution,
    naleeConfig.padding,
    width,
    height
  );

  const domain = makeDomain(naleeConfig.resolution, domainToWorld);
  const systems = clipRects.map((clipRect, idx) => {
    const clippedDomain = clipDomainWithWorldCoords(domain, clipRect);
    return createNaleeSystem(
      clippedDomain,
      naleeConfig,
      domainToWorld,
      [idx === 1 ? fg1 : fg2],
      bg
    );
  });

  wrap.render = (props: SketchProps) => {
    const { width, height, frame, playhead } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      systems.forEach((system) => {
        system.reset();
      });
    }

    const s = config.w * width;
    const t1 = lerpFrames([0, -s, -s * 0.5, 0], playhead);
    const t2 = lerpFrames([0, -s, s * 0.5, 0], playhead);

    edges.a = [
      [config.x * width + t1, 0],
      [config.x * width + t1, height],
    ];

    edges.b = [
      [(config.x + config.w) * width + t2, 0],
      [(config.x + config.w) * width + t2, height],
    ];

    const clipRects: Point[][] = [
      [[0, 0], edges.a[0], edges.a[1], [0, height]],
      [edges.a[0], edges.b[0], edges.b[1], edges.a[1]],
      [edges.b[0], [width, 0], [width, height], edges.b[1]],
    ];

    clipRects.forEach((clipRect, idx) => {
      const newDomain = clipDomainWithWorldCoords(domain, clipRect);
      systems[idx].grow(newDomain);
    });

    systems.forEach((system) => {
      system(props);
    });
  };
};

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
