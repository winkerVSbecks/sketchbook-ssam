import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

const config = {
  a: 1, // focal distance
  tauMax: 2,
  sigmaMax: Math.PI,
  gridDensity: {
    tau: 0.2, // Increased density for τ circles
    sigma: Math.PI / 16, // Increased density for σ circles
  },
  axisRange: 4, // Range for x and y axes (-4 to 4)
};

const drawAxes = (
  context: CanvasRenderingContext2D,
  centerX: number,
  centerY: number,
  scale: number
) => {
  context.strokeStyle = '#444';
  context.lineWidth = 1;
  context.setLineDash([5, 5]);

  // X-axis
  context.beginPath();
  context.moveTo(centerX - (config.axisRange + 1) * scale, centerY);
  context.lineTo(centerX + (config.axisRange + 1) * scale, centerY);
  context.stroke();

  // Y-axis
  context.beginPath();
  context.moveTo(centerX, centerY - (config.axisRange + 1) * scale);
  context.lineTo(centerX, centerY + (config.axisRange + 1) * scale);
  context.stroke();

  context.setLineDash([]);
};

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const scale = width / (2 * config.axisRange + 1);

    // Draw axes
    drawAxes(context, centerX, centerY, scale);

    context.lineWidth = 2;
    context.strokeStyle = '#000';
    context.strokeRect(0, 0, width, height);

    // Draw τ circles (constant τ)
    for (
      let tau = -config.tauMax;
      tau <= config.tauMax;
      tau += config.gridDensity.tau
    ) {
      if (Math.abs(tau) < 0.001) continue;

      context.beginPath();
      context.strokeStyle = '#0000ff';

      const r = Math.abs(config.a / Math.sinh(tau)) * scale;
      const x0 = (config.a / Math.tanh(tau)) * scale;

      if (isFinite(r) && r > 0) {
        context.arc(centerX + x0, centerY, r, 0, 2 * Math.PI);
        context.stroke();
      }
    }

    // Draw σ circles (constant σ)
    for (
      let sigma = -config.sigmaMax;
      sigma <= config.sigmaMax;
      sigma += config.gridDensity.sigma
    ) {
      if (Math.abs(sigma % Math.PI) < 0.001) continue;

      context.beginPath();
      context.strokeStyle = '#ff0000';

      const r = Math.abs(config.a / Math.sin(sigma)) * scale;
      const y0 = (config.a / Math.tan(sigma)) * scale;

      if (isFinite(r) && r > 0 && isFinite(y0)) {
        context.arc(centerX, centerY + y0, r, 0, 2 * Math.PI);
        context.stroke();
      }
    }

    // Draw focal points
    context.fillStyle = '#ff0000';
    context.beginPath();
    context.arc(centerX - config.a * scale, centerY, 3, 0, 2 * Math.PI);
    context.arc(centerX + config.a * scale, centerY, 3, 0, 2 * Math.PI);
    context.fill();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
