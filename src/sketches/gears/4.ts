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
  type: 'gear' | 'belt';
};

type Belt = {
  gear1: Gear;
  gear2: Gear;
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

    context.beginPath();
    context.arc(0, 0, centerRadius, 0, Math.PI * 2);
    context.fill();

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

  function drawBelt(belt: Belt) {
    const { gear1, gear2 } = belt;
    const dx = gear2.x - gear1.x;
    const dy = gear2.y - gear1.y;
    const angle = Math.atan2(dy, dx);

    context.save();
    context.strokeStyle = '#666';
    context.lineWidth = 4;

    const offset = gear1.radius;
    context.beginPath();
    context.moveTo(
      gear1.x + Math.cos(angle + Math.PI / 2) * offset,
      gear1.y + Math.sin(angle + Math.PI / 2) * offset
    );
    context.lineTo(
      gear2.x + Math.cos(angle + Math.PI / 2) * offset,
      gear2.y + Math.sin(angle + Math.PI / 2) * offset
    );
    context.stroke();

    context.beginPath();
    context.moveTo(
      gear1.x + Math.cos(angle - Math.PI / 2) * offset,
      gear1.y + Math.sin(angle - Math.PI / 2) * offset
    );
    context.lineTo(
      gear2.x + Math.cos(angle - Math.PI / 2) * offset,
      gear2.y + Math.sin(angle - Math.PI / 2) * offset
    );
    context.stroke();

    context.beginPath();
    context.arc(
      gear1.x,
      gear1.y,
      offset,
      angle + Math.PI / 2,
      angle - Math.PI / 2,
      true
    );
    context.stroke();

    context.beginPath();
    context.arc(
      gear2.x,
      gear2.y,
      offset,
      angle - Math.PI / 2,
      angle + Math.PI / 2,
      true
    );
    context.stroke();

    context.restore();
  }

  function checkGearMeshDistance(g1: Gear, g2: Gear): boolean {
    const dx = g2.x - g1.x;
    const dy = g2.y - g1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    // For proper meshing, gears should be exactly touching at their outer radii
    return Math.abs(distance - (g1.radius + g2.radius)) < 1;
  }

  function generateGears(count: number): [Gear[], Belt[]] {
    const gears: Gear[] = [];
    const belts: Belt[] = [];
    const minRadius = 30;
    const maxRadius = 50;

    // Place first gear
    const firstGear: Gear = {
      x: width * 0.5,
      y: height * 0.5,
      radius: Random.range(minRadius, maxRadius),
      teeth: Math.floor(Random.range(8, 16)),
      rotation: 0,
      speed: 0.02,
      connected: [],
      type: 'gear',
    };
    gears.push(firstGear);

    // Add subsequent gears in meshing positions
    for (let i = 1; i < count; i++) {
      const parentGear = Random.pick(gears);
      const newRadius = Random.range(minRadius, maxRadius);
      const angle = Random.range(0, Math.PI * 2);

      const newGear: Gear = {
        x: parentGear.x + Math.cos(angle) * (parentGear.radius + newRadius),
        y: parentGear.y + Math.sin(angle) * (parentGear.radius + newRadius),
        radius: newRadius,
        teeth: Math.floor(Random.range(8, 16)),
        rotation: 0,
        speed: -parentGear.speed * (parentGear.radius / newRadius),
        connected: [],
        type: Random.value() > 0.7 ? 'belt' : 'gear',
      };

      // Check if new gear position is valid
      let isValid = true;
      for (const existingGear of gears) {
        if (existingGear === parentGear) continue;
        const dx = newGear.x - existingGear.x;
        const dy = newGear.y - existingGear.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < (existingGear.radius + newGear.radius) * 1.1) {
          isValid = false;
          break;
        }
      }

      if (
        isValid &&
        newGear.x > width * 0.2 &&
        newGear.x < width * 0.8 &&
        newGear.y > height * 0.2 &&
        newGear.y < height * 0.8
      ) {
        gears.push(newGear);
        parentGear.connected.push(newGear);
        newGear.connected.push(parentGear);

        if (newGear.type === 'belt') {
          belts.push({ gear1: parentGear, gear2: newGear });
        }
      }
    }

    return [gears, belts];
  }

  const [gears, belts] = generateGears(8);

  wrap.render = () => {
    context.fillStyle = '#111';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = '#444';
    context.fillStyle = '#333';
    context.lineWidth = 2;

    belts.forEach(drawBelt);

    gears.forEach((gear) => {
      gear.rotation += gear.speed;
      drawGear(gear);
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
