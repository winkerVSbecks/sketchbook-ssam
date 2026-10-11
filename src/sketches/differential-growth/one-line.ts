/**
 * one-line — thick-nalee with a single walker: one line through every node of
 * the lattice (a random Hamiltonian path, as in ../nalee-one-line), drawn so
 * thick it fills the canvas, its area then filled by one differential-growth
 * organism seeded down its centreline. One band, one wash, one ink, on paper
 * (`reverse` swaps wash and ink). Pane and drawing live in ./band-sketch.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { bandSketch } from './band-sketch';
import { hamiltonianPath } from './region';

const draw = bandSketch({
  title: 'one-line',
  defaults: () => ({ lattice: Random.pick([5, 6, 7]) }),
  paths: ({ lattice }) => [hamiltonianPath(lattice, lattice)],
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
