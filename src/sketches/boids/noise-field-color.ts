import Random from 'canvas-sketch-util/random';
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { mapRange } from 'canvas-sketch-util/math';
import { interpolate, parse, formatCss, Color, oklch, Oklch } from 'culori';
import { Vector } from 'p5';
import { drawPath } from '@daeinc/draw';
import { quadtree as d3Quadtree, Quadtree } from 'd3-quadtree';
import { generateColors } from '../../subtractive-color';
import { palettes as autoAlbersPalettes } from '../../colors/auto-albers';
import { palettes as mindfulPalettes } from '../../colors/mindful-palettes';
import { scaleCanvasAndApplyDither } from '../../scale-canvas-dither';
import { dither } from '../../dither';

const config = {
  count: 128 * 6,
  resolution: 64,
  neighbourDist: 60,
  desiredSeparation: 40,
  debug: false,
  trailLengthMax: 30,
  noiseAmplitude: 0.001,
  noiseFrequency: 1,
};

const scale = 3;

let colors = Random.chance()
  ? generateColors()
  : Random.pick([...mindfulPalettes, ...autoAlbersPalettes]);

const bg = colors.shift()!;
const baseColor = colors.shift()!;

colors = colors.sort((a: string, b: string) => {
  return oklch(a)!.h! - oklch(b)!.h!;
});

const colorSale = interpolate([...colors, bg]);
const trailColorMap = (t: number) => formatCss(colorSale(t));

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

    flock = Array.from({ length: config.count }).map(() => {
      const node = Random.pick(grid.filter((node) => !node.occupied));
      return boidOf(node.x, node.y);
    });
  }

  reset();

  wrap.render = ({ width, height, playhead, frame, canvas }: SketchProps) => {
    if (frame === 0) {
      reset();
    }

    const quadtree = d3Quadtree<Boid>()
      .extent([
        [0, 0],
        [width, height],
      ])
      .x((b) => b.position.x)
      .y((b) => b.position.y)
      .addAll(flock);

    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    context.fillStyle = baseColor;
    grid.forEach((node) => {
      context.fillRect(node.x - 2, node.y - 2, 4, 4);

      if (config.debug) {
        const colorT = mapRange(
          Random.noise2D(
            node.x,
            node.y,
            config.noiseAmplitude,
            config.noiseFrequency
          ),
          -1,
          1,
          0,
          1
        );
        context.fillStyle = trailColorMap(colorT);
        context.fillRect(node.x - 16, node.y - 8, 32, 16);
      }
    });

    flock.forEach((boid) => {
      const neighbours = findBoidsInRadius(
        quadtree,
        boid.position,
        config.neighbourDist
      );
      move(neighbours, boid);
      update(boid);
      handleScreenBoundaries(boid);
      render(boid, neighbours, context, width, height, playhead);

      if (playhead > 0.8) {
        boid.trailLength = Math.max(
          Math.round(mapRange(playhead, 0.8, 0.9, 20, 1)),
          0
        );
        boid.trail.shift();
      }
    });

    if (config.debug) {
      drawQuadtree(context, quadtree);
    }

    const ditheredImage = scaleCanvasAndApplyDither(
      width,
      height,
      0.35,
      canvas,
      (data) =>
        dither(data, {
          greyscaleMethod: 'none',
          ditherMethod: 'atkinson',
        })
    );

    context.drawImage(ditheredImage, 0, 0, width, height);
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
    trailLength: Random.range(5, config.trailLengthMax),
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
  neighbours: Boid[],
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  playhead: number = 0
) {
  const colorT = mapRange(
    Random.noise2D(
      boid.position.x,
      boid.position.y,
      config.noiseAmplitude,
      config.noiseFrequency
    ),
    -1,
    1,
    0,
    1
  );
  const color = trailColorMap(colorT);

  context.fillStyle = color; //boid.color;
  context.strokeStyle = color; //boid.color;
  context.lineWidth = boid.r;

  const chunks = splitPath(boid, width, height);

  const colorSale = interpolate([color, bg]);
  const colorMap = (t: number) => formatCss(colorSale(t));

  // Draw trail
  chunks.forEach((chunk) => {
    if (chunk.length > 4) {
      drawGradientPath(context, chunk, colorMap);
      // drawPath(context, chunk);
      // context.stroke();
    }
  });

  // Draw arrow head
  context.fillStyle =
    playhead > 0.9
      ? colorMap(mapRange(playhead, 0.9, 0.95, 0, 1, true))
      : color; //headColor;
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

function drawGradientPath(
  context: CanvasRenderingContext2D,
  path: Point[],
  map: (x: number) => string
) {
  for (let i = 1; i < path.length - 1; i++) {
    context.strokeStyle = map(1 - i / (path.length - 1));
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
    boid.position.x =
      ((((boid.position.x - boid.r) % width) + width) % width) + boid.r;
    boid.position.y =
      ((((boid.position.y - boid.r) % height) + height) % height) + boid.r;
  };
}

/**
 * Split path into chunks that are on or off canvas
 */
function splitPath(boid: Boid, width: number, height: number) {
  let prevOffCanvas = false;
  let prevPt = boid.trail[0];

  return boid.trail.reduce<Point[][]>(
    (acc, pt) => {
      const offCanvas =
        pt[0] < -boid.r ||
        pt[0] > width + boid.r ||
        pt[1] < -boid.r ||
        pt[1] > height + boid.r;

      const wrappedAround =
        Math.abs(pt[0] - prevPt[0]) > width / 2 ||
        Math.abs(pt[1] - prevPt[1]) > height / 2;

      if (offCanvas !== prevOffCanvas || wrappedAround) {
        acc.push([]);
      }

      acc[acc.length - 1].push(pt);
      prevOffCanvas = offCanvas;
      prevPt = pt;
      return acc;
    },
    [[]]
  );
}

/**
 * Quadtree helpers
 */
// Function to find points within radius of target point
function findBoidsInRadius(
  quadtree: Quadtree<Boid>,
  p: Vector,
  radius: number
): Boid[] {
  const neighbours: Boid[] = [];
  const radiusSquared = radius * radius;
  const x = p.x;
  const y = p.y;

  quadtree.visit((node, x1, y1, x2, y2) => {
    if (!node.length) {
      if (node.data) {
        const boid = node.data;
        const dx = boid.position.x - x;
        const dy = boid.position.y - y;
        const distanceSquared = dx * dx + dy * dy;

        if (distanceSquared <= radiusSquared) {
          neighbours.push(boid);
        }
      }
      return;
    }

    const closestX = Math.max(x1, Math.min(x, x2));
    const closestY = Math.max(y1, Math.min(y, y2));
    const dx = x - closestX;
    const dy = y - closestY;

    return dx * dx + dy * dy > radiusSquared;
  });

  return neighbours;
}

function drawQuadtree(
  context: CanvasRenderingContext2D,
  quadtree: Quadtree<Boid>
) {
  // Draw quadtree as before
  context.lineWidth = 1;
  context.beginPath();
  context.strokeStyle = baseColor;
  quadtree.visit((node, x1, y1, x2, y2) => {
    context.rect(x1, y1, x2 - x1, y2 - y1);
    return false;
  });
  context.stroke();
}

export const settings: SketchSettings = {
  mode: '2d',
  // dimensions: [1080, 1080],
  dimensions: [1920, 1080],
  // dimensions: [1080, 1920],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 20_000, //20_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
