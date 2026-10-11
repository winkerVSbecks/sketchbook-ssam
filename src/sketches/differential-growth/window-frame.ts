/**
 * Window frames that clip a sketch's field, for the `jali` variant.
 *
 *   - arch — the jali shell of ../jali/truchet: a rectangle under a pointed
 *            Bézier arch, a thick front edge and the whole silhouette
 *            extruded to the right behind it;
 *   - rect — a deep rectangular frame seen from the lower left: the front
 *            ring, its top and right faces extruded up and to the right, and
 *            inside the opening the left and bottom reveals of the tunnel.
 *
 * `aperture` is what the field shows through — the opening minus the reveals
 * — and `draw` lays the frame over it. Everything is in canvas px, laid out
 * from the canvas size so the window keeps its proportions at any resolution.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */
export type WindowStyle = 'arch' | 'rect';
export const WINDOW_STYLES: WindowStyle[] = ['arch', 'rect'];

export interface FrameColors {
  /** The face looking at us. */
  front: string;
  /** The top face, and the bottom reveal inside the opening. */
  top: string;
  /** The right face, and the left reveal inside the opening. */
  side: string;
}

export interface WindowFrame {
  /** The region the field is clipped to. */
  aperture: Path2D;
  /** Bounding box of the aperture, to fit the field to. */
  bounds: { x: number; y: number; w: number; h: number };
  /** Whatever sits behind the field (the arch's depth); the caller then
   * repaints the ground inside the aperture before drawing the field. */
  back?(context: CanvasRenderingContext2D, colors: FrameColors): void;
  /** The frame laid over the field. */
  draw(context: CanvasRenderingContext2D, colors: FrameColors): void;
}

const poly = (pts: [number, number][]): Path2D => {
  const p = new Path2D();
  pts.forEach(([x, y], i) => (i === 0 ? p.moveTo(x, y) : p.lineTo(x, y)));
  p.closePath();
  return p;
};

/**
 * The rectangular frame, proportioned after the reference: ≈55% of the width
 * by ≈69% of the height, a front ring ≈5% thick and ≈2.4% of depth.
 */
function rectFrame(width: number, height: number): WindowFrame {
  const fw = width * 0.555;
  const fh = height * 0.6925;
  const t = width * 0.0485;
  const d = width * 0.024;
  // Centre the frame together with its extrusion.
  const x0 = (width - fw - d) / 2;
  const y0 = (height - fh + d) / 2;
  const [ix, iy, iw, ih] = [x0 + t, y0 + t, fw - 2 * t, fh - 2 * t];

  // Through the opening we see the back of the tunnel, shifted up and right
  // by the depth: the left and bottom walls cover the rest.
  const aperture = poly([
    [ix + d, iy],
    [ix + iw, iy],
    [ix + iw, iy + ih - d],
    [ix + d, iy + ih - d],
  ]);

  return {
    aperture,
    bounds: { x: ix + d, y: iy, w: iw - d, h: ih - d },
    draw(context, c) {
      context.fillStyle = c.side;
      context.fill(
        poly([
          [ix, iy],
          [ix + d, iy],
          [ix + d, iy + ih - d],
          [ix, iy + ih],
        ]),
      );
      context.fill(
        poly([
          [x0 + fw, y0],
          [x0 + fw + d, y0 - d],
          [x0 + fw + d, y0 + fh - d],
          [x0 + fw, y0 + fh],
        ]),
      );
      context.fillStyle = c.top;
      context.fill(
        poly([
          [ix, iy + ih],
          [ix + d, iy + ih - d],
          [ix + iw, iy + ih - d],
          [ix + iw, iy + ih],
        ]),
      );
      context.fill(
        poly([
          [x0, y0],
          [x0 + d, y0 - d],
          [x0 + fw + d, y0 - d],
          [x0 + fw, y0],
        ]),
      );
      const ring = new Path2D();
      ring.rect(x0, y0, fw, fh);
      ring.rect(ix, iy, iw, ih);
      context.fillStyle = c.front;
      context.fill(ring, 'evenodd');
    },
  };
}

/** The arched jali shell of ../jali/truchet, with a thick front edge. */
function archFrame(width: number, height: number): WindowFrame {
  const off = width * 0.046;
  const t = width * 0.024;
  // Shifted left by half the extrusion, as truchet does, to sit centred.
  const sx = -off / 2;
  const x1 = width * 0.25 + sx;
  const x2 = width * 0.75 + sx;
  const x3 = width * 0.5 + sx;
  const y1 = height * 0.35;
  const y2 = height * 0.9;
  const y3 = height * 0.1;

  const aperture = new Path2D();
  aperture.moveTo(x1, y2);
  aperture.lineTo(x2, y2);
  aperture.lineTo(x2, y1);
  aperture.bezierCurveTo(x2, y1 * 0.8, x2, y1 * 0.8, x3, y3);
  aperture.bezierCurveTo(x1, y1 * 0.8, x1, y1 * 0.8, x1, y1);
  aperture.closePath();

  // The front edge is the band within `t` outside the aperture: a stroke of
  // width 2t along the aperture, clipped to its outside. Miter joins keep the
  // apex sharp and the foot square.
  const silhouette = (context: CanvasRenderingContext2D) => {
    context.lineWidth = 2 * t;
    context.lineJoin = 'miter';
    context.fill(aperture);
    context.stroke(aperture);
  };

  return {
    aperture,
    bounds: { x: x1, y: y3, w: x2 - x1, h: y2 - y3 },
    back(context, c) {
      // The depth is the frame's whole silhouette slid right a pixel at a
      // time (truchet's extrusion direction), so it meets the front edge
      // exactly along the arch and the foot.
      context.save();
      context.fillStyle = c.side;
      context.strokeStyle = c.side;
      const steps = Math.max(1, Math.ceil(off));
      for (let k = steps; k >= 1; k--) {
        context.save();
        context.translate((off * k) / steps, 0);
        silhouette(context);
        context.restore();
      }
      context.restore();
    },
    draw(context, c) {
      context.save();
      const outside = new Path2D();
      outside.rect(0, 0, width, height);
      outside.addPath(aperture);
      context.clip(outside, 'evenodd');
      context.strokeStyle = c.front;
      context.lineWidth = 2 * t;
      context.lineJoin = 'miter';
      context.stroke(aperture);
      context.restore();
    },
  };
}

export function windowFrame(style: WindowStyle, width: number, height: number): WindowFrame {
  return style === 'arch' ? archFrame(width, height) : rectFrame(width, height);
}
