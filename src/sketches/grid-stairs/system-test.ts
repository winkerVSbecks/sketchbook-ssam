import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { drawGridPattern } from './system';

const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = () => {
    drawGridPattern(context, width, height, {
      gridSize: 20,
      colors: ['#0066FF', '#003399', '#000066'],
      stairCount: 3,
      chequerboardCount: 2,
      backgroundColor: '#F0F0F0',
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [400, 400],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3000,
  playFps: 0.3333333333,
  exportFps: 0.3333333333,
};

ssam(sketch as Sketch<'2d'>, settings);
