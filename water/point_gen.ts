import { gmath, slidingWindows } from "../deps.ts";

const A = Math.SQRT1_2;
const SQRT_3 = Math.sqrt(3);
const B = SQRT_3 * A;
const S45 = Math.SQRT1_2;
const C45 = S45;

function surroundingHexagonalPoints(
  x: number,
  y: number,
): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] {
  return [
    [x, y - 1],
    [x + 1, y - 1],
    [x + 1, y],
    [x, y + 1],
    [x - 1, y + 1],
    [x - 1, y],
  ];
}

function surroundingPointValuesIter<T>(
  map: Map<string, T>,
  x: number,
  y: number,
  forEach: (val: [T, T]) => void,
) {
  const points = surroundingHexagonalPoints(x, y);
  const newPoints = [
    points[0],
    points[1],
    points[2],
    points[3],
    points[4],
    points[5],
    points[0],
  ];

  (slidingWindows(newPoints, 2)
    .map((x) => [map.get(JSON.stringify(x[0])), map.get(JSON.stringify(x[1]))] as const)
    .filter(([a, b]) => a !== undefined && b !== undefined) as [T, T][])
    .forEach(forEach);
}

function calculateNormal(
  a: gmath.Vector3,
  b: gmath.Vector3,
  c: gmath.Vector3,
): gmath.Vector3 {
  return b.sub(a).normal().cross(c.sub(a).normal()).normal();
}

function qGivenR(radius: number): number {
  return ((Math.floor(Math.floor(((4 * radius) / SQRT_3) + 1) / 2) * 2) + 1);
}

export interface TerrainVertex {
  position: gmath.Vector3;
  color: [number, number, number, number];
}

export const TERRAIN_VERTEX_ATTRIBUTES_SIZE = 28;

export class HexTerrainMesh {
  vertices: Map<string, TerrainVertex>;
  halfSize: number;

  constructor(
    radius: number,
    genVertex: (val: [number, number]) => TerrainVertex,
  ) {
    const width = qGivenR(radius);
    const halfWidth = Math.floor(width / 2);
    const map = new Map();
    let max = Number.MIN_VALUE;
    for (let i = -halfWidth; i <= halfWidth; i++) {
      const xO = i;
      for (let j = -halfWidth; j <= halfWidth; j++) {
        const yO = j;
        const x = A * (xO * C45 - yO * S45);
        const z = B * (xO * S45 + yO * C45);
        if (Math.hypot(x, z) < radius) {
          const vertex = genVertex([x, z]);
          if (vertex.position.y > max) {
            max = vertex.position.y;
          }
          map.set(JSON.stringify([i, j]), vertex);
        }
      }
    }
    this.vertices = map;
    this.halfSize = halfWidth;
  }

  makeBufferData(): Uint8Array[] {
    let vertices: Uint8Array[] = [];
    function middle(
      p1: TerrainVertex,
      p2: TerrainVertex,
      p3: TerrainVertex,
    ): gmath.Vector3 {
      return new gmath.Vector3(
        (p1.position.x + p2.position.x + p3.position.x) / 3.0,
        (p1.position.y + p2.position.y + p3.position.y) / 3.0,
        (p1.position.z + p2.position.z + p3.position.z) / 3.0,
      );
    }
    function half(p1: TerrainVertex, p2: TerrainVertex): gmath.Vector3 {
      return new gmath.Vector3(
        (p1.position.x + p2.position.x) / 2.0,
        (p1.position.y + p2.position.y) / 2.0,
        (p1.position.z + p2.position.z) / 2.0,
      );
    }

    function pushTriangle(
      p1: TerrainVertex,
      p2: TerrainVertex,
      p3: TerrainVertex,
      c: [number, number, number, number],
    ) {
      const m = middle(p1, p2, p3);
      const ap = half(p1, p3);
      const bp = half(p2, p3);
      const p = p3.position;
      const n1 = calculateNormal(ap, m, p);
      const n2 = calculateNormal(m, bp, p);

      vertices = vertices.concat(
        [[ap, n1], [m, n1], [p, n1], [m, n2], [bp, n2], [p, n2]].map((
          [pos, normal],
        ) => {
          const u8 = new Uint8Array(TERRAIN_VERTEX_ATTRIBUTES_SIZE);
          const f32 = new Float32Array(u8.buffer);
          f32.set(pos.toArray());
          f32.set(normal.toArray(), 3);
          u8.set(c, 24);

          return u8;
        }),
      );
    }

    for (let i = -this.halfSize; i <= this.halfSize; i++) {
      for (let j = -this.halfSize; j <= this.halfSize; j++) {
        const p = this.vertices.get(JSON.stringify([i, j]));
        if (p) {
          surroundingPointValuesIter(
            this.vertices,
            i,
            j,
            ([a, b]) => pushTriangle(a, b, p, p.color),
          );
        }
      }
    }

    return vertices;
  }
}

export const WATER_VERTEX_ATTRIBUTES_SIZE = 8;

export class HexWaterMesh {
  vertices: Map<string, [number, number]>;
  halfSize: number;

  constructor(radius: number) {
    const width = qGivenR(radius);
    const halfWidth = Math.floor(width / 2);
    const map = new Map();

    for (let i = -halfWidth; i <= halfWidth; i++) {
      const xO = i;
      for (let j = -halfWidth; j <= halfWidth; j++) {
        const yO = j;
        const x = A * (xO * C45 - yO * S45);
        const z = B * (xO * S45 + yO * C45);
        if (Math.hypot(x, z) < radius) {
          const x2 = Math.round(x * 2.0);
          const z2 = Math.round((z / B) * Math.sqrt(2));
          map.set(JSON.stringify([i, j]), [x2, z2]);
        }
      }
    }

    this.vertices = map;
    this.halfSize = halfWidth;
  }

  generatePoints(): Int8Array[] {
    let vertices: Int8Array[] = [];

    function calculateDifferences(
      a: [number, number],
      b: [number, number],
      c: [number, number],
    ): [number, number, number, number] {
      return [
        b[0] - a[0],
        b[1] - a[1],
        c[0] - a[0],
        c[1] - a[1],
      ];
    }

    function pushTriangle(
      a: [number, number],
      b: [number, number],
      c: [number, number],
    ) {
      const bc = calculateDifferences(a, b, c);
      const ca = calculateDifferences(b, c, a);
      const ab = calculateDifferences(c, a, b);

      vertices = vertices.concat(
        [[a, bc], [b, ca], [c, ab]].map(([pos, offsets]) => {
          const i8 = new Int8Array(WATER_VERTEX_ATTRIBUTES_SIZE);
          const i16 = new Int16Array(i8.buffer);
          i16.set(pos);

          i8.set(offsets, 4);

          return i8;
        }),
      );
    }

    for (let i = -this.halfSize; i <= this.halfSize; i++) {
      for (let j = -this.halfSize; j <= this.halfSize; j++) {
        if ((i - j) % 3 === 0) {
          const p = this.vertices.get(JSON.stringify([i, j]));
          if (p !== undefined) {
            surroundingPointValuesIter(
              this.vertices,
              i,
              j,
              ([a, b]) => pushTriangle(a, b, p),
            );
          }
        }
      }
    }

    return vertices;
  }
}