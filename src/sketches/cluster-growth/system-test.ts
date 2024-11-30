import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { renderCluster, ClusterConfig } from './system';

export const sketch: Sketch<'2d'> = ({
  wrap,
  context,
  width,
  height,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const config: ClusterConfig = {
    cellSize: 10,
    gap: 0,
    growthProbabilityMin: 0.05,
    growthProbabilityMax: 0.2,
    initialClusterSize: 8,
    chars: '░▒▓'.split(''),
    width,
    height,
  };

  wrap.render = renderCluster(config);
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch, settings);
