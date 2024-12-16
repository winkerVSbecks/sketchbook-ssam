function random(spawnWalker, resolution, walkerCount) {
    new Array(walkerCount).fill(null).forEach(() => spawnWalker());
}
function mandala(spawnWalker, resolution) {
    for (let index = 0; index < resolution; index++) {
        spawnWalker({ x: index, y: resolution - index });
        spawnWalker({
            x: resolution - index,
            y: resolution - index,
        });
        spawnWalker({ x: resolution - index, y: index });
        spawnWalker({ x: index, y: index });
    }
}
function quadCentres(spawnWalker, resolution) {
    // quad centres
    spawnWalker({
        x: Math.floor(0.25 * resolution),
        y: Math.floor(0.25 * resolution),
    });
    spawnWalker({
        x: Math.floor(0.75 * resolution),
        y: Math.floor(0.25 * resolution),
    });
    spawnWalker({
        x: Math.floor(0.75 * resolution),
        y: Math.floor(0.75 * resolution),
    });
    spawnWalker({
        x: Math.floor(0.25 * resolution),
        y: Math.floor(0.75 * resolution),
    });
}
function middleOut(spawnWalker, resolution) {
    // middle out
    spawnWalker({
        x: Math.floor(0.5 * resolution) - 1,
        y: Math.floor(0.5 * resolution) - 1,
    });
    spawnWalker({
        x: Math.floor(0.5 * resolution) + 1,
        y: Math.floor(0.5 * resolution) - 1,
    });
    spawnWalker({
        x: Math.floor(0.5 * resolution) + 1,
        y: Math.floor(0.5 * resolution) + 1,
    });
    spawnWalker({
        x: Math.floor(0.5 * resolution) - 1,
        y: Math.floor(0.5 * resolution) + 1,
    });
}
function middleOutCross(spawnWalker, resolution) {
    // middle out cross style
    spawnWalker({ x: 0, y: 0 });
    spawnWalker({ x: resolution, y: 0 });
    for (let x = 0; x < resolution; x++) {
        spawnWalker({ x: x, y: x % 2 === 0 ? resolution : 0 });
    }
    for (let y = 0; y < resolution; y++) {
        spawnWalker({ x: y % 2 === 0 ? resolution : 0, y: y });
    }
    spawnWalker({ x: 0, y: resolution });
    spawnWalker({ x: resolution, y: resolution });
}
export default {
    random: random,
    mandala: mandala,
    'middle-out': middleOut,
    'quad-centres': quadCentres,
    'middle-out-cross': middleOutCross,
};
