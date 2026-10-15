import type { DeepReadonly } from "ts-essentials";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";

export interface Cell {
  kind: C.TileKind;
  band: C.BandName | null;
  ore: C.OreId | null;
  material: C.MaterialId | null;
  health: number | null;
}
export interface Effect {
  name: string;
  x: number;
  y: number;
  age: number;
  seed: number;
  tint?: string;
}
export interface Resources {
  images: Record<string, ImageBitmap>;
  effects: Record<string, ParticleSystem>;
}
export interface DeepcoreState {
  resources: Resources;
  grid: Cell[][];
  screen: C.ScreenName;
  panel: C.PanelId | null;
  mode: C.Mode;
  worldSize: C.WorldSize;
  coreRow: number;
  menuIndex: number;
  muted: boolean;
  simTime: number;
  elapsedSeconds: number;
  credits: number;
  creditsEarned: number;
  deepestDepthMeters: number;
  miner: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    facing: C.Facing;
    state: C.MinerState;
    travel: boolean;
    drill: boolean;
    fuel: number;
    hull: number;
    hurt: number;
    animTime: number;
  };
  cargo: Partial<Record<C.OreId, number>>;
  satchel: { resonite: number; cryenite: number; coreSample: boolean };
  tiers: Record<C.TrackName, number>;
  items: Record<C.ItemId, number>;
  coreTimer: number | null;
  coreGround: { col: number; row: number } | null;
  installed: number;
  lead: number;
  camX: number;
  camY: number;
  drilling: { col: number; row: number; dir: "down" | "left" | "right" } | null;
  hitTime: number;
  noticesFired: Record<C.NoticeHazard, boolean>;
  notice: { hazard: C.NoticeHazard; age: number } | null;
  summary: {
    deepestDepthMeters: number;
    creditsEarned: number;
    elapsedSeconds: number;
    mode: C.Mode;
    componentsInstalled: number;
    deathCause: C.DeathCause | null;
  } | null;
  nextTeleportHeight: number | null;
  nextTeleportSpeed: number | null;
  hasSave: boolean;
  saveData: string | null;
  effects: Effect[];
  sounds: C.CueName[];
  shake: number;
  note: string;
  noteTime: number;
  accumulator: number;
  pointerDown: Record<number, string>;
  launchTime: number | null;
  panelFocus: number;
}
export type ReadState = DeepReadonly<DeepcoreState>;
export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));
export const depthFraction = (row: number, coreRow: number) =>
  (row - 1) / (coreRow - 1);
export const bandAt = (row: number, coreRow: number) =>
  C.BANDS[Math.min(3, Math.floor(4 * depthFraction(row, coreRow)))];
export const minable = (cell: DeepReadonly<Cell>) =>
  ["rock", "ore", "material", "gas", "lava"].includes(cell.kind);
export function cell(
  kind: C.TileKind,
  band: C.BandName | null,
  ore: C.OreId | null = null,
  material: C.MaterialId | null = null,
): Cell {
  return {
    kind,
    band,
    ore,
    material,
    health:
      ["rock", "ore", "material", "gas", "lava"].includes(kind) && band
        ? C.BAND_HEALTH[band]
        : null,
  };
}
export function emptyGrid(coreRow: number): Cell[][] {
  return Array.from({ length: coreRow + 1 }, (_, r) =>
    Array.from({ length: C.WORLD_COLS }, (_, c) =>
      cell(
        r === coreRow
          ? c === C.CORE_COL
            ? "core"
            : "bedrock"
          : r === 0
            ? "tunnel"
            : c === 0 || c === C.WORLD_COLS - 1
              ? "bedrock"
              : "tunnel",
        r > 0 && r < coreRow ? bandAt(r, coreRow) : null,
      ),
    ),
  );
}
export function tile(s: ReadState, c: number, r: number): DeepReadonly<Cell> {
  return s.grid[r]?.[c] ?? cell(r < 1 ? "tunnel" : "bedrock", null);
}
export const minerCell = (s: ReadState) => ({
  col: Math.floor((s.miner.x + C.MINER_W / 2) / C.TILE),
  row: Math.max(0, Math.floor((s.miner.y + C.MINER_H / 2) / C.TILE)),
});
export const depth = (s: ReadState) =>
  Math.max(
    0,
    ((s.miner.y + C.MINER_H - C.SURFACE_Y) / C.TILE) * C.METERS_PER_ROW,
  );
export const maxFuel = (s: ReadState) => C.FUEL_TIERS[s.tiers.fuel - 1];
export const maxHull = (s: ReadState) => C.HULL_TIERS[s.tiers.hull - 1];
export const slots = (s: ReadState) =>
  Object.values(s.cargo).reduce((a, b) => a + (b ?? 0), 0);
export const loadKg = (s: ReadState) =>
  C.MINERALS.reduce((a, o) => a + (s.cargo[o.id] ?? 0) * o.weightKg, 0);
export const cargoValue = (s: ReadState) =>
  C.MINERALS.reduce((a, o) => a + (s.cargo[o.id] ?? 0) * o.value, 0);
export const jet = (s: ReadState) => C.JETPACK_TIERS[s.tiers.jetpack - 1];
export function grounded(s: ReadState): boolean {
  const feet = s.miner.y + C.MINER_H;
  const r = Math.floor((feet + 0.5) / C.TILE);
  if (Math.abs(feet - r * C.TILE) > 0.6) return s.drilling?.dir === "down";
  for (const x of [s.miner.x + 1, s.miner.x + C.MINER_W - 1])
    if (tile(s, Math.floor(x / C.TILE), r).kind !== "tunnel") return true;
  return false;
}
export function copy(s: ReadState): DeepcoreState {
  return {
    ...s,
    resources: s.resources as Resources,
    grid: s.grid.map((r) => r.slice()) as Cell[][],
    miner: { ...s.miner },
    cargo: { ...s.cargo },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    drilling: s.drilling ? { ...s.drilling } : null,
    noticesFired: { ...s.noticesFired },
    notice: s.notice ? { ...s.notice } : null,
    summary: s.summary ? { ...s.summary } : null,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    effects: s.effects.map((e) => ({ ...e })),
    sounds: [...s.sounds],
    pointerDown: { ...s.pointerDown },
  };
}
export function initial(
  resources: Resources,
  muted = false,
  saveData: string | null = null,
): DeepcoreState {
  const coreRow = C.STANDARD_ROWS;
  return {
    resources,
    grid: emptyGrid(coreRow),
    screen: "title",
    panel: null,
    mode: "standard",
    worldSize: "standard",
    coreRow,
    menuIndex: 0,
    muted,
    simTime: 0,
    elapsedSeconds: 0,
    credits: 0,
    creditsEarned: 0,
    deepestDepthMeters: 0,
    miner: {
      x: C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2,
      y: C.SURFACE_Y - C.MINER_H,
      vx: 0,
      vy: 0,
      facing: "east",
      state: "idle",
      travel: true,
      drill: true,
      fuel: C.FUEL_TIERS[0],
      hull: C.HULL_TIERS[0],
      hurt: 0,
      animTime: 0,
    },
    cargo: {},
    satchel: { resonite: 0, cryenite: 0, coreSample: false },
    tiers: Object.fromEntries(C.TRACKS.map((t) => [t, 1])) as Record<
      C.TrackName,
      number
    >,
    items: Object.fromEntries(C.ITEM_IDS.map((i) => [i, 0])) as Record<
      C.ItemId,
      number
    >,
    coreTimer: null,
    coreGround: null,
    installed: 0,
    lead: 0,
    camX: 0,
    camY: -C.VIEW_H / 2,
    drilling: null,
    hitTime: 0,
    noticesFired: { gas: false, lava: false },
    notice: null,
    summary: null,
    nextTeleportHeight: null,
    nextTeleportSpeed: null,
    hasSave: !!saveData,
    saveData,
    effects: [],
    sounds: [],
    shake: 0,
    note: "",
    noteTime: 0,
    accumulator: 0,
    pointerDown: {},
    launchTime: null,
    panelFocus: 0,
  };
}
export const footprints = C.BUILDINGS.map((id, i) => ({
  id,
  x: 100 + i * (180 + C.BUILDING_GAP + 65),
  y: C.SURFACE_Y - 118,
  w: 180,
  h: 118,
}));
export function scanner(s: ReadState) {
  const range = C.SCANNER_TIERS[s.tiers.scanner - 1];
  let nearest: {
    target: C.MaterialId;
    dx: number;
    dy: number;
    distance: number;
  } | null = null;
  const p = minerCell(s);
  if (range)
    for (let r = 1; r < s.coreRow; r++)
      for (let c = 1; c < C.WORLD_COLS - 1; c++) {
        const t = tile(s, c, r);
        if (t.material && s.satchel[t.material] === 0) {
          const dx = c - p.col,
            dy = r - p.row,
            distance = Math.hypot(dx, dy);
          if (distance <= range && (!nearest || distance < nearest.distance))
            nearest = { target: t.material, dx, dy, distance };
        }
      }
  return nearest
    ? {
        locked: true,
        target: nearest.target,
        dirX: nearest.dx / (nearest.distance || 1),
        dirY: nearest.dy / (nearest.distance || 1),
        distanceTiles: nearest.distance,
      }
    : { locked: false, target: null, dirX: 0, dirY: 0, distanceTiles: null };
}
export function camera(s: DeepcoreState, dt: number) {
  const target =
    Math.abs(s.miner.vy) <= C.CAM_STILL_SPEED
      ? 0
      : Math.sign(s.miner.vy) * C.CAM_LEAD_MAX;
  const unwinding =
    (s.lead > 0 && target < s.lead) || (s.lead < 0 && target > s.lead);
  let step =
    (C.CAM_LEAD_MAX / C.CAM_LEAD_RAMP) *
    (unwinding ? C.CAM_UNWIND_MULT : 1) *
    dt;
  if (
    unwinding &&
    Math.sign(s.lead) !== Math.sign(target) &&
    step > Math.abs(s.lead)
  )
    step = Math.abs(s.lead);
  s.lead += clamp(target - s.lead, -step, step);
  s.camX = clamp(
    s.miner.x + C.MINER_W / 2 - C.VIEW_W / 2,
    0,
    C.WORLD_W - C.VIEW_W,
  );
  s.camY = Math.min(
    s.miner.y + C.MINER_H / 2 - C.VIEW_H / 2 + s.lead,
    (s.coreRow + 1) * C.TILE - C.VIEW_H,
  );
}
