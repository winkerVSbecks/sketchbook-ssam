import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { mapMaker, Street } from './algorithm';

const config = {
  size: 5,
};

const bg = '#fff';
const fg = '#000';

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  const mapSystem = mapMaker([width, height]);
  // const mapSystem = mapMaker([width/2, height/2], [width / 4, height / 4]);

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = bg;
    context.fillRect(0, 0, width, height);

    const streets = mapSystem();

    context.lineWidth = config.size;
    context.strokeStyle = fg;
    streets.forEach((street) => {
      drawStreet(context, street);
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
