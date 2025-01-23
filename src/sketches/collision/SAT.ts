import { drawPath } from '@daeinc/draw';
import { Vector } from 'p5';

export interface Extent {
  min: number;
  max: number;
}

export interface Polygon {
  location: Vector;
  radius?: number;
  vertices: Vector[];
  edges: Vector[];
  normals: Vector[];
  velocity: Vector;
  state: 'alive' | 'dead' | 'other';
  color: string;
}

export function polygon(
  location: Vector,
  radius: number,
  sides: number,
  velocity?: Vector,
  color: string = '#fff',
  state?: 'alive' | 'dead' | 'other'
): Polygon {
  const vertices = Array.from({ length: sides }, (_, idx) => {
    const angle = ((2 * Math.PI) / sides) * idx;
    return new Vector(
      location.x + radius * Math.cos(angle),
      location.y + radius * Math.sin(angle)
    );
  });

  const edges = vertices.map((v, idx, arr) => {
    const next = arr[(idx + 1) % arr.length];
    return next.copy().sub(v);
  });

  return {
    color,
    state: state || 'alive',
    location,
    radius,
    velocity: velocity || Vector.random2D().mult(2),
    vertices,
    edges,
    normals: edges.map((e) => new Vector(-e.y, e.x).normalize()),
  };
}

export function updatePolygon(poly: Polygon) {
  // poly.location.add(poly.velocity);
  poly.vertices.forEach((v) => v.add(poly.velocity));

  // Apply friction
  // if (poly.velocity.mag() > 1) {
  //   poly.velocity.mult(0.9);
  // }

  // // clamp velocity
  // if (poly.velocity.mag() > 5) {
  //   poly.velocity.normalize().mult(5);
  // }

  poly.velocity.normalize().mult(2);
}

export function movePolygon(poly: Polygon, translation: Vector) {
  // poly.location.add(translation);
  poly.vertices.forEach((v) => v.add(translation));
}

export function drawPolygon(
  context: CanvasRenderingContext2D,
  poly: Polygon,
  type: 'fill' | 'stroke' = 'fill'
) {
  if (type === 'fill') {
    context.fillStyle = poly.color;
  } else {
    context.strokeStyle = poly.color;
    context.lineWidth = 2;
  }

  context.beginPath();
  drawPath(
    context,
    poly.vertices.map((v) => v.array()),
    true
  );

  if (type === 'fill') {
    context.fill();
  } else {
    context.stroke();
  }

  // // Draw normals
  // context.strokeStyle = 'red';
  // poly.normals.forEach((n, idx) => {
  //   const vertex = poly.vertices[idx];
  //   context.beginPath();
  //   context.moveTo(vertex.x, vertex.y);
  //   context.lineTo(vertex.x + n.x * 20, vertex.y + n.y * 20);
  //   context.stroke();
  // });
}

export function project(
  p: Polygon,
  axis: Vector,
  center: Vector = new Vector(0, 0)
): Extent {
  const dots = p.vertices.map((v) => Vector.dot(v.copy().sub(center), axis));

  const min = Math.min(...dots);
  const max = Math.max(...dots);
  return { min, max };
}

// Returns the overlap between two extents or false if there is no overlap
export function overlap(p1: Extent, p2: Extent): number | false {
  if (Math.max(p1.min, p2.min) < Math.min(p1.max, p2.max)) {
    return Math.min(
      p1.max - p1.min,
      p1.max - p2.min,
      p2.max - p1.min,
      p2.max - p2.min
    );
  }
  return false;
}

export function calculateMtv(poly1: Polygon, poly2: Polygon): Vector | null {
  let smallestOverlap = Infinity;
  let smallestAxis: Vector | null = null;

  const axes = poly1.normals.concat(poly2.normals);

  // Test each axis
  for (const axis of axes) {
    const p1 = project(poly1, axis);
    const p2 = project(poly2, axis);

    const overlapAmount = overlap(p1, p2);

    // If no overlap on any axis, we have no collision
    if (overlapAmount === false) {
      return null;
    }

    // Keep track of smallest overlap
    if (overlapAmount < smallestOverlap) {
      smallestOverlap = overlapAmount;
      smallestAxis = axis;
    }
  }

  // No MTV if we didn't find an axis
  if (!smallestAxis) return null;

  // To determine direction, project centers to determine push direction
  const proj1 = Vector.dot(poly1.vertices[0] /* .location */, smallestAxis);
  const proj2 = Vector.dot(poly2.vertices[0] /* .location */, smallestAxis);

  // If proj2 > proj1, we need to push in positive axis direction
  const direction = proj2 > proj1 ? 1 : -1;

  // Return MTV as a vector
  return new Vector(
    smallestAxis.x * smallestOverlap * direction,
    smallestAxis.y * smallestOverlap * direction
  );
}

export function resolveCollision(
  poly1: Polygon,
  poly2: Polygon,
  restitution: number = 0.5,
  onCollision?: (poly1: Polygon, poly2: Polygon) => void
): void {
  const translationVector = calculateMtv(poly1, poly2)?.normalize();

  if (!translationVector) return; // No collision

  // Calculate relative velocity
  const relativeVelocity = poly2.velocity.copy().sub(poly1.velocity);

  // Calculate velocity along normal
  const velAlongNormal = Vector.dot(relativeVelocity, translationVector);

  // Don't resolve if objects are moving apart
  if (velAlongNormal > 0) return;

  // Calculate impulse scalar
  const j = -(1 + restitution) * velAlongNormal;

  // Apply impulse
  const impulse = {
    x: translationVector.x * j,
    y: translationVector.y * j,
  };

  poly1.velocity.x -= impulse.x;
  poly1.velocity.y -= impulse.y;
  poly2.velocity.x += impulse.x;
  poly2.velocity.y += impulse.y;

  if (onCollision) {
    onCollision(poly1, poly2);
  }

  // movePolygon(poly1, translationVector);
  // movePolygon(poly2, translationVector);
}

export function checkScreenBounds(
  poly: Polygon,
  width: number,
  height: number
) {
  // Find polygon bounds
  const bounds = {
    min: { x: Infinity, y: Infinity },
    max: { x: -Infinity, y: -Infinity },
  };

  for (const vertex of poly.vertices) {
    bounds.min.x = Math.min(bounds.min.x, vertex.x);
    bounds.min.y = Math.min(bounds.min.y, vertex.y);
    bounds.max.x = Math.max(bounds.max.x, vertex.x);
    bounds.max.y = Math.max(bounds.max.y, vertex.y);
  }

  // Check and resolve collisions with screen edges
  if (bounds.min.x < 0) {
    // Hit left wall
    movePolygon(poly, new Vector(-bounds.min.x, 0));
    poly.velocity.x = -poly.velocity.x;
  }
  if (bounds.max.x > width) {
    // Hit right wall
    movePolygon(poly, new Vector(width - bounds.max.x, 0));
    poly.velocity.x = -poly.velocity.x;
  }
  if (bounds.min.y < 0) {
    // Hit ceiling
    movePolygon(poly, new Vector(0, -bounds.min.y));
    poly.velocity.y = -poly.velocity.y;
  }
  if (bounds.max.y > height) {
    // Hit floor
    movePolygon(poly, new Vector(0, height - bounds.max.y));
    poly.velocity.y = -poly.velocity.y;
  }
}
