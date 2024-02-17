import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';
import { drawCircle, drawLine } from '@daeinc/draw';
import { lerpArray } from 'canvas-sketch-util/math';
import { interpolate, formatCss } from 'culori';

// Random.setSeed(Random.getRandomSeed());
// console.log(Random.getSeed());

const debug = false;

interface Node {
  x: number;
  y: number;
  r: number;
  color: string;
}

interface Path {
  from: Node;
  to: Node;
  steps: {
    from: Point;
    to: Point;
    color: string;
  }[];
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const colors = generateColors();
  const bg = colors.shift()!;
  const debugColor = colors[0];

  const colorSale = interpolate(colors);
  const colorMap = (t: number) => formatCss(colorSale(1 - t));

  const maxCount = 1000;
  let currentCount = 1;
  const nodes: Node[] = [];
  const paths: Path[] = [];

  // first circle
  nodes.push({
    x: width / 2,
    y: height / 2,
    r: 10,
    color: colors[0],
  });

  wrap.render = ({ playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.clearRect(0, 0, width, height);
    context.fillRect(0, 0, width, height);

    if (currentCount < maxCount) {
      // create a random set of parameters
      const newR = Random.range(1, 7);
      const newX = Random.range(newR, width - newR);
      const newY = Random.range(newR, height - newR);
      const newNode: Node = {
        r: newR,
        x: newX,
        y: newY,
        color: colorMap(
          Math.hypot(newX - width / 2, newY - height / 2) / (width / 2)
        ),
      };

      var closestDist = Number.MAX_VALUE;
      var closestIndex = 0;

      // find the closest node
      for (var i = 0; i < currentCount; i++) {
        var newDist = Math.hypot(
          newNode.x - nodes[i].x,
          newNode.y - nodes[i].y
        );
        if (newDist < closestDist) {
          closestDist = newDist;
          closestIndex = i;
        }
      }

      const closestNode = nodes[closestIndex];

      if (debug) {
        context.strokeStyle = debugColor;
        context.lineWidth = 4;
        context.beginPath();
        drawCircle(context, [newNode.x, newNode.y], newR * 2);
        context.fill();

        context.lineWidth = 1;
        context.beginPath();
        drawLine(
          context,
          [newNode.x, newNode.y],
          [closestNode.x, closestNode.y]
        );
        context.stroke();
      }

      // a line it to the closest circle outline
      var angle = Math.atan2(
        newNode.y - closestNode.y,
        newNode.x - closestNode.x
      );

      nodes[currentCount] = {
        ...newNode,
        x: closestNode.x + Math.cos(angle) * (closestNode.r + newNode.r),
        y: closestNode.y + Math.sin(angle) * (closestNode.r + newNode.r),
      };

      paths.push({
        from: closestNode,
        to: nodes[currentCount],
        steps: gradientSteps(closestNode, nodes[currentCount]),
      });

      currentCount++;
    }

    context.lineWidth = 8;
    context.lineCap = 'round';
    for (const path of paths) {
      // path.steps.forEach((step) => {
      //   context.strokeStyle = step.color;
      //   context.beginPath();
      //   drawLine(context, step.from, step.to);
      //   context.stroke();
      // });

      context.strokeStyle = colorMap(
        Math.hypot(path.to.x - width / 2, path.to.y - height / 2) / (width / 2)
      );
      context.beginPath();
      drawLine(context, [path.from.x, path.from.y], [path.to.x, path.to.y]);
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
  playFps: debug ? 15 : 60,
  exportFps: debug ? 15 : 60,
  framesFormat: ['mp4'],
  attributes: {
    willReadFrequently: true,
  },
};

ssam(sketch as Sketch<'2d'>, settings);

function gradientSteps(from: Node, to: Node, count: number = 6) {
  const colorSale = interpolate([from.color, to.color]);
  const colorMap = (t: number) => formatCss(colorSale(t));

  const steps = [];

  for (let i = 1; i < count; i++) {
    const t = (i + 1) / count;
    const nFrom = lerpArray([from.x, from.y], [to.x, to.y], i / count);
    const nTo = lerpArray([from.x, from.y], [to.x, to.y], t);

    steps.push({
      from: nFrom,
      to: nTo,
      color: colorMap(t),
    });
  }

  return steps;
}
