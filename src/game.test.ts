/// <reference types="node" />
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { readFile } from "node:fs/promises";
import {
  createEngine,
  ConstantClock,
  SequenceClock,
  type Engine,
} from "@clockwyrks/simple-2d";
import { game, type DeepcoreState, type DeepcoreDebugApi } from "./game";
import * as C from "./constants";
import { bandAt, initial, type Resources } from "./model";
import { generate } from "./world";
import { createDebug } from "./debug";

let resources: Resources;
const engines: Engine<DeepcoreState, DeepcoreDebugApi>[] = [];
const storage = new Map<string, string>();
beforeAll(async () => {
  vi.stubGlobal(
    "fetch",
    async (url: string) =>
      new Response(
        await readFile(new URL("../" + url.split("?")[0], import.meta.url)),
      ),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
  vi.stubGlobal(
    "AudioContext",
    class {
      decodeAudioData() {
        return Promise.resolve({});
      }
    },
  );
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, v),
    removeItem: (k: string) => storage.delete(k),
  });
  const { engine } = await harness(true);
  resources = engine.state.resources as Resources;
});
afterAll(() => {
  engines.forEach((e) => e.destroy());
  vi.unstubAllGlobals();
});
async function harness(full = false, ms = 1000 / 60) {
  const target = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    clock: new ConstantClock(ms),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
    game: full
      ? game
      : {
          ...game,
          initialize(api) {
            for (const [name, keys] of Object.entries(C.ACTIONS))
              api.input.register(name, { keys: [...keys] });
            for (const cue of Object.values(C.CUES))
              api.audio.define(cue, { freq: 100, durationMs: 20 });
            return [initial(resources), createDebug()];
          },
        },
  });
  engines.push(engine);
  await engine.initialize();
  const key = (code: string, down = true) =>
    target.dispatchEvent(
      Object.assign(new Event(down ? "keydown" : "keyup"), {
        code,
        repeat: false,
      }),
    );
  const press = async (code: string) => {
    key(code);
    await engine.advance(1);
    key(code, false);
  };
  const pose = (
    fn: (d: DeepcoreDebugApi, s: typeof engine.state) => DeepcoreState,
  ) => engine.apply((s) => fn(engine.debug, s));
  const snapshot = () => engine.debug.snapshot(engine.state);
  return { engine, key, press, pose, snapshot, target };
}
async function arena() {
  const h = await harness();
  h.pose((d, s) => d.setScreen(d.clearMine(s), "in-mine"));
  return h;
}

describe("engine integration and immutable transitions", () => {
  it("loads the produced assets and registers meaningful diagnostics", async () => {
    const h = await harness(true);
    expect(Object.keys(h.engine.state.resources.images).length).toBeGreaterThan(
      90,
    );
    expect(Object.keys(h.engine.state.resources.effects)).toHaveLength(12);
    expect(h.engine.diagnostics().length).toBeGreaterThanOrEqual(12);
    await h.engine.advance(1);
    expect(h.snapshot().simTime).toBeCloseTo(1 / 60);
  });
  it("navigates mode and size choices with the real engine action bindings", async () => {
    const h = await harness();
    await h.press("Enter");
    expect(h.snapshot().screen).toBe("mode-select");
    await h.press("ArrowDown");
    await h.press("Enter");
    expect(h.snapshot().mode).toBe("hardcore");
    await h.press("Enter");
    expect(h.snapshot().screen).toBe("in-mine");
    expect(h.snapshot().worldSize).toBe("quick");
    expect(h.snapshot().coreRow).toBe(250);
  });
  it("preserves prior state when poses and updates run", async () => {
    const h = await arena(),
      old = h.engine.state;
    h.pose((d, s) => d.setFuel(s, 80));
    expect(old.miner.fuel).toBe(100);
    h.key("KeyD");
    await h.engine.advance(30);
    expect(old.miner.x).toBe(C.SPAWN_COL * C.TILE + 12);
  });
  it("accepts a complete touch press and rejects mismatched edges", async () => {
    const h = await harness();
    const pointer = (type: string, x: number, y: number) =>
      h.target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: 1,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons: type === "pointerup" ? 0 : 1,
        }),
      );
    pointer("pointerdown", 100, 360);
    pointer("pointerup", 100, 430);
    await h.engine.advance(1);
    expect(h.snapshot().screen).toBe("title");
    pointer("pointerdown", 100, 360);
    pointer("pointerup", 100, 360);
    await h.engine.advance(1);
    expect(h.snapshot().screen).toBe("mode-select");
  });
  it("reconciles derived facts without advancing the world", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setCargo(d.setMinerPosition(s, 800, 1800), "adamite", 5),
    );
    const before = h.snapshot();
    h.pose((d, s) => d.reconcile(s));
    expect(h.snapshot()).toEqual(before);
    expect(before.cargo.loadKg).toBe(420);
    expect(before.miner.overloaded).toBe(true);
    expect(before.deepestDepthMeters).toBe(0);
  });
  it("rejects invalid debug poses loudly", async () => {
    const h = await arena();
    expect(() => h.pose((d, s) => d.setFuel(s, -1))).toThrow();
    expect(() => h.pose((d, s) => d.setTile(s, 32, 1, "rock"))).toThrow();
    expect(() => h.pose((d, s) => d.setTier(s, "scanner", 4))).toThrow();
    expect(() => h.pose((d, s) => d.setCoreTimer(s, 10))).toThrow();
  });
});
describe("generation and resize", () => {
  for (const size of C.WORLD_SIZES)
    it(`generates complete balanced ${size} geology`, () => {
      const coreRow = Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]),
        grid = generate(coreRow);
      expect(grid).toHaveLength(coreRow + 1);
      expect(grid[1][C.CAVE_MOUTH_COL].kind).toBe("tunnel");
      expect(grid[coreRow][C.CORE_COL].kind).toBe("core");
      for (const material of C.MATERIALS)
        expect(grid.flat().filter((t) => t.material === material)).toHaveLength(
          1,
        );
      for (const band of C.BANDS) {
        const cells = grid
          .flat()
          .filter((c) => c.band === band && c.kind !== "bedrock");
        expect(
          cells.filter((t) => t.kind === "ore").length / cells.length,
        ).toBeCloseTo(C.ORE_DENSITY, 1);
        for (let r = 1; r < coreRow; r++)
          if (bandAt(r, coreRow) === band)
            expect(["stone", "lava"]).not.toContain(
              grid[r][C.CAVE_MOUTH_COL].kind,
            );
      }
    });
  it("preserves a cell’s original band and damage across resize", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setTileHealth(d.setOreTile(s, 10, 200, "argenite"), 10, 200, 3),
    );
    h.pose((d, s) => d.setWorldSize(s, "marathon"));
    const t = h.engine.debug.tileAt(h.engine.state, 10, 200);
    expect(t.band).toBe("rockbed");
    expect(t.health).toBe(3);
    expect(t.maxHealth).toBe(8);
    expect(h.engine.debug.tileAt(h.engine.state, 10, 500).kind).toBe("tunnel");
    h.pose((d, s) => d.setWorldSize(s, "quick"));
    expect(h.engine.debug.tileAt(h.engine.state, 10, 700).band).toBeNull();
  });
});
describe("drilling, travel, load and fuel", () => {
  it("ramps camera lead by time and unwinds faster than it builds", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setMinerVelocity(
        d.setMinerTravel(d.setMinerPosition(s, 1200, 1600), false),
        0,
        100,
      ),
    );
    await h.engine.advance(60);
    expect(h.snapshot().camera.lead).toBeCloseTo(C.CAM_LEAD_MAX / 2);
    h.pose((d, s) => d.setMinerVelocity(s, 0, 0));
    await h.engine.advance(15);
    expect(h.snapshot().camera.lead).toBeCloseTo(0);
  });
  it("ends an underground fuel-out on the next update", async () => {
    const h = await arena();
    h.pose((d, s) => d.setFuel(d.setMinerPosition(s, 812, 1600), 0));
    await h.engine.advance(1);
    expect(h.snapshot().summary?.deathCause).toBe("fuel-out");
    h.pose((d, s) => d.setFuel(s, 100));
    await h.engine.advance(1);
    expect(h.snapshot().screen).toBe("game-over");
  });
  it("cuts at the specified cadence, spends fuel, banks ore and smoothly sinks", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setMinerPosition(
        d.setOreTile(d.setTile(s, 4, 2, "rock"), 4, 1, "ferron"),
        332,
        8,
      ),
    );
    h.key("KeyS");
    await h.engine.advance(15);
    expect(h.engine.debug.tileAt(h.engine.state, 4, 1).health).toBe(2);
    expect(h.snapshot().miner.y).toBeGreaterThan(8);
    await h.engine.advance(15);
    expect(h.snapshot().cargo.ore.ferron).toBe(1);
    expect(h.engine.debug.tileAt(h.engine.state, 4, 1).kind).toBe("tunnel");
    expect(h.snapshot().miner.fuel).toBeLessThanOrEqual(99);
  });
  it("holds drill progress and allows faculty-gated drilling", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setMinerTravel(
        d.setMinerPosition(d.setTile(s, 4, 1, "rock"), 332, 8),
        false,
      ),
    );
    h.key("KeyS");
    await h.engine.advance(15);
    h.key("KeyS", false);
    await h.engine.advance(2);
    expect(h.engine.debug.tileAt(h.engine.state, 4, 1).health).toBe(2);
    expect(h.snapshot().miner.y).toBe(8);
    h.pose((d, s) => d.setMinerDrill(s, false));
    h.key("KeyS");
    await h.engine.advance(30);
    expect(h.engine.debug.tileAt(h.engine.state, 4, 1).health).toBe(2);
  });
  it("does not drill upward or while falling and respects unbreakable stone", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setMinerPosition(d.setTile(s, 4, 10, "stone"), 332, 400),
    );
    h.key("KeyS");
    await h.engine.advance(30);
    expect(h.engine.debug.tileAt(h.engine.state, 4, 10).kind).toBe("stone");
    expect(h.snapshot().miner.drilling).toBeNull();
    h.key("KeyS", false);
    h.key("Space");
    await h.engine.advance(30);
    expect(h.snapshot().miner.state).toBe("jetpack");
  });
  it("walks to a wall before starting a side cut", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setTile(
        d.setTile(d.setTile(s, 4, 2, "rock"), 5, 2, "rock"),
        5,
        1,
        "rock",
      ),
    );
    h.pose((d, s) => d.setMinerPosition(s, 332, 88));
    h.key("KeyD");
    await h.engine.advance(2);
    expect(h.engine.debug.tileAt(h.engine.state, 5, 1).health).toBe(4);
    await h.engine.advance(40);
    expect(h.engine.debug.tileAt(h.engine.state, 5, 1).kind).toBe("tunnel");
  });
  it("enforces the overload wall and dropping ore restores climb", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setCargo(
        d.setMinerPosition(d.setTile(s, 4, 2, "rock"), 332, 88),
        "adamite",
        5,
      ),
    );
    h.key("Space");
    await h.engine.advance(30);
    expect(h.snapshot().miner.y).toBeCloseTo(88);
    h.pose((d, s) => d.dropOre(s, "adamite"));
    await h.engine.advance(60);
    expect(h.snapshot().miner.y).toBeLessThan(88);
  });
  it("applies weighted terminal falls and hard-landing damage", async () => {
    const h = await arena();
    h.pose((d, s) => d.setMinerPosition(d.setTile(s, 4, 15, "rock"), 332, 300));
    await h.engine.advance(120);
    expect(h.snapshot().miner.hull).toBeCloseTo(75);
    expect(h.snapshot().miner.grounded).toBe(true);
  });
  it("permits flight above the surface without a camera ceiling", async () => {
    const h = await arena();
    h.key("Space");
    await h.engine.advance(120);
    expect(h.snapshot().miner.y).toBeLessThan(-1000);
    expect(h.snapshot().camera.y).toBeLessThan(-1000);
    expect(h.snapshot().miner.fuel).toBeLessThan(100);
  });
  it("is invariant to frame subdivision", async () => {
    const a = await arena(),
      b = await arena();
    for (const h of [a, b]) {
      h.pose((d, s) =>
        d.setMinerTravel(d.setMinerPosition(s, 600, 1800), false),
      );
      h.key("Space");
    }
    b.engine.setClock(new SequenceClock([10, 40]));
    await a.engine.advance(60);
    await b.engine.advance(40);
    expect(a.snapshot().miner.fuel).toBeCloseTo(b.snapshot().miner.fuel, 8);
    expect(a.snapshot().elapsedSeconds).toBeCloseTo(
      b.snapshot().elapsedSeconds,
      8,
    );
  });
});
describe("economy, supplies, hazards and expedition lifecycle", () => {
  it("extracts an inexhaustible Core only while drilling downward", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setMinerPosition(
        s,
        C.CORE_COL * C.TILE + 12,
        s.coreRow * C.TILE - C.MINER_H,
      ),
    );
    h.key("KeyS");
    await h.engine.advance(10);
    h.key("KeyS", false);
    expect(h.snapshot().satchel.coreSample).toBe(true);
    expect(h.snapshot().coreTimer).toBeGreaterThan(89);
    expect(
      h.engine.debug.tileAt(h.engine.state, C.CORE_COL, h.snapshot().coreRow)
        .kind,
    ).toBe("core");
  });
  it("leaves fixed increments unaffordable while fill-to-full spends the remaining balance", async () => {
    const h = await arena();
    h.pose((d, s) => d.buyFuel(d.setCredits(d.setFuel(s, 10), 3)));
    expect(h.snapshot().miner.fuel).toBe(10);
    h.pose((d, s) => d.fillFuel(s));
    expect(h.snapshot().miner.fuel).toBe(13);
  });
  it("sells only cargo and adds only purchased capacity to tank upgrades", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.sell(d.setMaterial(d.setCargo(s, "cuprite", 10), "resonite", 1)),
    );
    expect(h.snapshot().credits).toBe(650);
    expect(h.snapshot().satchel.resonite).toBe(1);
    h.pose((d, s) => d.buyUpgrade(d.setFuel(s, 30), "fuel"));
    expect(h.snapshot().miner.fuel).toBe(105);
    expect(h.snapshot().credits).toBe(350);
    h.pose((d, s) => d.fillFuel(s));
    expect(h.snapshot().miner.fuel).toBe(175);
    expect(h.snapshot().credits).toBe(280);
  });
  it("caps purchases at available Credits and never regenerates resources", async () => {
    const h = await arena();
    h.pose((d, s) => d.fillFuel(d.setCredits(d.setFuel(s, 10), 3)));
    expect(h.snapshot().miner.fuel).toBe(13);
    expect(h.snapshot().credits).toBe(0);
    h.pose((d, s) => d.setMinerTravel(s, false));
    await h.engine.advance(60);
    expect(h.snapshot().miner.fuel).toBe(13);
  });
  it("blasts stone and destroys ore while preserving exotic nodes", async () => {
    const h = await arena();
    h.pose((d, s) => d.setMinerPosition(s, 812, 808));
    h.pose((d, s) => d.setTile(s, 10, 10, "stone"));
    h.pose((d, s) => d.setOreTile(s, 11, 10, "ferron"));
    h.pose((d, s) => d.setMaterialTile(s, 9, 10, "resonite"));
    h.pose((d, s) => d.useItem(d.setItemCount(s, "dynamite", 1), "dynamite"));
    expect(h.engine.debug.tileAt(h.engine.state, 10, 10).kind).toBe("tunnel");
    expect(h.engine.debug.tileAt(h.engine.state, 11, 10).kind).toBe("tunnel");
    expect(h.engine.debug.tileAt(h.engine.state, 9, 10).kind).toBe("material");
    expect(h.snapshot().cargo.slotsUsed).toBe(0);
    expect(h.snapshot().items.dynamite).toBe(0);
  });
  it("consumes posed Quantum outcomes individually and applies normal impact", async () => {
    const h = await arena();
    h.pose((d, s) => d.setTile(s, 4, 1, "rock"));
    h.pose((d, s) =>
      d.useItem(
        d.setNextTeleportSpeed(
          d.setNextTeleportHeight(
            d.setItemCount(s, "quantum-teleporter", 1),
            8,
          ),
          700,
        ),
        "quantum-teleporter",
      ),
    );
    expect(h.snapshot().miner.y + C.MINER_H).toBe(C.SURFACE_Y - 8 * C.TILE);
    expect(h.snapshot().nextTeleportHeight).toBeNull();
    await h.engine.advance(120);
    expect(h.snapshot().miner.hull).toBeLessThan(100);
  });
  it("does not consume supplies whose effect would do nothing", async () => {
    const h = await arena();
    h.pose((d, s) => d.useItem(d.setItemCount(s, "nanobots", 1), "nanobots"));
    expect(h.snapshot().items.nanobots).toBe(1);
    h.pose((d, s) => d.useItem(d.setHull(s, 55), "nanobots"));
    expect(h.snapshot().miner.hull).toBe(75);
  });
  it("locates needed materials only inside scanner range", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setMaterialTile(
        d.setTier(d.setMinerPosition(s, 812, 808), "scanner", 2),
        15,
        12,
        "resonite",
      ),
    );
    expect(h.snapshot().scanner.locked).toBe(true);
    expect(h.snapshot().scanner.target).toBe("resonite");
    h.pose((d, s) => d.setMaterial(s, "resonite", 1));
    expect(h.snapshot().scanner.locked).toBe(false);
  });
  it("gas damage scales with depth and raises a delayed notice", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setMinerTravel(d.setMinerPosition(s, 812, 199 * C.TILE + 8), false),
    );
    h.pose((d, s) => d.setHull(d.setTile(s, 10, 200, "gas"), 1000));
    h.pose((d, s) => d.useItem(d.setItemCount(s, "dynamite", 1), "dynamite"));
    expect(h.snapshot().miner.hull).toBeLessThan(1000);
    expect(h.snapshot().noticesFired.gas).toBe(true);
    expect(h.snapshot().notice?.shown).toBe(false);
    await h.engine.advance(91);
    expect(h.snapshot().notice?.shown).toBe(true);
  });
  it("applies radiator-protected lava contact even with travel held", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setMinerTravel(
        d.setMinerPosition(
          d.setTier(d.setTile(s, 10, 300, "lava"), "radiator", 5),
          812,
          300 * C.TILE,
        ),
        false,
      ),
    );
    await h.engine.advance(60);
    expect(h.snapshot().miner.hull).toBeCloseTo(100 - C.LAVA_CONTACT_DPS * 0.2);
  });
  it("keeps the Core timer running in inventory but freezes it on pause", async () => {
    const h = await arena();
    h.pose((d, s) => d.setPanel(d.setCoreCarried(s, true), "inventory"));
    await h.engine.advance(60);
    expect(h.snapshot().coreTimer).toBeCloseTo(89);
    await h.press("Escape");
    await h.press("Escape");
    const time = h.snapshot().coreTimer;
    await h.engine.advance(60);
    expect(h.snapshot().coreTimer).toBe(time);
    await h.press("KeyP");
    await h.engine.advance(60);
    expect(h.snapshot().coreTimer).toBeLessThan(time!);
  });
  it("detonates a carried sample irreversibly and ignores a distant ground blast", async () => {
    const h = await arena();
    h.pose((d, s) => d.setCoreTimer(d.setCoreCarried(s, true), 0.1));
    await h.engine.advance(10);
    expect(h.snapshot().summary?.deathCause).toBe("core-detonation");
    const b = await arena();
    b.pose((d, s) => d.setCoreTimer(d.placeCoreSample(s, 20, 20), 0.1));
    await b.engine.advance(10);
    expect(b.snapshot().screen).toBe("in-mine");
    expect(b.snapshot().coreTimer).toBeNull();
  });
  it("kills zero hull even with an overlay open", async () => {
    const h = await arena();
    h.pose((d, s) => d.setHull(d.setPanel(s, "inventory"), 0));
    await h.engine.advance(1);
    expect(h.snapshot().screen).toBe("game-over");
    expect(h.snapshot().summary?.deathCause).toBe("hull-destroyed");
  });
  it("saves a complete expedition and Standard death can restore it", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.save(
        d.setCredits(d.setTier(d.setCargo(s, "marlite", 3), "drill", 3), 777),
      ),
    );
    expect(h.snapshot().hasSave).toBe(true);
    h.pose((d, s) => d.setHull(s, 0));
    await h.engine.advance(1);
    expect(h.snapshot().hasSave).toBe(true);
    await h.press("Enter");
    expect(h.snapshot().screen).toBe("in-mine");
    expect(h.snapshot().credits).toBe(777);
    expect(h.snapshot().tiers.drill).toBe(3);
    expect(h.snapshot().cargo.ore.marlite).toBe(3);
  });
  it("refuses unstable saves and Hardcore death deletes the slot immediately", async () => {
    const h = await arena();
    h.pose((d, s) => d.setMode(s, "hardcore"));
    h.pose((d, s) => d.save(s));
    expect(h.snapshot().hasSave).toBe(true);
    const save = h.engine.state.saveData;
    h.pose((d, s) => d.save(d.setCoreCarried(s, true)));
    expect(h.engine.state.saveData).toBe(save);
    h.pose((d, s) => d.setHull(s, 0));
    await h.engine.advance(1);
    expect(h.snapshot().hasSave).toBe(false);
  });
  it("fabricates in order, consumes materials and plays a complete launch", async () => {
    const h = await arena();
    h.pose((d, s) =>
      d.setCredits(
        d.setMaterial(
          d.setMaterial(d.setCoreCarried(s, true), "cryenite", 1),
          "resonite",
          1,
        ),
        C.ROCKET_TOTAL_CREDITS,
      ),
    );
    for (let i = 0; i < 5; i++) h.pose((d, s) => d.fabricate(s));
    expect(h.snapshot().rocket.installed).toHaveLength(5);
    expect(h.snapshot().coreTimer).toBeNull();
    expect(h.snapshot().credits).toBe(0);
    h.pose((d, s) => d.launch(s));
    await h.engine.advance(220);
    expect(h.snapshot().screen).toBe("victory");
    expect(h.snapshot().summary?.componentsInstalled).toBe(5);
  });
  it("reset restores defaults while preserving preferences and save", async () => {
    const h = await arena();
    h.pose((d, s) => d.save(s));
    h.pose((d, s) => d.reset(d.setCoreCarried(d.setCredits(s, 900), true)));
    expect(h.snapshot().screen).toBe("title");
    expect(h.snapshot().credits).toBe(0);
    expect(h.snapshot().coreTimer).toBeNull();
    expect(h.snapshot().hasSave).toBe(true);
  });
});
