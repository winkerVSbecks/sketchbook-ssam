export type PathStyle =
  | 'solidStyle'
  | 'pipeStyle'
  | 'distressedStyle'
  | 'highlightStyle';

export type DomainToWorld = (x: number, y: number) => Point;

export interface Config {
  resolution: number;
  size: number;
  stepSize: number;
  walkerCount: number;
  flat: boolean;
  padding: number;
  pathStyle: PathStyle;
}

export interface Coord {
  x: number;
  y: number;
}

export interface Node extends Coord {
  id: string;
  occupied?: boolean;
  moveTo?: boolean;
  worldX: number;
  worldY: number;
}

export interface Walker {
  path: Node[];
  lengths: number[];
  color: string;
  highlightColor: string;
  state: 'alive' | 'dead';
  nextStep: (current: Node) => Node;
  pathStyle: PathStyle;
  size: number;
  stepSize: number;
}
