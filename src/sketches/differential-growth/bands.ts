/**
 * Thick nalee bands filled by differential growth, shared by the
 * `thick-nalee` and `one-line` variants. Each lattice path is stamped as a
 * band into one mask; each band gets its own organism, seeded as a thin loop
 * along the band's centreline and confined to that band only.
 *
 * Not a sketch — it exports no `sketch`, so the gallery and archive skip it.
 */
import { createGrowth, type Growth } from '../terminal-ui/growth-sim';
import {
  bandCentreline,
  createConfiner,
  createMask,
  outline,
  regionAreas,
  regionRects,
  seedLoop,
  stampPath,
  type Edge,
  type LatticePoint,
  type Rect,
  type RegionMask,
} from './region';

export interface BandOptions {
  /** Lattice nodes per side. */
  lattice: number;
  /** Cells from one lattice node to the next. */
  pitch: number;
  /** Cells of band per lattice node; `pitch - band` is the gap left between bands. */
  band: number;
  /** World units per cell. */
  cell: number;
  /** Nodes are kept this far inside a band's edge, in world units. */
  margin: number;
  /** Organism seeds, one per call. */
  seed: () => number;
  /** Repulsion radius — the curve's own spacing, in world units. Default 0.9. */
  radius?: number;
}

export interface BandField {
  mask: RegionMask;
  organisms: Growth[];
  edges: Edge[];
  /** Each band's area as rectangles, indexed like `organisms`. */
  rects: Rect[][];
  /** Side of the square the bands occupy, in world units. */
  extent: number;
  step(): void;
}

/** Node budget per world unit² of band at the default radius: enough to pack it. */
const NODES_PER_AREA = 4;
const DEFAULT_RADIUS = 0.9;

export function createBandField(paths: LatticePoint[][], o: BandOptions): BandField {
  const size = o.lattice * o.pitch - (o.pitch - o.band);
  const mask = createMask(size, size, o.cell);
  paths.forEach((path, id) => stampPath(mask, path, id, o.pitch, o.band));
  const areas = regionAreas(mask);
  const confine = createConfiner(mask, o.margin);

  // A tighter curve needs proportionally more length to pack the same area.
  const radius = o.radius ?? DEFAULT_RADIUS;
  const density = NODES_PER_AREA * (DEFAULT_RADIUS / radius);
  const organisms = paths.map((path, id) => {
    const growth = createGrowth({
      seed: o.seed(),
      repulsionRadius: radius,
      maxNodes: Math.round((areas.get(id) ?? 0) * density),
    });
    growth.state.nodes = seedLoop(bandCentreline(path, o.pitch, o.band, o.cell), radius * 0.4);
    return growth;
  });

  const rects = regionRects(mask);

  return {
    mask,
    organisms,
    edges: outline(mask),
    rects: paths.map((_, id) => rects.get(id) ?? []),
    extent: size * o.cell,
    step() {
      organisms.forEach((growth, id) => {
        growth.step();
        for (const p of growth.state.nodes) confine(id, p);
      });
    },
  };
}
