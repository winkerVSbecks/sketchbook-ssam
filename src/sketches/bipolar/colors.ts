import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { palettes } from '../../colors/auto-albers';
import { interpolate, formatCss, parse } from 'culori';

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

const colorsA = Random.pick(palettes);
const colorsB = colorsA; // Random.pick(palettes);
const bg = colorsA.pop()!;

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const centerX = width / 2;
    const centerY = height / 2;
    const scale = width / (2 * config.axisRange + 1);

    let tauCircles = [];
    let sigmaCircles = [];
    let tauCount = 0;
    let sigmaCount = 0;

    // Draw τ circles (constant τ)
    for (let tau = 0; tau <= config.tauMax; tau += config.gridDensity.tau) {
      if (Math.abs(tau) < 0.001) continue;

      const r = Math.abs(config.a / Math.sinh(tau)) * scale;
      const x0 = (config.a / Math.tanh(tau)) * scale;

      if (isFinite(r) && r > 0) {
        // const colorA = colors[idx % colors.length];
        // const colorB = colors[(idx + 1) % colors.length];
        // const color = (t: number) =>
        //   formatCss(interpolate([parse(colorA)!, parse(colorB)!])(t));

        tauCircles.push({
          id: tauCount,
          x: centerX + x0,
          y: centerY,
          r,
          type: 'tau',
        });
        tauCircles.push({
          id: tauCount,
          x: centerX - x0,
          y: centerY,
          r,
          type: 'tau',
        });
        tauCount++;
      }
    }

    // Draw σ circles (constant σ)
    for (
      let sigma = 0;
      sigma <= config.sigmaMax;
      sigma += config.gridDensity.sigma
    ) {
      if (Math.abs(sigma % Math.PI) < 0.001) continue;

      const r = Math.abs(config.a / Math.sin(sigma)) * scale;
      const y0 = (config.a / Math.tan(sigma)) * scale;

      if (isFinite(r) && r > 0 && isFinite(y0)) {
        // const colorA = colorsB[idx % colorsB.length];
        // const colorB = colorsB[(idx + 1) % colorsB.length];
        // const color = (t: number) =>
        //   formatCss(interpolate([parse(colorA)!, parse(colorB)!])(t));

        sigmaCircles.push({
          id: sigmaCount,
          x: centerX,
          y: centerY + y0,
          r,
          type: 'sigma',
        });
        sigmaCircles.push({
          id: sigmaCount,
          x: centerX,
          y: centerY - y0,
          r,
          type: 'sigma',
        });
        sigmaCount++;
      }
    }

    const pingPongPlayhead = Math.sin(playhead * Math.PI);
    const l = Math.floor(sigmaCircles.length * 0.5);
    const tauoff = Math.floor(playhead * tauCount);
    const sigmaoff = Math.floor(playhead * sigmaCount);

    [...sigmaCircles, ...tauCircles]
      .sort((a, b) => b.r - a.r)
      .forEach((c) => {
        const colors = c.type === 'tau' ? colorsA : colorsB;
        const offset = c.type === 'tau' ? tauoff : sigmaoff;

        context.beginPath();
        context.fillStyle = colors[(c.id + offset) % colors.length];
        context.arc(c.x, c.y, c.r, 0, 2 * Math.PI);
        context.fill();
      });

    // sigmaCircles
    //   .sort((a, b) => b.r - a.r)
    //   .forEach((c) => {
    //     context.beginPath();
    //     context.strokeStyle = c.color;
    //     context.arc(c.x, c.y, c.r, 0, 2 * Math.PI);
    //     context.stroke();
    //   });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 2_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
