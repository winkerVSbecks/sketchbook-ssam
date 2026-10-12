/**
 * jali — nalee-whitespace seen through a window.
 *
 * The field is nalee-whitespace's: differential growth packing a polyomino,
 * the rest of the grid tiled by nalee walks. Here it covers the opening of a
 * window frame (./window-frame) and is clipped to it — the arched jali shell
 * of ../jali/truchet, or a deep rectangular frame with its top and right
 * faces extruded and the tunnel's reveals inside — the way truchet's tiles
 * are only seen through its arch. The growth's domain is outlined in
 * ../khidki's grill: bars along every edge it shares with the walks, circles
 * and diamonds alternating on its vertices. Growth and walks share one quiet
 * contrast level so the grill, in the high tier, stands out over them. Pane
 * and drawing live in ./whitespace-sketch.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { whitespaceSketch } from './whitespace-sketch';
import { WINDOW_STYLES } from './window-frame';

const draw = whitespaceSketch({
  title: 'jali',
  windowed: true,
  grill: true,
  defaults: () => ({ window: Random.pick(WINDOW_STYLES), hues: 5, accent: 3, bar: 0.5 }),
});

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
