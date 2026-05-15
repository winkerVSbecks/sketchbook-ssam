import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

export const sketch: Sketch<'2d'> = ({ wrap, context, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  wrap.render = ({ width, height }: SketchProps) => {
    const bars = 12;
    const barWidth = width / bars;
    for (let i = 0; i < bars; i++) {
      const hue = Math.round((i / bars) * 360);
      context.fillStyle = `hsl(${hue}, 70%, 55%)`;
      context.fillRect(i * barWidth, 0, barWidth, height);
    }
    context.fillStyle = 'rgba(0, 0, 0, 0.85)';
    context.fillRect(width * 0.4, height * 0.4, width * 0.2, height * 0.2);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [512, 512],
  pixelRatio: 1,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
