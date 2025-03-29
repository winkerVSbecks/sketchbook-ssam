import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { drawPath } from '@daeinc/draw';
import { generateDomainSystem, isIsland } from '../domain-polygon-system';
import {
  drawWindow,
  drawPart,
  drawVectorNetwork,
  drawControls,
  drawTopBar,
} from './ui';
import { config, colors } from './config';

// To do:
// - Combine thin areas into a single cell
// - If all islands, then convert one to a window

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const grid = {
    w: width * 0.75,
    h: height * 0.75,
    x: width * 0.125,
    y: height * 0.125,
  };

  const { domains, polygon, polygonParts } = generateDomainSystem(
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

  const solidParts = polygonParts.filter(
    (part) => part.area.length > 2 && !part.island
  );
  const islands = polygonParts.filter(
    (part) => part.area.length > 2 && part.island
  );

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = colors.background;
    context.fillRect(0, 0, width, height);

    context.lineJoin = 'round';

    if (solidParts.length === 0) {
      drawTopBar(context, grid.x, grid.y - config.window.toolbar, grid.w);
    }

    // Render macos style windows with top bar,
    // three circular buttons and shadow
    windows.forEach((d) => {
      drawWindow(context, d.x, d.y, d.width, d.height, d.debug);
    });

    if (toolbar) {
      drawControls(
        context,
        toolbar.x,
        toolbar.y,
        toolbar.width,
        toolbar.height
      );
    }

    // render solid parts with button style aesthetic
    solidParts.forEach((part, idx) => {
      drawPart(context, part.area, colors.parts[idx % colors.parts.length]);
    });

    // render islands with vector network aesthetic
    islands.forEach((part) => {
      drawVectorNetwork(context, part);
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
  animate: false,
  duration: 1_000,
};

ssam(sketch as Sketch<'2d'>, settings);
