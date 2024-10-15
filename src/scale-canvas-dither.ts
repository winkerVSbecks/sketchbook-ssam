export function scaleCanvasAndApplyDither(
  width: number,
  height: number,
  scaleFactor: number = 0.25,
  canvas: HTMLCanvasElement,
  dither: (data: ImageData) => ImageData
): HTMLCanvasElement {
  const smallCanvas = document.createElement('canvas');
  const smallCtx = smallCanvas.getContext('2d')!;

  smallCanvas.width = width * scaleFactor;
  smallCanvas.height = height * scaleFactor;
  smallCtx.drawImage(
    canvas,
    0,
    0,
    smallCanvas.width * window.devicePixelRatio,
    smallCanvas.height * window.devicePixelRatio
  );

  const data = smallCtx.getImageData(0, 0, width, height);

  const dithered = dither(data);

  smallCtx.putImageData(dithered, 0, 0);

  return smallCanvas;
}
