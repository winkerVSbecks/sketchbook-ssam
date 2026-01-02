import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { rybHslToCSS } from '../../colors/rybitten';
import { Tree } from '../../data-structures/tree';

const config = {
  colorCount: 6,
  res: 12,
  depth: 8,
};

let h = Random.range(0, 360);
const s = Random.range(0.75, 0.9);
const l = Random.range(0.25, 0.5);
const fg = rybHslToCSS([h, s, l]);
const fg1 = rybHslToCSS([(h + 180) % 360, s, Random.range(0.75, 0.9)]);
const bg = '#fff'; //rybHslToCSS([h, 0, 1]); //'#F0F0F0';

interface Rectangle {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
}

function splitRectangle(rect: Rectangle): Rectangle[] {
  const type =
    rect.width === rect.height
      ? Random.pick(['v', 'h'])
      : rect.width > rect.height
      ? 'v'
      : 'h';
  const splitPos =
    type === 'h' ? rect.y + rect.height * 0.5 : rect.x + rect.width * 0.5;

  let rects: Rectangle[] = [];

  if (type === 'h') {
    rects.push({
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: splitPos - rect.y,
      color: rect.color,
    });
    rects.push({
      x: rect.x,
      y: splitPos,
      width: rect.width,
      height: rect.y + rect.height - splitPos,
      color: rect.color,
    });
  } else {
    rects.push({
      x: rect.x,
      y: rect.y,
      width: splitPos - rect.x,
      height: rect.height,
      color: rect.color,
    });
    rects.push({
      x: splitPos,
      y: rect.y,
      width: rect.x + rect.width - splitPos,
      height: rect.height,
      color: rect.color,
    });
  }

  return rects;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Generate seed
  const seed = Random.getRandomSeed();
  Random.setSeed(seed);
  console.log('Seed:', seed);

  const tree = new Tree<Rectangle>();
  let id = 0;

  let currentNode = { x: 0, y: 0, width: width, height: height, color: fg };
  tree.add(id, currentNode);

  let depth = 0;

  while (depth < config.depth) {
    const [cA, cB] = Random.shuffle(splitRectangle(currentNode));
    tree.add(id++, cA, currentNode);
    const next = { ...cB, color: currentNode.color === fg1 ? fg : fg1 };
    tree.add(id++, next, currentNode);

    currentNode = next;
    depth++;
  }

  wrap.render = () => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const s = width / config.depth / 2;

    // draw rectangles
    tree.traverse((node) => {
      context.fillStyle = node.value.color;
      context.fillRect(
        node.value.x,
        node.value.y,
        node.value.width,
        node.value.height
      );
      // context.strokeStyle = '#FFFFFF';
      // context.lineWidth = 4;
      // context.strokeRect(
      //   node.value.x,
      //   node.value.y,
      //   node.value.width,
      //   node.value.height
      // );
    });

    // draw grid
    context.strokeStyle = `rgba(0 0 0 / 0.01)`;
    context.lineWidth = 1;
    for (let y = 0; y <= height; y += s) {
      for (let x = 0; x <= width; x += s) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(width, y);
        context.stroke();

        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, height);
        context.stroke();
      }
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 3_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
