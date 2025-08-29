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
import { clrs } from '../../colors/clrs';

Random.setSeed(Random.getRandomSeed());
// Random.setSeed(169146);
console.log(Random.getSeed());

let colors = Random.shuffle(Random.pick(clrs));
const bg = colors.pop();

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const clipRects: Point[][] = [
    [
      [width * 0.5, 0.7 * height],
      [width, 0.7 * height],
      [width, height],
      [width * 0.5, height],
    ],
    [
      [width * 0.4, 0.6 * height],
      [width, 0.6 * height],
      [width, 0.7 * height],
      [width * 0.5, 0.7 * height],
      [width * 0.5, height],
      [width * 0.4, height],
    ],
    [
      [0, 0],
      [width, 0],
      [width, 0.6 * height],
      [width * 0.4, 0.6 * height],
      [width * 0.4, height],
      [0, height],
    ],
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
  const systems = clipRects.map((clipRect) => {
    const clippedDomain = clipDomainWithWorldCoords(domain, clipRect);
    console.log('#', clippedDomain.length);

    return createNaleeSystem(
      clippedDomain,
      naleeConfig,
      domainToWorld,
      [colors.pop()],
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

    const x1 = lerpFrames(
      [0.4 * width, 0.4 * width, 0.2 * width, 0.4 * width],
      playhead
    );
    const x2 = lerpFrames(
      [0.5 * width, 0.45 * width, 0.25 * width, 0.5 * width],
      playhead
    );

    const y1 = lerpFrames([0.7 * height, 0.6 * height, 0.7 * height], playhead);
    const y2 = lerpFrames([0.6 * height, 0, 0, 0.6 * height], playhead);

    const clipRects: Point[][] = [
      [
        [x2, y1],
        [width, y1],
        [width, height],
        [x2, height],
      ],
      [
        [x1, y2],
        [width, y2],
        [width, y1],
        [x2, y1],
        [x2, height],
        [x1, height],
      ],
      [
        [0, 0],
        [width, 0],
        [width, y2],
        [x1, y2],
        [x1, height],
        [0, height],
      ],
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
