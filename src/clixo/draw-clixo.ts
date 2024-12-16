const PI = Math.PI;

export function drawClixo(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  { base, ring, inner }: { base: string; ring: string; inner: string }
) {
  const anchors: Point[] = [
    [x, y],
    [x + 2 * r, y],
    [x + 4 * r, y],
    [x + 4 * r, y + 2 * r],
    [x + 4 * r, y + 4 * r],
    [x + 2 * r, y + 4 * r],
    [x, y + 4 * r],
    [x, y + 2 * r],
  ];

  context.fillStyle = base;
  context.beginPath();
  context.arc(...anchors[0], r, 0.5 * PI, 2 * PI);
  context.arc(...anchors[1], r, 1 * PI, 0 * PI, true);
  context.arc(...anchors[2], r, 1 * PI, 2.5 * PI);
  context.arc(...anchors[3], r, 1.5 * PI, 0.5 * PI, true);
  context.arc(...anchors[4], r, 1.5 * PI, 1 * PI);
  context.arc(...anchors[5], r, 0 * PI, 1 * PI, true);
  context.arc(...anchors[6], r, 0 * PI, 1.5 * PI);
  context.arc(...anchors[7], r, 0.5 * PI, -0.5 * PI, true);
  context.fill();

  context.fillStyle = ring;
  context.beginPath();
  context.arc(...anchors[0], r / 2, 0, 2 * PI);
  context.moveTo(...anchors[2]);
  context.arc(...anchors[2], r / 2, 0, 2 * PI);
  context.moveTo(...anchors[4]);
  context.arc(...anchors[4], r / 2, 0, 2 * PI);
  context.moveTo(...anchors[6]);
  context.arc(...anchors[6], r / 2, 0, 2 * PI);
  context.fill();

  context.fillStyle = inner;
  context.beginPath();
  context.arc(...anchors[0], r / 8, 0, 2 * PI);
  context.moveTo(...anchors[2]);
  context.arc(...anchors[2], r / 8, 0, 2 * PI);
  context.moveTo(...anchors[4]);
  context.arc(...anchors[4], r / 8, 0, 2 * PI);
  context.moveTo(...anchors[6]);
  context.arc(...anchors[6], r / 8, 0, 2 * PI);
  context.fill();
}
