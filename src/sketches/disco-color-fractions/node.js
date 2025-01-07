import { generateColorRamp, colorToCSS } from 'rampensau';
import { formatHex } from 'culori';
import chalk from 'chalk';

const FRACTIONS = 8;
let tiles = '█▓▒░'.split('');
const step = 5;

let hStart = Math.random() * 360;
let colors = generateColors(hStart);

setInterval(() => {
  console.clear();

  hStart += step;
  colors = generateColors(hStart);

  const rows = [];

  tiles.push(tiles.shift());

  for (let y = 0; y < FRACTIONS; y++) {
    let row = '';
    tiles.push(tiles.shift());

    for (let x = 0; x < FRACTIONS; x++) {
      const color = colors[(y + x) % colors.length];
      row = row.concat(chalk.hex(color)(tiles.join('')));
    }
    rows.push(row);
  }

  const grid = rows.join('\n');
  console.log(grid);
}, 150);

function generateColors(hStart) {
  const s = 0.6;
  const l = 0.6;

  const colors = generateColorRamp({
    total: FRACTIONS,
    hStart,
    hEasing: (x) => x,
    hCycles: 1 / 3,
    sRange: [s, s],
    lRange: [l, l],
  })
    .reverse()
    .map((color) => colorToCSS(color, 'oklch'))
    .map((color) => formatHex(color));

  return colors;
}
