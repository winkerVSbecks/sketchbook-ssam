import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import { Mesh, Program, Renderer, Triangle, Vec2, GPGPU } from 'ogl';
import { resolveLygia } from 'resolve-lygia';

const baseFrag = resolveLygia(/*glsl*/ `precision highp float;
varying vec2 vUv;
uniform sampler2D gsTexture;

void main(){
  float gs = texture2D(gsTexture, vUv).r;
  float gsMap = (gs - 0.3) / (0.9 - 0.3);

  // gl_FragColor = vec4(gsMap, gsMap, gsMap, 1.);
  gl_FragColor = vec4(texture2D(gsTexture, vUv).xyz, 1.);
}`);

const baseVert = /*glsl*/ `attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}`;

const simulationFrag = resolveLygia(/*glsl*/ `precision highp float;
varying vec2 vUv;
uniform sampler2D tMap;
uniform vec2 brush;
// uniform float brush_size;
uniform vec2 screen_size;
uniform float killrate_min;
uniform float killrate_max;
uniform float feedrate;
uniform float difussion_a;
uniform float difussion_b;


void main() {
    // vec2 step = vec2(1.,1.)/screen_size;

    // vec2 uv0 = texture2D(tMap, vUv + vec2(-step.x, -step.y)).rg * 0.05;
    // vec2 uv1 = texture2D(tMap, vUv + vec2( 0., -step.y)).rg * 0.2;
    // vec2 uv2 = texture2D(tMap, vUv + vec2(step.x, -step.y)).rg * 0.05;

    // vec2 uv3 = texture2D(tMap, vUv + vec2(-step.x, 0.)).rg * 0.2;
    // vec2 uv4 = texture2D(tMap, vUv).rg * (0.-1.);
    // vec2 uv5 = texture2D(tMap, vUv + vec2(step.x, 0.)).rg * 0.2;

    // vec2 uv6 = texture2D(tMap, vUv + vec2(-step.x, step.y)).rg * 0.05;
    // vec2 uv7 = texture2D(tMap, vUv + vec2( 0., step.y)).rg * 0.2;
    // vec2 uv8 = texture2D(tMap, vUv + vec2(step.x, step.y)).rg * 0.05;

    // vec2 laplacian = uv0 + uv1 + uv2 + uv3 + uv4 + uv5 + uv6 + uv7 + uv8;

    // vec2 uv = texture2D(tMap, vUv).rg;

    // float killrate = (vUv.x * (killrate_max-killrate_min)) + killrate_min;

    // float a = uv.r + 1. * ((laplacian.r * difussion_a) - (uv.r*uv.g*uv.g) + (feedrate * (1. - uv.r)));

    // float b = uv.g + 1. * ((laplacian.g * difussion_b) + (uv.r*uv.g*uv.g) - ((feedrate + killrate) * uv.g));


    // gl_FragColor =  vec4(clamp(a,0.,1.), clamp(b,0.,1.),0. ,1.);
    gl_FragColor =  texture2D(tMap, vUv);

    // if(brush.x > 0.0){
    //     vec2 diff = (vUv - brush) * screen_size;
    //     float dist = dot(diff, diff);
    //     if(dist < brush_size)
    //         gl_FragColor = vec4(0.,1.,0.,1.);
    // }
}
`);

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

  const texSize = width * height * 4;

  const initTex = new Float32Array(texSize);

  for (let i = 0; i < texSize; i++) {
    initTex[i] = Math.random();
  }

  // for (let i = 0; i < texSize * 4; i += 4) {
  //   let val = Math.random() > 0.9 ? 1 : 0;
  //   initTex[i] = val;
  //   initTex[i + 1] = val;
  //   initTex[i + 2] = val;
  //   initTex[i + 3] = 1;
  // }

  // for (let i = 0; i < texSize; i++) {
  //   initTex[4 * i] = 1;
  //   if (Math.random() > 0.9) {
  //     initTex[4 * i + 1] = 1;
  //   }

  //   // if (Math.random() > 0.9) {
  //   //   initTex[4 * i] = 0;
  //   // } else {
  //   //   initTex[4 * i] = 1;
  //   // }
  // }

  const texture = new GPGPU(gl, { data: initTex });

  texture.addPass();
  // texture.addPass({
  //   fragment: simulationFrag,
  //   uniforms: {
  //     previousTexture: texture.uniform,
  //     screen_size: { value: [width, height] },
  //     killrate_min: { value: 0.045 },
  //     killrate_max: { value: 0.05 },
  //     feedrate: { value: 0.015 },
  //     difussion_a: { value: 1 },
  //     difussion_b: { value: 0.5 },
  //   },
  // });

  const geometry = new Triangle(gl);
  const program = new Program(gl, {
    vertex: baseVert,
    fragment: baseFrag,
    uniforms: {
      uResolution: { value: new Vec2(width, height) },
      uTime: { value: 0 },
      gsTexture: texture.uniform,
    },
  });
  const mesh = new Mesh(gl, { geometry, program });

  wrap.render = ({ playhead }) => {
    program.uniforms.uTime.value = playhead * Math.PI * 2;

    texture.render();
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
  dimensions: [800, 800],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 6_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
  attributes: {
    preserveDrawingBuffer: true,
  },
};

ssam(sketch, settings);
