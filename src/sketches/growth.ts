import { ssam } from 'ssam';
import WebFont from 'webfontloader';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';
import { drawCircle, drawLine } from '@daeinc/draw';
import { lerpArray, mapRange } from 'canvas-sketch-util/math';
import { interpolate, formatCss } from 'culori';
import { dither } from '../dither';

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
  size: number;
}

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  await new Promise((resolve) => {
    WebFont.load({
      google: {
        families: ['Eczar'],
      },
      active: () => {
        resolve(void 0);
      },
    });
  });

  const colors = generateColors();
  const bg = colors.shift()!; //'#f5edd6';
  const debugColor = colors[0];
  const idxToColor = (idx: number) => colors[idx % colors.length];

  const colorSale = interpolate(colors);
  const colorMap = (t: number) => formatCss(colorSale(t));

  const maxCount = 1400;
  let currentCount = 1;
  let nodes: Node[] = [];
  let paths: Path[] = [];
  let postProcessingApplied = false;

  const xMin = width * 0.2;
  const xMax = width * 0.8;
  const yMin = height * 0.2;
  const yMax = height * 0.8;

  nodes.push({
    x: width / 2,
    y: height * 0.8,
    r: 10,
    color: colors[0],
  });

  wrap.render = ({ frame }: SketchProps) => {
    if (postProcessingApplied) return;

    context.fillStyle = bg;
    context.clearRect(0, 0, width, height);
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      nodes = [];
      paths = [];
      currentCount = 1;
      nodes.push({
        x: width / 2,
        y: height * 0.8,
        r: 10,
        color: colors[0],
      });
    }

    if (currentCount < maxCount) {
      // create a random set of parameters
      const newR = Random.range(1, 7);
      const newNode: Node = {
        r: newR,
        x: Random.range(xMin - newR, xMax - newR),
        y: Random.range(yMin - newR, yMax - newR),
        color: idxToColor(currentCount),
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
        size: 68 - (60 * currentCount) / maxCount,
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
      context.lineWidth = path.size;
      context.strokeStyle = colorMap(
        mapRange(path.to.y, 0, height, 0, 1, true)
        // Math.hypot(path.to.x - width / 2, path.to.y - height / 2) / (width / 2)
      ); //path.from.color;
      context.beginPath();
      drawLine(context, [path.from.x, path.from.y], [path.to.x, path.to.y]);
      context.stroke();
    }

    context.strokeStyle = '#222';
    context.lineWidth = 4;
    context.strokeRect(width * 0.1, height * 0.1, width * 0.8, height * 0.8);

    if (currentCount >= maxCount) {
      postProcessingApplied = true;
      context.font = `600 32px Eczar`;
      context.fillStyle = '#222';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(
        'FIGURE 42: ALEYONIUM ARBOREUM',
        width / 2,
        height * 0.94
      );

      const imageData = context.getImageData(0, 0, width * 2, height * 2);
      const ditheredImage = dither(imageData, {
        greyscaleMethod: 'none',
        ditherMethod: 'atkinson',
        ditherThreshold: 50,
        replaceColours: false,
        replaceColourMap: {
          black: { r: 0, g: 0, b: 0, a: 255 },
          white: { r: 255, g: 255, b: 255, a: 255 },
        },
      });
      context.putImageData(ditheredImage, 0, 0);
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  // dimensions: [1080, 1080],
  dimensions: [600 * 2, 800 * 2],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 18_000,
  playFps: debug ? 15 : 60,
  exportFps: debug ? 15 : 60,
  framesFormat: ['mp4'],
  attributes: {
    willReadFrequently: true,
  },
};

ssam(sketch as Sketch, settings);

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
