import { mapRange } from 'canvas-sketch-util/math';
import Random from 'canvas-sketch-util/random';

export function loopNoise(
  x: number,
  y: number,
  playhead: number,
  speed: number = 1
) {
  let angle = Math.PI * 2 * playhead;
  const polarPlayhead = [
    mapRange(Math.sin(angle), -1, 1, 0, 1),
    mapRange(Math.cos(angle), -1, 1, 0, 1),
  ];

  return Random.noise4D(
    x,
    y,
    polarPlayhead[0] * speed,
    polarPlayhead[1] * speed
  );
}
