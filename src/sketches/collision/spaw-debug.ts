import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { drawPath } from '@daeinc/draw';
import { Vector } from 'p5';

interface Extent {
  min: number;
  max: number;
}

interface Polygon {
  location: Vector;
  vertices: Vector[];
  edges: Vector[];
  normals: Vector[];
  velocity: Vector;
}

export const sketch = async ({ wrap, width, height, context }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const polygons: Polygon[] = [];
  for (let index = 0; index < 12; index++) {
    const location = new Vector(
      Random.range(0, width),
      Random.range(0, height)
    );

    const p = polygon(
      location,
      100,
      Random.rangeFloor(3, 8),
      new Vector(width / 2, height / 2).sub(location).normalize().mult(2)
    );

    let attempts = 0;
    const MAX_ATTEMPTS = 20;

    while (attempts < MAX_ATTEMPTS) {
      let hasOverlap = false;
      checkScreenBounds(p, width, height);

      // Check against existing polygons
      for (const existingPoly of polygons) {
        const translationVector = calculateMtv(existingPoly, p);
        if (translationVector) {
          hasOverlap = true;
          movePolygon(p, translationVector);
          p.color = 'red';
        }
      }

      if (!hasOverlap) {
        polygons.push(p);
        break;
      }

      attempts++;
    }
  }

  // window.onclick = () => {
  //   MAX_ATTEMPTS++;
  // };
  context.fillStyle = '#000';
  context.fillRect(0, 0, width, height);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);

    polygons.forEach((p) => {
      updatePolygon(p);
    });

    polygons.forEach((p, i) => {
      // checkScreenBounds(p, width, height);

      for (let j = i + 1; j < polygons.length; j++) {
        const poly2 = polygons[j];
        resolveCollision(p, poly2);
      }
    });

    polygons.forEach((p) => {
      drawPolygon(context, p);
    });
  };
};

function polygon(
  location: Vector,
  radius: number,
  sides: number,
  velocity?: Vector
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
    location,
    velocity: velocity || Vector.random2D(),
    vertices,
    edges,
    normals: edges.map((e) => new Vector(-e.y, e.x).normalize()),
  };
}

function updatePolygon(poly: Polygon) {
  poly.location.add(poly.velocity);
  poly.vertices.forEach((v) => v.add(poly.velocity));

  poly.velocity.normalize();
}

function movePolygon(poly: Polygon, translation: Vector) {
  poly.location.add(translation);
  poly.vertices.forEach((v) => v.add(translation));
}

function drawPolygon(
  context: CanvasRenderingContext2D,
  poly: Polygon,
  color: string = '#fff'
) {
  context.strokeStyle = poly.color || color;
  context.lineWidth = 2;
  context.beginPath();
  drawPath(
    context,
    poly.vertices.map((v) => v.array()),
    true
  );
  context.stroke();
}

function project(
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
function overlap(p1: Extent, p2: Extent): number | false {
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

function calculateMtv(poly1: Polygon, poly2: Polygon): Vector | null {
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
  const proj1 = Vector.dot(poly1.location, smallestAxis);
  const proj2 = Vector.dot(poly2.location, smallestAxis);

  // If proj2 > proj1, we need to push in positive axis direction
  const direction = proj2 > proj1 ? 1 : -1;

  // Return MTV as a vector
  return new Vector(
    smallestAxis.x * smallestOverlap * direction,
    smallestAxis.y * smallestOverlap * direction
  );
}

function resolveCollision(
  poly1: Polygon,
  poly2: Polygon,
  restitution: number = 0.5
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

  // movePolygon(poly1, translationVector);
  // movePolygon(poly2, translationVector);
}

function checkScreenBounds(poly: Polygon, width: number, height: number) {
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

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: false,
  duration: 1_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
