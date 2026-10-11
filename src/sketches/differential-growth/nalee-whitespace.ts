/**
 * nalee-whitespace — differential-growth with the rest of its grid filled.
 *
 * The organism packs a polyomino grown from the centre of a square grid
 * (see ./differential-growth); the empty cells are tiled by nalee walks on a
 * finer lattice, at about the curve's own density — one grown, one walked.
 * Slate ground, the walks a second hue 51° round the ring. Pane and drawing
 * live in ./whitespace-sketch.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

import { whitespaceSketch } from './whitespace-sketch';

const draw = whitespaceSketch({ title: 'nalee-whitespace' });

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
