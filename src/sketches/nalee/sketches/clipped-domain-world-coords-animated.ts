import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange, lerpFrames } from 'canvas-sketch-util/math';
import { createNaleeSystem } from '../nalee-system';
import { makeDomain, clipDomainWithWorldCoords } from '../domain';
import { Config } from '../types';
import { xyToCoords } from '../utils';

Random.setSeed('nalee');

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 12;
  const config = {
    resolution: [Math.floor(width / size), Math.floor(height / size)],
    size: size,
    stepSize: size / 3,
    walkerCount: 30,
    padding: 0.03125, // 1 / 32
    pathStyle: 'solidStyle',
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );

  wrap.render = (props: SketchProps) => {
    const { playhead } = props;
    const domain = makeDomain(config.resolution, domainToWorld);
    const t = lerpFrames([0, 1, 0], playhead);
    const x1 = lerpFrames([0, 200, 300], t); // mapRange(t, 0, 1, 0, 200);
    const x2 = lerpFrames([400, 1000, 400], t); // mapRange(t, 0, 1, 400, 1000);
    const y1 = lerpFrames([0, 200, 300], t); // mapRange(t, 0, 1, 0, 200);
    const y2 = lerpFrames([200, 600, 900], t); // mapRange(playhead, 0, 1, 200, 600);
    const clippedDomain = clipDomainWithWorldCoords(domain, [
      [x1, y1],
      [x2, y1],
      [x2, y2],
      [x1, y2],
    ]);
    const naleeSystem = createNaleeSystem(clippedDomain, config, domainToWorld);
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#101019';
    context.fillRect(0, 0, width, height);

    naleeSystem(props);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 12,
  exportFps: 12,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
