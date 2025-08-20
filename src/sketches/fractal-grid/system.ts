// Golden ratio and its reciprocal
const phi = (1 + Math.sqrt(5)) / 2;

export function createCells(
  xLines: number[],
  yLines: number[],
  origin: Point
): {
  a: Point;
  b: Point;
  to: Point;
  from: Point;
}[] {
  const cells = [];
  for (let i = 0; i < yLines.length - 1; i++) {
    for (let j = 0; j < xLines.length - 1; j++) {
      const from: Point = [
        xLines[j] <= origin[0] ? xLines[j] : xLines[j + 1],
        yLines[i] <= origin[1] ? yLines[i] : yLines[i + 1],
      ];
      const to: Point = [
        xLines[j] <= origin[0] ? xLines[j + 1] : xLines[j],
        yLines[i] <= origin[1] ? yLines[i + 1] : yLines[i],
      ];

      cells.push({
        a: [xLines[j], yLines[i]] as Point,
        b: [xLines[j + 1], yLines[i + 1]] as Point,
        to,
        from,
      });
    }
  }
  return cells;
}

export function generateFractalGrid(
  bounds: [number, number],
  startPos: number,
  initialInterval: number,
  ratio: number = phi
): number[] {
  const positions = [];
  let currentInterval = initialInterval;
  let currentPosA = startPos - currentInterval;
  let currentPosB = startPos + currentInterval;

  while (
    currentPosA >= bounds[0] &&
    currentPosA <= bounds[1] &&
    currentInterval < 0.2 * bounds[1]
  ) {
    positions.push(Math.round(currentPosA));
    currentInterval *= ratio;
    currentPosA -= currentInterval;
  }

  currentInterval = initialInterval;
  while (
    currentPosB >= bounds[0] &&
    currentPosB <= bounds[1] &&
    currentInterval < 0.2 * bounds[1]
  ) {
    positions.push(Math.round(currentPosB));
    currentInterval *= ratio;
    currentPosB += currentInterval;
  }

  positions.push();

  return positions.sort((a, b) => a - b);
}
