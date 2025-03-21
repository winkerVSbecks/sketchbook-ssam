import Random from 'canvas-sketch-util/random';
import { drawPath } from '@daeinc/draw';
import type { PolygonPart } from '../types';
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

export function drawWindow(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  debug?: boolean
) {
  context.fillStyle = colors.bg;
  context.strokeStyle = debug ? '#f00' : colors.window.outline;
  applyShadow(context, () => {
    context.beginPath();
    context.roundRect(x, y, width, height, config.r);
    context.fill();
    context.restore();
    context.stroke();
  });

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

export function drawToolbar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  context.fillStyle = colors.toolbar.background;
  context.strokeStyle = colors.window.outline;
  applyShadow(context, () => {
    context.beginPath();
    context.roundRect(x, y, width, height, config.r);
    context.fill();
    context.restore();
    context.stroke();
  });

  const direction = width > height ? 'horizontal' : 'vertical';

  const count = 3;
  const margin = config.inset * 2;
  const gap = margin;
  const size = [
    direction === 'horizontal' ? (width - margin * 4) / 3 : width - margin * 2,
    direction === 'horizontal'
      ? height - margin * 2
      : (height - margin * 4) / count,
  ];
  const x0 =
    direction === 'horizontal' ? x + margin : x + (width - size[0]) / 2;
  const y0 =
    direction === 'horizontal' ? y + (height - size[1]) / 2 : y + margin;

  for (let i = 0; i < count; i++) {
    drawRaisedButton(
      context,
      x0 + (direction === 'horizontal' ? (gap + size[0]) * i : 0),
      y0 + (direction === 'horizontal' ? 0 : (gap + size[1]) * i),
      size[0],
      size[1],
      colors.toolbar.parts[i % colors.toolbar.parts.length]
    );
  }
}

export function drawRaisedButton(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: {
    base: [string, string, string];
    border: string;
    accent: string;
  }
) {
  const y0 = y;
  const y1 = y + height;

  const fillGradient = context.createLinearGradient(0, y0, 0, y1);
  fillGradient.addColorStop(0, color.accent);
  fillGradient.addColorStop(0.125, color.base[0]);
  fillGradient.addColorStop(0.75, color.base[1]);
  fillGradient.addColorStop(1, color.base[2]);

  const strokeGradient = context.createLinearGradient(0, y0, 0, y1);
  strokeGradient.addColorStop(0, color.accent);
  strokeGradient.addColorStop(1, color.base[1]);

  context.fillStyle = fillGradient;

  applyShadow(context, () => {
    context.beginPath();
    context.roundRect(x, y, width, height, config.r);

    context.strokeStyle = color.border;
    context.lineWidth = 6;
    context.stroke();

    context.strokeStyle = strokeGradient;
    context.lineWidth = 3;
    context.stroke();

    context.strokeStyle = color.accent;
    context.lineWidth = 2;
    context.stroke();

    context.fill();
  });

  const y2 = y + height / 4;
  const y3 = y + (3 * height) / 4;

  const centreGradient = context.createLinearGradient(0, y2, 0, y3);
  centreGradient.addColorStop(0, color.base[2]);
  centreGradient.addColorStop(1, color.base[1]);

  const centreStrokeGradient = context.createLinearGradient(0, y2, 0, y3);
  centreStrokeGradient.addColorStop(0, color.base[2]);
  centreStrokeGradient.addColorStop(1, color.accent);
  const r = Math.min(width, height) * 0.25;

  context.lineWidth = 2;
  context.fillStyle = centreGradient;
  context.strokeStyle = centreStrokeGradient;
  context.beginPath();
  context.arc(x + width / 2, y + height / 2, r, 0, Math.PI * 2);
  context.fill();
  context.stroke();
}

export function drawControls(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  const direction = width > height ? 'horizontal' : 'vertical';

  const margin = config.knobs.margin;
  const size = Math.min(width, height) - margin * 2;
  const x0 = x + margin;
  const y0 = y + margin;

  const availableLength = Math.max(width, height) - margin * 2;
  const count = Math.floor(availableLength / (size + margin));

  const gap = (availableLength - count * size) / (count - 1);

  for (let i = 0; i < count; i++) {
    const type = Random.pick([drawKnob, drawRaisedButton]);

    type(
      context,
      x0 + (direction === 'horizontal' ? (gap + size) * i : 0),
      y0 + (direction === 'horizontal' ? 0 : (gap + size) * i),
      size,
      size,
      colors.toolbar.parts[i % colors.toolbar.parts.length]
    );
  }
}

export function drawKnob(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: {
    base: [string, string, string];
    border: string;
    accent: string;
  }
) {
  const y0 = y;
  const y1 = y + height;

  const fillGradient = context.createLinearGradient(0, y0, 0, y1);
  fillGradient.addColorStop(0, color.base[0]);
  fillGradient.addColorStop(1, color.base[2]);

  const strokeGradient = context.createLinearGradient(0, y0, 0, y1);
  strokeGradient.addColorStop(0, color.accent);
  strokeGradient.addColorStop(1, color.base[1]);

  context.fillStyle = fillGradient; // color.base[1];

  applyShadow(context, () => {
    context.beginPath();
    context.roundRect(x, y, width, height, config.r);

    context.strokeStyle = color.border;
    context.lineWidth = 6;
    context.stroke();

    context.strokeStyle = strokeGradient;
    context.lineWidth = 3;
    context.stroke();

    context.strokeStyle = color.accent;
    context.lineWidth = 2;
    context.stroke();

    context.fill();
  });

  const y2 = y + height / 4;
  const y3 = y + (3 * height) / 4;

  const centreStrokeGradient = context.createLinearGradient(0, y2, 0, y3);
  centreStrokeGradient.addColorStop(0, color.accent);
  centreStrokeGradient.addColorStop(0.5, color.base[2]);
  centreStrokeGradient.addColorStop(1, color.border);

  const r = Math.min(width, height) * 0.25;

  context.fillStyle = color.base[1];
  context.beginPath();
  context.arc(x + width / 2, y + height / 2, r, 0, Math.PI * 2);

  context.save();
  context.shadowColor = 'rgba(0,0,0,0.1)';
  context.shadowBlur = 20;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = 20;

  context.fill();
  context.restore();

  context.save();
  context.shadowColor = 'rgba(255, 255, 255,.5)';
  context.shadowBlur = 20;
  context.shadowOffsetX = 0;
  context.shadowOffsetY = -20;
  context.fill();
  context.restore();

  context.lineWidth = 2;
  context.strokeStyle = centreStrokeGradient;
  context.stroke();
}
