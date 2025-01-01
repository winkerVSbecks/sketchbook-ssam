import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import {
  createNaleeSystem,
  makeDomain,
  xyToCoords,
  clipDomainWithWorldCoords,
} from '../nalee';
import type { Config } from '../nalee';
import { clrs } from '../../colors/clrs';

const colors = Random.pick(clrs);
const bg = colors.pop();
const outline = Random.pick(colors);
const fill = Random.pick(colors);

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

const config = {
  left: 0.12,
  w: 0.05,
  h: 0.38,
};

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 2;
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
  const w = width * config.w;
  const gap = (width * (1 - config.left * 2 - 7 * config.w)) / 6;
  const h = height * config.h;
  const top = (height * (1 - config.h)) / 2;

  wrap.render = (props: SketchProps) => {
    const { width, height, playhead } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const rects = [
      { x: left, y: top, w, h },
      { x: left + w + gap, y: top, w, h },
      { x: left + w * 2 + gap * 2, y: top, w, h },
      { x: left + w * 3 + gap * 3, y: top, w, h },
      { x: left + w * 4 + gap * 4, y: top, w, h },
      { x: left + w * 5 + gap * 5, y: top, w, h },
      { x: left + w * 6 + gap * 6, y: top, w, h },
    ].map((rect, idx) => ({
      ...rect,
      fillH: Math.max(
        h * 0.1,
        rect.h * Math.abs(Math.sin((playhead + idx / 7) * Math.PI * 2))
      ),
    }));

    const clipRects = rects
      .map((rect, idx) => {
        return {
          x: rect.x,
          y: rect.y,
          w: rect.w,
          h: rect.fillH,
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
    context.fillStyle = fill;
    context.strokeStyle = outline;
    rects.forEach((rect) => {
      context.strokeRect(
        rect.x - size,
        rect.y - size,
        rect.w + size * 2,
        rect.h + size * 2
      );
      // context.fillRect(rect.x, rect.y, rect.w, rect.fillH);
    });

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
  playFps: 24,
  exportFps: 24,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
