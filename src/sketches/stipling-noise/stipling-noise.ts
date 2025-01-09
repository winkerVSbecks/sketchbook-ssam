import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { generateColors } from '../../subtractive-color';
import { lerpArray, mapRange } from 'canvas-sketch-util/math';
import { drawCircle, drawPath } from '@daeinc/draw';
import { Delaunay, Voronoi } from 'd3-delaunay';
import { interpolate, parse, formatCss, Color } from 'culori';

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
  const colorSale = interpolate(colors);
  const colorMap = (t: number) => formatCss(colorSale(t));

  let points: Point[];
  let originalPoints: Point[];
  let delaunay: Delaunay<number[]>;
  let voronoi: Voronoi<number[]>;
  let dMax = 10;

  const noise = (x: number, y: number, t: number) => {
    const angle = Math.PI * 2 * t * 2;
    const polarT = [
      mapRange(Math.sin(angle), -1, 1, 0, 2),
      mapRange(Math.cos(angle), -1, 1, 0, 2),
    ];

    return Random.noise4D(x / 100, y / 100, polarT[0], polarT[1], 0.25, 1);
  };

  function reset() {
    points = [];
    // points = Array.from({ length: config.count }).map(() => {
    //   // return Random.insideCircle(width / 2).map((v: number) => v + width / 2);
    //   return [Random.rangeFloor(0, width), Random.rangeFloor(0, height)];
    // });
    for (let index = 0; index < config.count; index++) {
      const pt = [
        Random.rangeFloor(0, width),
        Random.rangeFloor(0, height),
      ] as Point;

      const t = noise(pt[0], pt[1], 0);

      if (t < -0.5) {
        index--;
      } else {
        points.push(pt);
      }
    }
    originalPoints = [...points];

    delaunay = calculateDelaunay(points);
    voronoi = delaunay.voronoi([0, 0, width, height]);
  }
  reset();

  wrap.render = ({ width, height, playhead, frame }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    if (frame === 0) {
      reset();
      // points = Array.from({ length: config.count }).map(() => [
      //   Random.rangeFloor(0, width),
      //   Random.rangeFloor(0, height),
      // ]);
      // originalPoints = [...points];

      // delaunay = calculateDelaunay(points);
      // voronoi = delaunay.voronoi([0, 0, width, height]);
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
      if (playhead < 0.125) {
        points[i] = lerpArray(
          points[i] as any,
          centroids[i] as any,
          mapRange(playhead, 0, 0.125, 0, 1, true)
        ) as Point;
        dMax = mapRange(playhead, 0, 0.125, 10, 18, true);
      } else if (playhead < 0.875) {
        points[i] = centroids[i];
      } else {
        points[i] = lerpArray(
          centroids[i] as any,
          originalPoints[i] as any,
          mapRange(playhead, 0.875, 1, 0, 1, true)
        ) as Point;
        dMax = mapRange(playhead, 0.875, 1, 18, 10, true);
      }
    }

    for (let i = 0; i < cells.length; i++) {
      let poly = cells[i];
      context.strokeStyle = strokeColor;

      context.beginPath();
      drawPath(context, poly);
      context.stroke();
    }

    for (let i = 0; i < points.length; i++) {
      const t = noise(points[i][0], points[i][1], playhead);
      const color = colorMap(mapRange(t, -1, 1, 0, 1, true));

      context.fillStyle = color;
      const diam = mapRange(avgWeights[i], 0, maxWeight, dMax, 0, true);
      context.beginPath();
      drawCircle(context, points[i], diam);
      context.fill();

      context.fillStyle = bg;
      context.beginPath();
      drawCircle(context, points[i], 5);
      context.fill();
    }

    // for (let i = 0; i < centroids.length; i++) {
    //   context.fillStyle = bg;
    //   context.beginPath();
    //   drawCircle(context, centroids[i], 5);
    //   context.fill();
    // }

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
  duration: 10_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
