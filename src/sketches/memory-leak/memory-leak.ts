import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import {
  GridCell,
  GridPatternConfig,
  createGridStairsSystem,
} from '../grid-stairs/system';
import * as tome from 'chromotome';
import {
  ClusterConfig,
  createClusterSystem,
} from '../cluster-growth/system-animated';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

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
  const drawGridPattern = createGridStairsSystem(
    {
      ...(config as Omit<GridPatternConfig, 'width' | 'height'>),
      width,
      height,
    },
    function drawPixel(c: GridCell) {
      if (c.filled) {
        context.fillStyle = c.color;
        context.fillRect(
          c.x * c.cellSize,
          c.y * c.cellSize,
          c.cellSize,
          c.cellSize
        );
      }
    }
  );

  wrap.render = (props) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

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
