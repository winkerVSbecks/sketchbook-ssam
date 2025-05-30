import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { palettes } from '../../colors/auto-albers';
import { interpolate, formatCss, parse } from 'culori';

type Point = [number, number];

interface Config {
  turns: number;
  pointsPerTurn: number;
  tauRange: [number, number];
  foci: Point[];
  variableLineWeight: Boolean;
}

const config: Config = {
  turns: 20,
  pointsPerTurn: 200,
  tauRange: [-3, 3],
  foci: [
    [0.2, 0.5],
    [0.75, 0.5],
  ],
  variableLineWeight: false,
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

  return [centerX + x, centerY - y]; // Invert y-axis for canvas
}

function generateSpiralPoints(
  tauRange: [number, number],
  turns: number,
  twist: number,
  playhead: number
): Point[] {
  const points = [];

  for (let i = 0; i < turns * config.pointsPerTurn; i++) {
    const theta = (i / config.pointsPerTurn) * Math.PI * 2; // Angle for spiral
    const sigma = theta + twist; // Add twist to sigma for continuous rotation
    const tau =
      tauRange[0] +
      (tauRange[1] - tauRange[0]) * (i / (turns * config.pointsPerTurn)); // Tau increases linearly

    let point = bipolarToCartesian(sigma, tau);
    const noiseScale = 0.01;
    const noiseStrength = 4;

    if (isFinite(point[0]) && isFinite(point[1])) {
      const t = Math.sin(playhead * 2 * Math.PI);
      point[0] +=
        noiseStrength *
        Random.noise2D(point[0] * noiseScale, point[1] * noiseScale, t);
      point[1] +=
        noiseStrength *
        Random.noise2D(point[1] * noiseScale, point[0] * noiseScale, t);
    }
    points.push(point);
  }

  return points;
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

    // Use playhead directly for continuous twisting
    const twist = playhead * Math.PI * 2; // Full rotation per loop

    // Draw the spiral
    const spiralPoints = generateSpiralPoints(
      config.tauRange,
      config.turns,
      twist,
      playhead
    );

    context.lineWidth = 6;
    context.lineCap = 'round';
    context.lineJoin = 'round';

    const c = Math.round(spiralPoints.length / 2);
    for (let i = 1; i < spiralPoints.length; i++) {
      const gradient = Math.abs(i - c) / c;
      if (config.variableLineWeight) {
        context.lineWidth = 4 + 4 * Math.sin(gradient * Math.PI);
      }
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
