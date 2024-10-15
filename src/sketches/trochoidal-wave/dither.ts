import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../../subtractive-color';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { dither as simpleDither } from '../../simple-dither';
import { dither } from '../../dither';

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

interface WaveParams {
  amplitude: number;
  frequency: number;
  numberOfPoints: number;
  radius: number;
}

const baseFrequency = Random.range(0.00001, 0.01);
const baseRadius = Random.rangeFloor(1, 20);
const baseAmplitude = Random.rangeFloor(20, 80);

export const sketch = ({ wrap, context, canvas }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  context.imageSmoothingEnabled = false;
  //@ts-ignore
  context.mozImageSmoothingEnabled = false;
  //@ts-ignore
  context.oImageSmoothingEnabled = false;
  //@ts-ignore
  context.webkitImageSmoothingEnabled = false;
  //@ts-ignore
  context.msImageSmoothingEnabled = false;
  //@ts-ignore
  canvas.style['image-rendering'] = 'pixelated';

  function drawWave(
    y: number,
    width: number,
    height: number,
    time: number,
    color: string,
    waveParams: WaveParams
  ) {
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(0, height);

    for (let i = -10; i < waveParams.numberOfPoints + 10; i++) {
      const x = i * ((width / waveParams.numberOfPoints) * 2);

      // Calculate trochoidal motion
      const xPos =
        x - waveParams.radius * Math.sin(waveParams.frequency * x + time);
      const yPos =
        y - waveParams.amplitude * Math.cos(waveParams.frequency * x + time);

      context.lineTo(xPos, yPos);
      context.lineTo(xPos, yPos);
    }
    context.lineTo(width, y);
    context.lineTo(width, height);

    context.fill();
  }

  const layerCount = 5;
  const colors = Random.pick([...mindfulPalettes, ...autoAlbersPalettes]);
  // const colors = Array.from(
  //   { length: layerCount + 1 },
  //   (_, idx) => `hsl(0 0% ${((75 * idx) / layerCount).toFixed(2)}%)`
  // );
  const bg = colors.shift()!;

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.clearRect(0, 0, width, height);
    context.fillRect(0, 0, width, height);

    const time = playhead * Math.PI * 2;
    const size = height / layerCount;

    for (let i = 0; i < layerCount; i++) {
      const y = i * size;
      drawWave(y, width, height, time, colors[i % colors.length], {
        amplitude: baseAmplitude + Math.sin(time) * 10,
        frequency: baseFrequency + Math.sin(time) * 0.0001 + i * 0.0005,
        numberOfPoints: 200,
        radius: baseRadius + i * 1,
      });
    }

    const smallCanvas = document.createElement('canvas');
    const smallCtx = smallCanvas.getContext('2d')!;

    const scaleFactor = 0.25; // .25 or .5

    smallCanvas.width = width * scaleFactor;
    smallCanvas.height = height * scaleFactor;
    smallCtx.drawImage(canvas, 0, 0, smallCanvas.width, smallCanvas.height);

    const data = smallCtx.getImageData(0, 0, width, height);
    // const dithered = simpleDither(data);

    const dithered = dither(data, {
      greyscaleMethod: 'none', // 'average'
      ditherMethod: 'atkinson',
    });

    smallCtx.putImageData(dithered, 0, 0);

    context.drawImage(smallCanvas, 0, 0, width, height);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: 1,
  animate: true,
  duration: 4_000,
  playFps: 24,
  exportFps: 24,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
