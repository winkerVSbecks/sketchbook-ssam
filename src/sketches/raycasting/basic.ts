import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { Vector } from 'p5';

// Boundary class - represents a wall
class Boundary {
  a: Vector;
  b: Vector;

  constructor(x1: number, y1: number, x2: number, y2: number) {
    this.a = new Vector(x1, y1);
    this.b = new Vector(x2, y2);
  }

  show(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.a.x, this.a.y);
    ctx.lineTo(this.b.x, this.b.y);
    ctx.stroke();
  }
}

// Ray class - casts rays and checks for intersections
class Ray {
  pos: Vector;
  dir: Vector;

  constructor(pos: Vector, angle: number) {
    this.pos = pos;
    this.dir = Vector.fromAngle(angle);
  }

  lookAt(x: number, y: number) {
    this.dir.x = x - this.pos.x;
    this.dir.y = y - this.pos.y;
    this.dir.normalize();
  }

  show(ctx: CanvasRenderingContext2D) {
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(this.pos.x, this.pos.y);
    ctx.lineTo(this.pos.x + this.dir.x * 10, this.pos.y + this.dir.y * 10);
    ctx.stroke();
  }

  cast(wall: Boundary): Vector | null {
    const x1 = wall.a.x;
    const y1 = wall.a.y;
    const x2 = wall.b.x;
    const y2 = wall.b.y;

    const x3 = this.pos.x;
    const y3 = this.pos.y;
    const x4 = this.pos.x + this.dir.x;
    const y4 = this.pos.y + this.dir.y;

    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) {
      return null;
    }

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;

    if (t > 0 && t < 1 && u > 0) {
      const pt = new Vector(
        x1 + t * (x2 - x1),
        y1 + t * (y2 - y1)
      );
      return pt;
    }

    return null;
  }
}

// Particle class - holds multiple rays and checks all walls
class Particle {
  pos: Vector;
  rays: Ray[];

  constructor(width: number, height: number) {
    this.pos = new Vector(width / 2, height / 2);
    this.rays = [];
    for (let a = 0; a < 360; a += 1) {
      this.rays.push(new Ray(this.pos, (a * Math.PI) / 180));
    }
  }

  update(x: number, y: number) {
    this.pos.set(x, y);
  }

  look(ctx: CanvasRenderingContext2D, walls: Boundary[]) {
    for (let i = 0; i < this.rays.length; i++) {
      const ray = this.rays[i];
      let closest: Vector | null = null;
      let record = Infinity;

      for (let wall of walls) {
        const pt = ray.cast(wall);
        if (pt) {
          const d = Vector.dist(this.pos, pt);
          if (d < record) {
            record = d;
            closest = pt;
          }
        }
      }

      if (closest) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(this.pos.x, this.pos.y);
        ctx.lineTo(closest.x, closest.y);
        ctx.stroke();
      }
    }
  }

  show(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.pos.x, this.pos.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // Initialize walls
  const walls: Boundary[] = [];

  // Random interior walls
  for (let i = 0; i < 5; i++) {
    const x1 = Random.range(0, width);
    const x2 = Random.range(0, width);
    const y1 = Random.range(0, height);
    const y2 = Random.range(0, height);
    walls.push(new Boundary(x1, y1, x2, y2));
  }

  // Canvas boundary walls
  walls.push(new Boundary(0, 0, width, 0));
  walls.push(new Boundary(width, 0, width, height));
  walls.push(new Boundary(width, height, 0, height));
  walls.push(new Boundary(0, height, 0, 0));

  // Initialize particle
  const particle = new Particle(width, height);

  // Noise offsets for smooth animation
  let xoff = 0;
  let yoff = 10000;

  wrap.render = ({ playhead }) => {
    // Clear background
    context.fillStyle = '#000000';
    context.fillRect(0, 0, width, height);

    // Show walls
    for (let wall of walls) {
      wall.show(context);
    }

    // Update particle position using noise
    particle.update(
      Random.noise2D(xoff, 0) * width,
      Random.noise2D(0, yoff) * height
    );

    // Cast rays and show particle
    particle.look(context, walls);
    particle.show(context);

    // Increment noise offsets
    xoff += 0.01;
    yoff += 0.01;
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
