function random(
  spawnWalker: (coord?: { x: number; y: number }) => void,
  resolution: number[],
  walkerCount: number
) {
  new Array(walkerCount).fill(null).forEach(() => spawnWalker());
}

function mandala(
  spawnWalker: (coord?: { x: number; y: number }) => void,
  resolution: number[]
) {
  for (let index = 0; index < resolution[0]; index++) {
    spawnWalker({ x: index, y: resolution[1] - index });
    spawnWalker({
      x: resolution[0] - index,
      y: resolution[1] - index,
    });
    spawnWalker({ x: resolution[0] - index, y: index });
    spawnWalker({ x: index, y: index });
  }
}

function quadCentres(
  spawnWalker: (coord?: { x: number; y: number }) => void,
  resolution: number[]
) {
  // quad centres
  spawnWalker({
    x: Math.floor(0.25 * resolution[0]),
    y: Math.floor(0.25 * resolution[1]),
  });
  spawnWalker({
    x: Math.floor(0.75 * resolution[0]),
    y: Math.floor(0.25 * resolution[1]),
  });
  spawnWalker({
    x: Math.floor(0.75 * resolution[0]),
    y: Math.floor(0.75 * resolution[1]),
  });
  spawnWalker({
    x: Math.floor(0.25 * resolution[0]),
    y: Math.floor(0.75 * resolution[1]),
  });
}

function middleOut(
  spawnWalker: (coord?: { x: number; y: number }) => void,
  resolution: number[]
) {
  // middle out
  spawnWalker({
    x: Math.floor(0.5 * resolution[0]) - 1,
    y: Math.floor(0.5 * resolution[1]) - 1,
  });
  spawnWalker({
    x: Math.floor(0.5 * resolution[0]) + 1,
    y: Math.floor(0.5 * resolution[1]) - 1,
  });
  spawnWalker({
    x: Math.floor(0.5 * resolution[0]) + 1,
    y: Math.floor(0.5 * resolution[1]) + 1,
  });
  spawnWalker({
    x: Math.floor(0.5 * resolution[0]) - 1,
    y: Math.floor(0.5 * resolution[1]) + 1,
  });
}

function middleOutCross(
  spawnWalker: (coord?: { x: number; y: number }) => void,
  resolution: number[]
) {
  // middle out cross style
  spawnWalker({ x: 0, y: 0 });
  spawnWalker({ x: resolution[0], y: 0 });
  for (let x = 0; x < resolution[0]; x++) {
    spawnWalker({ x: x, y: x % 2 === 0 ? resolution[1] : 0 });
  }
  for (let y = 0; y < resolution[1]; y++) {
    spawnWalker({ x: y % 2 === 0 ? resolution[0] : 0, y: y });
  }
  spawnWalker({ x: 0, y: resolution[1] });
  spawnWalker({ x: resolution[0], y: resolution[1] });
}

export default {
  random: random,
  mandala: mandala,
  'middle-out': middleOut,
  'quad-centres': quadCentres,
  'middle-out-cross': middleOutCross,
};
