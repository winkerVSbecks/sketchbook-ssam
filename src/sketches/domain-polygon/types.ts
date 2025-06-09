export type Grid = (number | null)[][];
export interface Region {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  debug?: boolean;
}

export interface Domain {
  id: number;
  x: number;
  y: number;
  width: number;
  height: number;
  debug?: boolean;
  type: 'default' | 'full-span';
  selected: boolean;
  hasPart?: boolean;
  rect: Point[];
  rectWithInset: Point[];
  region: Region;
  raw: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  scale: (
    currentGrid: number[][],
    nextGrid: number[][],
    t: number
  ) => {
    x: number;
    y: number;
    width: number;
    height: number;
    rect: Point[];
    rectWithInset: Point[];
  };
}

export interface RelativePolygon {
  domain: Domain;
  point: Point;
}

export interface PolygonPart {
  area: Point[];
  island: boolean;
  domain: Domain;
}
