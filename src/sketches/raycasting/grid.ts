import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { lerp } from 'canvas-sketch-util/math';
import { Vector } from 'p5';
import { ColorPaletteGenerator } from 'pro-color-harmonies';
import { makeGrid, getRect } from '../../grid';
import { formatCss, oklch, wcagContrast } from 'culori';
import { logColors } from '../../colors';

const palette = ColorPaletteGenerator.generate(
  { l: Random.range(0, 1), c: Random.range(0, 0.4), h: Random.range(0, 360) },
  Random.pick([
    'analogous',
    'complementary',
    'triadic',
    'tetradic',
    'splitComplementary',
    'tintsShades',
  ]),
  {
    style: Random.pick(['default', 'square', 'triangle', 'circle', 'diamond']),
    modifiers: {
      sine: Random.range(-1, 1),
      wave: Random.range(-1, 1),
      zap: Random.range(-1, 1),
      block: Random.range(-1, 1),
    },
  }
).map((c) => formatCss(oklch({ mode: 'oklch', ...c })));

logColors(palette);

// pick the lightest color as background
const bg = palette.reduce((lightest, color) => {
  // Compare lightness values in OKLCH color space
  const lightestL = oklch(lightest)?.l ?? 0;
  const colorL = oklch(color)?.l ?? 0;
  return colorL > lightestL ? color : lightest;
}, palette[0]);
// find a foreground color that contrasts with background
const colors = Random.shuffle(
  palette.filter((c) => c !== bg && wcagContrast(c, bg) >= 4.5)
);
const fg = colors.pop()!;
const particleColor = colors.pop()!;

// Rectangle type
type Rectangle = {
  x: number;
  y: number;
  w: number;
  h: number;
};

const showRectangle = (ctx: CanvasRenderingContext2D, rect: Rectangle) => {
  const { x, y, w, h } = rect;
  const radius = Math.min(w, h) * 0.2; // 20% of smallest dimension

  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
  ctx.stroke();
};

// Convert rounded rectangle to boundaries
const rectToSegments = (rect: Rectangle): Boundary[] => {
  const { x, y, w, h } = rect;
  const radius = Math.min(w, h) * 0.2; // 20% of smallest dimension
  const segments: Boundary[] = [];
  const cornerSegments = 8; // Number of segments per corner

  // Top edge
  segments.push(createBoundary(x + radius, y, x + w - radius, y));

  // Top-right corner
  for (let i = 0; i < cornerSegments; i++) {
    const angle1 = -Math.PI / 2 + (i * Math.PI) / (2 * cornerSegments);
    const angle2 = -Math.PI / 2 + ((i + 1) * Math.PI) / (2 * cornerSegments);
    const cx = x + w - radius;
    const cy = y + radius;
    segments.push(
      createBoundary(
        cx + Math.cos(angle1) * radius,
        cy + Math.sin(angle1) * radius,
        cx + Math.cos(angle2) * radius,
        cy + Math.sin(angle2) * radius
      )
    );
  }

  // Right edge
  segments.push(createBoundary(x + w, y + radius, x + w, y + h - radius));

  // Bottom-right corner
  for (let i = 0; i < cornerSegments; i++) {
    const angle1 = 0 + (i * Math.PI) / (2 * cornerSegments);
    const angle2 = 0 + ((i + 1) * Math.PI) / (2 * cornerSegments);
    const cx = x + w - radius;
    const cy = y + h - radius;
    segments.push(
      createBoundary(
        cx + Math.cos(angle1) * radius,
        cy + Math.sin(angle1) * radius,
        cx + Math.cos(angle2) * radius,
        cy + Math.sin(angle2) * radius
      )
    );
  }

  // Bottom edge
  segments.push(createBoundary(x + w - radius, y + h, x + radius, y + h));

  // Bottom-left corner
  for (let i = 0; i < cornerSegments; i++) {
    const angle1 = Math.PI / 2 + (i * Math.PI) / (2 * cornerSegments);
    const angle2 = Math.PI / 2 + ((i + 1) * Math.PI) / (2 * cornerSegments);
    const cx = x + radius;
    const cy = y + h - radius;
    segments.push(
      createBoundary(
        cx + Math.cos(angle1) * radius,
        cy + Math.sin(angle1) * radius,
        cx + Math.cos(angle2) * radius,
        cy + Math.sin(angle2) * radius
      )
    );
  }

  // Left edge
  segments.push(createBoundary(x, y + h - radius, x, y + radius));

  // Top-left corner
  for (let i = 0; i < cornerSegments; i++) {
    const angle1 = Math.PI + (i * Math.PI) / (2 * cornerSegments);
    const angle2 = Math.PI + ((i + 1) * Math.PI) / (2 * cornerSegments);
    const cx = x + radius;
    const cy = y + radius;
    segments.push(
      createBoundary(
        cx + Math.cos(angle1) * radius,
        cy + Math.sin(angle1) * radius,
        cx + Math.cos(angle2) * radius,
        cy + Math.sin(angle2) * radius
      )
    );
  }

  return segments;
};

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

  // Use more rays for smoother polygon
  const rayCount = 720; // 0.5 degree increments
  for (let a = 0; a < rayCount; a += 1) {
    rays.push(createRay(pos, (a * Math.PI * 2) / rayCount));
  }

  return { pos, rays };
};

const updateParticle = (particle: Particle, x: number, y: number) => {
  particle.pos.set(x, y);
};

const lookParticle = (
  ctx: CanvasRenderingContext2D,
  particle: Particle,
  walls: Boundary[],
  fillColor: string
) => {
  // Collect all intersection points with their angles
  const points: Array<{ point: Vector; angle: number }> = [];

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
      // Calculate angle from particle to intersection point
      const angle = Math.atan2(
        closest.y - particle.pos.y,
        closest.x - particle.pos.x
      );
      points.push({ point: closest, angle });
    }
  }

  // Sort points by angle to ensure correct polygon drawing order
  points.sort((a, b) => a.angle - b.angle);

  // Draw solid polygon with the specified color
  if (points.length > 0) {
    ctx.fillStyle = fillColor;
    ctx.beginPath();
    ctx.moveTo(points[0].point.x, points[0].point.y);

    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].point.x, points[i].point.y);
    }

    ctx.closePath();
    ctx.fill();
  }
};

const showParticle = (ctx: CanvasRenderingContext2D, particle: Particle) => {
  ctx.fillStyle = particleColor;
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

  const gridOptions = {
    width,
    height,
    cols: 8,
    rows: 8,
    gapX: 20,
    gapY: 20,
  };

  // Create grid for visualization (optional)
  const grid = makeGrid(gridOptions);

  // Track occupied cells
  const occupiedCells = new Set<string>();

  // Generate 2-3 random rectangles on the grid
  const rectangleCount = Random.rangeFloor(2, 4); // 2 or 3
  const rectangles: Rectangle[] = [];

  for (let i = 0; i < rectangleCount; i++) {
    let attempts = 0;
    let placed = false;

    while (!placed && attempts < 50) {
      const gridX = Random.rangeFloor(0, gridOptions.cols);
      const gridY = Random.rangeFloor(0, gridOptions.rows);
      const gridW = Random.rangeFloor(
        1,
        Math.min(4, gridOptions.cols - gridX + 1)
      );
      const gridH = Random.rangeFloor(
        1,
        Math.min(4, gridOptions.rows - gridY + 1)
      );

      // Check if any cells in this rectangle are occupied
      let hasOverlap = false;
      for (let y = gridY; y < gridY + gridH; y++) {
        for (let x = gridX; x < gridX + gridW; x++) {
          if (occupiedCells.has(`${x},${y}`)) {
            hasOverlap = true;
            break;
          }
        }
        if (hasOverlap) break;
      }

      if (!hasOverlap) {
        // Mark all cells as occupied
        for (let y = gridY; y < gridY + gridH; y++) {
          for (let x = gridX; x < gridX + gridW; x++) {
            occupiedCells.add(`${x},${y}`);
          }
        }

        const rect = getRect(gridOptions, {
          x: gridX,
          y: gridY,
          w: gridW,
          h: gridH,
        });

        rectangles.push(rect);
        placed = true;
      }

      attempts++;
    }
  }

  // Generate 2-3 circles at random grid cells
  const circleCount = Random.rangeFloor(2, 4); // 2 or 3
  const circles: Circle[] = [];

  for (let i = 0; i < circleCount; i++) {
    let attempts = 0;
    let placed = false;

    while (!placed && attempts < 50) {
      const gridX = Random.rangeFloor(0, gridOptions.cols);
      const gridY = Random.rangeFloor(0, gridOptions.rows);
      const cellKey = `${gridX},${gridY}`;

      if (!occupiedCells.has(cellKey)) {
        occupiedCells.add(cellKey);

        // Get the grid cell dimensions
        const cell = grid[gridY * gridOptions.cols + gridX];

        // Place circle at center of cell with radius that fits within it
        const radius = Math.min(cell.width, cell.height) / 2;

        circles.push({
          x: cell.x + cell.width / 2,
          y: cell.y + cell.height / 2,
          r: radius,
        });

        placed = true;
      }

      attempts++;
    }
  }

  // Initialize walls
  const walls: Boundary[] = [];

  // Canvas boundary walls
  walls.push(createBoundary(0, 0, width, 0));
  walls.push(createBoundary(width, 0, width, height));
  walls.push(createBoundary(width, height, 0, height));
  walls.push(createBoundary(0, height, 0, 0));

  // Convert each rectangle to line segments for raycasting
  rectangles.forEach((rect) => {
    const segments = rectToSegments(rect);
    walls.push(...segments);
  });

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
    // updateParticle(particle, mouseX, mouseY);
    updateParticle(
      particle,
      lerp(0, width, playhead),
      lerp(0, height, playhead)
    );

    // Fill entire canvas with shadow color (foreground)
    context.fillStyle = fg;
    context.fillRect(0, 0, width, height);

    // Draw the lit area with background color
    lookParticle(context, particle, walls, bg);

    // // Show rectangles
    // for (let rect of rectangles) {
    //   showRectangle(context, rect);
    // }

    // // Show circles
    // for (let circle of circles) {
    //   showCircle(context, circle);
    // }

    // // Show particle
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
