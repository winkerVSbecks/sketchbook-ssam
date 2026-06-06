#!/usr/bin/env node
// Scaffolds a new ssam sketch file from a fixed template.
// Usage: node scaffold.js <name> <dir_or_dot> <mode> <animated> [duration_ms] <random> <math>
//   name        — filename without .ts
//   dir_or_dot  — subdirectory under src/sketches/, or "." for no subdir
//   mode        — 2d | webgl | webgl2
//   animated    — true | false
//   duration_ms — milliseconds (only required when animated=true)
//   random      — true | false (import canvas-sketch-util/random)
//   math        — true | false (import canvas-sketch-util/math)
// Prints the created file path on success.

import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const [, , name, dir, mode, animated, ...rest] = process.argv;

if (!name || !dir || !mode || !animated) {
  console.error('Usage: scaffold.js <name> <dir_or_dot> <mode> <animated> [duration_ms] <random> <math>');
  process.exit(1);
}

let duration, random, math;
if (animated === 'true') {
  [duration, random, math] = rest;
  duration = duration || '4000';
} else {
  [random, math] = rest;
}

const destDir = dir === '.' ? 'src/sketches' : `src/sketches/${dir}`;
mkdirSync(destDir, { recursive: true });
const dest = join(destDir, `${name}.ts`);

const randomLine = random === 'true' ? "import Random from 'canvas-sketch-util/random';\n" : '';
const mathLine   = math === 'true'   ? "import { mapRange } from 'canvas-sketch-util/math';\n" : '';
const extraImports = randomLine + mathLine;
const animLines = animated === 'true'
  ? `  duration: ${duration},\n  framesFormat: ['mp4'],\n  playFps: 60,\n  exportFps: 60,\n`
  : '';

let content;

if (mode === '2d') {
  content = `import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
${extraImports}
export const sketch = ({ wrap, context, width, height, ...props }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => { props.exportFrame(); });

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: ${animated},
${animLines}};

ssam(sketch as Sketch<'2d'>, settings);
`;
} else {
  content = `import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import { Mesh, Program, Renderer, Triangle } from 'ogl';
${extraImports}
const sketch: Sketch<'${mode}'> = ({ wrap, canvas, width, height, pixelRatio, ...props }) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }
  import.meta.hot?.on('mcp:export', () => { props.exportFrame(); });

  const renderer = new Renderer({ canvas, width, height, dpr: pixelRatio });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const vert = /* glsl */ \`
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0, 1);
    }
  \`;

  const frag = /* glsl */ \`
    precision highp float;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      gl_FragColor = vec4(vUv, 0.0, 1.0);
    }
  \`;

  const geometry = new Triangle(gl);
  const program = new Program(gl, {
    vertex: vert,
    fragment: frag,
    uniforms: { uTime: { value: 0 } },
  });
  const mesh = new Mesh(gl, { geometry, program });

  wrap.render = ({ playhead }) => {
    program.uniforms.uTime.value = playhead * Math.PI * 2;
    renderer.render({ scene: mesh });
  };
};

export const settings: SketchSettings = {
  mode: '${mode}',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: ${animated},
${animLines}};

ssam(sketch, settings);
`;
}

// Collapse triple-blank lines from unused optional imports
content = content.replace(/\n{3,}/g, '\n\n');

writeFileSync(dest, content);
console.log(dest);
