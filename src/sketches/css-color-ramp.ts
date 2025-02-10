import { ssam, Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerp } from 'canvas-sketch-util/math';

const chroma = 100;
// let chroma = 0;
// let dir = 1;
const steps = 20;
let hStart = Random.range(0, 360);

export const sketch = ({ wrap, context }: SketchProps) => {
  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    const step = width / steps;

    for (let y = 0; y < steps; y++) {
      const hue = hStart + lerp(0, 360, y / steps);

      for (let x = 0; x < steps; x++) {
        const lightness = lerp(0, 100, x / steps);

        context.fillStyle = `oklch( ${lightness}% ${chroma}% ${hue})`;
        context.fillRect(x * step, y * step, step, height);
      }
    }
    hStart++;

    // chroma = chroma + dir * 1;

    // if (chroma == 100) {
    //   dir = -1;
    // } else if (chroma == 25) {
    //   dir = 1;
    // }
  };
};

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
};

ssam(sketch as Sketch<'2d'>, settings);
