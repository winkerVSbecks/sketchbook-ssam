import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { wrap as nWrap } from 'canvas-sketch-util/math';
import { converter, formatCss } from 'culori';
import { createNaleeSystem } from '../nalee-system';
import { makePolarDomain } from '../polar-utils';
import { Config, DomainToWorld, Walker } from '../types';
import { drawShape } from '../paths';

const bg = '#201c1d';
const colors = ['#fff'];
const oklch = converter('oklch');

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  console.clear();

  const size = 10;
  const resolution = [Math.floor(width / size), Math.floor(height / size)];
  const radiusRes = resolution[0] / 5;
  const thetaRes = resolution[1];

  const config = {
    resolution,
    size: size,
    stepSize: 3,
    walkerCount: 4,
    padding: 0,
    // x => r, y => theta
    pathStyle: function solidStyle(
      context: CanvasRenderingContext2D,
      walker: Walker,
      pts: Point[],
      playhead: number
    ) {
      context.lineCap = 'round';
      context.lineJoin = 'round';

      function polarToColor(
        r: number,
        theta: number,
        maxR: number,
        maxTheta: number,
        saturation = 100
      ) {
        const hue = Math.floor((theta / maxTheta) * 360) + playhead * 360;
        const lightness = 40 + Math.round((r / maxR) * 50);

        return formatCss(
          oklch(`hsl(${hue}, ${saturation}%, ${lightness}%)`)
        ) as string;
      }

      context.lineWidth = walker.size - walker.stepSize;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i];
        const b = pts[i + 1] || pts[i];

        const r = walker.path[i].x;
        const theta = walker.path[i].y;
        context.strokeStyle = polarToColor(
          r,
          theta,
          radiusRes,
          thetaRes,
          nWrap(
            (i / pts.length) * 100 + 100 * Math.sin(playhead * Math.PI * 2),
            0,
            100
          )
        );
        drawShape(context, [a, b], false);
        context.stroke();
      }
    },
    flat: true,
  } satisfies Config;

  const radius = width * 0.4;
  const [cx, cy] = [width / 2, height / 2];

  const domainToWorld: DomainToWorld = (r: number, theta: number) => {
    const worldX =
      cx +
      ((radius * r) / radiusRes) * Math.cos((theta * Math.PI * 2) / thetaRes);
    const worldY =
      cy +
      ((radius * r) / radiusRes) * Math.sin((theta * Math.PI * 2) / thetaRes);
    return [worldX, worldY];
  };

  const domain = makePolarDomain([8, radiusRes], [0, thetaRes], domainToWorld);
  const naleeSystem = createNaleeSystem(
    domain,
    config,
    domainToWorld,
    colors,
    bg
  );

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // draw polar grid
    context.strokeStyle = '#3f3f3f';
    context.lineWidth = 1;
    for (let r = 8; r <= radiusRes; r++) {
      context.beginPath();
      context.arc(cx, cy, (r / radiusRes) * radius + 10, 0, Math.PI * 2);
      context.stroke();
    }
    for (let t = 0; t < thetaRes; t += thetaRes / 12) {
      const [x, y] = domainToWorld(radiusRes * 1.1, t);
      context.beginPath();
      context.moveTo(cx, cy);
      context.lineTo(x, y);
      context.stroke();
    }

    naleeSystem(props);
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
