import type { SketchProps } from 'ssam';
import { createOffscreenCanvas } from '@daeinc/canvas';

// export interface OffscreenSketchProps
//   extends Omit<SketchProps, 'context' | 'canvas'> {
//   context: OffscreenCanvasRenderingContext2D;
//   canvas: OffscreenCanvas;
//   gl: WebGLRenderingContext | WebGL2RenderingContext | undefined;
// }

export function renderOffscreen(
  draw: (props: SketchProps) => void,
  props: {
    context: '2d' | 'webgl' | 'webgl2';
    width: number;
    height: number;
    pixelRatio?: number | undefined;
    pixelated?: boolean | undefined;
    scaleContext?: boolean | undefined;
    attributes?:
      | CanvasRenderingContext2DSettings
      | WebGLContextAttributes
      | undefined;
  }
) {
  const { canvas, context, gl } = createOffscreenCanvas(props);

  return (finalProps: SketchProps) =>
    draw({
      ...finalProps,
      // @ts-ignore
      context: context as OffscreenCanvasRenderingContext2D,
      // @ts-ignore
      canvas: canvas as OffscreenCanvas,
      gl,
    });
}
