import Timeline from '@daeinc/timeline';
import type { Sketch, SketchSettings } from 'ssam';
import { ssam } from 'ssam';
import { drawCircle } from '@daeinc/draw';
import { Pt } from '@daeinc/geom';

const tl = Timeline.from({
  name: 'circle-1',
  properties: [
    {
      name: 'position',
      keyframes: [
        { time: 0, value: [500, 100], ease: 'hold' },
        { time: 1, value: [300, 300], ease: 'expoIn' },
        { time: 2, value: [300, 500], ease: 'quadInOut' },
      ],
    },
    {
      name: 'diam',
      keyframes: [
        { time: 0, value: 5 },
        { time: 2, value: 50 },
        { time: 3, value: 20 },
      ],
    },
  ],
});

const sketch: Sketch<'2d'> = ({ wrap, context: ctx, width, height }) => {
  wrap.render = ({ width, height, playhead }) => {
    ctx.fillStyle = `#112`;
    ctx.fillRect(0, 0, width, height);

    const position = tl.value('position', playhead * 2) as Pt;
    const diam = tl.value('diam', playhead * 2) as unknown as number;

    drawCircle(ctx, position, diam);
    ctx.fillStyle = '#f0f';
    ctx.fill();
  };
};

const settings: SketchSettings = {
  dimensions: [800, 800],
  duration: 4_000,
};

ssam(sketch, settings);
