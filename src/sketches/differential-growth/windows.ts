/**
 * windows — the band grid seen through a window.
 *
 * The field is thick-nalee's (or one-line's): lattice paths stamped as thick
 * bands, each washed in and packed by its own differential-growth curve. Here
 * it is clipped to a window frame (./window-frame) — the arched jali shell of
 * ../jali/truchet, or a deep rectangular frame with its top and right faces
 * extruded and the tunnel's reveals inside — so the growth is only seen
 * through the opening, the way the jali's tiles are in truchet.
 *
 * Paper ground (slate when reversed); bands take a hue's low-tier wash and
 * their curves the same hue's ink, ≈7.5:1 apart; the frame is the darkest ink
 * on its face and the mid tier on its depth. Pane and drawing live in
 * ./band-sketch.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

import { bandSketch } from './band-sketch';
import { hamiltonianPath, naleeWalks } from './region';
import { WINDOW_STYLES } from './window-frame';

const draw = bandSketch({
  title: 'windows',
  windowed: true,
  multiHue: true,
  defaults: () => ({
    window: Random.pick(WINDOW_STYLES),
    lattice: Random.pick([6, 7, 8]),
    count: Random.rangeFloor(1, 4),
  }),
  paths: ({ grid, lattice, walkLength }) =>
    grid === 'line'
      ? [hamiltonianPath(lattice, lattice)]
      : naleeWalks(
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
