import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import * as tome from 'chromotome';
import Random from 'canvas-sketch-util/random';
import {
  GridCell,
  GridPatternConfig,
  createGridStairsSystem,
} from '../grid-stairs/system';
import {
  ClusterConfig,
  createClusterSystem,
} from '../cluster-growth/system-animated';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

let { colors, background: bg, stroke } = tome.get();
stroke ??= Random.pick(colors);
if (stroke === bg) {
  stroke = Random.pick(colors);
}

console.log({ colors, bg, stroke });

interface MemoryLeakConfig
  extends Omit<GridPatternConfig, 'width' | 'height'>,
    Omit<ClusterConfig, 'width' | 'height'> {
  dither?: boolean;
  artwork: {
    width: number;
    height: number;
  };
  cartridge: {
    stroke: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
    gap: number;
    logoHeight: number;
  };
  label: {
    fontSize1: number;
    fontSize2: number;
    version: string;
  };
}

const config: MemoryLeakConfig = {
  stairCount: 3,
  chequerboardCount: 2,
  mode: 'pixel',
  clusterCount: 3,
  cellSize: 10,
  gap: 0,
  growthProbabilityMin: 0.05,
  growthProbabilityMax: 0.2,
  initialClusterSize: 8,
  colors,
  renderBackground: false,
  renderBaseGrid: false,
  radiusRange: [0.1, 0.25],
  dither: false,
  artwork: {
    width: 1080,
    height: 1080,
  },
  cartridge: {
    stroke: 8,
    top: 80,
    left: 80,
    right: 80,
    bottom: 320,
    gap: 40,
    logoHeight: 60,
  },
  label: {
    fontSize1: 80,
    fontSize2: 40,
    version: `ROM ${getRandomVersion()}`,
  },
};

const sketch = ({ wrap, context, width, height, canvas }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const w = 1080;
  const h = 1080;

  const clusterConfig: ClusterConfig = {
    ...(config as Omit<ClusterConfig, 'width' | 'height'>),
    // colors: [bg, colors[0]],
    colors,
    width: w,
    height: h,
  };

  const drawClusterSystem = createClusterSystem(clusterConfig);
  const drawGridPattern = createGridStairsSystem(
    {
      ...(config as Omit<GridPatternConfig, 'width' | 'height'>),
      width: w,
      height: h,
    },
    function drawPixel(c: GridCell) {
      if (c.filled) {
        context.fillStyle = c.color;
        context.fillRect(
          c.x * c.cellSize,
          c.y * c.cellSize,
          c.cellSize,
          c.cellSize
        );
      }
    }
  );
  const drawEraserSystem = createClusterSystem({
    ...clusterConfig,
    clusterCount: 2,
    initialClusterSize: 4,
    colors: [stroke || bg],
    background: stroke || bg,
  });

  function createScanLinePattern(context: CanvasRenderingContext2D) {
    const patternCanvas = document.createElement('canvas');
    const patternContext = patternCanvas.getContext('2d')!;

    patternCanvas.width = 1;
    patternCanvas.height = 4; // Adjust for scanLine density

    // Clear pattern background
    patternContext.fillStyle = 'transparent';
    patternContext.fillRect(0, 0, 1, 4);

    // Draw scanLine
    patternContext.fillStyle = '#000000';
    patternContext.globalAlpha = 0.1; // Adjust for intensity
    patternContext.fillRect(0, 0, 1, 2);

    return context.createPattern(patternCanvas, 'repeat')!;
  }

  // In your sketch setup:
  const scanLinePattern = createScanLinePattern(context);

  wrap.render = async (props) => {
    // drawPico8Cartridge(context, width, height);
    drawCartridge(context, width, height);

    // Draw background that will be clipped
    context.globalCompositeOperation = 'destination-in';
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    // Reset composite operation
    context.globalCompositeOperation = 'source-over';

    context.save();
    context.translate(
      config.cartridge.left + config.cartridge.stroke / 2,
      config.cartridge.top + config.cartridge.stroke / 2
    );
    drawGridPattern();
    drawClusterSystem(props);
    drawEraserSystem(props);

    // In your render function, after all other drawing:
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = scanLinePattern;
    context.fillRect(0, 0, w, h);
    context.restore();

    context.restore();

    if (config.dither) {
      const ditheredImage = scaleCanvasAndApplyDither(
        width,
        height,
        0.5,
        canvas,
        (data) =>
          dither(data, {
            greyscaleMethod: 'none',
            ditherMethod: 'atkinson',
          })
      );

      context.drawImage(ditheredImage, 0, 0, width, height);
    }
  };
};

function drawCartridge(
  context: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  // Main cartridge shape
  context.lineWidth = config.cartridge.stroke;
  context.strokeStyle = stroke;
  context.fillStyle = bg;
  drawRoundedRectWithSlant(
    context,
    config.cartridge.stroke / 2,
    config.cartridge.stroke / 2,
    width - config.cartridge.stroke,
    height - config.cartridge.stroke,
    20,
    60
  );
  context.fill();
  context.stroke();

  // Draw SSAM logo
  const logoY = config.cartridge.top / 2 - config.cartridge.logoHeight / 2;
  drawSSAMLogo(
    context,
    config.cartridge.left,
    logoY,
    config.cartridge.logoHeight
  );

  const w = width - config.cartridge.left - config.cartridge.right;
  const h = height - config.cartridge.top - config.cartridge.bottom;
  context.strokeRect(config.cartridge.left, config.cartridge.top, w, h);

  // Label area
  const lX = config.cartridge.left;
  const lY =
    config.cartridge.top +
    config.artwork.height +
    config.cartridge.gap +
    config.cartridge.stroke;
  const lH = height - lY - config.cartridge.gap;
  context.fillStyle = stroke || Random.pick(config.colors);
  context.beginPath();
  context.rect(lX, lY, w, lH);
  context.fill();
  context.stroke();

  // Label text
  context.fillStyle = bg;
  drawCentredTextGroup(
    context,
    { text: 'MEMORY LEAK 64', fontSize: config.label.fontSize1 },
    { text: config.label.version, fontSize: config.label.fontSize2 },
    config.cartridge.left + config.cartridge.gap,
    lY,
    w,
    lH
  );

  // Optional: Add minimal grid pattern to label area
  const gridSize = 8;
  context.strokeStyle = bg;
  context.lineWidth = 1;
  context.globalAlpha = 0.1;

  for (let x = lX; x < lX + w; x += gridSize) {
    context.beginPath();
    context.moveTo(x, lY);
    context.lineTo(x, lY + lH);
    context.stroke();
  }

  context.globalAlpha = 1.0;
}

function drawSSAMLogo(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  height: number
) {
  context.save();

  // Draw "SSAM" text as logo
  context.fillStyle = stroke;
  context.font = `bold ${height * 0.6}px VT323`;
  context.textBaseline = 'middle';
  context.textAlign = 'left';
  context.fillText('SSAM-JS', x, y + height / 2);

  // Add star to the right of text
  const textMetrics = context.measureText('SSAM-JS');
  const textWidth = textMetrics.width;
  const starSize = height * 0.6;
  const starX = x + textWidth + starSize * 0.75;
  const starY = y + height / 2;
  drawPico8Star(context, starX, starY, starSize);

  context.restore();
}

function drawPico8Star(
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  size: number
) {
  context.save();

  // Draw each pixel of the star
  const pixelSize = size / 8; // Adjust for desired chunkiness

  // Star pixel map (1 represents pixel positions)
  const starMap = [
    [0, 0, 1, 0, 0],
    [0, 1, 1, 1, 0],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ];

  // Calculate start position to center the star
  const startX = centerX - pixelSize * 2.5;
  const startY = centerY - pixelSize * 2.5;

  // Draw pixels
  starMap.forEach((row, y) => {
    row.forEach((pixel, x) => {
      if (pixel === 1) {
        context.fillStyle = colors[(x + y) % colors.length];
        context.fillRect(
          startX + x * pixelSize,
          startY + y * pixelSize,
          pixelSize,
          pixelSize
        );
      }
    });
  });

  context.restore();
}

function drawCentredTextGroup(
  context: CanvasRenderingContext2D,
  line1: { text: string; fontSize: number },
  line2: { text: string; fontSize: number },
  rectX: number,
  rectY: number,
  rectWidth: number,
  rectHeight: number
) {
  // Calculate total height of both lines
  const totalHeight = line1.fontSize + line2.fontSize;

  // Calculate vertical center position
  const groupCenterY = rectY + (rectHeight - totalHeight) / 2;

  // Draw first line
  context.font = `${line1.fontSize}px jgs7`;
  context.textBaseline = 'top';
  const text1Width = context.measureText(line1.text).width;
  context.fillText(line1.text, rectX, groupCenterY);

  // Draw second line
  context.font = `${line2.fontSize}px jgs7`;
  context.textBaseline = 'top';
  const text2Width = context.measureText(line2.text).width;
  context.fillText(line2.text, rectX, groupCenterY + line1.fontSize);
}

function drawRoundedRectWithSlant(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  slantOffset: number = 50 // How far to slant inward
): void {
  context.beginPath();
  context.moveTo(x + radius, y);

  // Top right corner
  context.lineTo(x + width - radius, y);
  context.arcTo(x + width, y, x + width, y + radius, radius);

  // Right edge to start of slant
  context.lineTo(x + width, y + height - slantOffset);

  // Slanted corner (bottom right)
  context.lineTo(x + width - slantOffset, y + height);

  // Bottom left corner
  context.lineTo(x + radius, y + height);
  context.arcTo(x, y + height, x, y + height - radius, radius);

  // Top left corner
  context.lineTo(x, y + radius);
  context.arcTo(x, y, x + radius, y, radius);

  context.closePath();
}

function getRandomVersion() {
  const major = Random.rangeFloor(0, 9); // Random integer between 0 and 9
  const minor = Random.rangeFloor(0, 100); // Random integer between 0 and 99
  const patch = Random.rangeFloor(0, 100); // Random integer between 0 and 999
  return `v${major}.${minor}.${patch}`;
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [
    1080 +
      config.cartridge.left +
      config.cartridge.right +
      config.cartridge.stroke,
    1080 +
      config.cartridge.top +
      config.cartridge.bottom +
      config.cartridge.stroke,
  ],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
