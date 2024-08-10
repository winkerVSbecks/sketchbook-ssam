import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { createNaleeSystem } from './nalee-system-manager';

Random.setSeed('nalee');

export const sketch = async ({ wrap, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const naleeSystem = createNaleeSystem();

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#101019';
    context.fillRect(0, 0, width, height);

    naleeSystem(props);
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
