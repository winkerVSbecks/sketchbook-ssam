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
  type: 'gear' | 'chain';
};

type Chain = {
  gear1: Gear;
  gear2: Gear;
  points: { x: number; y: number }[];
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

  function calculateChainPoints(
    g1: Gear,
    g2: Gear
  ): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    const dx = g2.x - g1.x;
    const dy = g2.y - g1.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);
    const r1 = g1.radius + 5;
    const r2 = g2.radius + 5;

    const crossAngle = Math.asin((r2 - r1) / distance);
    const tangentAngle = Math.acos((r1 + r2) / distance);

    const arc1Steps = Math.ceil(
      (g1.teeth * (Math.PI + 2 * crossAngle)) / (2 * Math.PI)
    );
    for (let i = 0; i <= arc1Steps; i++) {
      const t = i / arc1Steps;
      const a = angle + Math.PI - crossAngle + t * (2 * crossAngle);
      points.push({
        x: g1.x + Math.cos(a) * r1,
        y: g1.y + Math.sin(a) * r1,
      });
    }

    const arc2Steps = Math.ceil(
      (g2.teeth * (Math.PI + 2 * crossAngle)) / (2 * Math.PI)
    );
    for (let i = 0; i <= arc2Steps; i++) {
      const t = i / arc2Steps;
      const a = angle + crossAngle + t * (2 * crossAngle);
      points.push({
        x: g2.x + Math.cos(a) * r2,
        y: g2.y + Math.sin(a) * r2,
      });
    }

    return points;
  }

  function drawChain(chain: Chain, playhead: number) {
    context.save();
    context.strokeStyle = '#666';
    context.lineWidth = 3;

    context.beginPath();
    chain.points.forEach((p, i) => {
      if (i === 0) context.moveTo(p.x, p.y);
      else context.lineTo(p.x, p.y);
    });

    const firstPoint = chain.points[0];
    context.lineTo(firstPoint.x, firstPoint.y);
    context.stroke();

    const totalLength = chain.points.length;
    const offset = (playhead * totalLength * 2) % totalLength;

    for (let i = 0; i < totalLength; i += 4) {
      const idx = Math.floor((i + offset) % totalLength);
      const p = chain.points[idx];
      context.fillStyle = '#444';
      context.beginPath();
      context.arc(p.x, p.y, 2, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }

  function generateGears(count: number): [Gear[], Chain[]] {
    const gears: Gear[] = [];
    const chains: Chain[] = [];
    const minRadius = 30;
    const maxRadius = 50;

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

    for (let i = 1; i < count; i++) {
      const parentGear = Random.pick(gears);
      const newRadius = Random.range(minRadius, maxRadius);
      const angle = Random.range(0, Math.PI * 2);

      const newGear: Gear = {
        x:
          parentGear.x + Math.cos(angle) * (parentGear.radius + newRadius + 20),
        y:
          parentGear.y + Math.sin(angle) * (parentGear.radius + newRadius + 20),
        radius: newRadius,
        teeth: Math.floor(Random.range(8, 16)),
        rotation: 0,
        speed: -parentGear.speed * (parentGear.radius / newRadius),
        connected: [],
        type: Random.value() > 0.7 ? 'chain' : 'gear',
      };

      let isValid = true;
      for (const existingGear of gears) {
        if (existingGear === parentGear) continue;
        const dx = newGear.x - existingGear.x;
        const dy = newGear.y - existingGear.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        if (distance < (existingGear.radius + newGear.radius) * 1.5) {
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

        if (newGear.type === 'chain') {
          chains.push({
            gear1: parentGear,
            gear2: newGear,
            points: calculateChainPoints(parentGear, newGear),
          });
        }
      }
    }

    return [gears, chains];
  }

  const [gears, chains] = generateGears(8);

  wrap.render = ({ playhead }) => {
    context.fillStyle = '#111';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = '#444';
    context.fillStyle = '#333';
    context.lineWidth = 2;

    chains.forEach((chain) => drawChain(chain, playhead));
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
