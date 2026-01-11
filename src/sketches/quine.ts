import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // The quine's DNA - this string contains its own representation
  const code = `import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  // The quine's DNA - this string contains its own representation
  const code = \`PLACEHOLDER\`;

  // Replace PLACEHOLDER with escaped version of itself
  const escapedCode = code.replace('PLACEHOLDER', code.replace(/\\\`/g, '\\\\\\\`').replace(/\\\\\$/g, '\\\\\\\\\$'));
  const lines = escapedCode.split('\\\\n');

  wrap.render = ({ playhead }) => {
    context.fillStyle = '#0a0a0a';
    context.fillRect(0, 0, width, height);

    const lineHeight = 28;
    const padding = 40;
    const maxVisibleLines = Math.floor((height - padding * 2) / lineHeight);

    // Clip the text rendering area
    context.save();
    context.beginPath();
    context.rect(padding, padding * 2, width - padding * 2, height - padding * 4);
    context.clip();

    // Render the source code with scrolling
    context.fillStyle = '#fff';
    context.font = '18px "SF Mono", "Monaco", "Consolas", monospace';

    // Scroll through the code over time
    const scrollOffset =
      playhead * Math.max(padding * 2, lines.length - maxVisibleLines);
    const startLine = Math.floor(scrollOffset);
    const endLine = startLine + maxVisibleLines;

    lines.slice(startLine, endLine).forEach((line, i) => {
      const y =
        padding + i * lineHeight - (scrollOffset - startLine) * lineHeight;
      context.fillText(line, padding, y);
    });

    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 30_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
`;

  // Replace PLACEHOLDER with escaped version of itself
  const escapedCode = code.replace(
    'PLACEHOLDER',
    code.replace(/`/g, '\\`').replace(/\$/g, '\\$')
  );
  const lines = escapedCode.split('\n');

  wrap.render = ({ playhead }) => {
    context.fillStyle = '#0a0a0a';
    context.fillRect(0, 0, width, height);

    const lineHeight = 28;
    const padding = 40;
    const maxVisibleLines = Math.floor((height - padding * 2) / lineHeight);

    // Clip the text rendering area
    context.save();
    context.beginPath();
    context.rect(
      padding,
      padding * 2,
      width - padding * 2,
      height - padding * 4
    );
    context.clip();

    // Render the source code with scrolling
    context.fillStyle = '#fff';
    context.font = '18px "SF Mono", "Monaco", "Consolas", monospace';

    // Scroll through the code over time
    const scrollOffset =
      playhead * Math.max(padding * 2, lines.length - maxVisibleLines);
    const startLine = Math.floor(scrollOffset);
    const endLine = startLine + maxVisibleLines;

    lines.slice(startLine, endLine).forEach((line, i) => {
      const y =
        padding + i * lineHeight - (scrollOffset - startLine) * lineHeight;
      context.fillText(line, padding, y);
    });

    context.restore();
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 30_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
};

ssam(sketch as Sketch<'2d'>, settings);
