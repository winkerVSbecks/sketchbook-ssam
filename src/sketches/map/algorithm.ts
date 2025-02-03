import PoissonDiskSampling from 'poisson-disk-sampling';
import Random from 'canvas-sketch-util/random';

type Range = { min: number; max: number };
type Axis = 'horizontal' | 'vertical';

export interface Street {
  points: Point[];
  angle: number;
  orientation: Axis;
  forwardState: 'growing' | 'stopped';
  backwardState: 'growing' | 'stopped';
  color?: string;
}

const config = {
  minDistance: 50,
  maxDistance: 100,
  debug: false,
  step: 2,
};

export function mapMaker({ width, height }: { width: number; height: number }) {
  const points = fillPoints([width, height], [0, 0]);
  let streets = points.map(initStreet);

  const state = {
    cleaned: false,
    iteration: 0,
    allStopped: false,
    stable: false,
  };

  return (): Street[] => {
    state.allStopped = streets.every(
      (street) =>
        street.forwardState === 'stopped' && street.backwardState === 'stopped'
    );

    if (state.allStopped && !state.cleaned) {
      console.log('iteration', state.iteration);
      state.iteration++;

      const toRemove = removeClose(streets);
      state.cleaned = true;

      if (toRemove.size > 0) {
        streets = streets.filter((street) => !toRemove.has(street));

        streets = streets.map((street) => ({
          ...street,
          forwardState: 'growing',
          backwardState: 'growing',
        }));
        state.cleaned = false;
      }
    }

    if (state.allStopped && state.cleaned && !state.stable) {
      state.stable = true;
      console.log('stable');
    }

    streets.forEach((street) => {
      if (
        street.forwardState !== 'stopped' ||
        street.backwardState !== 'stopped'
      ) {
        street = growStreet(street);
        street = updateStreet(street, [width, height], streets);
      }
    });

    return streets;
  };
}

function initStreet(point: Point): Street {
  const orientation = Random.pick(['horizontal', 'vertical']);
  const baseAngle = orientation === 'horizontal' ? 0 : Math.PI / 2;
  return {
    points: [point],
    orientation,
    angle: baseAngle + (Random.range(-1, 1) * Math.PI) / 32,
    forwardState: 'growing',
    backwardState: 'growing',
  };
}

function growStreet(street: Street): Street {
  // Grow forward from last point
  if (street.forwardState !== 'stopped') {
    const lastPoint = street.points[street.points.length - 1];
    const newForwardPoint: Point = [
      lastPoint[0] + config.step * Math.cos(street.angle),
      lastPoint[1] + config.step * Math.sin(street.angle),
    ];
    street.points.push(newForwardPoint);
  }

  // Grow backward from first point
  if (street.backwardState !== 'stopped') {
    const firstPoint = street.points[0];
    const newBackwardPoint: Point = [
      firstPoint[0] - config.step * Math.cos(street.angle),
      firstPoint[1] - config.step * Math.sin(street.angle),
    ];
    street.points.unshift(newBackwardPoint);
  }

  return street;
}

function findIntersection(
  [x1, y1]: Point,
  [x2, y2]: Point,
  [x3, y3]: Point,
  [x4, y4]: Point
): Point | null {
  const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
  if (denom === 0) return null;

  const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
  const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;

  if (ua < 0 || ua > 1 || ub < 0 || ub > 1) return null;

  return [x1 + ua * (x2 - x1), y1 + ua * (y2 - y1)];
}

function updateStreet(
  street: Street,
  bounds: Point,
  streets: Street[]
): Street {
  if (street.forwardState === 'stopped' && street.backwardState === 'stopped') {
    return street;
  }

  for (const otherStreet of streets) {
    if (otherStreet === street) continue;

    const firstPoint = street.points[0];
    const lastPoint = street.points[street.points.length - 1];

    for (let i = 0; i < otherStreet.points.length - 1; i++) {
      // Check forward growth
      if (street.forwardState === 'growing') {
        const intersectionForward = findIntersection(
          street.points[street.points.length - 2],
          lastPoint,
          otherStreet.points[i],
          otherStreet.points[i + 1]
        );

        if (intersectionForward) {
          street.points[street.points.length - 1] = intersectionForward;
          street.forwardState = 'stopped';
        }

        if (outOfBounds(lastPoint, bounds)) {
          street.forwardState = 'stopped';
        }
      }

      // Check backward growth
      if (street.backwardState === 'growing') {
        const intersectionBackward = findIntersection(
          street.points[1],
          firstPoint,
          otherStreet.points[i],
          otherStreet.points[i + 1]
        );

        if (intersectionBackward) {
          street.points[0] = intersectionBackward;
          street.backwardState = 'stopped';
        }

        if (outOfBounds(firstPoint, bounds)) {
          street.backwardState = 'stopped';
        }
      }
    }
  }

  return street;
}

function outOfBounds([x, y]: Point, [width, height]: Point): boolean {
  return x < 0 || x > width || y < 0 || y > height;
}

function fillPoints(shape: Point, offset: Point): Point[] {
  const p = new PoissonDiskSampling({
    shape,
    minDistance: config.minDistance,
    maxDistance: config.maxDistance,
    tries: 20,
  });
  return p.fill().map(([x, y]) => [offset[0] + x, offset[1] + y]);
}

function getRange(points: Point[], component: number): Range {
  const values = points.map((p) => p[component]);
  return {
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function getCentroid(points: Point[]): Point {
  const sum = points.reduce((acc, [x, y]) => [acc[0] + x, acc[1] + y], [0, 0]);
  return [sum[0] / points.length, sum[1] / points.length];
}

function rangesOverlap(range1: Range, range2: Range): boolean {
  return Math.max(range1.min, range2.min) < Math.min(range1.max, range2.max);
}

function areStreetsClose(street1: Street, street2: Street): boolean {
  if (street1.orientation !== street2.orientation) return false;

  const perpComponent = street1.orientation === 'horizontal' ? 1 : 0;
  const parallelComponent = 1 - perpComponent;

  const centroid1 = getCentroid(street1.points);
  const centroid2 = getCentroid(street2.points);

  if (Math.abs(centroid1[perpComponent] - centroid2[perpComponent]) >= 10) {
    return false;
  }

  const range1 = getRange(street1.points, parallelComponent);
  const range2 = getRange(street2.points, parallelComponent);

  return rangesOverlap(range1, range2);
}

function removeClose(streets: Street[]): Set<Street> {
  const toRemove = new Set<Street>();

  for (let i = 0; i < streets.length; i++) {
    const street1 = streets[i];
    if (toRemove.has(street1)) continue;

    for (let j = i + 1; j < streets.length; j++) {
      const street2 = streets[j];
      if (areStreetsClose(street1, street2)) {
        toRemove.add(street2);
      }
    }
  }

  console.log(
    `Removing ${toRemove.size} parallel streets out of ${streets.length}`
  );
  return toRemove;
}
