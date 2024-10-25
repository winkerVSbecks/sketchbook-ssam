import { drawRect } from '@daeinc/draw';
import { lerp } from '@daeinc/math';
import type { Sketch, SketchSettings } from 'ssam';
import { ssam } from 'ssam';
import PdTimeline from '@daeinc/pd-timeline';

const sketch: Sketch<'2d'> = ({ wrap, context: ctx, width, height }) => {
  const tl = new PdTimeline();

  tl.appendRange('lr', 1.0);
  tl.appendRange('tb', 1.0);
  tl.appendRange('rl', 1.0);
  tl.appendRange('bt', 1.0);

  const posLR = [
    [0, 0],
    [width - 100, 0],
  ];
  const posTB = [
    [width - 100, 0],
    [width - 100, height - 100],
  ];
  const posRL = [
    [width - 100, height - 100],
    [0, height - 100],
  ];
  const posBT = [
    [0, height - 100],
    [0, 0],
  ];

  const pos = [0, 0];

  wrap.render = ({ width, height, deltaTime, time }) => {
    ctx.fillStyle = `#112`;
    ctx.fillRect(0, 0, width, height);

    // update time with deltaTime
    // tl.update(deltaTime * 0.001);

    // update time
    tl.updateTime(time * 0.001);

    if (tl.isRangeActive('lr')) {
      const t = tl.getRangeProgress('lr');
      pos[0] = lerp(posLR[0][0], posLR[1][0], t);
      pos[1] = lerp(posLR[0][1], posLR[1][1], t);
    }
    if (tl.isRangeActive('tb')) {
      const t = tl.getRangeProgress('tb');
      pos[0] = lerp(posTB[0][0], posTB[1][0], t);
      pos[1] = lerp(posTB[0][1], posTB[1][1], t);
    }
    if (tl.isRangeActive('rl')) {
      const t = tl.getRangeProgress('rl');
      pos[0] = lerp(posRL[0][0], posRL[1][0], t);
      pos[1] = lerp(posRL[0][1], posRL[1][1], t);
    }
    if (tl.isRangeActive('bt')) {
      const t = tl.getRangeProgress('bt');
      pos[0] = lerp(posBT[0][0], posBT[1][0], t);
      pos[1] = lerp(posBT[0][1], posBT[1][1], t);
    }

    drawRect(ctx, pos, [100, 100]);
    ctx.fillStyle = `#999`;
    ctx.fill();
  };
};

const settings: SketchSettings = {
  dimensions: [800, 800],
  duration: 4_000,
};

ssam(sketch, settings);
