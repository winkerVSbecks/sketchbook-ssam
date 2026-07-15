import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Pane } from 'tweakpane';
import { createNaleeSystem } from '../nalee/nalee-system';
import { makeDomain } from '../nalee/domain';
import type { Config, Walker } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';
import {
  applyFilmGrain,
  drawGlowLine,
  drawVignetteBackground,
} from './glow-style';

const PALETTE = ['#ff2d95', '#8b3fd1', '#2e8bff'];

const config = {
  cellSize: 90, // grid pitch in px — coarser means a sparser composition
  lineWidth: 20, // rendered tube width, decoupled from the grid pitch
  walkerCount: 4,
  padding: 0.06,
  flat: true,

  bg: '#0a0a0f',
  vignetteStrength: 0.45,
  grainIntensity: 24,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

const gridFolder = pane.addFolder({ title: 'Grid & walkers' });
gridFolder.addBinding(config, 'cellSize', { min: 30, max: 300, step: 5 });
gridFolder.addBinding(config, 'lineWidth', { min: 2, max: 40, step: 1 });
gridFolder.addBinding(config, 'walkerCount', { min: 1, max: 16, step: 1 });
gridFolder.addBinding(config, 'padding', { min: 0, max: 0.25, step: 0.01 });
gridFolder.addBinding(config, 'flat');
const regenerateButton = gridFolder.addButton({ title: 'Regenerate' });

const lookFolder = pane.addFolder({ title: 'Look' });
lookFolder.addBinding(config, 'bg');
lookFolder.addBinding(config, 'vignetteStrength', {
  min: 0,
  max: 1,
  step: 0.01,
});
lookFolder.addBinding(config, 'grainIntensity', { min: 0, max: 80, step: 1 });

function bioSprueLineStyle(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
) {
  drawGlowLine(
    context,
    pts.map(([x, y]) => ({ x, y })),
    walker.color,
    walker.size,
  );
}

function buildNaleeSystem(width: number, height: number) {
  const naleeConfig = {
    resolution: [
      Math.floor(width / config.cellSize),
      Math.floor(height / config.cellSize),
    ],
    size: config.lineWidth,
    stepSize: config.lineWidth / 3,
    walkerCount: config.walkerCount,
    padding: config.padding,
    pathStyle: bioSprueLineStyle,
    flat: config.flat,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    naleeConfig.resolution,
    naleeConfig.padding,
    width,
    height,
  );
  const domain = makeDomain(naleeConfig.resolution, domainToWorld);
  return createNaleeSystem(
    domain,
    naleeConfig,
    domainToWorld,
    PALETTE,
    config.bg,
  );
}

export const sketch = ({
  wrap,
  context,
  width,
  height,
  ...props
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  let naleeSystem = buildNaleeSystem(width, height);

  regenerateButton.on('click', () => {
    naleeSystem = buildNaleeSystem(width, height);
    props.render();
  });

  wrap.render = (renderProps: SketchProps) => {
    const { width, height } = renderProps;
    drawVignetteBackground(
      context,
      width,
      height,
      config.bg,
      config.vignetteStrength,
    );
    naleeSystem(renderProps);
    applyFilmGrain(context, config.grainIntensity);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
