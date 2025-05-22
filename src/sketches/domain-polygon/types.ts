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
}

export interface PolygonPart {
  area: Point[];
  island: boolean;
  domain: Domain;
}
