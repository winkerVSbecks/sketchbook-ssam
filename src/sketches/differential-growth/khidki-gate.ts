/**
 * khidki-gate — the gate grill of ./grills (a round-shouldered gate of stiles
 * and interlocking, bent steps), every block it leaves open filled with nalee
 * walks or differential growth in noise patches, as in ./khidki. Pane and
 * drawing live in ./khidki-sketch.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { GRILLS } from './grills';
import { khidkiSketch } from './khidki-sketch';

const draw = khidkiSketch({ title: 'khidki-gate', grill: GRILLS.find((g) => g.name === 'gate') });

export const sketch = (props: SketchProps) => {
  const { wrap } = props;
  const cleanup = draw(props);
  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      cleanup();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  attributes: { colorSpace: 'display-p3' },
  animate: true,
  duration: 20000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
