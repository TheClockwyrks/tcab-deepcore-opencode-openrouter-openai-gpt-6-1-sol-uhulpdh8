import * as C from "./constants";
import {
  bandAt,
  cell,
  depthFraction,
  emptyGrid,
  type Cell,
  type DeepcoreState,
} from "./model";

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
export function generate(coreRow: number): Cell[][] {
  const grid = emptyGrid(coreRow);
  for (let r = 1; r < coreRow; r++)
    for (let c = 1; c < C.WORLD_COLS - 1; c++)
      grid[r][c] = cell("rock", bandAt(r, coreRow));
  // Allocate exact band quotas, then place coherent lava pools. The reserved
  // vertical spine and node access lanes guarantee a hazard-free diggable route.
  for (const band of C.BANDS) {
    const candidates: { c: number; r: number }[] = [];
    for (let r = 1; r < coreRow; r++)
      if (bandAt(r, coreRow) === band)
        for (let c = 1; c < C.WORLD_COLS - 1; c++) candidates.push({ c, r });
    const n = candidates.length,
      mid = candidates[Math.floor(n / 2)].r,
      f = depthFraction(mid, coreRow),
      idx = C.BANDS.indexOf(band);
    const pool = shuffle(
      candidates.filter((p) => p.c !== C.CAVE_MOUTH_COL && p.c !== C.CORE_COL),
    );
    function place(kind: C.TileKind, count: number) {
      let placed = 0;
      for (const p of pool) {
        if (placed >= count) break;
        if (grid[p.r][p.c].kind === "rock") {
          grid[p.r][p.c] = cell(kind, band);
          placed++;
        }
      }
    }
    if (idx >= 2) {
      const target = Math.round(
        n *
          (C.LAVA_DENSITY_MIN +
            ((C.LAVA_DENSITY_MAX - C.LAVA_DENSITY_MIN) * (f - 0.5)) / 0.5),
      );
      let placed = 0;
      for (const p of shuffle([...pool])) {
        if (placed >= target) break;
        for (let dx = 0; dx < 3 && placed < target; dx++) {
          const c = p.c + dx;
          if (
            c >= C.PLAYABLE_COL_MAX ||
            c === C.CAVE_MOUTH_COL ||
            c === C.CORE_COL
          )
            continue;
          if (grid[p.r][c].kind === "rock") {
            grid[p.r][c] = cell("lava", band);
            placed++;
          }
        }
      }
    }
    if (idx >= 1) {
      place(
        "stone",
        Math.round(
          n *
            (C.STONE_DENSITY_MIN +
              ((C.STONE_DENSITY_MAX - C.STONE_DENSITY_MIN) * (f - 0.25)) /
                0.75),
        ),
      );
      place(
        "gas",
        Math.round(
          n *
            (C.GAS_DENSITY_MIN +
              ((C.GAS_DENSITY_MAX - C.GAS_DENSITY_MIN) * (f - 0.25)) / 0.75),
        ),
      );
    }
    let oreCount = Math.round(n * C.ORE_DENSITY);
    for (const p of shuffle([...candidates])) {
      if (!oreCount) break;
      if (p.r < C.ORE_MIN_ROW || grid[p.r][p.c].kind !== "rock") continue;
      const f = depthFraction(p.r, coreRow);
      const weights = C.MINERALS.map(
        (m) => m.pick * Math.max(0, 1 - Math.abs(f - m.peak) / m.spread),
      );
      let draw = Math.random() * weights.reduce((a, b) => a + b, 0),
        i = 0;
      while (i < weights.length - 1 && draw >= weights[i]) draw -= weights[i++];
      grid[p.r][p.c] = cell("ore", band, C.MINERALS[i].id);
      oreCount--;
    }
  }
  for (const material of C.MATERIALS) {
    const rows = Array.from({ length: coreRow - 1 }, (_, i) => i + 1).filter(
      (r) => bandAt(r, coreRow) === C.MATERIAL_BAND[material],
    );
    const r = rows[Math.floor(Math.random() * rows.length)],
      c = 1 + Math.floor(Math.random() * (C.WORLD_COLS - 2));
    grid[r][c] = cell("material", C.MATERIAL_BAND[material], null, material);
    for (
      let x = Math.min(c, C.CAVE_MOUTH_COL);
      x <= Math.max(c, C.CAVE_MOUTH_COL);
      x++
    )
      if (["stone", "lava"].includes(grid[r][x].kind))
        grid[r][x] = cell("rock", C.MATERIAL_BAND[material]);
  }
  // Connect the two safe spines directly above the Core.
  for (let c = C.CORE_COL; c <= C.CAVE_MOUTH_COL; c++)
    if (["stone", "lava"].includes(grid[coreRow - 1][c].kind))
      grid[coreRow - 1][c] = cell("rock", "coreshell");
  grid[1][C.CAVE_MOUTH_COL] = cell("tunnel", "topsoil");
  return grid;
}
export function resize(s: DeepcoreState, size: C.WorldSize) {
  const old = s.coreRow;
  const next = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]);
  const grid = emptyGrid(next);
  for (let r = 0; r < Math.min(old, next); r++) grid[r] = s.grid[r].slice();
  s.grid = grid;
  s.worldSize = size;
  s.coreRow = next;
}
