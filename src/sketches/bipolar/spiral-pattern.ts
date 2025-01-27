import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
// import { palettes } from '../../colors/auto-albers';
import { palettes } from '../../colors/mindful-palettes';
import { interpolate, formatCss, parse } from 'culori';

type Point = [number, number];

interface Config {
  turns: number;
  pointsPerTurn: number;
  tauRange: [number, number];
  foci: Point[];
}

const config: Config = {
  turns: 20,
  pointsPerTurn: 20,
  tauRange: [-3, 3],
  foci: [
    [0.2, 0.5],
    [0.75, 0.5],
  ],
};

const colors = Random.pick(palettes);
const bg = colors.pop()!;
const grid = colors.pop()!;
const colorScale = (t: number) =>
  formatCss(interpolate(colors.map((c: string) => parse(c)!))(t));

function bipolarToCartesian(sigma: number, tau: number): Point {
  const a =
    Math.hypot(
      config.foci[1][0] - config.foci[0][0],
      config.foci[1][1] - config.foci[0][1]
    ) / 2; // Half the distance between foci
  const sinhTau = Math.sinh(tau);
  const coshTau = Math.cosh(tau);
  const cosSigma = Math.cos(sigma);
  const sinSigma = Math.sin(sigma);

  const denominator = coshTau - cosSigma;

  const x = (a * sinhTau) / denominator;
  const y = (a * sinSigma) / denominator;

  // Translate to canvas coordinates
  const centerX = (config.foci[0][0] + config.foci[1][0]) / 2;
  const centerY = (config.foci[0][1] + config.foci[1][1]) / 2;

  return [centerX + x, centerY - y]; // Invert y-axis for canvas
}

function generateSpiralPoints(
  tauRange: [number, number],
  turns: number,
  twist: number
): Point[] {
  const points = [];

  for (let i = 0; i < turns * config.pointsPerTurn; i++) {
    const theta = (i / config.pointsPerTurn) * Math.PI * 2; // Angle for spiral
    const sigma = theta + twist; // Add twist to sigma for continuous rotation
    const tau =
      tauRange[0] +
      (tauRange[1] - tauRange[0]) * (i / (turns * config.pointsPerTurn)); // Tau increases linearly

    const point = bipolarToCartesian(sigma, tau);
    points.push(point);
  }

  return points;
}

function drawSpiral(context: CanvasRenderingContext2D, points: Point[]) {
  const c = Math.round(points.length / 2);

  for (let i = 1; i < points.length; i++) {
    const gradient = Math.abs(i - c) / c;
    context.strokeStyle = colorScale(gradient);
    const x = points[i][0];
    const y = points[i][1];
    const s = 5;

    context.beginPath();
    context.moveTo(x - s, y);
    context.lineTo(x + s, y);
    context.moveTo(x, y - s);
    context.lineTo(x, y + s);
    context.stroke();
  }
}

function drawBipolarGrid(
  context: CanvasRenderingContext2D,
  numTauLines: number,
  numSigmaLines: number,
  color: string
) {
  context.strokeStyle = color;
  context.lineWidth = 1;
  context.globalAlpha = 0.25;

  // Draw circles of constant tau (hyperbolic curves)
  for (let i = 0; i < numTauLines; i++) {
    const tau =
      config.tauRange[0] +
      (i * (config.tauRange[1] - config.tauRange[0])) / (numTauLines - 1);

    context.beginPath();

    // Generate points along the hyperbolic curve
    const steps = 100;
    for (let j = 0; j <= steps; j++) {
      const sigma = (j / steps) * Math.PI * 2;
      const [x, y] = bipolarToCartesian(sigma, tau);

      if (j === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
  }

  // Draw circles of constant sigma (circular arcs)
  for (let i = 0; i < numSigmaLines; i++) {
    const sigma = (i / numSigmaLines) * Math.PI * 2;
    context.beginPath();

    // Generate points along the circular arc
    const steps = 100;
    for (let j = 0; j <= steps; j++) {
      const tau =
        config.tauRange[0] +
        (j / steps) * (config.tauRange[1] - config.tauRange[0]);
      const [x, y] = bipolarToCartesian(sigma, tau);

      if (j === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    }

    context.stroke();
  }

  context.globalAlpha = 1;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  config.foci = config.foci.map(([x, y]) => [x * width, y * height]);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    drawBipolarGrid(context, 10, 24, grid); // 10 tau lines, 24 sigma lines

    // Use playhead directly for continuous twisting
    const twist = playhead * Math.PI * 2; // Full rotation per loop

    context.lineWidth = 1;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    // Draw the spiral
    const spiralPoints1 = generateSpiralPoints(
      config.tauRange,
      config.turns,
      twist
    );
    drawSpiral(context, spiralPoints1);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 16_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
