import Random from 'canvas-sketch-util/random';

import { drawPath } from '@daeinc/draw';
import type { PolygonPart } from '../types';
import { color } from '../../../colors/radix';
import { config, colors } from './config';
import { generateGridSystemLogs } from './mock-logs';

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

export function drawTerminal(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
) {
  drawWindow(context, x, y, width, height);

  const padding = config.terminal.padding;
  const fontSize = config.terminal.fontSize;
  const lineHeight = config.terminal.lineHeight;

  const logCount = Math.floor((height - config.window.toolbar) / lineHeight);

  const logs = generateGridSystemLogs({ logCount });
  console.log(logCount, logs.length);
  console.log(logs.join('\n'));

  // clip the terminal content
  context.save();
  context.beginPath();
  context.rect(
    x + padding,
    y + config.window.toolbar + padding,
    width - 2 * padding,
    height - config.window.toolbar - padding * 2
  );
  context.clip();

  context.fillStyle = colors.text;
  context.textBaseline = 'top';
  context.font = `${fontSize}px SF Mono`;
  logs.forEach((log, idx) => {
    context.fillText(
      log,
      x + padding,
      y + config.window.toolbar + padding + idx * lineHeight
    );
  });

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
  applyShadow(context, () => {
    context.beginPath();
    context.roundRect(x, y, width, height, [config.r, config.r, 0, 0]);
    context.fill();
    context.restore();
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

/**
 * Domain statistics interface
 */
interface DomainStats {
  totalDomains?: number;
  islands?: number;
  windows?: number;
  terminals?: number;
  [key: string]: any;
}

/**
 * Draws a sidebar with domain statistics and configuration options
 */
export function drawSidebar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  config: any,
  stats: DomainStats = {}
): void {
  // Background
  context.fillStyle = colors.window.background[0];
  context.beginPath();
  context.rect(x, y, width, height);
  context.fill();

  // Top toolbar
  context.fillStyle = colors.window.background[1];
  context.beginPath();
  context.rect(x, y, width, config.window.toolbar);
  context.fill();

  // Window control buttons
  let buttonY = y + config.window.toolbar / 2;
  const buttonRadius = config.window.button;
  const buttonSpacing = config.window.buttonSpacing;

  // Draw the three buttons
  [0, 1, 2].forEach((i) => {
    context.fillStyle = colors.window.buttons[i];
    context.beginPath();
    context.arc(
      x + buttonSpacing * (i + 1),
      buttonY,
      buttonRadius,
      0,
      Math.PI * 2
    );
    context.fill();
  });

  // Title
  context.fillStyle = colors.text;
  context.font =
    'bold 12px SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif';
  context.textAlign = 'center';
  context.fillText('Domain Configuration', x + width / 2, buttonY + 4);
  context.textAlign = 'left';

  // Content
  const contentY = y + config.window.toolbar + 20;
  const padding = 20;
  const contentWidth = width - padding * 2;

  // Calculate available height for content
  const availableHeight = height - config.window.toolbar - padding * 2 - 60; // 60px for export button area
  const sectionHeight = availableHeight / 2; // Split available height between two sections

  // Section: Configuration
  drawSection(
    context,
    x + padding,
    contentY,
    'Configuration',
    [
      { label: 'Resolution', value: `[${config.res[0]}, ${config.res[1]}]` },
      { label: 'Gap', value: config.gap.toString() },
      { label: 'Radius', value: config.r.toString() },
      { label: 'Color Mode', value: config.colorMode },
      { label: 'Debug', value: config.debug ? 'On' : 'Off' },
      { label: 'Inset', value: config.inset.toString() },
    ],
    contentWidth,
    sectionHeight
  );

  // Section: Statistics
  drawSection(
    context,
    x + padding,
    contentY + sectionHeight,
    'Statistics',
    [
      { label: 'Total Domains', value: stats.totalDomains?.toString() || '0' },
      { label: 'Windows', value: stats.windows?.toString() || '0' },
      { label: 'Islands', value: stats.islands?.toString() || '0' },
      { label: 'Terminals', value: stats.terminals?.toString() || '0' },
    ],
    contentWidth,
    sectionHeight
  );

  // Draw export button
  const buttonWidth = contentWidth;
  const buttonHeight = 36;
  const buttonX = x + padding;
  buttonY = y + height - padding - buttonHeight;

  // Button background with gradient
  const gradient = context.createLinearGradient(
    buttonX,
    buttonY,
    buttonX,
    buttonY + buttonHeight
  );
  gradient.addColorStop(0, colors.parts[0].base[0]);
  gradient.addColorStop(1, colors.parts[0].base[2]);

  context.fillStyle = gradient;
  context.beginPath();
  context.roundRect(buttonX, buttonY, buttonWidth, buttonHeight, 6);
  context.fill();

  // Button border
  context.strokeStyle = colors.parts[0].border;
  context.lineWidth = 1;
  context.stroke();

  // Button text
  context.fillStyle = 'white';
  context.font =
    'bold 13px SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif';
  context.textAlign = 'center';
  context.fillText(
    'Export Configuration',
    buttonX + buttonWidth / 2,
    buttonY + 23
  );
  context.textAlign = 'left';

  // Border for the sidebar
  context.strokeStyle = colors.window.outline;
  context.lineWidth = 1;
  context.beginPath();
  context.rect(x, y, width, height);
  context.stroke();
}

/**
 * Helper function to draw a section in the sidebar
 */
function drawSection(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  title: string,
  items: Array<{ label: string; value: string }>,
  width: number = 240,
  maxHeight: number = Infinity
): void {
  // Section title
  context.fillStyle = colors.text;
  context.font =
    'bold 14px SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif';
  context.fillText(title, x, y);

  // Section items
  const itemHeight = 24;
  const itemY = y + 20;

  // Calculate how many items can fit in the available height
  const maxItems = Math.floor((maxHeight - 20) / itemHeight);
  const itemsToRender = items.slice(0, maxItems);

  itemsToRender.forEach((item, index) => {
    const yPos = itemY + index * itemHeight;

    // Label
    context.fillStyle = colors.text;
    context.font =
      '13px SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif';
    context.fillText(item.label, x, yPos);

    // Value
    context.fillStyle = colors.parts[0].base[1];
    context.font =
      '13px SF Pro Display, -apple-system, BlinkMacSystemFont, sans-serif';
    context.textAlign = 'right';
    context.fillText(item.value, x + width, yPos);
    context.textAlign = 'left';

    // Separator line
    if (index < itemsToRender.length - 1) {
      context.strokeStyle = colors.window.outline;
      context.lineWidth = 0.5;
      context.beginPath();
      context.moveTo(x, yPos + 10);
      context.lineTo(x + width, yPos + 10);
      context.stroke();
    }
  });
}
