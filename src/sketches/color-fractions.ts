import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { generateColorRamp, colorToCSS, colorHarmonies } from 'rampensau';
import Random from 'canvas-sketch-util/random';
import Ticker from 'tween-ticker';
import Tweenr from 'tweenr';

const ticker = /* Tweenr(); // */ Ticker();
const loops = 10;

type Block = {
  x: number;
  y: number;
  width: number;
  height: number;
  targetWidth: number;
  targetHeight: number;
  color: string;
  row: number;
  col: number;
  flip?: boolean;
};

export const sketch = ({ wrap, context, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const generateRow = (
    size: number,
    _y: number,
    parts: number,
    colors: string[]
  ): Block[] => {
    let row: Block[] = [];
    const sliceSize = size / parts;

    let colorIdx = 0;
    for (let _x = 0; _x < 8; _x++) {
      for (let slice = 0; slice < parts; slice++) {
        const color = colors[colorIdx % colors.length];

        const x = _x * size + slice * sliceSize;
        const y = _y * size;
        const flip = _x % 2 !== 0;

        row.push({
          x: flip ? _x * size : x,
          y: flip ? _y * size + slice * sliceSize : y,
          width: flip ? size : 0,
          height: flip ? 0 : size,
          targetWidth: flip ? size : sliceSize,
          targetHeight: flip ? sliceSize : size,
          color: color,
          col: colorIdx,
          row: _y,
          flip,
        });
        colorIdx++;
      }
    }

    return row;
  };

  const step = height / 8;

  const generateBlocks = (colors: string[]) => {
    const blocks: Block[] = [];
    for (let y = 0; y < 8; y++) {
      const parts = y + 1;

      let row = generateRow(step, y, parts, colors);
      blocks.push(...row);
    }
    return blocks;
  };

  let blocks: Block[] = [];

  wrap.render = ({
    width,
    height,
    frame,
    deltaTime,
    totalFrames,
  }: SketchProps) => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    if (frame % (totalFrames / loops) === 0) {
      ticker.cancel();
      const colors = generateColors();
      blocks = generateBlocks(colors);
      stagger(blocks);
    }

    blocks.forEach((block) => {
      context.fillStyle = block.color;
      context.fillRect(block.x, block.y, block.width, block.height);
    });

    ticker.tick((deltaTime * 1.5) / 1000);
    // ticker.tick(deltaTime / 1000);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3_000 * loops,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);

// Colors
function generateColors() {
  const hStart = Random.rangeFloor(0, 360);
  const s = 0.6;
  const l = 0.6;

  const colors = generateColorRamp({
    total: 8,
    hStart,
    hEasing: (x) => x,
    hCycles: 1 / 3,
    sRange: [s, s],
    lRange: [l, l],
  })
    .reverse()
    .map((color) => colorToCSS(color, 'oklch'));

  return colors;
}

// Animation
function stagger(elements: Block[]) {
  elements.forEach((e) => {
    ticker.to(e, {
      width: e.targetWidth,
      height: e.targetHeight,
      duration: 0.4,
      delay: e.col * 0.001 + (8 - e.row) * 0.005,
      ease: 'cubicIn',
    });
  });
  ticker.to(elements, {
    height: 0,
    width: 0,
    delay: 2.6,
    duration: 0.4,
    ease: 'cubicOut',
  });
}
