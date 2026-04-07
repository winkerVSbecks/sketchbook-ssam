declare module 'pack-spheres';
declare module 'tweenr';
declare module 'tween-ticker';
declare module 'density-clustering';
declare module 'convex-hull';
declare module 'chaikin-smooth';
declare module 'canvas-sketch-util/math';
declare module 'canvas-sketch-util/random';
declare module 'canvas-sketch-util/color';
declare module 'canvas-sketch-util/geometry';
declare module 'canvas-sketch-util/penplot';
declare module 'webfontloader';
declare module 'polyline-normals';
declare module 'resolve-lygia';
declare module 'joy-joy';
declare module '@texel/color';
declare module 'load-asset';
declare module 'chromotome';
declare module 'convert-length';
declare module 'toxiclibsjs';

type Point = [number, number];
type Line = Point[];

declare module '*.frag' {
  const value: string;
  export default value;
}

declare module '*.vert' {
  const value: string;
  export default value;
}

declare module 'polybooljs' {
  const value: any;
  export default value;
}

declare module 'robust-point-in-polygon' {
  const value: (polygon: Point[], point: Point) => number;
  export default value;
}

// Heerich types
declare module 'heerich' {
  interface BoxStyle {
    default?: StyleObject;
    top?: StyleObject;
    bottom?: StyleObject;
    left?: StyleObject;
    right?: StyleObject;
    front?: StyleObject;
    back?: StyleObject;
  }

  interface ApplyGeometryOptions {
    type: 'box' | 'sphere' | 'line' | 'fill';
    position?: Coord3D;
    center?: Coord3D;
    size?: Coord3D;
    radius?: number;
    from?: Coord3D;
    to?: Coord3D;
    mode?: 'union' | 'subtract' | 'intersect' | 'exclude';
    style?: BoxStyle | StyleParam;
    opaque?: boolean;
    meta?: Record<string, unknown>;
  }

  interface ViewBoxBounds {
    x: number;
    y: number;
    w: number;
    h: number;
  }

  interface ToSVGOptions {
    padding?: number;
    viewBox?: [number, number, number, number];
    style?: StyleObject;
    occlusion?: boolean;
    faces?: Face[];
  }

  class Heerich {
    constructor(options?: HeerichOptions);
    applyGeometry(options: ApplyGeometryOptions): this;
    addGeometry(options: Omit<ApplyGeometryOptions, 'mode'>): this;
    removeGeometry(options: Omit<ApplyGeometryOptions, 'mode'>): this;
    getFaces(): Face[];
    getBounds(): ViewBoxBounds;
    toSVG(options?: ToSVGOptions): string;
  }

  export default Heerich;
  export { Heerich };
}

interface HatchOptions {
  angle?: number;
  period?: number;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

interface StyleObject {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  strokeDasharray?: string;
  strokeLinecap?: string;
  strokeLinejoin?: string;
  fillOpacity?: number;
  strokeOpacity?: number;
  hatch?: HatchOptions;
  [key: string]: string | number | HatchOptions | undefined;
}

type StyleParam =
  | StyleObject
  | ((x: number, y: number, z: number) => StyleObject);

type BooleanMode = 'union' | 'subtract' | 'intersect' | 'exclude';

type Coord3D = [number, number, number];

interface RotateOptions {
  axis: 'x' | 'y' | 'z';
  turns: number;
  center?: Coord3D;
}

interface CameraOptions {
  type?: 'oblique' | 'perspective' | 'isometric' | 'orthographic';
  angle?: number;
  distance?: number;
  position?: [number, number];
}

interface HeerichOptions {
  tile?: [number, number];
  style?: StyleObject;
  camera?: CameraOptions;
}

interface Face {
  type: string;
  points: { data: number[] };
  style: StyleObject;
  depth: number;
  voxel: { x: number; y: number; z: number; meta?: Record<string, unknown> };
}
