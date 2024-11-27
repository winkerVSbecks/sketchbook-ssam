import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';

type Gear = {
  x: number;
  y: number;
  radius: number;
  teeth: number;
  rotation: number;
  speed: number;
  connected: Gear[];
};

const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  function drawGear(gear: Gear) {
    const { x, y, radius, teeth, rotation } = gear;
    const innerRadius = radius * 0.7;
    const centerRadius = radius * 0.2;

    context.save();
    context.translate(x, y);
    context.rotate(rotation);

    // Draw teeth
    context.beginPath();
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const nextAngle = ((i + 1) / teeth) * Math.PI * 2;
      const toothAngle = (nextAngle - angle) / 4;

      context.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
      context.lineTo(
        Math.cos(angle + toothAngle) * innerRadius,
        Math.sin(angle + toothAngle) * innerRadius
      );
      context.lineTo(
        Math.cos(nextAngle - toothAngle) * innerRadius,
        Math.sin(nextAngle - toothAngle) * innerRadius
      );
    }
    context.closePath();
    context.stroke();

    // Draw center
    context.beginPath();
    context.arc(0, 0, centerRadius, 0, Math.PI * 2);
    context.fill();

    // Draw spokes
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2;
      context.beginPath();
      context.moveTo(
        Math.cos(angle) * centerRadius,
        Math.sin(angle) * centerRadius
      );
      context.lineTo(
        Math.cos(angle) * innerRadius,
        Math.sin(angle) * innerRadius
      );
      context.stroke();
    }

    context.restore();
  }

  function checkGearCollision(g1: Gear, g2: Gear): boolean {
    const dx = g2.x - g1.x;
    const dy = g2.y - g1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < (g1.radius + g2.radius) * 1.1;
  }

  function generateGears(count: number): Gear[] {
    const gears: Gear[] = [];
    const minRadius = 20;
    const maxRadius = 50;

    for (let i = 0; i < count; i++) {
      let attempts = 0;
      let gear: Gear;

      do {
        gear = {
          x: Random.range(width * 0.2, width * 0.8),
          y: Random.range(height * 0.2, height * 0.8),
          radius: Random.range(minRadius, maxRadius),
          teeth: Math.floor(Random.range(8, 16)),
          rotation: 0,
          speed: Random.range(0.02, 0.04) * (Random.value() > 0.5 ? 1 : -1),
          connected: [],
        };
        attempts++;
      } while (
        gears.some((g) => checkGearCollision(g, gear)) &&
        attempts < 100
      );

      if (attempts < 100) {
        gears.push(gear);
      }
    }

    // Connect nearby gears
    for (let i = 0; i < gears.length; i++) {
      for (let j = i + 1; j < gears.length; j++) {
        const dx = gears[j].x - gears[i].x;
        const dy = gears[j].y - gears[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        if (distance < (gears[i].radius + gears[j].radius) * 1.2) {
          gears[i].connected.push(gears[j]);
          gears[j].connected.push(gears[i]);
          gears[j].speed =
            -gears[i].speed * (gears[i].radius / gears[j].radius);
        }
      }
    }

    return gears;
  }

  const gears = generateGears(12);

  wrap.render = ({ playhead }: SketchProps) => {
    context.fillStyle = '#111';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = '#444';
    context.fillStyle = '#333';
    context.lineWidth = 2;

    gears.forEach((gear) => {
      gear.rotation += gear.speed;
      drawGear(gear);

      // Draw connections
      gear.connected.forEach((connected) => {
        context.strokeStyle = '#222';
        context.beginPath();
        context.moveTo(gear.x, gear.y);
        context.lineTo(connected.x, connected.y);
        context.stroke();
        context.strokeStyle = '#444';
      });
    });
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [400, 400],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 3000,
  playFps: 60,
  exportFps: 60,
};

ssam(sketch as Sketch<'2d'>, settings);
