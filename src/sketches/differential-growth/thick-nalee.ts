/**
 * thick-nalee — nalee walks drawn with a line so thick it fills the canvas,
 * then the line's area washed in and filled by differential growth.
 *
 * Walkers tile a lattice the nalee way (hold a direction, bounce at walls,
 * die when boxed in or past a drawn length, spawn until every node is taken).
 * Each walk becomes a band three quarters of the lattice pitch wide, so only
 * a thin strip of ground separates bands, and each band holds its own
 * organism (../terminal-ui/growth-sim), seeded as a thin loop down the band's
 * centreline and confined to it — so the walks survive only
 * as the corridors the curves have packed. On a paper ground each band is
 * washed in its hue's low tier and its curve drawn in the same hue's ink
 * (`reverse` turns the paper to slate). Pane and drawing live in ./band-sketch.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { bandSketch } from './band-sketch';
import { naleeWalks } from './region';

const draw = bandSketch({
  title: 'thick-nalee',
  walks: true,
  multiHue: true,
  defaults: () => ({ lattice: Random.pick([6, 7, 8]), count: Random.rangeFloor(1, 4) }),
  paths: ({ lattice, walkLength }) =>
    naleeWalks(
      lattice,
      lattice,
      () => true,
      () => Random.rangeFloor(lattice, Math.max(lattice, lattice * walkLength) + 1),
    ),
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
