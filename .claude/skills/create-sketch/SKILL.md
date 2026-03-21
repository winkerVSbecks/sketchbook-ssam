---
name: create-sketch
description: >
  Scaffolds a new generative art sketch for the sketchbook-ssam project using the ssam framework.
  Use this skill whenever the user wants to create a new sketch, start a new generative art piece,
  add a new sketch file, or says anything like "make a sketch", "new sketch", "create a sketch called X",
  "I want to start a new piece", or describes a generative art idea they want to code up.
  Always use this skill — don't just write the file from memory.
---

# create-sketch

Scaffold a new ssam sketch file with the right structure, imports, and settings.

## Step 1: Gather info

Ask the user (in a single message, all at once):

1. **Sketch name** — what to call it (becomes the filename, e.g. `circle-grid` → `src/sketches/circle-grid.ts`)
2. **Mode** — `2d` (default), `webgl`, or `webgl2`
3. **Animated?** — yes or no (default: no). If yes, ask for duration in milliseconds (default: 4000)
4. **Random?** — import `canvas-sketch-util/random`? (yes/no)
5. **Math?** — import `canvas-sketch-util/math` for `mapRange` etc.? (yes/no)

If any of these are already clear from context (e.g. the user said "animated sketch called foo"), don't re-ask for those — only ask what's missing.

## Step 2: Create the file

Create `src/sketches/<name>.ts` using the appropriate template below.

### 2D template

```typescript
import { ssam } from 'ssam';
import type { Sketch, SketchProps, SketchSettings } from 'ssam';
// RANDOM_IMPORT
// MATH_IMPORT

export const sketch = ({ wrap, context, width, height }: SketchProps) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  wrap.render = ({ width, height }: SketchProps) => {
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
  };
};

export const settings: SketchSettings = {
  mode: '2d',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: ANIMATE,
  // DURATION_LINE
  // FRAMES_LINE
  // FPS_LINES
};

ssam(sketch as Sketch<'2d'>, settings);
```

### WebGL/WebGL2 template

```typescript
import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import { Mesh, Program, Renderer, Triangle } from 'ogl';
// RANDOM_IMPORT
// MATH_IMPORT

const sketch: Sketch<'MODE'> = ({ wrap, canvas, width, height, pixelRatio }) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const renderer = new Renderer({ canvas, width, height, dpr: pixelRatio });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const vert = /* glsl */ `
    attribute vec2 position;
    varying vec2 vUv;
    void main() {
      vUv = position * 0.5 + 0.5;
      gl_Position = vec4(position, 0, 1);
    }
  `;

  const frag = /* glsl */ `
    precision highp float;
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      gl_FragColor = vec4(vUv, 0.0, 1.0);
    }
  `;

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
  mode: 'MODE',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: ANIMATE,
  // DURATION_LINE
  // FRAMES_LINE
  // FPS_LINES
};

ssam(sketch, settings);
```

## Step 3: Fill in the placeholders

| Placeholder | Replacement |
|---|---|
| `// RANDOM_IMPORT` | `import Random from 'canvas-sketch-util/random';` (or remove line) |
| `// MATH_IMPORT` | `import { mapRange } from 'canvas-sketch-util/math';` (or remove line) |
| `ANIMATE` | `true` or `false` |
| `// DURATION_LINE` | `duration: <ms>,` (only if animated, remove comment otherwise) |
| `// FRAMES_LINE` | `framesFormat: ['mp4'],` (only if animated, remove comment otherwise) |
| `// FPS_LINES` | `playFps: 60,\n  exportFps: 60,` (only if animated, remove comment otherwise) |
| `MODE` | `webgl` or `webgl2` |

Remove all comment placeholders that aren't used — don't leave `// RANDOM_IMPORT` or empty comment lines in the final file.

## Step 4: Tell the user

After creating the file, tell them:
- The file path created
- How to run it: `VITE_SKETCH="sketches/<name>" npm run dev`
