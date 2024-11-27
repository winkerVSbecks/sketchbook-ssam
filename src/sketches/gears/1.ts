import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

type Component = {
  type: 'gear' | 'pipe' | 'circuit' | 'bolt';
  x: number;
  y: number;
  size: number;
  rotation: number;
};

const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  function drawGear(x: number, y: number, size: number, rotation: number) {
    const teeth = Math.floor(Random.range(8, 16));
    const innerRadius = size * 0.6;
    const outerRadius = size;

    context.save();
    context.translate(x, y);
    context.rotate(rotation);

    context.beginPath();
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const nextAngle = ((i + 1) / teeth) * Math.PI * 2;

      context.lineTo(
        Math.cos(angle) * outerRadius,
        Math.sin(angle) * outerRadius
      );
      context.lineTo(
        Math.cos(angle + 0.1) * innerRadius,
        Math.sin(angle + 0.1) * innerRadius
      );
      context.lineTo(
        Math.cos(nextAngle - 0.1) * innerRadius,
        Math.sin(nextAngle - 0.1) * innerRadius
      );
    }
    context.closePath();
    context.stroke();

    context.beginPath();
    context.arc(0, 0, size * 0.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawPipe(x: number, y: number, size: number, rotation: number) {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);

    context.beginPath();
    context.rect(-size / 2, -size / 6, size, size / 3);
    context.stroke();

    const joints = Math.floor(size / 15);
    for (let i = 0; i < joints; i++) {
      const xPos = -size / 2 + (i * size) / joints;
      context.beginPath();
      context.rect(xPos, -size / 4, size / 20, size / 2);
      context.fill();
    }
    context.restore();
  }

  function drawCircuit(x: number, y: number, size: number, rotation: number) {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);

    const points = [];
    const segments = 6;
    for (let i = 0; i < segments; i++) {
      points.push({
        x: -size / 2 + (i * size) / segments,
        y: Random.range(-size / 4, size / 4),
      });
    }

    context.beginPath();
    context.moveTo(-size / 2, 0);
    points.forEach((point) => {
      context.lineTo(point.x, point.y);
    });
    context.lineTo(size / 2, 0);
    context.stroke();

    points.forEach((point) => {
      context.beginPath();
      context.arc(point.x, point.y, size / 20, 0, Math.PI * 2);
      context.fill();
    });
    context.restore();
  }

  function drawBolt(x: number, y: number, size: number, rotation: number) {
    context.save();
    context.translate(x, y);
    context.rotate(rotation);

    const sides = 6;
    context.beginPath();
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const px = (Math.cos(angle) * size) / 2;
      const py = (Math.sin(angle) * size) / 2;
      i === 0 ? context.moveTo(px, py) : context.lineTo(px, py);
    }
    context.closePath();
    context.stroke();

    context.beginPath();
    context.arc(0, 0, size / 4, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function generateComponents(count: number): Component[] {
    const components: Component[] = [];
    const types: ('gear' | 'pipe' | 'circuit' | 'bolt')[] = [
      'gear',
      'pipe',
      'circuit',
      'bolt',
    ];

    for (let i = 0; i < count; i++) {
      components.push({
        type: Random.pick(types),
        x: Random.range(width * 0.2, width * 0.8),
        y: Random.range(height * 0.2, height * 0.8),
        size: Random.range(20, 60),
        rotation: Random.range(0, Math.PI * 2),
      });
    }

    return components;
  }

  wrap.render = () => {
    context.fillStyle = '#111';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = '#666';
    context.fillStyle = '#444';
    context.lineWidth = 2;

    const components = generateComponents(15);

    components.forEach((comp) => {
      switch (comp.type) {
        case 'gear':
          drawGear(comp.x, comp.y, comp.size, comp.rotation);
          break;
        case 'pipe':
          drawPipe(comp.x, comp.y, comp.size * 2, comp.rotation);
          break;
        case 'circuit':
          drawCircuit(comp.x, comp.y, comp.size * 2, comp.rotation);
          break;
        case 'bolt':
          drawBolt(comp.x, comp.y, comp.size, comp.rotation);
          break;
      }
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [400, 400],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3000,
  playFps: 0.3333333333,
  exportFps: 0.3333333333,
};

ssam(sketch as Sketch<'2d'>, settings);
