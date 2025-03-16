import Random from 'canvas-sketch-util/random';

import { drawPath } from '@daeinc/draw';
import type { PolygonPart } from '../types';
import { color } from '../../../colors/radix';
import { config, colors } from './config';

export function applyShadow(
  context: CanvasRenderingContext2D,
  callback: () => void
) {
  context.save();
  context.shadowColor = colors.shadow;
  context.shadowBlur = 20;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 5;

  callback();
  context.restore();
}

export function drawContextMenu(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  context.fillStyle = colors.bg;
  context.beginPath();
  context.roundRect(x, y, width, height, config.r);
  context.fill();

  context.strokeStyle = colors.window.outline;
  context.beginPath();
  context.roundRect(x, y, width, height, config.r);
  context.stroke();

  context.strokeStyle = color('mauve', 6, config.colorMode);
  context.fillStyle = color('slate', 11, config.colorMode);
  const h = 20;
  const count = Math.ceil(height / h);
  const padding = 5;
  // Render the context menu items (random text)
  context.textBaseline = 'top';
  Array.from({ length: count }).forEach((_, idx) => {
    const itemY = padding + y + idx * h;

    context.font = '12px SF Pro Display';
    context.fillStyle = color('mauve', 6, config.colorMode);
    context.fillText(
      Random.pick([
        'New File',
        'Open File',
        'Save File',
        'Close File',
        'Close Window',
        'Close Tab',
        'Close All',
        'Undo',
        'Redo',
        'Cut',
        'Copy',
        'Paste',
        'Delete',
        'Select All',
        'Find',
        'Replace',
        'Go to Line',
        'Preferences',
        'Settings',
        'Help',
      ]),
      x + padding * 2,
      itemY + 4
    );
  });
}

export function drawWindow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  debug?: boolean
) {
  context.lineWidth = 1;

  const gradient = context.createLinearGradient(
    x,
    y,
    x,
    y + config.window.toolbar
  );
  gradient.addColorStop(0, colors.window.background[0]);
  gradient.addColorStop(1, colors.window.background[1]);

  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(x, y, width, config.window.toolbar, [
    config.r,
    config.r,
    0,
    0,
  ]);
  context.fill();

  context.strokeStyle = colors.window.outline;
  context.beginPath();
  context.moveTo(x, y + config.window.toolbar);
  context.lineTo(x + width, y + config.window.toolbar);
  context.stroke();

  colors.window.buttons.forEach((color, idx) => {
    context.fillStyle = color;
    context.beginPath();
    context.arc(
      x +
        config.window.buttonSpacing * 0.75 +
        idx * config.window.buttonSpacing,
      y + 10,
      config.window.button,
      0,
      Math.PI * 2
    );
    context.fill();
  });

  context.strokeStyle = debug ? '#f00' : colors.window.outline;
  context.beginPath();
  context.roundRect(x, y, width, height, config.r);
  context.stroke();
}

export function drawPart(
  context: CanvasRenderingContext2D,
  area: Point[],
  color: {
    base: [string, string, string];
    border: string;
    accent: string;
  }
) {
  const ys = area.map((p) => p[1]);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);

  const fillGradient = context.createLinearGradient(0, y0, 0, y1);
  fillGradient.addColorStop(0, color.base[0]);
  fillGradient.addColorStop(0.75, color.base[1]);
  fillGradient.addColorStop(1, color.base[2]);

  const strokeGradient = context.createLinearGradient(0, y0, 0, y1);
  strokeGradient.addColorStop(0, color.accent);
  strokeGradient.addColorStop(1, color.base[1]);

  context.fillStyle = fillGradient;

  applyShadow(context, () => {
    drawPath(context, area, true);

    context.strokeStyle = color.border;
    context.lineWidth = 6;
    context.stroke();

    context.strokeStyle = strokeGradient;
    context.lineWidth = 3;
    context.stroke();

    context.fill();
  });
}

export function drawVectorNetwork(
  context: CanvasRenderingContext2D,
  part: PolygonPart,
  fg = colors.vector.fg,
  bg = colors.bg
) {
  context.fillStyle = bg;
  context.strokeStyle = colors.vector.connector;
  context.beginPath();
  drawPath(context, part.area, true);
  context.fill();
  context.stroke();

  // render vertices
  context.fillStyle = bg;
  context.strokeStyle = fg;
  part.area.forEach((point) => {
    context.beginPath();
    context.arc(point[0], point[1], 3, 0, Math.PI * 2);
    // context.rect(point[0] - 2, point[1] - 2, 4, 4);
    context.fill();
    context.stroke();
  });
}
