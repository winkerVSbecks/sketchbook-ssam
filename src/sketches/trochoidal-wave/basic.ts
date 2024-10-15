import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../../subtractive-color';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';

Random.setSeed(Random.getRandomSeed());
console.log(Random.getSeed());

interface WaveParams {
  amplitude: number;
  frequency: number;
  numberOfPoints: number;
  radius: number;
}

const colors = Random.pick(autoAlbersPalettes); //generateColors();
const bg = colors.shift()!;
const baseFrequency = Random.range(0.001, 0.01);
const baseRadius = Random.rangeFloor(1, 20);
const baseAmplitude = Random.rangeFloor(20, 80);

export const sketch = ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

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

  wrap.render = ({ width, height, playhead }: SketchProps) => {
    context.fillStyle = bg;
    context.clearRect(0, 0, width, height);
    context.fillRect(0, 0, width, height);

    const time = playhead * Math.PI * 2;

    context.lineWidth = 8;

    for (let i = -1; i < height / 40; i++) {
      const y = i * 40;
      drawWave(y, width, height, time, colors[i % colors.length], {
        amplitude: /* 60 */ baseAmplitude + Math.sin(time) * 10,
        frequency:
          /* 0.001 */ baseFrequency + Math.sin(time) * 0.0001 + i * 0.0005,
        numberOfPoints: 400,
        radius: /* 20 */ baseRadius + i * 1,
      });
    }
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
