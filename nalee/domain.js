import classifyPoint from 'robust-point-in-polygon';
import { xyToId } from './utils';
/**
 * Domain
 */
export function makeDomain(resolution, domainToWorld) {
    const domain = [];
    for (let y = 0; y <= resolution; y++) {
        for (let x = 0; x <= resolution; x++) {
            const [worldX, worldY] = domainToWorld(x, y);
            domain.push({ x, y, occupied: false, id: xyToId(x, y), worldX, worldY });
        }
    }
    return domain;
}
export function clipDomain(domain, polygon) {
    return domain.filter(({ x, y }) => {
        return classifyPoint(polygon, [x, y]) <= 0;
    });
}
export function clipDomainWithWorldCoords(grid, polygon) {
    return grid.filter(({ worldX, worldY }) => {
        return classifyPoint(polygon, [worldX, worldY]) <= 0;
    });
}
// Just a test function to see how the domain is clipped
export function makeAsymmetricDomain(domainToWorld) {
    const domain = [];
    for (let y = 10; y <= 30; y++) {
        for (let x = 30; x <= 60; x++) {
            const [worldX, worldY] = domainToWorld(x, y);
            domain.push({ x, y, occupied: false, id: xyToId(x, y), worldX, worldY });
        }
    }
    for (let y = 31; y <= 50; y++) {
        for (let x = 40; x <= 50; x++) {
            const [worldX, worldY] = domainToWorld(x, y);
            domain.push({ x, y, occupied: false, id: xyToId(x, y), worldX, worldY });
        }
    }
    for (let y = 40; y <= 50; y++) {
        for (let x = 51; x <= 70; x++) {
            const [worldX, worldY] = domainToWorld(x, y);
            domain.push({ x, y, occupied: false, id: xyToId(x, y), worldX, worldY });
        }
    }
    return domain;
}
export function drawDomain(context, domain, color, size) {
    domain.map(({ worldX, worldY }) => {
        context.fillStyle = color;
        const s = size * 0.25;
        context.fillRect(worldX - s / 2, worldY - s / 2, s, s);
    });
}
