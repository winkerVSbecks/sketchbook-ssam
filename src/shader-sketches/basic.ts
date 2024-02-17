import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import { Mesh, Program, Renderer, Triangle, Vec2 } from 'ogl';
import { resolveLygia } from 'resolve-lygia';

const baseFrag = resolveLygia(/*glsl*/ `precision highp float;

// float circleSDF(vec2 p, float r) { return length(p) - r; }
#include "lygia/sdf/circleSDF.glsl"

uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / uResolution.y;
  p.x *= aspect;

  float circ = circleSDF(p + vec2(0.5));

  vec3 col = vec3(p, sin(uTime) * 0.5 + 0.5);
  gl_FragColor = vec4(vec3(circ), 1.0);
}`);

const baseVert = /*glsl*/ `attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}`;

const sketch: Sketch<'webgl2'> = ({
  wrap,
  canvas,
  width,
  height,
  pixelRatio,
}) => {
  if (import.meta.hot) {
    import.meta.hot.dispose(() => wrap.dispose());
    import.meta.hot.accept(() => wrap.hotReload());
  }

  const renderer = new Renderer({
    canvas,
    width,
    height,
    dpr: pixelRatio,
  });
  const gl = renderer.gl;
  gl.clearColor(1, 1, 1, 1);

  const geometry = new Triangle(gl);
  const program = new Program(gl, {
    vertex: baseVert,
    fragment: baseFrag,
    uniforms: {
      uResolution: { value: new Vec2(width, height) },
      uTime: { value: 0 },
    },
  });
  const mesh = new Mesh(gl, { geometry, program });

  wrap.render = ({ playhead }) => {
    program.uniforms.uTime.value = playhead * Math.PI * 2;

    renderer.render({ scene: mesh });
  };

  wrap.resize = ({ width, height }) => {
    program.uniforms.uResolution.value.set(width, height);
    renderer.setSize(width, height);
  };

  wrap.unload = () => {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
};

const settings: SketchSettings = {
  mode: 'webgl2',
  // dimensions: [800, 800],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['webm'],
  attributes: {
    preserveDrawingBuffer: true,
  },
};

ssam(sketch, settings);
