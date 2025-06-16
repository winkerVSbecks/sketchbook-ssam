import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import eases from 'eases';
import {
  generateDomainSystem,
  polygonToParts,
  relativePolygonToPolygon,
} from '../domain-polygon-system';
import {
  generateTessellatedPolygon,
  addPaddingToPolygon,
} from '../polygon-utils';
import { drawPart } from './ui';
import { config as defaultConfig, colors } from './config';

const config = {
  ...defaultConfig,
  gap: 0,
  inset: 10,
  res: [5, 5] as any,
};

const cycles = 12;

const distort = () => {
  const xs = [0];
  for (let i = 1; i < config.res[0]; i++) {
    const next = Math.min(
      xs[i - 1] + Random.range(0.2, 1.8),
      config.res[0] - 1
    );
    xs.push(next);
  }
  xs.push(config.res[0]);

  const ys = [0];
  for (let i = 1; i < config.res[1]; i++) {
    const next = Math.min(
      ys[i - 1] + Random.range(0.2, 1.8),
      config.res[1] - 1
    );
    ys.push(next);
  }
  ys.push(config.res[0]);

  return [xs, ys];
};

const baseGrid = [
  Array.from({ length: config.res[0] + 1 }, (_, idx) => idx),
  Array.from({ length: config.res[0] + 1 }, (_, idx) => idx),
];
const grids = Array.from({ length: cycles - 1 }, () => distort());
grids.unshift(baseGrid);
grids.push(baseGrid);

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const grid = {
    w: width * 0.9,
    h: height * 0.9,
    x: width * 0.05,
    y: height * 0.05,
  };

  const { domains } = generateDomainSystem(
    config.res,
    config.gap,
    width,
    height,
    {
      inset: [config.inset, config.inset, config.inset, config.inset],
      doCombineSmallRegions: true,
      doCombineNarrowRegions: true,
      doReduceNarrowRegions: true,
    },
    grid
  );

  const tessellatedPolygons = generateTessellatedPolygon(domains);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    const gridIndex = Math.floor(playhead * cycles);

    const currentGrid = grids[gridIndex];
    const nextGrid = grids[gridIndex + 1];

    const t = eases.cubicInOut((playhead * cycles) % 1);

    const scaledDomains = domains.map((d) => {
      const { rect, rectWithInset } = d.scale(currentGrid, nextGrid, t);
      return { ...d, rect, rectWithInset };
    });

    context.lineJoin = 'round';

    tessellatedPolygons.forEach((relativePolygon, dx) => {
      let polygon = relativePolygonToPolygon(
        relativePolygon,
        currentGrid,
        nextGrid,
        t
      );
      polygon = addPaddingToPolygon(polygon, config.inset * 2);

      const polygonParts = polygonToParts(scaledDomains, polygon, true);

      // domains.forEach((d) => {
      //   const { x, y, width, height } = d.scale(currentGrid, nextGrid, t);
      //   context.strokeStyle = colors.window.outline;
      //   context.strokeRect(x, y, width, height);
      // });

      // render solid parts with button style aesthetic
      polygonParts.forEach((part, idx) => {
        drawPart(
          context,
          part.area,
          colors.parts[(idx + dx) % colors.parts.length]
        );
      });
    });
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: cycles * 2000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
