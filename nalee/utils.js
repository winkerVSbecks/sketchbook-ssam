import { mapRange } from 'canvas-sketch-util/math';
/**
 * Utils
 */
export function xyToIndex(nodes, x, y) {
    const id = xyToId(x, y);
    return nodes.findIndex((node) => node.id === id);
}
export function xyToId(x, y) {
    return `${x}-${y}`;
}
export function inBounds(nodes, { x, y }) {
    const id = xyToId(x, y);
    return nodes.some((node) => node.id === id);
}
export function xyToCoords(resolution, padding, width, height) {
    return (x, y) => [
        toWorld(x, width, resolution, width * padding),
        toWorld(y, height, resolution, width * padding),
    ];
}
export function toWorld(v, size, resolution, padding) {
    const s = size - 2 * padding;
    return padding + mapRange(v, 0, resolution, 0, s);
}
