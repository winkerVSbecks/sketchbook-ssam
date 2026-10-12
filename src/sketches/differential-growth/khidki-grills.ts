/**
 * khidki-grills — the grills of ./grills drawn bare, as a contact sheet, to
 * check them against the street photographs before they are filled.
 *
 * Each grill sits in its own cell at its own proportions: frame drawn heavy,
 * bars at one weight, clipped to the frame, its name underneath. One ink on
 * a paper ground (cusphanger). The pane picks one grill to see large.
 */
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Pane } from 'tweakpane';

import { cuspPalette } from '../../colors/cusphanger';
import { GRILLS, type Grill, type Polyline } from './grills';

interface Params {
  /** 'all' for the contact sheet, or one grill's name. */
  show: string;
  /** Bar weight, in grill units (a grill is 1 tall). */
  bar: number;
}

export const sketch = ({ wrap, context, ...props }: SketchProps) => {
  Random.setSeed(Random.getRandomSeed());
  const params: Params = { show: 'all', bar: 0.012 };

  const palette = cuspPalette({ count: 1, ground: 'light' });
  const bg = palette.bg.css;
  const ink = palette.tiers.high[0].css;
  const label = palette.tiers.mid[0].css;

  const inGallery = new URLSearchParams(location.search).has('gallery');
  const pane = new Pane({ title: 'khidki-grills', expanded: !inGallery }) as any;
  pane.element.parentElement.style.zIndex = '1';
  pane
    .addBinding(params, 'show', {
      options: Object.fromEntries([['all', 'all'], ...GRILLS.map((g) => [g.name, g.name])]),
    })
    .on('change', () => props.render());
  pane.addBinding(params, 'bar', { min: 0.003, max: 0.04, step: 0.001 }).on('change', () => props.render());

  if (import.meta.hot) {
    import.meta.hot.dispose(() => {
      pane.dispose();
      wrap.dispose();
    });
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => {
    props.exportFrame();
  });

  const trace = (pts: Polyline, s: number) => {
    pts.forEach(([x, y], i) => (i === 0 ? context.moveTo(x * s, y * s) : context.lineTo(x * s, y * s)));
  };

  /** Draw `g` with its box's top-left at (x, y), `s` px per grill unit. */
  const drawGrill = (g: Grill, x: number, y: number, s: number) => {
    context.save();
    context.translate(x, y);
    const frame = new Path2D();
    g.frame.forEach(([fx, fy], i) => (i === 0 ? frame.moveTo(fx * s, fy * s) : frame.lineTo(fx * s, fy * s)));
    frame.closePath();

    context.save();
    context.clip(frame);
    context.strokeStyle = ink;
    context.lineWidth = params.bar * s;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.beginPath();
    for (const bar of g.bars) trace(bar, s);
    context.stroke();
    context.fillStyle = ink;
    context.beginPath();
    for (const d of g.discs) {
      context.moveTo((d.x + d.r) * s, d.y * s);
      context.arc(d.x * s, d.y * s, d.r * s, 0, Math.PI * 2);
    }
    context.fill();
    context.restore();

    context.strokeStyle = ink;
    context.lineWidth = params.bar * 2.5 * s;
    context.lineJoin = 'miter';
    context.stroke(frame);
    context.restore();
  };

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const shown = params.show === 'all' ? GRILLS : GRILLS.filter((g) => g.name === params.show);
    const cols = shown.length > 1 ? 3 : 1;
    const rows = Math.ceil(shown.length / cols);
    const margin = width * 0.05;
    const cw = (width - margin * 2) / cols;
    const ch = (height - margin * 2) / rows;
    const font = Math.max(10, Math.round(ch * 0.05));

    shown.forEach((g, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      // Fit the grill in its cell, leaving room for the frame and the label.
      const room = { w: cw * 0.8, h: ch * 0.78 };
      const s = Math.min(room.w / g.w, room.h / g.h);
      const x = margin + col * cw + (cw - g.w * s) / 2;
      const y = margin + row * ch + (ch * 0.86 - g.h * s) / 2;
      drawGrill(g, x, y, s);
      context.fillStyle = label;
      context.font = `${font}px ui-monospace, monospace`;
      context.textAlign = 'center';
      context.fillText(g.name, margin + col * cw + cw / 2, margin + row * ch + ch * 0.95);
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  attributes: { colorSpace: 'display-p3' },
  animate: false,
};

ssam(sketch as Sketch<'2d'>, settings);
