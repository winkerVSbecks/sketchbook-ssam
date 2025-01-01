import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

interface Point {
  x: number;
  y: number;
}

interface PathSegment {
  points: Point[];
  level: number;
}

interface Obstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

const config = {
  spacing: 8,
  numLevels: 15,
  margin: 150,
  lineWidth: 1,
  color: '#000000',
  numObstacles: 3,
  minObstacleSize: 50,
  maxObstacleSize: 150,
};

const generateObstacles = (width: number, height: number): Obstacle[] => {
  const obstacles: Obstacle[] = [];
  for (let i = 0; i < config.numObstacles; i++) {
    const width = Random.range(config.minObstacleSize, config.maxObstacleSize);
    const height = Random.range(config.minObstacleSize, config.maxObstacleSize);
    const x = Random.range(
      config.margin * 1.5,
      width - config.margin * 1.5 - width
    );
    const y = Random.range(
      config.margin * 1.5,
      height - config.margin * 1.5 - height
    );

    obstacles.push({ x, y, width, height });
  }
  return obstacles;
};

const generateConcentricPath = (
  level: number,
  obstacles: Obstacle[],
  width: number,
  height: number
): Point[] => {
  const points: Point[] = [];
  const offset = level * config.spacing;
  const x = config.margin + offset;
  const y = config.margin + offset;
  const w = width - (config.margin + offset) * 2;
  const h = height - (config.margin + offset) * 2;

  let currentX = x;
  let currentY = y;

  // Top edge (left to right)
  while (currentX < x + w) {
    points.push({ x: currentX, y: currentY });
    const nextX = currentX + config.spacing;

    const intersectingObstacle = obstacles.find(
      (obs) =>
        nextX > obs.x - offset &&
        nextX < obs.x + obs.width + offset &&
        currentY > obs.y - offset * 2 &&
        currentY < obs.y + obs.height + offset
    );

    if (intersectingObstacle) {
      // Create smooth curve around obstacle
      const curvePoints = 5;
      const obstacleLeft = intersectingObstacle.x - offset;
      const obstacleTop = intersectingObstacle.y - offset;
      const obstacleRight =
        intersectingObstacle.x + intersectingObstacle.width + offset;

      // Generate curve points
      for (let i = 0; i < curvePoints; i++) {
        const t = i / (curvePoints - 1);
        const curveX = currentX + (obstacleRight - currentX) * t;
        const curveY =
          currentY + (obstacleTop - currentY) * Math.sin(Math.PI * t);
        points.push({ x: curveX, y: curveY });
      }

      currentX = obstacleRight;
    } else {
      currentX += config.spacing;
    }
  }

  // Right edge (top to bottom)
  currentX = x + w;
  while (currentY < y + h) {
    points.push({ x: currentX, y: currentY });
    const nextY = currentY + config.spacing;

    const intersectingObstacle = obstacles.find(
      (obs) =>
        currentX > obs.x - offset * 2 &&
        currentX < obs.x + obs.width + offset &&
        nextY > obs.y - offset &&
        nextY < obs.y + obs.height + offset
    );

    if (intersectingObstacle) {
      const obstacleRight =
        intersectingObstacle.x + intersectingObstacle.width + offset;
      points.push({ x: obstacleRight, y: currentY });
      currentY += intersectingObstacle.height + offset * 2;
    } else {
      currentY += config.spacing;
    }
  }

  // Bottom edge (right to left)
  currentY = y + h;
  while (currentX > x) {
    points.push({ x: currentX, y: currentY });
    const nextX = currentX - config.spacing;

    const intersectingObstacle = obstacles.find(
      (obs) =>
        nextX > obs.x - offset &&
        nextX < obs.x + obs.width + offset &&
        currentY > obs.y - offset * 2 &&
        currentY < obs.y + obs.height + offset
    );

    if (intersectingObstacle) {
      const obstacleLeft = intersectingObstacle.x - offset;
      const obstacleBottom =
        intersectingObstacle.y + intersectingObstacle.height + offset;
      points.push({ x: obstacleLeft, y: obstacleBottom });
      currentX = obstacleLeft - config.spacing;
    } else {
      currentX -= config.spacing;
    }
  }

  // Left edge (bottom to top)
  currentX = x;
  while (currentY > y) {
    points.push({ x: currentX, y: currentY });
    currentY -= config.spacing;
  }

  // Close the path
  points.push({ x, y });

  return points;
};

// Add a helper function to smooth the paths
const smoothPath = (points: Point[], tension: number = 0.5): Point[] => {
  const smoothed: Point[] = [];

  for (let i = 0; i < points.length; i++) {
    const prev = points[(i - 1 + points.length) % points.length];
    const curr = points[i];
    const next = points[(i + 1) % points.length];

    const controlPoint1 = {
      x: curr.x + (next.x - prev.x) * tension,
      y: curr.y + (next.y - prev.y) * tension,
    };

    smoothed.push(curr);
    smoothed.push(controlPoint1);
  }

  return smoothed;
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const seed = Random.getRandomSeed();
  console.log('Seed:', seed);
  Random.setSeed(seed);

  const obstacles = generateObstacles(width, height);
  const paths = Array.from({ length: config.numLevels }, (_, i) => ({
    points: smoothPath(generateConcentricPath(i, obstacles, width, height)),
    level: i,
  }));

  wrap.render = ({ context, width, height }: SketchProps) => {
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, width, height);

    // Draw with curved lines
    paths.forEach((path) => {
      context.beginPath();
      context.strokeStyle = config.color;
      context.lineWidth = config.lineWidth;

      const points = path.points;
      context.moveTo(points[0].x, points[0].y);

      for (let i = 1; i < points.length - 2; i += 2) {
        context.quadraticCurveTo(
          points[i].x,
          points[i].y,
          points[i + 1].x,
          points[i + 1].y
        );
      }

      context.stroke();
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [800, 800],
  pixelRatio: 2,
  animate: false,
  duration: 4000,
  playFps: 60,
  exportFps: 60,
  numLoops: 1,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
