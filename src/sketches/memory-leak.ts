import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { GridPatternConfig, createGridPattern } from './grid-stairs/system';
import * as tome from 'chromotome';
import {
  ClusterConfig,
  createClusterSystem,
} from './cluster-growth/system-animated';
import { scaleCanvasAndApplyDither } from '../scale-canvas-dither';
import { dither } from '../dither';

const { colors, background: bg } = tome.get();

interface Bit64BloomConfig
  extends Omit<GridPatternConfig, 'width' | 'height'>,
    Omit<ClusterConfig, 'width' | 'height'> {
  dither?: boolean;
}

const config: Bit64BloomConfig = {
  stairCount: 3,
  chequerboardCount: 2,
  mode: 'pixel',
  clusterCount: 3,
  cellSize: 10,
  gap: 0,
  growthProbabilityMin: 0.05,
  growthProbabilityMax: 0.2,
  initialClusterSize: 8,
  chars: '░▒▓'.split(''),
  colors,
  renderBackground: false,
  renderBaseGrid: false,
  radiusRange: [0.1, 0.25],
  dither: true,
};

const sketch = ({ wrap, context, width, height, canvas }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const clusterConfig: ClusterConfig = {
    ...(config as Omit<ClusterConfig, 'width' | 'height'>),
    colors: [bg, colors[0]],
    // colors,
    width,
    height,
  };

  const drawClusterSystem = createClusterSystem(clusterConfig);
  const drawGridPattern = createGridPattern(
    {
      ...(config as Omit<GridPatternConfig, 'width' | 'height'>),
      width,
      height,
    },
    function drawPixel(
      x: number,
      y: number,
      cellSize: number,
      color: string,
      filled?: boolean
    ) {
      if (filled) {
        context.fillStyle = color;
        context.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
      }
    }
  );

  wrap.render = (props) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const { playhead } = props;

    // Create a pulsing growth probability
    const pulseRate = Math.sin(playhead * Math.PI * 2 * config.pulseSpeed);
    const currentGrowthProbability =
      config.growthProbabilityMin +
      ((config.growthProbabilityMax - config.growthProbabilityMin) *
        (pulseRate + 1)) /
        2;

    drawGridPattern();
    drawClusterSystem(props);

    // context.save();
    // context.globalCompositeOperation = 'destination-out'; // difference destination-out exclusion
    // context.globalAlpha = 0.9;
    // drawClusterSystem(props);
    // context.restore();

    if (config.dither) {
      const ditheredImage = scaleCanvasAndApplyDither(
        width,
        height,
        0.5,
        canvas,
        (data) =>
          dither(data, {
            greyscaleMethod: 'none',
            ditherMethod: 'atkinson',
          })
      );

      context.drawImage(ditheredImage, 0, 0, width, height);
    }
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 8_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
