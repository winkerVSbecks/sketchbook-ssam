import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import {
  generateColorRamp,
  colorToCSS,
  GenerateColorRampArgument,
} from 'rampensau';
import Random from 'canvas-sketch-util/random';
import Ticker from 'tween-ticker';

const ticker = Ticker();
const loops = 10;

type Block = {
  x: number;
  y: number;
  sizeX: number;
  origSizeY: number;
  sizeY: number;
  color: string;
  row: number;
  col: number;
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const generateStrip = (
    sizeX: number,
    sizeY: number,
    y: number,
    xOffset: number = 0,
    row: number,
    colorsA: string[],
    colorsB: string[]
  ): Block[] => {
    let strip: Block[] = [];

    for (let idx = 0; idx < 8; idx++) {
      const color = idx > 3 ? colorsB[idx - 4] : colorsA[idx];
      const x = xOffset + idx * sizeX;
      strip.push({
        x,
        y,
        sizeX,
        origSizeY: sizeY,
        sizeY: 0,
        color,
        col: y,
        row: row + idx,
      });
    }

    return strip;
  };

  const step = height / 8;

  const generateBlocks = (colorsA: string[], colorsB: string[]) => {
    const blocks: Block[] = [];
    for (let y = 0; y < 8; y++) {
      const parts = y + 1;
      const sizeX = width / parts / 8;
      const sizeY = step;

      for (let x = 0; x < parts; x++) {
        const offset = (x * width) / parts;
        let strip = generateStrip(
          sizeX,
          sizeY,
          y * step,
          offset,
          x * 8,
          colorsA,
          colorsB
        );
        blocks.push(...strip);
      }
    }
    return blocks;
  };

  let colorsA: any, colorsB: any;
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
      colorsA = colors[0];
      colorsB = colors[1];

      blocks = generateBlocks(colorsA, colorsB);
      stagger(blocks);
    }

    blocks.forEach((block) => {
      context.fillStyle = block.color;
      context.fillRect(block.x, block.y, block.sizeX, block.sizeY);
    });

    ticker.tick((deltaTime * 1.5) / 1000);
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

ssam(sketch as Sketch, settings);

// Colors
const colorParams: GenerateColorRampArgument = {
  total: 4,
  hStartCenter: 0.0,
  hEasing: (x) => x,
  hCycles: 0.0,
  sRange: [0.3, 0.4],
  sEasing: (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2),
  lRange: [0.15, 0.5],
  lEasing: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
};

function generateColors() {
  const hStartA = Random.rangeFloor(0, 360); // 40
  const hStartB = (hStartA + 240) % 360; // 270

  const colorsA = generateColorRamp({
    ...colorParams,
    hStart: hStartA,
  }).map((color) => colorToCSS(color, 'oklch'));

  const colorsB = generateColorRamp({
    ...colorParams,
    hStart: hStartB,
  })
    .reverse()
    .map((color) => colorToCSS(color, 'oklch'));

  return [colorsA, colorsB];
}

// Animation
function stagger(elements: Block[]) {
  elements.forEach((e, idx) => {
    ticker.to(e, {
      sizeY: e.origSizeY,
      duration: 0.4,
      delay: e.col * 0.001 + e.row * 0.005,
      ease: 'cubicIn',
    });
  });

  ticker.to(elements, {
    sizeY: 0,
    delay: 2.6,
    duration: 0.4,
    ease: 'cubicOut',
  });
}
