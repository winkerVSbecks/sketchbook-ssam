import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { palettes } from '../../colors/auto-albers';
import { interpolate, formatCss, parse } from 'culori';

const config = {
  turns: 15, // Number of spiral turns
  pointsPerTurn: 200, // Points per turn
  tauRange: [-3, 3], // Starting & Ending value of tau
  foci: [[0.2, 0.5] as Point, [0.75, 0.5] as Point],
};

const colors = Random.pick(palettes);
const bg = colors.pop()!;
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

  return [
    centerX + x,
    centerY - y, // Invert y-axis for canvas
  ] as Point;
}
5;

// Function to generate points for a spiral in bipolar coordinates
function generateSpiralPoints(tauRange: number[], turns: number): Point[] {
  const points = [];

  for (let i = 0; i < turns * config.pointsPerTurn; i++) {
    const theta = (i / config.pointsPerTurn) * Math.PI * 2; // Angle for spiral
    const sigma = theta; // Sigma increases linearly with theta
    const tau =
      tauRange[0] +
      (tauRange[1] - tauRange[0]) * (i / (turns * config.pointsPerTurn)); // Tau increases linearly

    const point = bipolarToCartesian(sigma, tau);
    points.push(point);
  }

  return points;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  config.foci = config.foci.map((f: Point) => [f[0] * width, f[1] * height]);

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // Draw the spiral
    const spiralPoints = generateSpiralPoints(config.tauRange, config.turns);

    context.lineWidth = 6;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    // Draw lines to the rest of the points with a gradient
    for (let i = 1; i < spiralPoints.length; i++) {
      const gradient = i / spiralPoints.length;

      context.strokeStyle = colorScale(gradient);
      context.beginPath();
      context.moveTo(spiralPoints[i - 1][0], spiralPoints[i - 1][1]);
      context.lineTo(spiralPoints[i][0], spiralPoints[i][1]);
      context.stroke();
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
