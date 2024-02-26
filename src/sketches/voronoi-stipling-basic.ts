import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../subtractive-color';
import { lerpArray, mapRange } from 'canvas-sketch-util/math';
import { drawCircle, drawPath } from '@daeinc/draw';
import { Delaunay, Voronoi } from 'd3-delaunay';

let config = {
  count: 2500,
};

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const colors = generateColors();
  const bg = colors.pop()!;
  const strokeColor = colors.pop()!;
  const fg = colors.shift()!;

  let points: Point[];
  let delaunay: Delaunay<number[]>;
  let voronoi: Voronoi<number[]>;

  const noise = (x: number, y: number, t: number) => {
    const angle = Math.PI * 2 * t * 2;
    const polarT = [
      mapRange(Math.sin(angle), -1, 1, 0, 2),
      mapRange(Math.cos(angle), -1, 1, 0, 2),
    ];

    return Random.noise4D(x / 100, y / 100, polarT[0], polarT[1], 0.25, 1);
  };

  points = Array.from({ length: config.count }).map(() => [
    Random.rangeFloor(0, width),
    Random.rangeFloor(0, height),
  ]);

  delaunay = calculateDelaunay(points);
  voronoi = delaunay.voronoi([0, 0, width, height]);

  wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      points = Array.from({ length: config.count }).map(() => [
        Random.rangeFloor(0, width),
        Random.rangeFloor(0, height),
      ]);

      delaunay = calculateDelaunay(points);
      voronoi = delaunay.voronoi([0, 0, width, height]);
    }

    let polygons = voronoi.cellPolygons();
    let cells = Array.from(polygons);

    let centroids: Point[] = new Array(config.count).fill([0, 0]);
    let weights = new Array(config.count).fill(0);
    let counts = new Array(config.count).fill(0);
    let avgWeights = new Array(config.count).fill(0);

    let delaunayIndex = 0;

    for (let i = 0; i <= width; i++) {
      for (let j = 0; j <= height; j++) {
        const value = noise(i, j, playhead);
        const weight = mapRange(value, -1, 1, 0, 1);

        delaunayIndex = delaunay.find(i, j, delaunayIndex);

        centroids[delaunayIndex] = [
          centroids[delaunayIndex][0] + i * weight,
          centroids[delaunayIndex][1] + j * weight,
        ];
        weights[delaunayIndex] += weight;
        counts[delaunayIndex]++;
      }
    }

    let maxWeight = 0;
    for (let i = 0; i < centroids.length; i++) {
      if (weights[i] > 0) {
        centroids[i][0] /= weights[i];
        centroids[i][1] /= weights[i];

        avgWeights[i] = weights[i] / (counts[i] || 1);
        if (avgWeights[i] > maxWeight) {
          maxWeight = avgWeights[i];
        }
      } else {
        centroids[i] = [...points[i]];
      }
    }

    for (let i = 0; i < points.length; i++) {
      points[i] = lerpArray(
        points[i] as any,
        centroids[i] as any,
        playhead
      ) as Point;
    }

    for (let i = 0; i < cells.length; i++) {
      let poly = cells[i];
      context.strokeStyle = strokeColor;

      context.beginPath();
      drawPath(context, poly);
      context.stroke();
    }

    for (let i = 0; i < points.length; i++) {
      context.fillStyle = fg;
      const diam = mapRange(avgWeights[i], 0, maxWeight, 0, 15, true);
      context.beginPath();
      drawCircle(context, points[i], diam);
      context.fill();
    }

    for (let i = 0; i < centroids.length; i++) {
      context.fillStyle = bg;
      context.beginPath();
      drawCircle(context, centroids[i], 5);
      context.fill();
    }

    delaunay = calculateDelaunay(points);
    voronoi = delaunay.voronoi([0, 0, width, height]);
  };
};

function calculateDelaunay(points: Point[]) {
  let pointsArray = [];
  for (let v of points) {
    pointsArray.push(v[0], v[1]);
  }

  return new Delaunay(pointsArray);
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
