import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { clipPolylinePoly } from '@thi.ng/geom-clip-line';
import { randomPalette } from '../../colors';
import { mapMaker, Street } from './algorithm';
import { drawPath } from '@daeinc/draw';

const config = {
  size: 5,
};

const colors = randomPalette();
const bg = colors.shift()!; // '#fff'
const fg = colors.shift()!; // '#000'

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const mapSystem = mapMaker([width, height]);

  let clip = [
    [50, 50],
    [800, 50],
    [800, 800],
    [50, 800],
  ];

  wrap.render = ({ width, height, time }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const streets = mapSystem();
    const regions = streets.map((street) => street.points);

    clip = clip.map(([x, y]) => [x + 1, y]);

    const output = regions.map((r) => clipPolylinePoly(r, clip));

    context.lineWidth = config.size;
    context.strokeStyle = fg;
    streets.forEach((street) => {
      drawStreet(context, street);
    });

    context.strokeStyle = 'green';
    drawPath(context, clip, true);
    context.stroke();

    output.forEach((regions) => {
      regions.forEach((region) => {
        context.strokeStyle = 'red';
        drawPath(context, region, false);
        context.stroke();
      });
    });
  };
};

function drawStreet(context: CanvasRenderingContext2D, street: Street) {
  context.strokeStyle = street.color || fg;
  context.beginPath();
  street.points.forEach(([x, y], i) => {
    if (i === 0) {
      context.moveTo(x, y);
    } else {
      context.lineTo(x, y);
    }
  });
  context.stroke();
}

export const settings: SketchSettings = {
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
