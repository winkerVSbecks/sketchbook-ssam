import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
import { lerp } from 'canvas-sketch-util/math';
import eases from 'eases';
import { renderOffscreen } from '../../render-offscreen';
import { ClusterConfig, renderCluster } from '../cluster-growth/system';

const config = {
  count: 5,
};

const sketch: Sketch<'2d'> = async ({ wrap, context: ctx, width, height }) => {
  const clusterConfig: ClusterConfig = {
    cellSize: 10,
    gap: 0,
    growthProbabilityMin: 0.05,
    growthProbabilityMax: 0.2,
    initialClusterSize: 8,
    chars: '░▒▓'.split(''),
    width,
    height,
  };

  function loadImageData(): Promise<ImageData> {
    console.log('Loading image data');

    return new Promise((resolve, reject) => {
      const draw = ({ context, width, height, pixelRatio }: SketchProps) => {
        renderCluster(clusterConfig)({
          context,
          width,
          height,
          pixelRatio,
        } as SketchProps);
        resolve(
          context.getImageData(0, 0, width * pixelRatio, height * pixelRatio)
        );
      };

      const offScreenDraw = renderOffscreen(draw, {
        context: '2d',
        width: 1080,
        height: 1080,
        pixelRatio: window.devicePixelRatio,
      });

      offScreenDraw({
        width,
        height,
        pixelRatio: window.devicePixelRatio,
      } as SketchProps);
    });
  }

  const imageData = await Promise.all(
    Array.from({ length: config.count }, loadImageData)
  );

  const interpolatePixels = (
    current: ImageData,
    next: ImageData,
    t: number,
    staggerDuration: number = 0.3 // Controls how long the stagger effect takes
  ) => {
    const result = new Uint8ClampedArray(current.data.length);

    for (let y = 0; y < height * 2; y++) {
      for (let x = 0; x < width * 2; x++) {
        const i = (y * width * 2 + x) * 4;

        // Calculate staggered progress based on x position
        const xProgress = x / (width * 2);
        const staggeredT = Math.max(
          0,
          Math.min(1, (t - xProgress * staggerDuration) / (1 - staggerDuration))
        );

        // Apply easing to the staggered transition
        const easedT = eases.quadInOut(staggeredT);

        // Interpolate RGBA values
        for (let j = 0; j < 4; j++) {
          result[i + j] = Math.round(
            lerp(current.data[i + j], next.data[i + j], easedT)
          );
        }
      }
    }
    return new ImageData(
      result,
      width * window.devicePixelRatio,
      height * window.devicePixelRatio
    );
  };

  wrap.render = ({ playhead }) => {
    // Calculate which images to interpolate between
    const totalProgress = playhead * config.count;
    const currentIndex = Math.floor(totalProgress);
    const nextIndex = (currentIndex + 1) % config.count;
    const progress = totalProgress % 1;

    // Interpolate and draw
    const interpolated = interpolatePixels(
      imageData[currentIndex],
      imageData[nextIndex],
      progress
    );
    ctx.putImageData(interpolated, 0, 0);
  };
};

const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  duration: config.count * 2_500, // 2 seconds per transition
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch, settings);
