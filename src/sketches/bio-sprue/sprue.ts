import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { Pane } from 'tweakpane';
import { createNaleeSystem } from '../nalee/nalee-system';
import { makeDomain } from '../nalee/domain';
import type { Config, Walker, Node } from '../nalee/types';
import { xyToCoords } from '../nalee/utils';
import {
  applyFilmGrain,
  drawGlowLine,
  drawVignetteBackground,
  mixHex,
  rgba,
  type Point as XY,
} from './glow-style';

const PALETTE = ['#ff2d95', '#8b3fd1', '#2e8bff'];

const config = {
  cellSize: 90, // grid pitch in px — coarser means a sparser composition
  lineWidth: 20, // rendered tube width, decoupled from the grid pitch
  walkerCount: 4,
  padding: 0.1,
  flat: true,

  bg: '#0a0a0f',
  vignetteStrength: 0.45,
  grainIntensity: 24,

  frameColor: '#ff2d95',
  frameWidth: 22,
  frameMargin: 60, // gap between the nalee domain edge and the sprue frame — also the gate connector length, so gates always land exactly on the frame
  gateWidth: 10,
  gateStepRatio: 0.7, // fraction of the gate's length that stays full width before stepping down to the thin tip
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

const frameFolder = pane.addFolder({ title: 'Sprue' });
frameFolder.addBinding(config, 'frameColor');
frameFolder.addBinding(config, 'frameWidth', { min: 4, max: 60, step: 1 });
frameFolder.addBinding(config, 'frameMargin', { min: 20, max: 160, step: 2 });
frameFolder.addBinding(config, 'gateWidth', { min: 2, max: 30, step: 1 });
frameFolder.addBinding(config, 'gateStepRatio', { min: 0.2, max: 0.95, step: 0.01 });

// Resolution, node lookup, and the full walker roster for the domain
// currently being walked — kept in module scope so the pathStyle callback
// (which only receives per-walker data) can tell whether a given path node
// sits on the domain's outer edge, find the world position of an arbitrary
// grid cell, and check what any other walker's path is doing at a cell.
let activeResolution: number[] = [0, 0];
let activeDomain: Node[] = [];
let activeWalkers: Walker[] = [];

function isBoundaryNode(x: number, y: number): [number, number][] {
  const dirs: [number, number][] = [];
  if (x === 0) dirs.push([-1, 0]);
  if (x === activeResolution[0]) dirs.push([1, 0]);
  if (y === 0) dirs.push([0, -1]);
  if (y === activeResolution[1]) dirs.push([0, 1]);
  return dirs;
}

function domainWorldPoint(x: number, y: number): XY | undefined {
  const node = activeDomain.find((n) => n.x === x && n.y === y);
  return node ? { x: node.worldX, y: node.worldY } : undefined;
}

function findPathOwner(
  x: number,
  y: number,
): { walker: Walker; index: number } | undefined {
  for (const walker of activeWalkers) {
    const index = walker.path.findIndex((n) => n.x === x && n.y === y);
    if (index !== -1) return { walker, index };
  }
  return undefined;
}

// A cell is a safe sprue target only if it's already a stable part of the
// drawn tube network: a mid-path point (tube on both sides), or an endpoint
// that's already anchored to the frame. An endpoint with no boundary anchor
// is itself just a bare dead-end tip — bridging to it would be one sprue
// connecting to another, and if that other tip never finds its own anchor,
// our end would be the only connected one.
function isStableAnchor(x: number, y: number): boolean {
  const owner = findPathOwner(x, y);
  if (!owner) return false;
  const { walker, index } = owner;
  const isEndpoint = index === 0 || index === walker.path.length - 1;
  return !isEndpoint || isBoundaryNode(x, y).length > 0;
}

function quadPoints(
  from: XY,
  to: XY,
  widthFrom: number,
  widthTo: number,
): XY[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  return [
    { x: from.x + (nx * widthFrom) / 2, y: from.y + (ny * widthFrom) / 2 },
    { x: to.x + (nx * widthTo) / 2, y: to.y + (ny * widthTo) / 2 },
    { x: to.x - (nx * widthTo) / 2, y: to.y - (ny * widthTo) / 2 },
    { x: from.x - (nx * widthFrom) / 2, y: from.y - (ny * widthFrom) / 2 },
  ];
}

function fillQuad(context: CanvasRenderingContext2D, quad: XY[]) {
  context.beginPath();
  context.moveTo(quad[0].x, quad[0].y);
  for (let i = 1; i < quad.length; i++) context.lineTo(quad[i].x, quad[i].y);
  context.closePath();
  context.fill();
}

// A half-disc bulging outward from `center` in `dir`, its flat diameter
// edge sitting exactly on `center` — extends a hard rectangular shaft end
// into a rounded cap without disturbing the other end of that shaft.
function fillRoundCap(
  context: CanvasRenderingContext2D,
  center: XY,
  dir: XY,
  radius: number,
) {
  const angle = Math.atan2(dir.y, dir.x);
  context.beginPath();
  context.arc(center.x, center.y, radius, angle - Math.PI / 2, angle + Math.PI / 2);
  context.closePath();
  context.fill();
}

// A gate: full width for most of its run to the frame rail, then an abrupt
// step down to a thin shoulder right at the tube — a stamped connector
// pinch-point, not a smooth cone, so it reads as molded rather than grown.
// The frame end alone gets a rounded cap so it blends into the frame rail
// instead of butting against it with a hard edge; the tube end keeps its
// flat step untouched.
function drawGateNub(
  context: CanvasRenderingContext2D,
  wideEnd: XY,
  narrowEnd: XY,
  color: string,
  width: number,
) {
  const tipWidth = Math.max(width * 0.22, 1.5);
  const stepPoint: XY = {
    x: wideEnd.x + (narrowEnd.x - wideEnd.x) * config.gateStepRatio,
    y: wideEnd.y + (narrowEnd.y - wideEnd.y) * config.gateStepRatio,
  };
  const capDx = wideEnd.x - stepPoint.x;
  const capDy = wideEnd.y - stepPoint.y;
  const capLen = Math.hypot(capDx, capDy) || 1;
  const capDir: XY = { x: capDx / capLen, y: capDy / capLen };

  // Stop the shaft at the frame's near face rather than its centerline, and
  // flare wider than the shaft there — a shallow, generous dome that melts
  // into the rail instead of a slim cap poking deep into its body.
  const frameHalfWidth = config.frameWidth / 2;
  const frameContact: XY = {
    x: wideEnd.x - capDir.x * frameHalfWidth,
    y: wideEnd.y - capDir.y * frameHalfWidth,
  };

  const drawShaft = (fillStyle: string, mul: number) => {
    context.fillStyle = fillStyle;
    fillQuad(context, quadPoints(frameContact, stepPoint, width * mul, width * mul));
    fillQuad(context, quadPoints(stepPoint, narrowEnd, tipWidth * mul, tipWidth * mul));
  };
  const drawCap = (fillStyle: string, mul: number) => {
    context.fillStyle = fillStyle;
    fillRoundCap(context, frameContact, capDir, width * mul);
  };

  context.save();

  // A little soft glow to sit in the scene, but not enough blur to smear
  // the step into a gradient — that's what read as a taper before.
  context.globalCompositeOperation = 'lighter';
  context.filter = 'blur(3px)';
  drawShaft(rgba(color, 0.25), 1.25);
  drawCap(rgba(color, 0.25), 1.25);

  context.globalCompositeOperation = 'source-over';
  const bands: [number, string][] = [
    [1.0, mixHex(color, '#000000', 0.55)],
    [0.72, color],
    [0.45, mixHex(color, '#ffffff', 0.45)],
  ];
  for (const [widthMul, bandColor] of bands) {
    context.filter = 'none';
    drawShaft(bandColor, widthMul);
    // The cap's edge sits on the frame's own painted surface, so it's
    // softened just enough to melt its color into the frame rather than
    // cutting a crisp ring across it, while still leaving a faint seam
    // where the two parts meet — the shaft above stays crisp, untouched.
    context.filter = 'blur(3px)';
    drawCap(bandColor, widthMul);
  }

  context.restore();
}

// A stub linking two nalee tubes: thin at both ends, stepping up to full
// width for the middle stretch — a double-sided version of the gate nub,
// since neither end is a frame rail to merge into.
function drawStubNub(
  context: CanvasRenderingContext2D,
  endA: XY,
  endB: XY,
  color: string,
  width: number,
) {
  const tipWidth = Math.max(width * 0.22, 1.5);
  const tipRatio = (1 - config.gateStepRatio) / 2;
  const stepA: XY = {
    x: endA.x + (endB.x - endA.x) * tipRatio,
    y: endA.y + (endB.y - endA.y) * tipRatio,
  };
  const stepB: XY = {
    x: endB.x + (endA.x - endB.x) * tipRatio,
    y: endB.y + (endA.y - endB.y) * tipRatio,
  };

  const drawStep = (fillStyle: string, mul: number) => {
    context.fillStyle = fillStyle;
    fillQuad(context, quadPoints(endA, stepA, tipWidth * mul, tipWidth * mul));
    fillQuad(context, quadPoints(stepA, stepB, width * mul, width * mul));
    fillQuad(context, quadPoints(stepB, endB, tipWidth * mul, tipWidth * mul));
  };

  context.save();

  context.globalCompositeOperation = 'lighter';
  context.filter = 'blur(3px)';
  drawStep(rgba(color, 0.25), 1.25);

  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  const bands: [number, string][] = [
    [1.0, mixHex(color, '#000000', 0.55)],
    [0.72, color],
    [0.45, mixHex(color, '#ffffff', 0.45)],
  ];
  for (const [widthMul, bandColor] of bands) {
    drawStep(bandColor, widthMul);
  }

  context.restore();
}

// Bridges a nalee tube into the sprue frame with a short stepped connector,
// drawn only where the walker's path first touches the domain edge (not on
// every boundary-hugging step), so gates read as discrete attachment points.
// The nub starts at the tube's surface, not its centerline, so it never
// overlaps the object it's attaching to.
function drawSprueGates(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
) {
  const surfaceOffset = walker.size / 2;

  walker.path.forEach((node, i) => {
    const dirs = isBoundaryNode(node.x, node.y);
    if (dirs.length === 0) return;

    const prev = walker.path[i - 1];
    const wasBoundary = prev ? isBoundaryNode(prev.x, prev.y).length > 0 : false;
    if (wasBoundary) return;

    const p = pts[i];
    if (!p) return;

    dirs.forEach(([dx, dy]) => {
      const narrowEnd = {
        x: p[0] + dx * surfaceOffset,
        y: p[1] + dy * surfaceOffset,
      };
      const wideEnd = {
        x: p[0] + dx * config.frameMargin,
        y: p[1] + dy * config.frameMargin,
      };
      drawGateNub(context, wideEnd, narrowEnd, config.frameColor, config.gateWidth);
    });
  });
}

const CARDINAL_DIRS: [number, number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// A dead-end tip that dies mid-grid never reaches the frame, so it has
// nothing to bond to. Bridge to a cardinal neighbor that's a stable, already-
// connected part of the tube network — never another bare dead-end tip, so a
// sprue never ends up bonded to another sprue with nothing solid underneath.
// Prefer a different walker's tube over this walker's own; if no stable
// neighbor exists at all, return undefined rather than draw a dangling stub.
function pickStubTarget(
  walker: Walker,
  tip: Node,
  own: [number, number],
): [number, number] | undefined {
  const candidates = CARDINAL_DIRS.filter(
    ([dx, dy]) =>
      (dx !== own[0] || dy !== own[1]) &&
      isStableAnchor(tip.x + dx, tip.y + dy),
  );
  if (candidates.length === 0) return undefined;

  const external = candidates.find(
    ([dx, dy]) =>
      !walker.path.some((n) => n.x === tip.x + dx && n.y === tip.y + dy),
  );
  return external ?? candidates[0];
}

// Bridges a path endpoint that terminates mid-grid (never touches the domain
// boundary, so drawSprueGates never fires for it) sideways to the nearest
// neighboring tube, using the same stepped-nub language as a frame gate.
function drawDeadEndStubs(
  context: CanvasRenderingContext2D,
  walker: Walker,
  pts: Point[],
) {
  if (walker.path.length < 2) return;
  const surfaceOffset = walker.size / 2;

  [0, walker.path.length - 1].forEach((i) => {
    const tip = walker.path[i];
    if (isBoundaryNode(tip.x, tip.y).length > 0) return;

    const neighbor = walker.path[i === 0 ? 1 : i - 1];
    const own: [number, number] = [neighbor.x - tip.x, neighbor.y - tip.y];
    const dir = pickStubTarget(walker, tip, own);
    if (!dir) return;
    const [dx, dy] = dir;

    const target = domainWorldPoint(tip.x + dx, tip.y + dy);
    const p = pts[i];
    if (!target || !p) return;

    const ownSurface = {
      x: p[0] + dx * surfaceOffset,
      y: p[1] + dy * surfaceOffset,
    };
    const neighborSurface = {
      x: target.x - dx * surfaceOffset,
      y: target.y - dy * surfaceOffset,
    };
    drawStubNub(context, ownSurface, neighborSurface, config.frameColor, config.gateWidth);
  });
}

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
  drawSprueGates(context, walker, pts);
  drawDeadEndStubs(context, walker, pts);
}

// Sprue frame sits `frameMargin` outside the domain's world-space bounds —
// the same distance gates travel, so every gate lands exactly on the rail.
function drawSprueFrame(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
) {
  const pad = width * config.padding;
  const left = pad - config.frameMargin;
  const top = pad - config.frameMargin;
  const right = width - pad + config.frameMargin;
  const bottom = height - pad + config.frameMargin;

  drawGlowLine(
    context,
    [
      { x: left, y: top },
      { x: right, y: top },
      { x: right, y: bottom },
      { x: left, y: bottom },
      { x: left, y: top },
    ],
    config.frameColor,
    config.frameWidth,
  );
}

function buildNaleeSystem(width: number, height: number) {
  const resolution = [
    Math.floor(width / config.cellSize),
    Math.floor(height / config.cellSize),
  ];
  activeResolution = resolution;

  const naleeConfig = {
    resolution,
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
  activeDomain = domain;
  const naleeSystem = createNaleeSystem(
    domain,
    naleeConfig,
    domainToWorld,
    PALETTE,
    config.bg,
  );
  activeWalkers = naleeSystem.walkers;
  return naleeSystem;
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
    drawSprueFrame(context, width, height);
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
