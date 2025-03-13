import Random from 'canvas-sketch-util/random';
import { Domain } from './types';

/**
 * Generates a convex polygon from a set of regions.
 * The polygon is generated by finding a random location within each region
 *  and sorting their vertices in clockwise order. If the resulting polygon
 * is not convex, the process is repeated.
 */
export function generatePolygon(
  regions: Domain[],
  attempts: number = 0
): Point[] {
  if (attempts > 100) {
    throw new Error('Failed to generate a convex polygon');
  }

  let polygon: Point[] = regions.map((r) => [
    Random.range(r.x, r.x + r.width),
    Random.range(r.y, r.y + r.height),
  ]);

  // Calculate centroid
  const centroid = polygon
    .reduce((acc, point) => [acc[0] + point[0], acc[1] + point[1]], [0, 0])
    .map((coord) => coord / polygon.length);

  // Sort points clockwise
  polygon = polygon.sort((a, b) => {
    const angleA = Math.atan2(a[1] - centroid[1], a[0] - centroid[0]);
    const angleB = Math.atan2(b[1] - centroid[1], b[0] - centroid[0]);
    return angleA - angleB; // Clockwise sorting
  });

  return isConvexPolygon(polygon)
    ? polygon
    : generatePolygon(regions, attempts + 1);
}

/**
 * Checks if a polygon is convex.
 * A polygon is convex if all interior angles are less than 180 degrees,
 * which can be determined by checking if all cross products of consecutive edges have the same sign.
 */
function isConvexPolygon(vertices: Point[]): boolean {
  // A polygon needs at least 3 vertices
  if (vertices.length < 3) {
    return false;
  }

  // For a convex polygon, all cross products of consecutive edges should have the same sign
  let sign = 0;

  const n = vertices.length;

  for (let i = 0; i < n; i++) {
    const current = vertices[i];
    const next = vertices[(i + 1) % n];
    const afterNext = vertices[(i + 2) % n];

    // Calculate vectors for two consecutive edges
    const edge1 = [next[0] - current[0], next[1] - current[1]];
    const edge2 = [afterNext[0] - next[0], afterNext[1] - next[1]];

    // Calculate cross product (in 2D, it's a scalar: edge1.x * edge2.y - edge1.y * edge2.x)
    const crossProduct = edge1[0] * edge2[1] - edge1[1] * edge2[0];

    // On the first valid cross product, store its sign
    if (crossProduct !== 0) {
      if (sign === 0) {
        sign = Math.sign(crossProduct);
      }
      // If we find a cross product with different sign, the polygon is not convex
      else if (sign * crossProduct < 0) {
        return false;
      }
    }
  }

  return true;
}
