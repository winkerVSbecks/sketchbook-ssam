/**
 * Napoleon's theorem geometry, shared by the Napoleon sketch and the flatland
 * ports. Pure functions in world units — no side effects, no ssam/ui imports,
 * so it can be imported without executing a sketch.
 */

export type Pt2 = [number, number];
export type Tri = [Pt2, Pt2, Pt2];

export const magnitude = ([x, y]: Pt2) => Math.hypot(x, y);
export const dist = ([ux, uy]: Pt2, [vx, vy]: Pt2) => Math.hypot(ux - vx, uy - vy);
const avg = (t0: number, t1: number, t2: number) => (t0 + t1 + t2) / 3;
export const sign = ([p1x, p1y]: Pt2, [p2x, p2y]: Pt2, [p3x, p3y]: Pt2) =>
  (p1x - p3x) * (p2y - p3y) - (p2x - p3x) * (p1y - p3y);
export const triangleHeight = (u: Pt2, v: Pt2) => (Math.sqrt(3) * dist(u, v)) / 2;

export function circumCenter([ax, ay]: Pt2, [bx, by]: Pt2, [cx, cy]: Pt2): Pt2 {
  const d = (ax - cx) * (by - cy) - (bx - cx) * (ay - cy);
  const x =
    ((((ax - cx) * (ax + cx) + (ay - cy) * (ay + cy)) / 2) * (by - cy) -
      (((bx - cx) * (bx + cx) + (by - cy) * (by + cy)) / 2) * (ay - cy)) /
    d;
  const y =
    ((((bx - cx) * (bx + cx) + (by - cy) * (by + cy)) / 2) * (ax - cx) -
      (((ax - cx) * (ax + cx) + (ay - cy) * (ay + cy)) / 2) * (bx - cx)) /
    d;
  return [x, y];
}

/**
 * Apex of the equilateral triangle on side u–v, on the far side from the
 * circumcentre (the original's construction). When the triangle has a right
 * angle opposite this side the circumcentre sits exactly on the midpoint and
 * that construction degenerates (0/0); given the opposite vertex `opp`, the apex
 * is then erected along the side's normal instead — away from `opp` for the
 * winding in which the other two sides erect outward (so all three agree and
 * the centroid triangle stays equilateral), towards it for the other winding.
 */
export function apex([ux, uy]: Pt2, [vx, vy]: Pt2, [ccx, ccy]: Pt2, opp?: Pt2): Pt2 {
  const [mpx, mpy] = [(vx + ux) / 2, (vy + uy) / 2];
  const h = triangleHeight([ux, uy], [vx, vy]);
  const dir = sign([ccx, ccy], [ux, uy], [vx, vy]) > 0 ? 1 : -1;
  const ccMp: Pt2 = [(mpx - ccx) * dir, (mpy - ccy) * dir];
  const m = magnitude(ccMp);
  if (m < 1e-9 && opp) {
    // Unit normal of u–v, oriented relative to the opposite vertex by the same
    // winding test the circumcentre branch uses (cc and opp share a side here)
    const len = dist([ux, uy], [vx, vy]);
    let [nx, ny] = [-(vy - uy) / len, (vx - ux) / len];
    const away = sign(opp, [ux, uy], [vx, vy]) > 0;
    const towardsOpp = nx * (opp[0] - mpx) + ny * (opp[1] - mpy) > 0;
    if (towardsOpp === away) [nx, ny] = [-nx, -ny];
    return [mpx + nx * h, mpy + ny * h];
  }
  const [nx, ny] = ccMp.map((s) => (s * (h + dir * m)) / m) as Pt2;
  return [nx + ccx, ny + ccy];
}

export const eqTriangle = (u: Pt2, v: Pt2, cc: Pt2, opp?: Pt2): Tri => [u, apex(u, v, cc, opp), v];
export const centroid = ([[ux, uy], [vx, vy], [wx, wy]]: Tri): Pt2 => [
  avg(ux, vx, wx),
  avg(uy, vy, wy),
];

export function getState(u: Pt2, v: Pt2, w: Pt2) {
  const cc = circumCenter(u, v, w);
  const a = eqTriangle(u, v, cc, w);
  const b = eqTriangle(v, w, cc, u);
  const c = eqTriangle(w, u, cc, v);
  const triangle: Tri = [u, v, w];
  const centroidTriangle: Tri = [centroid(a), centroid(b), centroid(c)];
  return { triangle, a, b, c, centroidTriangle };
}
