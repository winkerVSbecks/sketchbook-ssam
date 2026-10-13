/**
 * khidki — a grill over an opening, every block it leaves open filled with
 * nalee walks or differential growth (./khidki-field). The pane's `grill`
 * picks one, at random on load: khidki's own window — the jali's
 * rectangular frame round ../khidki's grill, filled in noise patches or by
 * whole lozenge stars — or one of the street gates and windows of ./grills
 * (sunburst, railing, scroll, gate, star, circles) in the same frame. Pane
 * and drawing live in ./khidki-sketch.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { GRILL_NAMES, khidkiSketch } from './khidki-sketch';

// A grill picked at random every load; the pane switches between them.
const draw = khidkiSketch({ title: 'khidki', defaults: () => ({ grill: Random.pick(GRILL_NAMES) }) });

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
  animate: false,
  duration: 20000,
  framesFormat: ['mp4'],
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
