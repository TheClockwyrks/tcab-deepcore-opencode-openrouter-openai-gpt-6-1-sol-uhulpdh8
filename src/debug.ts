import * as C from "./constants";
import {
  bandAt,
  cell,
  copy,
  depth,
  footprints,
  grounded,
  initial,
  jet,
  loadKg,
  maxFuel,
  maxHull,
  minerCell,
  minable,
  scanner,
  slots,
  tile,
  type DeepcoreState,
  type ReadState,
} from "./model";
import { controls, menuItems, menuRect } from "./interface";
import { generate, resize } from "./world";
import { storageWrite, transact } from "./transactions";
function number(v: number, min = -Infinity, max = Infinity, integer = false) {
  if (
    !Number.isFinite(v) ||
    v < min ||
    v > max ||
    (integer && !Number.isInteger(v))
  )
    throw new RangeError(`Invalid number: ${v}`);
}
function choice<T extends string>(v: T, values: readonly T[]) {
  if (!values.includes(v)) throw new RangeError(`Invalid identifier: ${v}`);
}
function boolean(v: boolean) {
  if (typeof v !== "boolean") throw new TypeError("Expected a boolean");
}
function coordinate(s: ReadState, c: number, r: number) {
  number(c, 0, C.WORLD_COLS - 1, true);
  number(r, 1, s.coreRow, true);
}
function pose(s: ReadState, fn: (n: DeepcoreState) => void) {
  const n = copy(s);
  fn(n);
  return n;
}
function observable(t: ReturnType<typeof tile>) {
  return {
    ...t,
    maxHealth: t.health !== null && t.band ? C.BAND_HEALTH[t.band] : null,
  };
}
export function snapshot(s: ReadState) {
  const p = minerCell(s);
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    screen: s.screen,
    panel: s.panel,
    mode: s.mode,
    worldSize: s.worldSize,
    coreRow: s.coreRow,
    menuIndex: s.menuIndex,
    muted: s.muted,
    simTime: s.simTime,
    elapsedSeconds: s.elapsedSeconds,
    hasSave: s.hasSave,
    credits: s.credits,
    creditsEarned: s.creditsEarned,
    depthMeters: depth(s),
    deepestDepthMeters: s.deepestDepthMeters,
    coreTimer: s.coreTimer,
    coreGround: s.coreGround ? { ...s.coreGround } : null,
    camera: { x: s.camX, y: s.camY, lead: s.lead },
    miner: {
      x: s.miner.x,
      y: s.miner.y,
      vx: s.miner.vx,
      vy: s.miner.vy,
      col: p.col,
      row: p.row,
      facing: s.miner.facing,
      state: s.miner.state,
      grounded: grounded(s),
      travel: s.miner.travel,
      drill: s.miner.drill,
      fuel: s.miner.fuel,
      maxFuel: maxFuel(s),
      hull: s.miner.hull,
      maxHull: maxHull(s),
      overloaded: loadKg(s) >= jet(s).liftLimitKg,
      drilling: s.drilling
        ? {
            ...s.drilling,
            progress:
              1 -
              (tile(s, s.drilling.col, s.drilling.row).health ??
                C.BAND_HEALTH[
                  tile(s, s.drilling.col, s.drilling.row).band ?? "topsoil"
                ]) /
                C.BAND_HEALTH[
                  tile(s, s.drilling.col, s.drilling.row).band ?? "topsoil"
                ],
          }
        : null,
    },
    cargo: {
      slotsUsed: slots(s),
      slotCap: C.CARGO_TIERS[s.tiers.cargo - 1],
      loadKg: loadKg(s),
      liftLimitKg: jet(s).liftLimitKg,
      ore: Object.fromEntries(Object.entries(s.cargo).filter(([, n]) => n)),
    },
    satchel: { ...s.satchel },
    tiers: { ...s.tiers },
    items: { ...s.items },
    nextTeleportHeight: s.nextTeleportHeight,
    nextTeleportSpeed: s.nextTeleportSpeed,
    rocket: {
      installed: C.ROCKET_COMPONENT_IDS.slice(0, s.installed),
      nextComponent: C.ROCKET_COMPONENT_IDS[s.installed] ?? null,
    },
    scanner: scanner(s),
    notice: s.notice
      ? { hazard: s.notice.hazard, shown: s.notice.age >= C.NOTICE_DELAY }
      : null,
    noticesFired: { ...s.noticesFired },
    summary: s.summary ? { ...s.summary } : null,
  };
}
export function createDebug() {
  const action = (control: string) => (s: ReadState) =>
    pose(s, (n) => transact(n, control));
  return {
    version: C.DEEPCORE_DEBUG_VERSION,
    snapshot,
    tileAt: (s: ReadState, c: number, r: number) =>
      observable(
        c < 0 || c >= C.WORLD_COLS || r < 0 || r > s.coreRow
          ? cell("bedrock", null)
          : tile(s, c, r),
      ),
    findTile: (s: ReadState, kind: C.TileKind) => {
      choice(kind, C.TILE_KINDS);
      let best: { col: number; row: number } | null = null,
        distance = Infinity;
      const p = minerCell(s);
      for (let r = 0; r <= s.coreRow; r++)
        for (let c = 0; c < C.WORLD_COLS; c++)
          if (tile(s, c, r).kind === kind) {
            const d = Math.hypot(c - p.col, r - p.row);
            if (d < distance) {
              distance = d;
              best = { col: c, row: r };
            }
          }
      return best;
    },
    buildings: (_s: ReadState) => footprints.map((b) => ({ ...b })),
    menuItemRect: (s: ReadState, i: number) => menuRect(s, i),
    controlRect: (s: ReadState, control: string, subject: string | null) => {
      const c = controls(s).find(
        (c) => c.id === control && c.subject === subject,
      );
      return c ? { x: c.x, y: c.y, w: c.w, h: c.h } : null;
    },
    reset: (s: ReadState) =>
      initial(s.resources as DeepcoreState["resources"], s.muted, s.saveData),
    reconcile: (s: ReadState) => copy(s),
    generateMine: (s: ReadState) => ({ ...copy(s), grid: generate(s.coreRow) }),
    clearMine: (s: ReadState) =>
      pose(s, (n) => {
        for (let r = 1; r < n.coreRow; r++)
          for (let c = 1; c < C.WORLD_COLS - 1; c++)
            n.grid[r][c] = cell("tunnel", tile(s, c, r).band);
      }),
    clearCargo: (s: ReadState) => ({ ...copy(s), cargo: {} }),
    clearItems: (s: ReadState) =>
      pose(s, (n) => {
        for (const i of C.ITEM_IDS) n.items[i] = 0;
      }),
    setTile: (s: ReadState, c: number, r: number, kind: C.TileKind) => {
      coordinate(s, c, r);
      choice(kind, [
        "rock",
        "gas",
        "lava",
        "stone",
        "bedrock",
        "tunnel",
        "core",
      ]);
      return pose(s, (n) => {
        n.grid[r][c] = cell(kind, bandAt(r, s.coreRow));
      });
    },
    setOreTile: (s: ReadState, c: number, r: number, ore: C.OreId) => {
      coordinate(s, c, r);
      choice(
        ore,
        C.MINERALS.map((m) => m.id),
      );
      return pose(s, (n) => {
        n.grid[r][c] = cell("ore", bandAt(r, s.coreRow), ore);
      });
    },
    setMaterialTile: (
      s: ReadState,
      c: number,
      r: number,
      material: C.MaterialId,
    ) => {
      coordinate(s, c, r);
      choice(material, C.MATERIALS);
      return pose(s, (n) => {
        n.grid[r][c] = cell("material", bandAt(r, s.coreRow), null, material);
      });
    },
    setTileHealth: (s: ReadState, c: number, r: number, health: number) => {
      coordinate(s, c, r);
      const t = tile(s, c, r);
      if (!minable(t)) throw new Error("Cell is not minable");
      number(health, Number.MIN_VALUE, C.BAND_HEALTH[t.band!]);
      return pose(s, (n) => {
        n.grid[r][c] = { ...t, health };
      });
    },
    placeCoreSample: (s: ReadState, c: number, r: number) => {
      coordinate(s, c, r);
      if (s.coreTimer !== null || tile(s, c, r).kind !== "tunnel")
        throw new Error("Sample requires an empty tunnel and no live sample");
      return pose(s, (n) => {
        n.coreGround = { col: c, row: r };
        n.coreTimer = C.CORE_TIMER;
      });
    },
    setMinerPosition: (s: ReadState, x: number, y: number) => {
      number(x);
      number(y);
      return pose(s, (n) => {
        n.miner.x = x;
        n.miner.y = y;
      });
    },
    setMinerVelocity: (s: ReadState, vx: number, vy: number) => {
      number(vx);
      number(vy);
      return pose(s, (n) => {
        n.miner.vx = vx;
        n.miner.vy = vy;
      });
    },
    setFacing: (s: ReadState, facing: C.Facing) => {
      choice(facing, C.FACINGS);
      return pose(s, (n) => {
        n.miner.facing = facing;
      });
    },
    setFuel: (s: ReadState, value: number) => {
      number(value, 0);
      return pose(s, (n) => {
        n.miner.fuel = value;
      });
    },
    setHull: (s: ReadState, value: number) => {
      number(value, 0);
      return pose(s, (n) => {
        n.miner.hull = value;
      });
    },
    setMinerTravel: (s: ReadState, enabled: boolean) =>
      pose(s, (n) => {
        boolean(enabled);
        n.miner.travel = enabled;
      }),
    setMinerDrill: (s: ReadState, enabled: boolean) =>
      pose(s, (n) => {
        boolean(enabled);
        n.miner.drill = enabled;
      }),
    setScreen: (s: ReadState, screen: C.ScreenName) => {
      choice(screen, C.SCREENS);
      return { ...copy(s), screen };
    },
    setPanel: (s: ReadState, panel: C.PanelId | null) => {
      if (panel !== null) choice(panel, C.PANELS);
      return { ...copy(s), panel };
    },
    setMenuIndex: (s: ReadState, index: number) => {
      number(index, 0, menuItems(s).length - 1, true);
      return { ...copy(s), menuIndex: index };
    },
    setMode: (s: ReadState, mode: C.Mode) => {
      choice(mode, C.MODES);
      return { ...copy(s), mode };
    },
    setWorldSize: (s: ReadState, size: C.WorldSize) => {
      choice(size, C.WORLD_SIZES);
      return pose(s, (n) => resize(n, size));
    },
    setCredits: (s: ReadState, value: number) => {
      number(value, 0);
      return { ...copy(s), credits: value };
    },
    setTier: (s: ReadState, track: C.TrackName, tier: number) => {
      choice(track, C.TRACKS);
      number(tier, 1, C.MAX_TIER[track], true);
      return pose(s, (n) => {
        n.tiers[track] = tier;
        n.miner.fuel = Math.min(n.miner.fuel, maxFuel(n));
        n.miner.hull = Math.min(n.miner.hull, maxHull(n));
      });
    },
    setCargo: (s: ReadState, ore: C.OreId, count: number) => {
      choice(
        ore,
        C.MINERALS.map((m) => m.id),
      );
      number(count, 0, Infinity, true);
      return pose(s, (n) => {
        if (count) n.cargo[ore] = count;
        else delete n.cargo[ore];
      });
    },
    setMaterial: (s: ReadState, material: C.MaterialId, count: number) => {
      choice(material, C.MATERIALS);
      number(count, 0, Infinity, true);
      return pose(s, (n) => {
        n.satchel[material] = count;
      });
    },
    setCoreCarried: (s: ReadState, carried: boolean) => {
      boolean(carried);
      if (carried && s.coreTimer !== null)
        throw new Error("A Core Sample is already live");
      return pose(s, (n) => {
        n.satchel.coreSample = carried;
        n.coreTimer = carried ? C.CORE_TIMER : null;
        if (!carried) n.coreGround = null;
      });
    },
    setCoreTimer: (s: ReadState, seconds: number) => {
      number(seconds, Number.MIN_VALUE);
      if (s.coreTimer === null) throw new Error("No live Core Sample");
      return { ...copy(s), coreTimer: seconds };
    },
    setItemCount: (s: ReadState, item: C.ItemId, count: number) => {
      choice(item, C.ITEM_IDS);
      number(count, 0, Infinity, true);
      return pose(s, (n) => {
        n.items[item] = count;
      });
    },
    setRocketInstalled: (s: ReadState, count: number) => {
      number(count, 0, C.ROCKET_COMPONENTS.length, true);
      return { ...copy(s), installed: count };
    },
    setNoticeFired: (s: ReadState, hazard: C.NoticeHazard, fired: boolean) => {
      boolean(fired);
      choice(hazard, C.NOTICE_HAZARDS);
      return pose(s, (n) => {
        n.noticesFired[hazard] = fired;
      });
    },
    setCameraLead: (s: ReadState, lead: number) => {
      number(lead, -C.CAM_LEAD_MAX, C.CAM_LEAD_MAX);
      return { ...copy(s), lead };
    },
    setElapsed: (s: ReadState, seconds: number) => {
      number(seconds, 0);
      return { ...copy(s), elapsedSeconds: seconds };
    },
    clearSave: (s: ReadState) => {
      storageWrite(null);
      return { ...copy(s), hasSave: false, saveData: null };
    },
    setNextTeleportHeight: (s: ReadState, tiles: number | null) => {
      if (tiles !== null)
        number(tiles, C.TELEPORT_HEIGHT_TILES_MIN, C.TELEPORT_HEIGHT_TILES_MAX);
      return { ...copy(s), nextTeleportHeight: tiles };
    },
    setNextTeleportSpeed: (s: ReadState, speed: number | null) => {
      if (speed !== null)
        number(speed, C.TELEPORT_SPEED_MIN, C.TELEPORT_SPEED_MAX);
      return { ...copy(s), nextTeleportSpeed: speed };
    },
    dropOre: (s: ReadState, ore: C.OreId) => {
      choice(
        ore,
        C.MINERALS.map((m) => m.id),
      );
      return pose(s, (n) => transact(n, "drop-ore", ore));
    },
    sell: action("sell"),
    buyFuel: action("buy-fuel"),
    fillFuel: action("fill-fuel"),
    buyRepair: action("buy-repair"),
    repairFull: action("repair-full"),
    buyUpgrade: (s: ReadState, track: C.TrackName) => {
      choice(track, C.TRACKS);
      return pose(s, (n) => transact(n, "buy-upgrade", track));
    },
    buyItem: (s: ReadState, item: C.ItemId) => {
      choice(item, C.ITEM_IDS);
      return pose(s, (n) => transact(n, "buy-item", item));
    },
    useItem: (s: ReadState, item: C.ItemId) => {
      choice(item, C.ITEM_IDS);
      return pose(s, (n) => transact(n, "use-item", item));
    },
    jettison: action("jettison"),
    fabricate: action("fabricate"),
    launch: action("launch"),
    save: action("save"),
    dismissNotice: action("dismiss-notice"),
  };
}
export type DeepcoreDebugApi = ReturnType<typeof createDebug>;
