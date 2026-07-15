import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';
import {
  applyFilmGrain,
  drawGlowLine,
  drawSpecularHighlight,
  drawVignetteBackground,
  roundedPolygonPath,
  shadeFillPath,
  type Point,
} from './glow-style';

const config = {
  bg: '#0a0a0f',
  vignetteStrength: 0.45,

  pink: '#ff2d95',
  pinkCore: '#ffd6ec',
  purple: '#8b3fd1',
  purpleLight: '#d8b8fb',
  purpleDark: '#2f1354',
  blue: '#2e8bff',
  blueLight: '#bfe0ff',
  blueDark: '#0c2450',

  outlineColor: '#050208',
  outlineWidth: 3,

  railWidth: 11,
  helixWidth: 8,
  helixAmplitude: 62,
  helixWavelength: 210,
  helixRungCount: 8,

  crossArmLength: 130,
  crossArmWidth: 46,
  crossCornerRadius: 20,

  vesicleCount: 4,
  vesicleBaseRadius: 52,

  grainIntensity: 24,
};

const pane = new Pane() as any;
pane.containerElem_.style.zIndex = 1;

const colorFolder = pane.addFolder({ title: 'Color' });
colorFolder.addBinding(config, 'bg');
colorFolder.addBinding(config, 'vignetteStrength', { min: 0, max: 1, step: 0.01 });
colorFolder.addBinding(config, 'pink');
colorFolder.addBinding(config, 'pinkCore');
colorFolder.addBinding(config, 'purple');
colorFolder.addBinding(config, 'purpleLight');
colorFolder.addBinding(config, 'purpleDark');
colorFolder.addBinding(config, 'blue');
colorFolder.addBinding(config, 'blueLight');
colorFolder.addBinding(config, 'blueDark');
colorFolder.addBinding(config, 'outlineColor');

const glowFolder = pane.addFolder({ title: 'Glow lines' });
glowFolder.addBinding(config, 'railWidth', { min: 2, max: 24, step: 1 });
glowFolder.addBinding(config, 'helixWidth', { min: 2, max: 20, step: 1 });
glowFolder.addBinding(config, 'helixAmplitude', { min: 10, max: 120, step: 1 });
glowFolder.addBinding(config, 'helixWavelength', { min: 60, max: 400, step: 5 });
glowFolder.addBinding(config, 'helixRungCount', { min: 2, max: 20, step: 1 });

const shapeFolder = pane.addFolder({ title: 'Shaded shapes' });
shapeFolder.addBinding(config, 'outlineWidth', { min: 1, max: 8, step: 0.5 });
shapeFolder.addBinding(config, 'crossArmLength', { min: 60, max: 220, step: 1 });
shapeFolder.addBinding(config, 'crossArmWidth', { min: 20, max: 90, step: 1 });
shapeFolder.addBinding(config, 'crossCornerRadius', { min: 0, max: 40, step: 1 });
shapeFolder.addBinding(config, 'vesicleCount', { min: 2, max: 8, step: 1 });
shapeFolder.addBinding(config, 'vesicleBaseRadius', { min: 20, max: 100, step: 1 });
shapeFolder.addBinding(config, 'grainIntensity', { min: 0, max: 80, step: 1 });

export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => { props.exportFrame(); });

  wrap.render = ({ width, height }: SketchProps) => {
    drawVignetteBackground(context, width, height, config.bg, config.vignetteStrength);

    drawGlowLine(
      context,
      [
        { x: width * 0.08, y: height * 0.13 },
        { x: width * 0.6, y: height * 0.13 },
        { x: width * 0.6, y: height * 0.21 },
        { x: width * 0.92, y: height * 0.21 },
      ],
      config.pink,
      config.railWidth,
    );

    drawHelix(context, width * 0.28, height * 0.38, height * 0.42);

    drawCross(context, width * 0.72, height * 0.4);

    drawVesicleCluster(context, width * 0.72, height * 0.74);

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

// ---------------------------------------------------------------------------
// scene-specific motifs
// ---------------------------------------------------------------------------

function drawHelix(
  context: CanvasRenderingContext2D,
  cx: number,
  topY: number,
  spanHeight: number,
) {
  const steps = 64;
  const strandA: Point[] = [];
  const strandB: Point[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const y = topY + t * spanHeight;
    const angle = (t * spanHeight * Math.PI * 2) / config.helixWavelength;
    strandA.push({ x: cx + Math.sin(angle) * config.helixAmplitude, y });
    strandB.push({ x: cx + Math.sin(angle + Math.PI) * config.helixAmplitude, y });
  }

  // cross-rungs first so the strands glow on top of them
  for (let i = 0; i <= config.helixRungCount; i++) {
    const t = i / config.helixRungCount;
    const idx = Math.round(t * steps);
    const a = strandA[idx];
    const b = strandB[idx];
    drawGlowLine(context, [a, b], config.blue, config.helixWidth * 0.45);
  }

  drawGlowLine(context, strandA, config.pink, config.helixWidth);
  drawGlowLine(context, strandB, config.purple, config.helixWidth);
}

function crossPolygonPoints(cx: number, cy: number, armLength: number, armWidth: number): Point[] {
  const a = armWidth / 2;
  const b = armLength;
  const rel: [number, number][] = [
    [-a, -b], [a, -b], [a, -a], [b, -a],
    [b, a], [a, a], [a, b], [-a, b],
    [-a, a], [-b, a], [-b, -a], [-a, -a],
  ];
  return rel.map(([x, y]) => ({ x: cx + x, y: cy + y }));
}

function drawCross(context: CanvasRenderingContext2D, cx: number, cy: number) {
  const points = crossPolygonPoints(cx, cy, config.crossArmLength, config.crossArmWidth);
  const path = roundedPolygonPath(points, config.crossCornerRadius);
  const b = config.crossArmLength + config.crossCornerRadius;
  const bounds = { x: cx - b, y: cy - b, w: b * 2, h: b * 2 };

  context.save();
  shadeFillPath(context, path, bounds, {
    light: config.purpleLight,
    base: config.purple,
    dark: config.purpleDark,
  }, -Math.PI * 0.75);

  drawSpecularHighlight(
    context,
    cx,
    cy - config.crossArmLength * 0.55,
    config.crossArmWidth * 0.7,
    path,
  );

  context.lineWidth = config.outlineWidth;
  context.strokeStyle = config.outlineColor;
  context.stroke(path);
  context.restore();
}

function drawVesicleCluster(context: CanvasRenderingContext2D, cx: number, cy: number) {
  const rng = Random.createRandom('vesicle-cluster');
  const positions: { x: number; y: number; r: number }[] = [];

  for (let i = 0; i < config.vesicleCount; i++) {
    const angle = (i / config.vesicleCount) * Math.PI * 2 + rng.range(-0.3, 0.3);
    const dist = rng.range(config.vesicleBaseRadius * 0.55, config.vesicleBaseRadius * 1.1);
    const r = config.vesicleBaseRadius * rng.range(0.6, 0.95);
    positions.push({
      x: cx + Math.cos(angle) * dist,
      y: cy + Math.sin(angle) * dist,
      r,
    });
  }

  positions
    .sort((a, b) => a.r - b.r)
    .forEach(({ x, y, r }, i) => {
      const useBlue = i % 2 === 0;
      const path = new Path2D();
      path.arc(x, y, r, 0, Math.PI * 2);
      const bounds = { x: x - r, y: y - r, w: r * 2, h: r * 2 };

      shadeFillPath(context, path, bounds, useBlue
        ? { light: config.blueLight, base: config.blue, dark: config.blueDark }
        : { light: config.purpleLight, base: config.pink, dark: config.purpleDark },
        -Math.PI * 0.7);

      drawSpecularHighlight(context, x - r * 0.35, y - r * 0.35, r * 0.35);

      context.lineWidth = config.outlineWidth;
      context.strokeStyle = config.outlineColor;
      context.stroke(path);
    });
}
