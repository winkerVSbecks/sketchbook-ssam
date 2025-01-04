import { ssam, Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import * as tome from 'chromotome';
const { colors, background, stroke } = tome.get();
export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  type R = { id: number; x: number; y: number; w: number; h: number };
  type G = (number | null)[][];
  function generateAreas(rows: number, cols: number): R[] {
    const g: G = Array(rows)
      .fill(null)
      .map(() => Array(cols).fill(null));
    const rs: R[] = [];
    let y = 0;
    while (y < rows) {
      const x = g[y].findIndex((cell) => cell === null);
      if (x === -1) {
        y++;
        continue;
      }
      let w = 0,
        h = 0;
      while (x + w < cols && g[y][x + w] === null) w++;
      while (y + h < rows && g[y + h][x] === null) h++;
      const region = {
        id: rs.length,
        x,
        y,
        w: Random.rangeFloor(1, w),
        h: Random.rangeFloor(1, h),
      };
      for (let i = y; i < y + region.h; i++) {
        for (let j = x; j < x + region.w; j++) {
          g[i][j] = region.id;
        }
      }
      rs.push(region);
    }
    return rs;
  }
  const res = Random.pick([
    [4, 4],
    [3, 3],
    [2, 2],
  ]);
  const gap = width * 0.01;
  const w = (width - gap) / res[0];
  const h = (height - gap) / res[1];

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = stroke || background;
    context.fillRect(0, 0, width, height);

    generateAreas(res[0], res[1]).forEach((r) => {
      context.fillStyle = Random.pick(colors);
      context.fillRect(
        gap / 2 + r.x * w + gap / 2,
        gap / 2 + r.y * h + gap / 2,
        r.w * w - gap,
        r.h * h - gap
      );
    });
  };
};
export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};
ssam(sketch as Sketch<'2d'>, settings);
