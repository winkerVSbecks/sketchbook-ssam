export function scaleCanvasAndApplyDither(
  width: number,
  height: number,
  scaleFactor: number = 0.25,
  canvas: HTMLCanvasElement,
  dither: (data: ImageData) => ImageData
): HTMLCanvasElement {
  const smallCanvas = document.createElement('canvas');
  const smallCtx = smallCanvas.getContext('2d')!;

  const w = width * scaleFactor * window.devicePixelRatio;
  const h = height * scaleFactor * window.devicePixelRatio;

  smallCanvas.width = w;
  smallCanvas.height = h;
  smallCtx.drawImage(canvas, 0, 0, w, h);

  const data = smallCtx.getImageData(0, 0, w, h);

  const dithered = dither(data);

  smallCtx.putImageData(dithered, 0, 0);

  return smallCanvas;
}
