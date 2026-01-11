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
    context.rect(padding, padding, width - padding * 2, height - padding * 2);
    context.clip();

    // Render the source code with carousel scrolling
    context.fillStyle = '#fff';
    context.font = '18px "SF Mono", "Monaco", "Consolas", monospace';

    // Carousel scroll - wraps around infinitely
    const scrollOffset = playhead * lines.length;
    const startLine = Math.floor(scrollOffset) % lines.length;
    const pixelOffset = (scrollOffset % 1) * lineHeight;

    // Render visible lines in carousel fashion
    for (let i = 0; i < maxVisibleLines + 1; i++) {
      const lineIndex = (startLine + i) % lines.length;
      const line = lines[lineIndex];
      const y = padding + i * lineHeight - pixelOffset;
      context.fillText(line, padding, y);
    }

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
    context.rect(padding, padding, width - padding * 2, height - padding * 2);
    context.clip();

    // Render the source code with carousel scrolling
    context.fillStyle = '#fff';
    context.font = '18px "SF Mono", "Monaco", "Consolas", monospace';

    // Carousel scroll - wraps around infinitely
    const scrollOffset = playhead * lines.length;
    const startLine = Math.floor(scrollOffset) % lines.length;
    const pixelOffset = (scrollOffset % 1) * lineHeight;

    // Render visible lines in carousel fashion
    for (let i = 0; i < maxVisibleLines + 1; i++) {
      const lineIndex = (startLine + i) % lines.length;
      const line = lines[lineIndex];
      const y = padding + i * lineHeight - pixelOffset;
      context.fillText(line, padding, y);
    }

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
