import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

const config = {
  animate: false,
  colors: {
    blue: '#0000FF',
    white: '#FFFFFF',
    black: '#000000',
  },
  grid: {
    rows: 20, // Number of horizontal divisions
    columns: 8, // Number of vertical sections
    rowHeight: 40, // Fixed height for each row
  },
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const createRect = (
    x: number,
    y: number,
    w: number,
    h: number,
    color: string
  ): Rectangle => ({
    x,
    y,
    width: w,
    height: h,
    color,
  });

  const generateRectangles = (): Rectangle[] => {
    const rectangles: Rectangle[] = [];
    const columnWidth = width / config.grid.columns;

    // Create a vertical structure first
    for (let col = 0; col < config.grid.columns; col++) {
      let y = 0;
      const x = col * columnWidth;

      // For each vertical section, create horizontal divisions
      while (y < height) {
        // Decide if this should be a "blind" section
        const isBlindSection = Random.value() > 0.3;

        if (isBlindSection) {
          // Create multiple horizontal bars
          const numBars = Random.rangeFloor(3, 6);
          const barHeight = config.grid.rowHeight;

          for (let i = 0; i < numBars; i++) {
            // Alternate colors for blind effect
            const color =
              i % 2 === 0 ? config.colors.blue : config.colors.white;

            rectangles.push(
              createRect(x, y + i * barHeight, columnWidth, barHeight, color)
            );
          }

          y += numBars * barHeight;
        } else {
          // Create a solid block
          const blockHeight = Random.rangeFloor(2, 4) * config.grid.rowHeight;
          const color =
            Random.value() > 0.5 ? config.colors.black : config.colors.blue;

          rectangles.push(createRect(x, y, columnWidth, blockHeight, color));

          y += blockHeight;
        }
      }
    }

    return rectangles;
  };

  // Store generated rectangles
  const rectangles = generateRectangles();

  // Render function
  wrap.render = ({ width, height }: SketchProps) => {
    // Clear canvas
    context.fillStyle = config.colors.white;
    context.fillRect(0, 0, width, height);

    // Draw rectangles
    rectangles.forEach((rect) => {
      context.fillStyle = rect.color;
      context.fillRect(rect.x, rect.y, rect.width, rect.height);
    });

    // Draw vertical dividing lines
    context.strokeStyle = config.colors.black;
    context.lineWidth = 2;

    for (let i = 1; i < config.grid.columns; i++) {
      const x = i * (width / config.grid.columns);
      context.beginPath();
      context.moveTo(x, 0);
      context.lineTo(x, height);
      context.stroke();
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [800, 800],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 4000,
  playFps: 60,
  exportFps: 60,
  numLoops: 1,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
