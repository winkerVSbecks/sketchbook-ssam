import Random from 'canvas-sketch-util/random';

const size = 12;

export const config = {
  resolution: Math.floor(1080 / size),
  size: size,
  sizeStep: 4,
  walkerCount: 30,
  flat: true,
  padding: 0.03125, // 1 / 32
  uniformPathStyle: true,
  globalPathStyle: 'solidStyle',

  // walkerCount: Random.rangeFloor(20, 40),
  // flat: Random.chance(),
  // uniformPathStyle: Random.chance(),
  // globalPathStyle: Random.pick([
  //   'solidStyle',
  //   'pipeStyle',
  //   'distressedStyle',
  //   'highlightStyle',
  // ]),
} as const;
