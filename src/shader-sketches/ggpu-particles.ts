import { ssam } from 'ssam';
import type { Sketch, SketchSettings } from 'ssam';
import { Renderer, Camera, Geometry, Program, Mesh, Vec2, GPGPU } from 'ogl';
import { resolveLygia } from 'resolve-lygia';

/**
 * From: https://github.com/oframe/ogl/blob/master/examples/gpgpu-particles.html
 */
const velocityFragment = resolveLygia(/* glsl */ `
  precision highp float;

  uniform float uTime;
  uniform sampler2D tPosition;
  uniform sampler2D tMap;
  uniform vec2 uMouse;

  varying vec2 vUv;

  void main() {
    vec4 position = texture2D(tPosition, vUv);
    vec4 velocity = texture2D(tMap, vUv);

    gl_FragColor = velocity;
  }
`);

const positionFragment = resolveLygia(/* glsl */ `
  precision highp float;

  #include "lygia/generative/curl.glsl"

  uniform float uTime;
  uniform sampler2D tVelocity;

  // Default texture uniform for GPGPU pass is 'tMap'.
  // Can use the textureUniform parameter to update.
  uniform sampler2D tMap;

  varying vec2 vUv;

  void main() {
    vec4 position = texture2D(tMap, vUv);
    vec4 velocity = texture2D(tVelocity, vUv);

    velocity.xy += curl(vec3(position.xy * 10., uTime)).xy;

    // position.xy += curl(vec3(position.xy, uTime)).xy * 0.01; //velocity.xy * 0.01;
    position.xy += velocity.xy * 0.005;

    gl_FragColor = position;
  }
`);

const vertex = /* glsl */ `
  attribute vec2 coords;
  attribute vec4 random;

  uniform float uTime;
  uniform sampler2D tPosition;
  uniform sampler2D tVelocity;

  varying vec4 vRandom;
  varying vec4 vVelocity;
  varying vec4 vPosition;

  void main() {
    vRandom = random;

    // Get position from texture, rather than attribute
    vec4 position = texture2D(tPosition, coords);
    vVelocity = texture2D(tVelocity, coords);
    vPosition = position;

    gl_Position = vec4(position.xy, 0, 1);
    gl_PointSize = mix(2.0, 15.0, vRandom.x);

    // Make bigger while moving
    gl_PointSize *= 1.0 + min(1.0, length(vVelocity.xy));
  }
`;

const fragment = /* glsl */ `
  precision highp float;

  varying vec4 vRandom;
  varying vec4 vVelocity;
  varying vec4 vPosition;

  vec3 pal( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) { return a + b*cos( 6.28318*(c*t+d) ); }

  vec3 spectrum(float n) {
    // return pal( n, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0,0.33,0.67) );
    return pal( n, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.0,0.10,0.20) );
    // return pal( n, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,1.0),vec3(0.3,0.20,0.20) );
    // return pal( n, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,1.0,0.5),vec3(0.8,0.90,0.30) );
    // return pal( n, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(1.0,0.7,0.4),vec3(0.0,0.15,0.20) );
    // return pal( n, vec3(0.5,0.5,0.5),vec3(0.5,0.5,0.5),vec3(2.0,1.0,0.0),vec3(0.5,0.20,0.25) );
    // return pal( n, vec3(0.8,0.5,0.4),vec3(0.2,0.4,0.2),vec3(2.0,1.0,1.0),vec3(0.0,0.25,0.25) );
  }

  void main() {
    // Circle shape
    if (step(0.25, length(gl_PointCoord.xy - 0.5)) > 0.0) discard;

    vec3 color = spectrum(length(vRandom)); //vec3(vRandom.zy, 1.0) * mix(0.7, 2.0, vRandom.w);

    // Fade to black when not moving, with an ease off curve
    // gl_FragColor.rgb = mix(vec3(0), color, 1.0 - pow(1.0 - smoothstep(0.0, 0.7, length(vVelocity.xy)), 2.0));
    gl_FragColor.rgb = color;

    gl_FragColor.a = 1.0;
  }
`;

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
  gl.clearColor(0, 0, 0, 1);

  const camera = new Camera(gl, { fov: 45 });
  camera.position.set(0, 0, 5);

  // Common uniforms
  const time = { value: 0 };
  const mouse = { value: new Vec2() };

  // The number of particles will determine how large the GPGPU textures are,
  // and therefore how expensive the GPU calculations will be.
  // Below I'm using 65536 to use every pixel of a 256x256 texture. If I used one more (65537),
  // it would need to use a 512x512 texture - the GPU would then perform calculations for each pixel,
  // meaning that nearly 3/4 of the texture (196607 pixels) would be redundant.
  const numParticles = 262144; // 262144; //65536;

  // Create the initial data arrays for position and velocity. 4 values for RGBA channels in texture.
  const initialPositionData = new Float32Array(numParticles * 4);
  const initialVelocityData = new Float32Array(numParticles * 4);

  // Random to be used as regular static attribute
  const random = new Float32Array(numParticles * 4);
  for (let i = 0; i < numParticles; i++) {
    initialPositionData.set(
      [
        (Math.random() - 0.5) * 2.0,
        (Math.random() - 0.5) * 2.0,
        0, // the Green and Alpha channels go unused in this example, however I set
        1, // unused Alpha to 1 so that texture is visible in WebGL debuggers
      ],
      i * 4
    );
    initialVelocityData.set([0, 0, 0, 1], i * 4);
    random.set(
      [Math.random(), Math.random(), Math.random(), Math.random()],
      i * 4
    );
  }

  // Initialise the GPGPU classes, creating the FBOs and corresponding texture coordinates
  const position = new GPGPU(gl, { data: initialPositionData });
  const velocity = new GPGPU(gl, { data: initialVelocityData });

  // Add the simulation shaders as passes to each GPGPU class
  position.addPass({
    fragment: positionFragment,
    uniforms: {
      uTime: time,
      tVelocity: velocity.uniform,
    },
  });
  velocity.addPass({
    fragment: velocityFragment,
    uniforms: {
      uTime: time,
      uMouse: mouse,
      tPosition: position.uniform,
    },
  });

  // Now we can create our geometry, using the coordinates from above.
  // We don't use the velocity or position data as attributes,
  // instead we will get this from the FBO textures in the shader.
  const geometry = new Geometry(gl, {
    random: { size: 4, data: random },
    // Could use either position or velocity coords, as they are the same
    coords: { size: 2, data: position.coords },
  });

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uTime: time,
      tPosition: position.uniform,
      tVelocity: velocity.uniform,
    },
  });

  const points = new Mesh(gl, { geometry, program, mode: gl.POINTS });

  // Add handlers to get mouse position
  const isTouchCapable = 'ontouchstart' in window;
  if (isTouchCapable) {
    window.addEventListener('touchstart', updateMouse, false);
    window.addEventListener('touchmove', updateMouse, false);
  } else {
    window.addEventListener('mousemove', updateMouse, false);
  }

  function updateMouse(e: any) {
    if (e.changedTouches && e.changedTouches.length) {
      e.x = e.changedTouches[0].pageX;
      e.y = e.changedTouches[0].pageY;
    }
    if (e.x === undefined) {
      e.x = e.pageX;
      e.y = e.pageY;
    }

    // Get mouse value in -1 to 1 range, with y flipped
    mouse.value.set(
      (e.x / gl.renderer.width) * 2 - 1,
      (1.0 - e.y / gl.renderer.height) * 2 - 1
    );
  }

  wrap.render = ({ time: t, playhead }) => {
    program.uniforms.uTime.value = playhead * Math.PI * 2;

    time.value = t * 0.001;

    // Update the GPGPU classes
    velocity.render();
    position.render();

    renderer.render({ scene: points, camera });
  };

  wrap.resize = ({ width, height }) => {
    // program.uniforms.uResolution.value.set(width, height);
    renderer.setSize(width, height);
    camera.perspective({ aspect: width / height });
  };

  wrap.unload = () => {
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  };
};

const settings: SketchSettings = {
  mode: 'webgl2',
  dimensions: [1080, 1080],
  pixelRatio: window.devicePixelRatio,
  animate: true,
  duration: 4_000,
  playFps: 60,
  exportFps: 60,
  framesFormat: ['mp4'],
  attributes: {
    preserveDrawingBuffer: true,
  },
};

ssam(sketch, settings);
