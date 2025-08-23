import { DomainToWorld, Node } from './types';
import { xyToId } from './utils';

export const polarDomainToWorld = (
  radiusRes: number,
  thetaRes: number,
  [cx, cy]: Point,
  radius: number
): DomainToWorld => {
  return (r: number, theta: number) => {
    const worldX =
      cx +
      ((radius * r) / radiusRes) * Math.cos((theta * Math.PI * 2) / thetaRes);
    const worldY =
      cy +
      ((radius * r) / radiusRes) * Math.sin((theta * Math.PI * 2) / thetaRes);
    return [worldX, worldY];
  };
};

export function makePolarDomain(
  radiusRange: Point,
  thetaRange: Point,
  domainToWorld: DomainToWorld
): Node[] {
  const domain = [];

  for (let theta = thetaRange[0]; theta < thetaRange[1]; theta++) {
    for (let r = radiusRange[0]; r <= radiusRange[1]; r++) {
      const [worldX, worldY] = domainToWorld(r, theta);
      domain.push({
        x: r,
        y: theta,
        occupied: false,
        id: xyToId(r, theta),
        worldX,
        worldY,
      });
    }
  }

  return domain;
}

export function clipPolarDomainWithWorldCoords(
  grid: Node[],
  center: Point,
  radius: number,
  inverse?: boolean
) {
  return grid.filter(({ worldX, worldY }) => {
    const isPointInCircle = pointInCircle(center, radius, [worldX, worldY]);
    return inverse ? !isPointInCircle : isPointInCircle;
  });
}

function pointInCircle(center: Point, radius: number, point: Point) {
  const dx = point[0] - center[0];
  const dy = point[1] - center[1];
  return dx * dx + dy * dy <= radius * radius;
}
