import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import { drawCircle, drawLine, drawPath } from '@daeinc/draw';

interface Pendulum {
  r1: number;
  r2: number;
  m1: number;
  m2: number;
  a1: number;
  a2: number;
  a1Vel: number;
  a2Vel: number;
  g: number;
  trail1: Line;
  trail2: Line;
  pathLength: number;
  color1: string;
  color2: string;
}

const config = {
  pendulumCount: 25,
  bothArms: false,
};

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const colors = generateColors(config.pendulumCount + 2);

  const bg = colors.pop()!;
  const base = colors.pop()!;

  let pendulums: Pendulum[] = [];

  wrap.render = ({ width, height, frame }: SketchProps) => {
    context.fillStyle = `hsla(${bg
      .replace('hsl(', '')
      .replace(')', '')} / 0.5)`;

    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      pendulums = Array.from({
        length: config.pendulumCount,
      }).map((_, idx) => {
        return {
          r1: 25 + ((idx + 1) / config.pendulumCount) * height * 0.5,
          r2: 25 + ((idx + 1) / config.pendulumCount) * height * 0.5,
          m1: 10,
          m2: 10,
          a1: Math.PI * 0.5,
          a2: Math.PI * 0.75,
          a1Vel: 0,
          a2Vel: 0,
          g: 1,
          trail1: [],
          trail2: [],
          pathLength: 25,
          color1: colors[idx],
          color2: colors[idx + 1],
        };
      });
    }

    context.save();
    context.translate(width / 2, 0);

    pendulums.forEach((pendulum) => {
      const [location1, location2] = updateLocations(pendulum);

      // const r = Math.hypot(...location2);
      // context.strokeStyle = base;
      // context.lineWidth = 8;
      // context.beginPath();
      // context.ellipse(0, 0, r, r, 0, 0, Math.PI * 2);
      // context.stroke();

      drawPendulum(context, pendulum, [location1, location2], false);
      updateAccAndVel(pendulum, true);
    });
    context.restore();
  };
};

/**
 * Pendulum Math
 */
function updateLocations(pendulum: Pendulum) {
  const location1: Point = [
    pendulum.r1 * Math.sin(pendulum.a1),
    pendulum.r1 * Math.cos(pendulum.a1),
  ];
  const location2: Point = [
    location1[0] + pendulum.r2 * Math.sin(pendulum.a2),
    location1[1] + pendulum.r2 * Math.cos(pendulum.a2),
  ];

  return [location1, location2];
}

function drawPendulum(
  context: CanvasRenderingContext2D,
  pendulum: Pendulum,
  [location1, location2]: [Point, Point],
  debug?: boolean
) {
  if (debug) {
    context.strokeStyle = '#fff';
    drawLine(context, [0, 0], location1);
    context.stroke();
    drawLine(context, location1, location2);
    context.stroke();
    drawCircle(context, [0, 0], 2);
    context.stroke();
    context.fillStyle = '#fff';
    drawCircle(context, location1, 12);
    context.fill();
    drawCircle(context, location2, 12);
    context.fill();
  }

  // Draw Trails
  pendulum.trail1.push(location1);
  pendulum.trail2.push(location2);

  if (pendulum.trail1.length > pendulum.pathLength) {
    pendulum.trail1.shift();
  }
  if (pendulum.trail2.length > pendulum.pathLength) {
    pendulum.trail2.shift();
  }

  context.lineWidth = 8;
  context.lineCap = 'round';
  if (config.bothArms) {
    // Motion path of top rod
    context.strokeStyle = pendulum.color1;
    drawPath(context, pendulum.trail1);
    context.stroke();
  }
  // Motion path of bottom rod
  context.strokeStyle = pendulum.color2;
  drawPath(context, pendulum.trail2);
  context.stroke();
}

function updateAccAndVel(pendulum: Pendulum, airFriction?: boolean) {
  // Update acceleration ➡ velocity ➡ angle
  const a1Acc = angularAccTop(pendulum);
  const a2Acc = angularAccBottom(pendulum);

  pendulum.a1Vel += a1Acc;
  pendulum.a2Vel += a2Acc;
  pendulum.a1 += pendulum.a1Vel;
  pendulum.a2 += pendulum.a2Vel;

  if (airFriction) {
    pendulum.a1Vel *= 0.995; //0.9999;
    pendulum.a2Vel *= 0.995; //0.9999;
  }
}

// Colors
function generateColors(count: number) {
  const hStart = Random.rangeFloor(0, 360);

  const colors = generateColorRamp({
    total: count,
    hStart,
    hEasing: (x) => x,
    hCycles: 1, // / 3,
    sRange: [0.2, 0.8],
    lRange: [0.2, 0.8],
  })
    .reverse()
    .map((color) => colorToCSS(color, 'hsl'));

  return colors;
}

// angular acceleration of top rod
function angularAccTop({ r1, r2, m1, m2, a1, a2, a1Vel, a2Vel, g }: Pendulum) {
  const num1 = -g * (2 * m1 + m2) * Math.sin(a1);
  const num2 = -m2 * g * Math.sin(a1 - 2 * a2);
  const num3 = -2 * Math.sin(a1 - a2) * m2;
  const num4 = a2Vel * a2Vel * r2 + a1Vel * a1Vel * r1 * Math.cos(a1 - a2);
  const den = r1 * (2 * m1 + m2 - m2 * Math.cos(2 * a1 - 2 * a2));
  return (num1 + num2 + num3 * num4) / den;
}

// angular acceleration of bottom rod
function angularAccBottom({
  r1,
  r2,
  m1,
  m2,
  a1,
  a2,
  a1Vel,
  a2Vel,
  g,
}: Pendulum) {
  const num1 = 2 * Math.sin(a1 - a2);
  const num2 = a1Vel * a1Vel * r1 * (m1 + m2);
  const num3 = g * (m1 + m2) * Math.cos(a1);
  const num4 = a2Vel * a2Vel * r2 * m2 * Math.cos(a1 - a2);
  const den = r2 * (2 * m1 + m2 - m2 * Math.cos(2 * a1 - 2 * a2));
  return (num1 * (num2 + num3 + num4)) / den;
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 20_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
