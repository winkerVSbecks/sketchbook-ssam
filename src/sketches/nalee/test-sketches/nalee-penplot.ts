import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import Random from 'canvas-sketch-util/random';
import { pathsToSVG } from 'canvas-sketch-util/penplot';
import { createNaleeSystem } from '../nalee-system';
import { makeDomain } from '../domain';
import { Config } from '../types';
import { xyToCoords } from '../utils';
import { getDimensionsFromPreset } from '../../../penplot/distances';
import paperSizes from '../../../penplot/paper-sizes';

// Random.setSeed('nalee');
const paperSettings = {
  dimensions: 'a4',
  pixelsPerInch: 300,
  units: 'cm',
};

export const sketch = async ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const size = 12;
  const config = {
    resolution: Math.floor(1080 / size),
    size: size,
    stepSize: size / 3,
    walkerCount: 30,
    padding: 0.03125, // 1 / 32
    pathStyle: 'solidStyle',
    flat: true,
  } satisfies Config;

  const domainToWorld = xyToCoords(
    config.resolution,
    config.padding,
    width,
    height
  );

  const domain = makeDomain(config.resolution, domainToWorld);
  const walkers = createNaleeSystem(
    domain,
    config,
    domainToWorld,
    ['#FFDE73', '#EE7744', '#F9BC4F', '#2C7C79', '#4C4D78', '#FFF5E0'],
    '#101019',
    false,
    true
  ) as Point[][][];

  let svg = '';

  // Add event listener for Cmd + E (or Ctrl + E)
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.which === 85) {
      event.preventDefault();
      downloadSVG(svg, 'nalee-plot.svg');
    }
  });

  wrap.render = (props: SketchProps) => {
    const { width, height } = props;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#101019';
    context.fillRect(0, 0, width, height);

    context.strokeStyle = '#fff';
    context.lineWidth = 4;

    context.lineCap = 'round';
    context.lineJoin = 'round';

    const paths = walkers.flat();

    paths.forEach((pts) => {
      drawShape(context, pts, false);
      context.stroke();
    });

    svg = pathsToSVG(paths, {
      width, //: paperSizes[paperSettings.dimensions].dimensions[0],
      height, //: paperSizes[paperSettings.dimensions].dimensions[1],
      // units: 'cm',
      // lineWidth: 1,
      optimize: true,
    });
  };
};

function drawShape(
  context: CanvasRenderingContext2D,
  [start, ...pts]: Point[],
  closed = true
) {
  context.beginPath();
  context.moveTo(...start);
  pts.forEach((pt) => {
    context.lineTo(...pt);
  });
  if (closed) {
    context.closePath();
  }
}

function downloadSVG(svgContent: string, fileName: string) {
  const blob = new Blob([svgContent], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: getDimensionsFromPreset(
    paperSettings.dimensions,
    'px',
    paperSettings.pixelsPerInch
  ),
  pixelRatio: window.devicePixelRatio,
  animate: false,
  scaleToParent: true,
  scaleContext: true,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
