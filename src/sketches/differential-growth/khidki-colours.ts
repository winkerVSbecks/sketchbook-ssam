/**
 * The colour system of the `khidki` sketches, from cusphanger: a ground
 * (paper or slate) and four hues off the ring in order from the base.
 *
 *   - fills  — growth in hue 0, walks in hue 1, both at one quiet contrast
 *              against the ground (`fill`, 1.8:1 by default), so neither
 *              outranks the other;
 *   - bars   — the highest contrast in the picture: the far end of hue 2's
 *              ramp from the ground, near white on slate, near black on paper;
 *   - knots  — circles in hue 3, diamonds in hue 0, at a mid tone (`knot`)
 *              between the two: by default bars stand ≥2.8:1 over the knots
 *              and the knots ≥3:1 over the fills, on any palette;
 *   - frame  — one hue (2, the bars' own) in three shades off its ramp: the
 *              front at `frame` contrast, the top a step lighter and the side
 *              a step darker, as if lit from above left.
 *
 * Pure maths, no canvas: runs in node. Seed `canvas-sketch-util/random`
 * before calling, as for cuspPalette.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */
import { formatCss, wcagContrast } from 'culori';
import type { OklchColor } from 'cusphanger';

import { cuspPalette } from '../../colors/cusphanger';

export interface KhidkiColourOptions {
  hue: number;
  /** Degrees between ring hues. */
  angle: number;
  saturation: number;
  /** Slate ground instead of paper. */
  slate: boolean;
  /** WCAG contrast of both fills against the ground. */
  fill: number;
  /** WCAG contrast of the circles and diamonds against the ground. */
  knot: number;
  /** WCAG contrast of the frame's front against the ground. */
  frame: number;
}

export interface KhidkiColours {
  bg: string;
  growth: string;
  walks: string;
  bars: string;
  circles: string;
  diamonds: string;
  hairline: string;
  frame: { front: string; top: string; side: string };
}

/** Lightness step between the frame's front and its top or side. */
const SHADE = 0.12;

const css = (c: OklchColor) => formatCss(c);

export function khidkiColours(o: KhidkiColourOptions): KhidkiColours {
  const palette = cuspPalette({
    hue: o.hue,
    count: 4,
    angle: o.angle,
    shuffle: false,
    saturation: o.saturation,
    ground: o.slate ? 'dark' : 'light',
    targets: { high: o.knot, mid: o.fill, low: 1.4 },
  });
  const { high, mid, low } = palette.tiers;
  const order = palette.ring.slice(0, palette.hues.length).map((h) => palette.hues.indexOf(h));
  const at = (j: number) => order[j % order.length];
  const bg = palette.bg.color;

  // The frame's hue, as its full ramp from dark to light.
  const ramp = [...palette.ramps[at(2)]].sort((a, b) => a.l - b.l);
  // Bars: whichever end of the ramp stands furthest from the ground.
  const bars = ramp.reduce((best, c) => (wcagContrast(c, bg) > wcagContrast(best, bg) ? c : best));
  // Frame: the front by contrast, then the samples nearest a step lighter
  // (top) and a step darker (side).
  const front = ramp.reduce((best, c) =>
    Math.abs(wcagContrast(c, bg) - o.frame) < Math.abs(wcagContrast(best, bg) - o.frame) ? c : best,
  );
  const near = (l: number) => ramp.reduce((best, c) => (Math.abs(c.l - l) < Math.abs(best.l - l) ? c : best));

  return {
    bg: palette.bg.css,
    growth: mid[at(0)].css,
    walks: mid[at(1)].css,
    bars: css(bars),
    circles: high[at(3)].css,
    diamonds: high[at(0)].css,
    hairline: low[at(0)].css,
    frame: { front: css(front), top: css(near(front.l + SHADE)), side: css(near(front.l - SHADE)) },
  };
}
