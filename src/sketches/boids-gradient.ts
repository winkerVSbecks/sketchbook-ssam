import Random from 'canvas-sketch-util/random';
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { mapRange } from 'canvas-sketch-util/math';
import { interpolate, parse, formatCss, Color } from 'culori';
import { Vector } from 'p5';
import { drawPath } from '@daeinc/draw';
import { generateColors } from '../subtractive-color';

const config = {
  resolution: 64,
  neighbourDist: 60,
  desiredSeparation: 40,
};

const scale = 2;

const colors = generateColors();
const bg = colors.shift()!;
const baseColor = colors.shift()!;
const headColor = colors.shift()!;

const colorSale = interpolate([headColor, ...colors, bg]);
const trailColorMap = (t: number) => formatCss(colorSale(t));

const headColor1 = formatCss({ ...parse(headColor), alpha: 1 } as Color);
const headColor2 = formatCss({ ...parse(headColor), alpha: 0 } as Color);
const headColorScale = interpolate([headColor1, headColor2]);
const headColorMap = (t: number) => formatCss(headColorScale(t));

interface Boid {
  acceleration: Vector;
  velocity: Vector;
  position: Vector;
  r: number;
  maxSpeed: number;
  maxForce: number;
  trail: Point[];
  trailLength: number;
  color: string;
}

interface Node {
  x: number;
  y: number;
  occupied: boolean;
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  let flock: Boid[];
  let grid: Node[] = [];

  const handleScreenBoundaries = handleBoundaries(width, height);
  const margin = 0.05 * width;

  const xyToWorld = (x: number, y: number) => [
    mapRange(x, 0, config.resolution - 1, margin, width - margin),
    mapRange(y, 0, config.resolution - 1, margin, height - margin),
  ];

  // make grid of resolution x resolution
  for (let i = 0; i < config.resolution; i++) {
    for (let j = 0; j < config.resolution; j++) {
      const [x, y] = xyToWorld(i, j);
      grid.push({ x, y, occupied: false });
    }
  }

  function reset() {
    grid.forEach((node) => {
      node.occupied = false;
    });

    flock = Array.from({ length: 128 }).map(() => {
      const node = Random.pick(grid.filter((node) => !node.occupied));
      return boidOf(node.x, node.y);
    });
  }

  reset();

  wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
    if (frame === 0) {
      reset();
    }

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.fillStyle = baseColor;
    grid.forEach((node) => {
      context.fillRect(node.x - 2, node.y - 2, 4, 4);
    });

    flock.forEach((boid) => {
      move(flock, boid);
      update(boid);
      handleScreenBoundaries(boid);
      render(boid, context, width, height, playhead);

      if (playhead > 0.8) {
        boid.trailLength = Math.max(
          Math.round(mapRange(playhead, 0.8, 0.9, 20, 1)),
          0
        );
        boid.trail.shift();
      }
    });
  };
};

/**
 * Boid
 * Based on Daniel Shiffman's code
 *  https://p5js.org/examples/simulate-flocking.html
 * and demonstration of Craig Reynolds' "Flocking" behavior
 *  http://www.red3d.com/cwr/boids/ Rules
 */
function boidOf(x: number, y: number) {
  return {
    acceleration: new Vector(0, 0),
    velocity: new Vector(Random.range(-1, 1), Random.range(-1, 1)),
    position: new Vector(x, y),
    r: 2 * scale, // Random.range(2, 4) * scale,
    maxSpeed: 3 * scale,
    maxForce: 0.1 * scale,
    trail: [],
    trailLength: 30, // Random.range(25, 60),
    color: Random.pick(colors),
  };
}

/**
 * Compute acceleration based on the three flocking rules
 */
function move(boids: Boid[], boid: Boid) {
  const separation = separate(boids, boid);
  const alignment = align(boids, boid);
  const bond = cohesion(boids, boid);

  // Weight these forces
  separation.mult(2);
  alignment.mult(1.0);
  bond.mult(1.0);

  // Add the force vectors to acceleration
  boid.acceleration.add(separation);
  boid.acceleration.add(alignment);
  boid.acceleration.add(bond);
}

/**
 * Update the location of the boid
 */
function update(boid: Boid) {
  boid.velocity.add(boid.acceleration);
  // Limit speed
  boid.velocity.limit(boid.maxSpeed);
  boid.position.add(boid.velocity);

  // Trail
  boid.trail.push([boid.position.x, boid.position.y]);

  if (boid.trail.length > boid.trailLength) {
    boid.trail.shift();
  }

  // Reset acceleration to 0 each cycle
  boid.acceleration.mult(0);
}

/**
 * Render the boid
 * A triangle rotated in the direction of the velocity
 */
function render(
  boid: Boid,
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  playhead: number = 0
) {
  context.fillStyle = boid.color;
  context.strokeStyle = boid.color;
  context.lineWidth = boid.r;

  const chunks = splitPath(boid, width, height);

  // Draw trail
  chunks.forEach((chunk) => {
    if (chunk.length > 4) {
      drawGradientPath(context, chunk);
    }
  });

  // Draw arrow head
  context.fillStyle =
    playhead > 0.9
      ? headColorMap(mapRange(playhead, 0.9, 0.95, 0, 1, true))
      : headColor;
  const theta = boid.velocity.heading() + Math.PI / 2;
  context.save();
  context.translate(boid.position.x, boid.position.y);
  context.rotate(theta);
  context.beginPath();
  drawPath(context, drawEquilateralTriangle([0, 0], boid.r * 2));
  context.fill();
  context.restore();
}

function drawEquilateralTriangle([x, y]: number[], size: number) {
  const a = [x, y - size];
  const b = [x + (size * Math.sqrt(3)) / 2, y + (size * Math.sqrt(3)) / 2];
  const c = [x - (size * Math.sqrt(3)) / 2, y + (size * Math.sqrt(3)) / 2];

  return [a, b, c];
}

function drawGradientPath(context: CanvasRenderingContext2D, path: Point[]) {
  for (let i = 1; i < path.length - 1; i++) {
    context.strokeStyle = trailColorMap(1 - i / (path.length - 1));
    context.beginPath();
    context.moveTo(...path[i - 1]);
    context.lineTo(...path[i]);
    context.stroke();
  }
}

/**
 * Separation
 * Steer to avoid crowding local boids
 */
function separate(boids: Boid[], boid: Boid) {
  const [count, direction] = boids.reduce(
    ([count, direction], otherBoid) => {
      const d = boid.position.dist(otherBoid.position);
      if (d > 0 && d < config.desiredSeparation) {
        // Calculate vector pointing away from neighbour
        const diff = Vector.sub(boid.position, otherBoid.position)
          .normalize()
          .div(d); // Weight by distance
        return [count + 1, direction.add(diff)];
      }
      return [count, direction];
    },
    [0, new Vector(0, 0)]
  );

  return count > 0
    ? direction
        .div(count) // average
        .normalize()
        .mult(boid.maxSpeed)
        .sub(boid.velocity)
        .limit(boid.maxForce)
    : direction;
}

/**
 * Alignment
 * Steer towards the average heading of local boids
 */
function align(boids: Boid[], boid: Boid) {
  const [count, direction] = boids.reduce(
    ([count, direction], otherBoid) => {
      const d = Vector.dist(boid.position, otherBoid.position);
      return d > 0 && d < config.neighbourDist
        ? [count + 1, direction.add(otherBoid.velocity)]
        : [count, direction];
    },
    [0, new Vector(0, 0)]
  );

  return count > 0
    ? direction
        .div(count)
        .normalize()
        .mult(boid.maxSpeed)
        .sub(boid.velocity)
        .limit(boid.maxForce)
    : direction;
}

/**
 * Cohesion
 * Steer to move toward the average position of local boids
 */
function cohesion(boids: Boid[], boid: Boid) {
  const [count, direction] = boids.reduce(
    ([count, direction], otherBoid) => {
      const d = Vector.dist(boid.position, otherBoid.position);
      return d > 0 && d < config.neighbourDist
        ? [count + 1, direction.add(otherBoid.position)]
        : [count, direction];
    },
    [0, new Vector(0, 0)]
  );

  if (count > 0) {
    direction.div(count);
    return seek(direction, boid);
  } else {
    return direction;
  }
}

/**
 * Calculate and apply a steering force towards a target
 * Steer = Desired - Velocity
 */
function seek(target: Vector, boid: Boid) {
  // A vector pointing from the boid location to the target
  const desired = Vector.sub(target, boid.position);
  // Normalize and scale to maximum speed
  desired.normalize();
  desired.mult(boid.maxSpeed);
  // Steer = Desired - Velocity
  const steer = Vector.sub(desired, boid.velocity);
  // Limit to maximum steering force
  steer.limit(boid.maxForce);
  return steer;
}

/**
 * Wrap the boid around canvas boundaries
 */
function handleBoundaries(width: number, height: number) {
  return (boid: Boid) => {
    // Left
    if (boid.position.x < -boid.r) {
      boid.position.x = width + boid.r;
    }
    // Top
    if (boid.position.y < -boid.r) {
      boid.position.y = height + boid.r;
    }
    // Right
    if (boid.position.x > width + boid.r) {
      boid.position.x = -boid.r;
    }
    // Bottom
    if (boid.position.y > height + boid.r) {
      boid.position.y = -boid.r;
    }
  };
}

/**
 * Split path into chunks that are on or off canvas
 */
function splitPath(boid: Boid, width: number, height: number) {
  let prevOffCanvas = false;

  return boid.trail.reduce<Point[][]>(
    (acc, pt) => {
      const offCanvas =
        pt[0] < -boid.r ||
        pt[0] > width + boid.r ||
        pt[1] < -boid.r ||
        pt[1] > height + boid.r;

      if (offCanvas !== prevOffCanvas) {
        acc.push([]);
      }

      acc[acc.length - 1].push(pt);
      prevOffCanvas = offCanvas;
      return acc;
    },
    [[]]
  );
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 20_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
