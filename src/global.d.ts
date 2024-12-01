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
declare module 'webfontloader';
declare module 'polyline-normals';
declare module 'resolve-lygia';
declare module 'joy-joy';
declare module '@texel/color';
declare module 'load-asset';
declare module 'chromotome';

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
