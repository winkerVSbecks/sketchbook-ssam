import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import paper from 'paper';
import { createNaleeSystem } from '../nalee-system';
import {
  clipPolarDomainWithWorldCoords,
  makePolarDomain,
  polarDomainToWorld,
} from '../polar-utils';
import { Config, DomainToWorld } from '../types';

const bg = '#201c1d';
const colors = [
  '#5f6ce0',
  '#ffad72',
  '#bafc9d',
  '#bf8dff',
  // '#2a1f38',
  '#ffb06b',
  // '#382718',
  '#fc9de7',
  // '#382333',
  '#d4ffff',
  '#ffffff',
  '#fff3d4',
];
// const colors = ['#ff5937', '#4169ff'];
// const colors = ['#ff5937', '#4169ff', '#cc4529', '#1a3299', '#48bb78'];
// const colors = ['#f13401', '#0769ce', '#f1d93c', '#11804b'];

paper.setup(null as unknown as HTMLCanvasElement);

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 8;
  const config = {
    resolution: [Math.floor(height / size), Math.floor(height / size)],
    size: size,
    stepSize: size / 4,
    walkerCount: 10,
    padding: 1 / 32,
    pathStyle: 'pipeStyle',
    flat: true,
  } satisfies Config;

  const radiusRes = config.resolution[0] / 5; //20;
  const thetaRes = config.resolution[1] / 1.5; //100;

  const circles = Array.from({ length: colors.length }).map(() => {
    const cx = Random.range(0.4, 0.6) * width;
    const cy = Random.range(0.4, 0.6) * height;
    const maxRadius = Math.min(cx, cy, width - cx, height - cy);
    const radius = Random.range(0.5, 1) * (maxRadius * 0.8);
    return { cx, cy, radius };
  });

  const systems = circles
    .map(({ cx, cy, radius }, idx) => {
      const domainToWorld: DomainToWorld = polarDomainToWorld(
        radiusRes,
        thetaRes,
        [cx, cy],
        radius
      );

      const domain = makePolarDomain(
        [10, radiusRes],
        [0, thetaRes],
        domainToWorld
      );

      const otherCircles = circles.filter((_, i) => i < idx);

      const clippedDomain = otherCircles.reduce((d, c) => {
        return clipPolarDomainWithWorldCoords(
          d,
          [c.cx, c.cy],
          c.radius + size * 1.5,
          true
        );
      }, domain);

      const color = colors[idx % colors.length];

      const system = createNaleeSystem(
        clippedDomain,
        config,
        domainToWorld,
        [bg, color],
        bg
      );

      return { system, circle: { cx, cy, radius }, color };
    })
    .reverse();

  const circlePaths = circles.map(({ cx, cy, radius }) => {
    return new paper.Path.Circle(new paper.Point(cx, cy), radius * 1.125);
  });

  const paperUnionPath = circlePaths.reduce((acc, p) => {
    return acc === undefined ? p : (acc as any).unite(p);
  }, undefined as unknown) as paper.PathItem;
  const unionPath = new Path2D(paperUnionPath.pathData);

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    // context.restore();
    // // context.shadowColor = 'rgba(0, 0, 0, 0.1)';
    // // context.shadowBlur = 50;
    // context.lineWidth = 10;
    // context.strokeStyle = bg;
    // context.stroke(unionPath);
    // context.save();

    systems.forEach(({ system, circle, color }) => {
      context.fillStyle = color;
      context.beginPath();
      context.arc(circle.cx, circle.cy, circle.radius * 1.0625, 0, Math.PI * 2);
      context.fill();
      system(props);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  // dimensions: [1920, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
