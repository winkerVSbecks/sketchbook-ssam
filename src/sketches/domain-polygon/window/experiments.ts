import { generateGridSystemLogs } from './mock-logs';

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

/**
 * Draws a sidebar with domain statistics and configuration options
 */
export function drawSidebar(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  // Background - light gray for macOS Finder look
  context.fillStyle = colors.window.background[0];
  context.beginPath();
  context.roundRect(x, y, width, height, config.r);
  context.fill();
  context.stroke();

  // Content area clipping
  context.save();
  context.beginPath();
  context.roundRect(x, y, width, height, config.r);
  context.clip();

  // Navigation buttons (back/forward)
  const navButtonSize = 24;
  const navButtonY = y + 15;
  const navButtonRadius = 4;
  const navPadding = 15;

  // Back button
  context.fillStyle = 'rgba(220, 220, 220, 0.8)';
  context.beginPath();
  context.roundRect(
    x + navPadding,
    navButtonY,
    navButtonSize,
    navButtonSize,
    navButtonRadius
  );
  context.fill();

  // Forward button
  context.beginPath();
  context.roundRect(
    x + navPadding + navButtonSize + 5,
    navButtonY,
    navButtonSize,
    navButtonSize,
    navButtonRadius
  );
  context.fill();

  // Arrow icons
  context.strokeStyle = 'rgba(100, 100, 100, 0.8)';
  context.lineWidth = 2;

  // Back arrow
  context.beginPath();
  context.moveTo(
    x + navPadding + navButtonSize - 8,
    navButtonY + navButtonSize / 2
  );
  context.lineTo(x + navPadding + 8, navButtonY + navButtonSize / 2);
  context.stroke();

  // Forward arrow
  context.beginPath();
  context.moveTo(
    x + navPadding + navButtonSize + 5 + 8,
    navButtonY + navButtonSize / 2
  );
  context.lineTo(
    x + navPadding + navButtonSize + 5 + navButtonSize - 8,
    navButtonY + navButtonSize / 2
  );
  context.stroke();

  // Content
  const contentY = navButtonY + navButtonSize + 20;
  const padding = 15;
  const contentWidth = width - padding * 2;

  // Sections in Finder style
  const section2Y = contentY;

  drawFinderSection(
    context,
    x + padding,
    section2Y,
    'Devices',
    [
      { icon: 'domains', label: 'Domains' },
      { icon: 'variable', label: 'Polygon' },
      { icon: 'scissors', label: 'PolySplitter' },
    ],
    contentWidth
  );

  const section3Y = section2Y + 120;

  drawFinderSection(
    context,
    x + padding,
    section3Y,
    'UI Manager',
    [
      { icon: 'window', label: `Window` },
      { icon: 'terminal', label: `Terminal` },
      { icon: 'wrench-screwdriver', label: `Toolbar` },
      { icon: 'cube', label: `Vector Network` },
    ],
    contentWidth
  );

  context.restore();
}

function drawFinderSection(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  title: string,
  items: Array<{ icon: string; label: string }>,
  width: number = 240
): void {
  // Section title - macOS Finder style
  context.fillStyle = 'rgba(120, 120, 120, 0.8)';
  context.font = '12px SF Mono ';
  context.fillText(title, x, y);

  // Section items
  const itemHeight = 24;
  const itemY = y + 20;
  const iconPadding = 25;

  items.forEach((item, index) => {
    const yPos = itemY + index * itemHeight;

    // Icon
    let pIcon = new Path2D();
    const transform = new DOMMatrix();
    transform.translateSelf(x, yPos - 12);
    const p = new Path2D(icons[item.icon]);
    pIcon.addPath(p, transform);
    context.fill(pIcon);

    // Label - macOS Finder style
    context.fillStyle = 'rgba(60, 60, 60, 0.9)';
    context.font =
      '12px -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    // context.textBaseline = 'top';
    context.fillText(item.label, x + iconPadding, yPos);
  });

  // Add section separator
  context.strokeStyle = 'rgba(200, 200, 200, 0.5)';
  context.lineWidth = 0.5;
  context.beginPath();
  context.moveTo(x - 5, y + items.length * itemHeight + 25);
  context.lineTo(x + width, y + items.length * itemHeight + 25);
  context.stroke();
}

const icons = {
  'vector-network': '',
  window:
    'M2 12V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2Zm1.5-5.5V12a.5.5 0 0 0 .5.5h8a.5.5 0 0 0 .5-.5V6.5A.5.5 0 0 0 12 6H4a.5.5 0 0 0-.5.5Zm.75-1.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z M7 4a.75.75 0 1 1-1.5 0A.75.75 0 0 1 7 4Zm1.25.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z',
  domains:
    'M1 4a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V4Z M10 5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1V5Z M4 10a1 1 0 0 0-1 1v1a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1H4Z',
  variable:
    'M3.38 3.012a.75.75 0 1 0-1.408-.516A15.97 15.97 0 0 0 1 8c0 1.932.343 3.786.972 5.503a.75.75 0 0 0 1.408-.516A14.47 14.47 0 0 1 2.5 8c0-1.754.311-3.434.88-4.988ZM12.62 3.012a.75.75 0 1 1 1.408-.516A15.97 15.97 0 0 1 15 8a15.97 15.97 0 0 1-.972 5.503.75.75 0 0 1-1.408-.516c.569-1.554.88-3.233.88-4.987s-.311-3.434-.88-4.988ZM6.523 4.785a.75.75 0 0 1 .898.38l.758 1.515.812-.902a2.376 2.376 0 0 1 2.486-.674.75.75 0 1 1-.454 1.429.876.876 0 0 0-.918.249L8.9 8.122l.734 1.468.388-.124a.75.75 0 0 1 .457 1.428l-1 .32a.75.75 0 0 1-.899-.379L7.821 9.32l-.811.901a2.374 2.374 0 0 1-2.489.673.75.75 0 0 1 .458-1.428.874.874 0 0 0 .916-.248L7.1 7.878 6.366 6.41l-.389.124a.75.75 0 1 1-.454-1.43l1-.318Z',
  terminal:
    'M2 4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4Zm2.22 1.97a.75.75 0 0 0 0 1.06l.97.97-.97.97a.75.75 0 1 0 1.06 1.06l1.5-1.5a.75.75 0 0 0 0-1.06l-1.5-1.5a.75.75 0 0 0-1.06 0ZM8.75 8.5a.75.75 0 0 0 0 1.5h2.5a.75.75 0 0 0 0-1.5h-2.5Z',
  scissors:
    'M2.25 6.665c.969.56 2.157.396 2.94-.323l.359.207c.34.196.777.02.97-.322.19-.337.115-.784-.22-.977l-.359-.207a2.501 2.501 0 1 0-3.69 1.622ZM4.364 5a1 1 0 1 1-1.732-1 1 1 0 0 1 1.732 1ZM8.903 5.465a2.75 2.75 0 0 0-1.775 1.893l-.375 1.398-1.563.902a2.501 2.501 0 1 0 .75 1.3L14.7 5.9a.75.75 0 0 0-.18-1.374l-.782-.21a2.75 2.75 0 0 0-1.593.052L8.903 5.465ZM4.365 11a1 1 0 1 1-1.732 1 1 1 0 0 1 1.732-1Z M8.892 10.408c-.052.03-.047.108.011.128l3.243 1.097a2.75 2.75 0 0 0 1.593.05l.781-.208a.75.75 0 0 0 .18-1.374l-2.137-1.235a1 1 0 0 0-1 0l-2.67 1.542Z',
  'wrench-screwdriver':
    'M15 4.5A3.5 3.5 0 0 1 11.435 8c-.99-.019-2.093.132-2.7.913l-4.13 5.31a2.015 2.015 0 1 1-2.827-2.828l5.309-4.13c.78-.607.932-1.71.914-2.7L8 4.5a3.5 3.5 0 0 1 4.477-3.362c.325.094.39.497.15.736L10.6 3.902a.48.48 0 0 0-.033.653c.271.314.565.608.879.879a.48.48 0 0 0 .653-.033l2.027-2.027c.239-.24.642-.175.736.15.09.31.138.637.138.976ZM3.75 13a.75.75 0 1 1-1.5 0 .75.75 0 0 1 1.5 0Z M11.5 9.5c.313 0 .62-.029.917-.084l1.962 1.962a2.121 2.121 0 0 1-3 3l-2.81-2.81 1.35-1.734c.05-.064.158-.158.426-.233.278-.078.639-.11 1.062-.102l.093.001ZM5 4l1.446 1.445a2.256 2.256 0 0 1-.047.21c-.075.268-.169.377-.233.427l-.61.474L4 5H2.655a.25.25 0 0 1-.224-.139l-1.35-2.7a.25.25 0 0 1 .047-.289l.745-.745a.25.25 0 0 1 .289-.047l2.7 1.35A.25.25 0 0 1 5 2.654V4Z',
  cube: 'M7.628 1.349a.75.75 0 0 1 .744 0l1.247.712a.75.75 0 1 1-.744 1.303L8 2.864l-.875.5a.75.75 0 0 1-.744-1.303l1.247-.712ZM4.65 3.914a.75.75 0 0 1-.279 1.023L4.262 5l.11.063a.75.75 0 0 1-.744 1.302l-.13-.073A.75.75 0 0 1 2 6.25V5a.75.75 0 0 1 .378-.651l1.25-.714a.75.75 0 0 1 1.023.279Zm6.698 0a.75.75 0 0 1 1.023-.28l1.25.715A.75.75 0 0 1 14 5v1.25a.75.75 0 0 1-1.499.042l-.129.073a.75.75 0 0 1-.744-1.302l.11-.063-.11-.063a.75.75 0 0 1-.28-1.023ZM6.102 6.915a.75.75 0 0 1 1.023-.279l.875.5.875-.5a.75.75 0 0 1 .744 1.303l-.869.496v.815a.75.75 0 0 1-1.5 0v-.815l-.869-.496a.75.75 0 0 1-.28-1.024ZM2.75 9a.75.75 0 0 1 .75.75v.815l.872.498a.75.75 0 0 1-.744 1.303l-1.25-.715A.75.75 0 0 1 2 11V9.75A.75.75 0 0 1 2.75 9Zm10.5 0a.75.75 0 0 1 .75.75V11a.75.75 0 0 1-.378.651l-1.25.715a.75.75 0 0 1-.744-1.303l.872-.498V9.75a.75.75 0 0 1 .75-.75Zm-4.501 3.708.126-.072a.75.75 0 0 1 .744 1.303l-1.247.712a.75.75 0 0 1-.744 0L6.38 13.94a.75.75 0 0 1 .744-1.303l.126.072a.75.75 0 0 1 1.498 0Z',
};

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
