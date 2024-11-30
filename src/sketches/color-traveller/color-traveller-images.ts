import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import load from 'load-asset';
import { lerp } from 'canvas-sketch-util/math';
import eases from 'eases';

const imagesRequests = [
  load('output/2024.11.26-20.38.25.png'),
  load('output/2024.11.26-20.23.53.png'),
  load('output/2024.11.26-20.23.40.png'),
  load('output/2024.11.26-20.08.03.png'),
  load('output/2024.11.26-13.54.08.png'),
];

const config = {
  count: 5,
};

const sketch: Sketch<'2d'> = async ({ wrap, context: ctx, width, height }) => {
  const images = await Promise.all(imagesRequests);

  // Get image data for all images
  const imageData = images.map((img) => {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;

    const tempCtx = tempCanvas.getContext('2d')!;
    tempCtx.drawImage(img, 0, 0);
    return tempCtx.getImageData(0, 0, img.width, img.height);
  });

  const interpolatePixels = (
    current: ImageData,
    next: ImageData,
    t: number,
    staggerDuration: number = 0.3 // Controls how long the stagger effect takes
  ) => {
    const result = new Uint8ClampedArray(current.data.length);
    const pixelsPerRow = width * 2 * 4; // 4 channels per pixel (RGBA)

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
    return new ImageData(result, width * 2, height * 2);
  };

  wrap.render = ({ playhead }) => {
    // Calculate which images to interpolate between
    const numImages = images.length;
    const totalProgress = playhead * numImages;
    const currentIndex = Math.floor(totalProgress);
    const nextIndex = (currentIndex + 1) % numImages;
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
  duration: imagesRequests.length * 2_500, // 2 seconds per transition
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch, settings);
