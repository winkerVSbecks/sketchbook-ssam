import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import eases from 'eases';
import { drawPath } from '@daeinc/draw';
import {
  generateDomainSystem,
  isIsland,
  polygonToParts,
  relativePolygonToPolygon,
} from '../domain-polygon-system';
import {
  drawWindow,
  drawPart,
  drawVectorNetwork,
  drawControls,
  drawTopBar,
} from './ui';
import { config, colors } from './config';

const cycles = 12;

// To do:
// - Combine thin areas into a single cell
// - If all islands, then convert one to a window

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
    w: width * 0.75,
    h: height * 0.75,
    x: width * 0.125,
    y: height * 0.125,
  };

  const { domains, relativePolygon } = generateDomainSystem(
    config.res,
    config.gap,
    width,
    height,
    {
      inset: [
        config.window.toolbar + config.inset,
        config.inset,
        config.inset,
        config.inset,
      ],
      doCombineSmallRegions: true,
      doCombineNarrowRegions: true,
      doReduceNarrowRegions: true,
    },
    grid
  );

  const toolbar = domains.find((d) => {
    const isNarrow =
      (d.region.width === 1 && d.region.height <= 3) ||
      (d.region.height === 1 && d.region.width <= 3);
    const isEdgeAligned =
      d.region.x === 0 ||
      d.region.y === 0 ||
      d.region.x + d.region.width === config.res[0] ||
      d.region.y + d.region.height === config.res[1];
    return isNarrow && isEdgeAligned && !d.hasPart;
  });
  const windows = domains.filter((d) => !isIsland(d) && d.id !== toolbar?.id);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    const gridIndex = Math.floor(playhead * cycles);

    const currentGrid = grids[gridIndex];
    const nextGrid = grids[gridIndex + 1];

    const t = eases.cubicInOut((playhead * cycles) % 1);

    const polygon = relativePolygonToPolygon(
      relativePolygon,
      currentGrid,
      nextGrid,
      t
    );
    const scaledDomains = domains.map((d) => {
      const { rect, rectWithInset } = d.scale(currentGrid, nextGrid, t);
      return { ...d, rect, rectWithInset };
    });
    const polygonParts = polygonToParts(scaledDomains, polygon);

    const solidParts = polygonParts.filter(
      (part) => part.area.length > 2 && !part.island
    );
    const islands = polygonParts.filter(
      (part) => part.area.length > 2 && part.island
    );

    context.lineJoin = 'round';

    if (solidParts.length === 0) {
      drawTopBar(context, grid.x, grid.y - config.window.toolbar, grid.w);
    }

    // Render macos style windows with top bar,
    // three circular buttons and shadow
    windows.forEach((d) => {
      const { x, y, width, height } = d.scale(currentGrid, nextGrid, t);
      drawWindow(context, x, y, width, height, d.debug);
    });

    if (toolbar) {
      const { x, y, width, height } = toolbar.scale(currentGrid, nextGrid, t);
      drawControls(context, x, y, width, height);
    }

    // render solid parts with button style aesthetic
    solidParts.forEach((part, idx) => {
      // const scaledArea = part.relativeArea.map((point) => {
      //   const { x, y, width, height } = part.domain.scale(
      //     currentGrid,
      //     nextGrid,
      //     t
      //   );

      //   return [x + point[0] * width, y + point[1] * height] as Point;
      // });

      drawPart(context, part.area, colors.parts[idx % colors.parts.length]);
    });

    // render islands with vector network aesthetic
    islands.forEach((part) => {
      // const scaledArea = part.relativeArea.map((point) => {
      //   const { x, y, width, height } = part.domain.scale(
      //     currentGrid,
      //     nextGrid,
      //     t
      //   );

      //   return [x + point[0] * width, y + point[1] * height] as Point;
      // });

      drawVectorNetwork(context, part /* { ...part, area: scaledArea } */);
    });

    if (config.debug) {
      context.fillStyle = 'red';
      drawPath(context, polygon, true);
      context.fill();

      context.fillStyle = 'red';
      polygon.forEach((point) => {
        context.beginPath();
        context.arc(point[0], point[1], 3, 0, Math.PI * 2);
        context.fill();
      });
    }
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
