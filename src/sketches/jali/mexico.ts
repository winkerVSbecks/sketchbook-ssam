import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { mapRange, lerpFrames } from 'canvas-sketch-util/math';
import { drawPath } from '@daeinc/draw';
import { generateColorRamp, colorToCSS } from 'rampensau';
import { logColors } from '../../colors';
import { carmen } from '../../colors/found';

const config = {
  count: 5,
  margin: 40,
};

const colors = generateColorRamp({
  total: 5,
  hStart: 280.7,
  hStartCenter: 0.5,
  hEasing: (x) => x,
  hCycles: 0.0,

  sRange: [0.874, 0.35],
  lRange: [0.925, 0.056],

  sEasing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  lEasing: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
}).map((color) => colorToCSS(color, 'oklch'));

// const colors = Random.shuffle(Random.pick([carmen, bless]));
const [light, bg, frame, , shadow] = colors; // Random.shuffle(carmen);
logColors(colors, true);

export const sketch = async ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);
    context.lineWidth = 4;
    context.lineJoin = 'round';
    context.lineCap = 'round';

    const frameW = width - 2 * config.margin;
    const frameH = height - 2 * config.margin;

    const h = frameH / config.count;
    const s = (2 * h) / Math.sqrt(3);

    const cols = Math.round(frameW / s);
    const rows = Math.round(frameH / h);

    function drawTriangle(
      cx: number,
      cy: number,
      size: number,
      up: boolean,
      color: string,
      type: 'fill' | 'stroke' = 'fill',
      scale: number = 1
    ) {
      const height = (size * Math.sqrt(3)) / 2;
      const s = size * scale;
      const h = (s * Math.sqrt(3)) / 2;
      // align the triangles to bottom edge
      const yOff = !up ? -height / 2 + h / 2 : height / 2 - h / 2;

      context.beginPath();
      if (up) {
        context.moveTo(cx, cy + yOff - h / 2);
        context.lineTo(cx - s / 2, cy + yOff + h / 2);
        context.lineTo(cx + s / 2, cy + yOff + h / 2);
      } else {
        context.moveTo(cx, cy + yOff + h / 2);
        context.lineTo(cx - s / 2, cy + yOff - h / 2);
        context.lineTo(cx + s / 2, cy + yOff - h / 2);
      }
      context.closePath();

      if (type === 'stroke') {
        context.lineWidth = 6;
        context.strokeStyle = color;
        context.stroke();
      } else {
        context.fillStyle = color;
        context.fill();
      }
    }

    context.translate(config.margin, config.margin);

    for (let row = 0; row < rows; row++) {
      const scale = mapRange(row, 0, rows, 1, 0, true);

      for (let col = -1; col <= cols; col++) {
        // Alternate triangle orientation by row
        const odd = row % 2 === 0;
        // Stagger every other row vertically by h
        const cx = col * s + s / 2;
        const cy = row * h + h / 2;
        const xOff = odd ? 0 : s / 2;
        drawTriangle(cx + xOff, cy, s, true, shadow, 'fill');
        drawTriangle(cx - s / 2 + xOff, cy, s, false, shadow, 'fill');
        drawTriangle(cx + xOff, cy, s, true, light, 'fill', scale);
        drawTriangle(cx + xOff, cy, s, true, frame, 'stroke');
        drawTriangle(cx - s / 2 + xOff, cy, s, false, frame, 'stroke');
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
