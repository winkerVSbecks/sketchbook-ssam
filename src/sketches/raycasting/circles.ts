import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Vector } from 'p5';
import pack from 'pack-spheres';

// Circle type
type Circle = {
  x: number;
  y: number;
  r: number;
};

const showCircle = (ctx: CanvasRenderingContext2D, circle: Circle) => {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(circle.x, circle.y, circle.r, 0, Math.PI * 2);
  ctx.stroke();
};

// Convert circle to polygon boundaries for raycasting
const circleToSegments = (circle: Circle, segments = 32): Boundary[] => {
  const boundaries: Boundary[] = [];
  const angleStep = (Math.PI * 2) / segments;

  for (let i = 0; i < segments; i++) {
    const angle1 = i * angleStep;
    const angle2 = (i + 1) * angleStep;

    const x1 = circle.x + Math.cos(angle1) * circle.r;
    const y1 = circle.y + Math.sin(angle1) * circle.r;
    const x2 = circle.x + Math.cos(angle2) * circle.r;
    const y2 = circle.y + Math.sin(angle2) * circle.r;

    boundaries.push(createBoundary(x1, y1, x2, y2));
  }

  return boundaries;
};

// Boundary - represents a wall
type Boundary = {
  a: Vector;
  b: Vector;
};

const createBoundary = (
  x1: number,
  y1: number,
  x2: number,
  y2: number
): Boundary => {
  return {
    a: new Vector(x1, y1),
    b: new Vector(x2, y2),
  };
};

const showBoundary = (ctx: CanvasRenderingContext2D, boundary: Boundary) => {
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(boundary.a.x, boundary.a.y);
  ctx.lineTo(boundary.b.x, boundary.b.y);
  ctx.stroke();
};

// Ray - casts rays and checks for intersections
type Ray = {
  pos: Vector;
  dir: Vector;
};

const createRay = (pos: Vector, angle: number): Ray => {
  return {
    pos,
    dir: Vector.fromAngle(angle),
  };
};

const castRay = (ray: Ray, wall: Boundary): Vector | null => {
  const x1 = wall.a.x;
  const y1 = wall.a.y;
  const x2 = wall.b.x;
  const y2 = wall.b.y;

  const x3 = ray.pos.x;
  const y3 = ray.pos.y;
  const x4 = ray.pos.x + ray.dir.x;
  const y4 = ray.pos.y + ray.dir.y;

  const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (den === 0) {
    return null;
  }

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

  if (t > 0 && t < 1 && u > 0) {
    return new Vector(x1 + t * (x2 - x1), y1 + t * (y2 - y1));
  }

  return null;
};

// Particle - holds multiple rays and checks all walls
type Particle = {
  pos: Vector;
  rays: Ray[];
};

const createParticle = (width: number, height: number): Particle => {
  const pos = new Vector(width / 2, height / 2);
  const rays: Ray[] = [];

  for (let a = 0; a < 360; a += 1) {
    rays.push(createRay(pos, (a * Math.PI) / 180));
  }

  return { pos, rays };
};

const updateParticle = (particle: Particle, x: number, y: number) => {
  particle.pos.set(x, y);
};

const lookParticle = (
  ctx: CanvasRenderingContext2D,
  particle: Particle,
  walls: Boundary[]
) => {
  // Collect all intersection points
  const points: Vector[] = [];

  for (let i = 0; i < particle.rays.length; i++) {
    const ray = particle.rays[i];
    let closest: Vector | null = null;
    let record = Infinity;

    for (let wall of walls) {
      const pt = castRay(ray, wall);
      if (pt) {
        const d = Vector.dist(particle.pos, pt);
        if (d < record) {
          record = d;
          closest = pt;
        }
      }
    }

    if (closest) {
      points.push(closest);
    }
  }

  // Draw solid polygon
  if (points.length > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }

    ctx.closePath();
    ctx.fill();
  }
};

const showParticle = (ctx: CanvasRenderingContext2D, particle: Particle) => {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(particle.pos.x, particle.pos.y, 4, 0, Math.PI * 2);
  ctx.fill();
};

export const sketch = ({
  wrap,
  context,
  width,
  height,
  canvas,
}: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = Math.min(width, height);
  const scale = 0.5 * size;

  // Generate packed circles
  const shapes = pack({
    dimensions: 2,
    padding: 0.01,
    minRadius: 0.25,
    maxRadius: 0.5,
  });

  const circles: Circle[] = shapes.map((shape: any) => ({
    x: scale + shape.position[0] * scale,
    y: scale + shape.position[1] * scale,
    r: shape.radius * scale,
  }));

  // Initialize walls
  const walls: Boundary[] = [];

  // Canvas boundary walls
  walls.push(createBoundary(0, 0, width, 0));
  walls.push(createBoundary(width, 0, width, height));
  walls.push(createBoundary(width, height, 0, height));
  walls.push(createBoundary(0, height, 0, 0));

  // Convert each circle to line segments for raycasting
  circles.forEach((circle) => {
    const segments = circleToSegments(circle, 32);
    walls.push(...segments);
  });

  // Initialize particle
  const particle = createParticle(width, height);

  // Track mouse position
  let mouseX = width / 2;
  let mouseY = height / 2;

  // Add mouse move listener
  canvas.addEventListener('mousemove', (e) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = (e.clientX - rect.left) * (width / rect.width);
    mouseY = (e.clientY - rect.top) * (height / rect.height);
  });

  wrap.render = ({ playhead }) => {
    // Update particle position to follow mouse
    updateParticle(particle, mouseX, mouseY);

    // Fill entire canvas with white (base color)
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);

    // Draw shadow layer (black everywhere)
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, width, height);

    // Cut out the lit area using destination-out
    context.save();
    context.globalCompositeOperation = 'destination-out';
    lookParticle(context, particle, walls);
    context.restore();

    // Show circles
    for (let circle of circles) {
      // showCircle(context, circle);
    }

    // Show particle
    showParticle(context, particle);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 10_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
