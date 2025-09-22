import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
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
import { Domain } from '../types';

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

  const {
    domains,
    polygon,
    polygonParts,
    grid: cGrid,
  } = generateDomainSystem(
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

  const baseWindows: Domain[] = Random.shuffle(
    domains.filter((d) => !isIsland(d))
  );
  const windows: Domain[] = baseWindows.slice(
    0,
    Math.round(baseWindows.length * 0.25)
  );

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

    // Draw grid lines
    context.strokeStyle = colors.shadow;
    context.lineWidth = 1;

    for (let x = cGrid.x; x <= cGrid.w; x += cGrid.xRes) {
      context.beginPath();
      context.moveTo(x + cGrid.gap / 2, cGrid.y);
      context.lineTo(x + cGrid.gap / 2, cGrid.y + cGrid.h);
      context.stroke();
    }
    for (let y = cGrid.y; y <= cGrid.h; y += cGrid.yRes) {
      context.beginPath();
      context.moveTo(cGrid.x, y + cGrid.gap / 2);
      context.lineTo(cGrid.x + cGrid.w, y + cGrid.gap / 2);
      context.stroke();
    }

    context.fillStyle = colors.background;
    domains.forEach((d) => {
      context.beginPath();
      context.rect(d.x, d.y, d.width, d.height);
      context.stroke();
      context.fill();
    });

    if (solidParts.length === 0) {
      drawTopBar(context, grid.x, grid.y - config.window.toolbar, grid.w);
    }

    // Render macos style windows with top bar,
    // three circular buttons and shadow
    windows.forEach((d) => {
      drawWindow(context, d.x, d.y, d.width, d.height, d.debug);
    });

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
