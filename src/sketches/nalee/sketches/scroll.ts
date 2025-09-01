import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerpFrames } from 'canvas-sketch-util/math';
import {
  createNaleeSystem,
  makeDomain,
  xyToCoords,
  clipDomainWithWorldCoords,
} from '../index';
import type { Config } from '../index';
import { clrs } from '../../../colors/clrs';
import { palettes } from '../../../colors/auto-albers';

const colors = Random.pick(palettes);
const bg = colors.pop();
const outline = Random.pick(colors);
const fill = Random.pick(colors);

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

const config = {
  left: 0.12,
  w: 0.05,
  h: 0.38,
  direction: 'horizontal', // vertical horizontal
};

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 6;
  const naleeConfig = {
    resolution: [Math.floor(width / size), Math.floor(height / size)],
    size: size,
    stepSize: size / 3,
    walkerCount: 30,
    padding: 0.03125, // 1 / 32
    pathStyle: 'solidStyle',
    flat: true,
  } satisfies Config;

  const left = width * config.left;
  const h = height * config.h;
  const top = (height * (1 - config.h)) / 2;

  wrap.render = (props: SketchProps) => {
    const { width, height, playhead } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const rects = [
      { x: left, y: top, w: width - left * 2, h: height - top * 2 },
    ].map((rect) => ({
      ...rect,
      clipX: lerpFrames([rect.x, rect.x, rect.x + rect.w], playhead),
      fillW: lerpFrames([0, rect.w, 0], playhead),
      clipY: lerpFrames([rect.y, rect.y, rect.y + rect.h], playhead),
      fillH: lerpFrames([0, h, 0], playhead),
    }));

    const clipRects = rects
      .map((rect) => {
        return {
          x: config.direction === 'horizontal' ? rect.clipX : rect.x,
          y: config.direction === 'vertical' ? rect.clipY : rect.y,
          w: config.direction === 'horizontal' ? rect.fillW : rect.w,
          h: config.direction === 'vertical' ? rect.fillH : rect.h,
        };
      })
      .map<Point[]>(({ x, y, w, h }) => [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
      ]);

    const domainToWorld = xyToCoords(
      naleeConfig.resolution,
      naleeConfig.padding,
      width,
      height
    );

    const systems = clipRects.map((clipRect, idx) => {
      const domain = makeDomain(naleeConfig.resolution, domainToWorld);
      const clippedDomain = clipDomainWithWorldCoords(domain, clipRect);
      return createNaleeSystem(
        clippedDomain,
        naleeConfig,
        domainToWorld,
        [fill],
        bg
      );
    });

    // Draw composition
    context.strokeStyle = outline;
    context.lineWidth = size;
    rects.forEach((rect) => {
      context.fillStyle = outline;
      context.fillRect(
        rect.x - size,
        rect.y - size * 4,
        rect.w + size * 2,
        size * 3
      );
      context.strokeRect(
        rect.x - size,
        rect.y - size * 4,
        rect.w + size * 2,
        size * 3
      );
      context.fillStyle = bg;
      const r = size;
      context.beginPath();
      context.arc(rect.x + size, rect.y - size * 2 - r / 2, r, 0, 2 * Math.PI);
      context.arc(
        rect.x + 3 * size + r,
        rect.y - size * 2 - r / 2,
        r,
        0,
        2 * Math.PI
      );
      context.arc(
        rect.x + 6 * size + r,
        rect.y - size * 2 - r / 2,
        r,
        0,
        2 * Math.PI
      );
      context.fill();

      context.strokeRect(
        rect.x - size,
        rect.y - size,
        rect.w + size * 2,
        rect.h + size * 2
      );
    });

    context.fillStyle = fill;

    systems.forEach((system) => {
      system(props);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [800, 600],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 8,
  exportFps: 8,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
