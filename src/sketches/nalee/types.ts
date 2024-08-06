export interface Node {
  x: number;
  y: number;
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
