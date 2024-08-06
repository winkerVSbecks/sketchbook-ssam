export interface Coord {
  x: number;
  y: number;
}

export interface Node extends Coord {
  id: string;
  occupied?: boolean;
  moveTo?: boolean;
}

export interface Walker {
  path: Node[];
  lengths: number[];
  color: string;
  highlightColor: string;
  state: 'alive' | 'dead';
  nextStep: (current: Node) => Node;
  pathStyle: 'solidStyle' | 'pipeStyle' | 'distressedStyle' | 'highlightStyle';
}
