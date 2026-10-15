import type { Game, InitApi, UpdateApi } from "@clockwyrks/simple-2d";
import "./style.css";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  copy,
  footprints,
  initial,
  type DeepcoreState,
  type ReadState,
  type Resources,
} from "./model";
import { createDebug, snapshot, type DeepcoreDebugApi } from "./debug";
import { contains, controls, menuItems, menuRect, nearby } from "./interface";
import { render } from "./render";
import { FIXED_STEP, step } from "./simulation";
import {
  checkDeath,
  restore,
  start,
  storageRead,
  transact,
} from "./transactions";
export type { DeepcoreState, DeepcoreDebugApi };
export const BACKGROUND = "#0d1b24";

// Vite discovers every authored file at build time, giving the engine its relative
// emitted filename. Asset generation is deliberately absent from the build.
const files = import.meta.glob<string>("../assets/**/*.{png,wav,json}", {
  eager: true,
  query: "?url&no-inline",
  import: "default",
});
function enginePath(url: string) {
  // With a relative Vite base, production URL imports are resolved against the
  // module and arrive as absolute URLs. The engine expects the suffix beneath
  // its own document-relative assets/ root, in development and production alike.
  const marker = url.lastIndexOf("/assets/");
  return marker >= 0
    ? url.slice(marker + "/assets/".length)
    : url.replace(/^\.?\/?assets\//, "");
}
async function initialize(
  api: InitApi<DeepcoreState>,
): Promise<[DeepcoreState, DeepcoreDebugApi]> {
  for (const [name, keys] of Object.entries(C.ACTIONS))
    api.input.register(name, { keys: [...keys] });
  const resources: Resources = { images: {}, effects: {} };
  await Promise.all(
    Object.entries(files).map(async ([path, url]) => {
      const name = path.replace("../assets/", "");
      if (name.endsWith(".png"))
        resources.images[name] = await api.assets.loadImage(enginePath(url));
      else if (name.startsWith("fx/") && name.endsWith(".json"))
        resources.effects[name.slice(3, -5)] = JSON.parse(
          await (await api.assets.load(enginePath(url))).text(),
        ) as ParticleSystem;
    }),
  );
  await Promise.all(
    Object.values(C.CUES).map(async (cue) => {
      const url = files[`../assets/audio/${cue}.wav`];
      await api.audio.load(cue, enginePath(url));
    }),
  );
  const debug = createDebug();
  const diagnostics: Record<string, (s: ReadState) => string> = {
    "Screen / panel": (s) => `${s.screen} / ${s.panel ?? "—"}`,
    "Mode / size": (s) => `${s.mode} / ${s.worldSize}`,
    Position: (s) => `${s.miner.x.toFixed(1)}, ${s.miner.y.toFixed(1)}`,
    Velocity: (s) => `${s.miner.vx.toFixed(1)}, ${s.miner.vy.toFixed(1)}`,
    Actor: (s) =>
      `${s.miner.state} / ${s.miner.facing} / grounded ${snapshot(s).miner.grounded}`,
    "Fuel / hull": (s) =>
      `${s.miner.fuel.toFixed(1)}/${snapshot(s).miner.maxFuel} / ${s.miner.hull.toFixed(1)}/${snapshot(s).miner.maxHull}`,
    Drill: (s) =>
      s.drilling
        ? `${s.drilling.col},${s.drilling.row} ${(snapshot(s).miner.drilling!.progress * 100).toFixed(0)}%`
        : "—",
    "Credits / depth": (s) =>
      `${s.credits.toFixed(0)} CR / ${snapshot(s).depthMeters.toFixed(1)}m`,
    Cargo: (s) => {
      const c = snapshot(s).cargo;
      return `${c.slotsUsed}/${c.slotCap} / ${c.loadKg}kg / overload ${snapshot(s).miner.overloaded}`;
    },
    Satchel: (s) =>
      `R ${s.satchel.resonite} / C ${s.satchel.cryenite} / core ${s.satchel.coreSample}`,
    Tiers: (s) => C.TRACKS.map((t) => `${t} ${s.tiers[t]}`).join(" / "),
    "Core timer": (s) => s.coreTimer?.toFixed(2) ?? "—",
    Scanner: (s) =>
      `${snapshot(s).scanner.locked} / ${snapshot(s).scanner.target ?? "—"}`,
  };
  for (const [label, source] of Object.entries(diagnostics))
    api.diagnostics.register(label, source);
  return [initial(resources, false, storageRead()), debug];
}
function goBack(s: DeepcoreState) {
  switch (s.screen) {
    case "paused":
      s.screen = "in-mine";
      s.menuIndex = 0;
      break;
    case "size-select":
      s.screen = "mode-select";
      s.menuIndex = C.MODES.indexOf(s.mode);
      break;
    case "how-to-play":
      s.screen = "title";
      s.menuIndex = menuItems(s).indexOf("HOW TO PLAY");
      break;
    case "mode-select":
      s.screen = "title";
      s.menuIndex = menuItems(s).indexOf("NEW EXPEDITION");
      break;
  }
}
function choose(s: DeepcoreState): DeepcoreState {
  const item = menuItems(s)[s.menuIndex];
  switch (s.screen) {
    case "title":
      if (item === "CONTINUE") return restore(s);
      s.screen = item === "HOW TO PLAY" ? "how-to-play" : "mode-select";
      break;
    case "mode-select":
      if (item === "BACK") {
        goBack(s);
        return s;
      }
      s.mode = C.MODES[s.menuIndex];
      s.screen = "size-select";
      break;
    case "size-select":
      if (item === "BACK") {
        goBack(s);
        return s;
      }
      s.worldSize = C.WORLD_SIZES[s.menuIndex];
      return start(s);
    case "how-to-play":
      goBack(s);
      return s;
    case "paused":
      if (item === "RESUME") s.screen = "in-mine";
      else if (item === "RESTART") return start(s);
      else {
        s.screen = "title";
        s.menuIndex = menuItems(s).indexOf("NEW EXPEDITION");
        return s;
      }
      break;
    case "victory":
    case "game-over":
      if (item === "PLAY AGAIN") return start(s);
      if (item === "CONTINUE FROM SAVE") return restore(s);
      s.screen = "title";
      s.menuIndex = menuItems(s).indexOf("NEW EXPEDITION");
      return s;
  }
  s.menuIndex = 0;
  return s;
}
function activateBuilding(s: DeepcoreState, id: C.BuildingId) {
  if (id === "save-pad") transact(s, "save");
  else {
    s.panel = id;
    s.panelFocus = 0;
  }
}
function control(
  s: DeepcoreState,
  id: string,
  subject: string | null,
  api: UpdateApi,
) {
  switch (id) {
    case "inventory":
      s.panel = s.panel === "inventory" ? null : "inventory";
      s.panelFocus = 0;
      break;
    case "pause":
      if (s.panel) s.panel = null;
      else {
        s.screen = "paused";
        s.menuIndex = 0;
      }
      break;
    case "mute":
      api.audio.setMuted(!api.audio.muted());
      break;
    case "close":
      s.panel = null;
      break;
    default:
      transact(s, id, subject);
  }
}
function hit(s: ReadState, x: number, y: number) {
  const menu = menuItems(s);
  for (let i = 0; i < menu.length; i++) {
    const r = menuRect(s, i)!;
    if (contains(r, x, y)) return `menu:${i}`;
  }
  for (const c of controls(s))
    if (c.enabled && contains(c, x, y))
      return `control:${c.id}:${c.subject ?? ""}`;
  if (s.screen === "in-mine" && !s.panel && y > C.HUD_H)
    for (const b of footprints)
      if (
        contains(
          { x: b.x - s.camX, y: b.y - s.camY + C.HUD_H, w: b.w, h: b.h },
          x,
          y,
        )
      )
        return `building:${b.id}`;
  return null;
}
function update(state: ReadState, api: UpdateApi, dt: number): DeepcoreState {
  let s = copy(state);
  s.simTime += dt;
  s.noteTime = Math.max(0, s.noteTime - dt);
  if (api.input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  if (s.screen === "in-mine") checkDeath(s);
  const pressed = Object.fromEntries(
    C.ACTION_NAMES.filter((n) => n !== "mute").map((n) => [
      n,
      api.input.pressed(n),
    ]),
  );
  if (pressed.pause) {
    if (s.screen === "in-mine") control(s, "pause", null, api);
    else goBack(s);
  } else if (s.screen !== "in-mine") {
    const length = menuItems(s).length;
    if (length) {
      if (pressed.down) s.menuIndex = (s.menuIndex + 1) % length;
      if (pressed.up) s.menuIndex = (s.menuIndex + length - 1) % length;
      if (pressed.activate) s = choose(s);
    }
  } else if (s.launchTime === null) {
    if (pressed.inventory) control(s, "inventory", null, api);
    if (pressed.jettison) transact(s, "jettison");
    C.ITEM_IDS.forEach((id, i) => {
      if (pressed[`supply${i + 1}`]) transact(s, "use-item", id);
    });
    if (s.panel) {
      const available = controls(s).filter(
        (c) =>
          !["inventory", "pause", "mute", "close", "dismiss-notice"].includes(
            c.id,
          ) && c.enabled,
      );
      if (pressed.down)
        s.panelFocus = (s.panelFocus + 1) % Math.max(1, available.length);
      if (pressed.up)
        s.panelFocus =
          (s.panelFocus + available.length - 1) % Math.max(1, available.length);
      if (pressed.activate && available.length) {
        const c = available[s.panelFocus % available.length];
        control(s, c.id, c.subject, api);
      }
    } else if (pressed.activate) {
      const b = nearby(s);
      if (b) activateBuilding(s, b.id);
    }
  }
  for (const p of api.input.pointerSamples()) {
    const target = hit(s, p.x, p.y);
    if (s.panel && p.type === "move" && target?.startsWith("control:")) {
      const available = controls(s).filter(
        (c) =>
          !["inventory", "pause", "mute", "close", "dismiss-notice"].includes(
            c.id,
          ) && c.enabled,
      );
      const index = available.findIndex(
        (c) => target === `control:${c.id}:${c.subject ?? ""}`,
      );
      if (index >= 0) s.panelFocus = index;
    }
    if (target?.startsWith("menu:") && (p.type === "move" || p.type === "down"))
      s.menuIndex = Number(target.split(":")[1]);
    if (p.type === "down") {
      if (target) s.pointerDown[p.id] = target;
      else delete s.pointerDown[p.id];
      if (target === "control:dismiss-notice:") s.notice = null;
    }
    if (p.type === "up") {
      if (target && s.pointerDown[p.id] === target) {
        const [kind, id, subject] = target.split(":");
        if (kind === "menu") {
          s.menuIndex = Number(id);
          s = choose(s);
        } else if (kind === "control") control(s, id, subject || null, api);
        else if (kind === "building") activateBuilding(s, id as C.BuildingId);
      }
      delete s.pointerDown[p.id];
    }
  }
  if (s.screen === "in-mine") {
    s.accumulator += dt;
    const held = {
      left: api.input.value("left"),
      right: api.input.value("right"),
      down: api.input.value("down"),
      up: api.input.value("up"),
    };
    while (s.accumulator + 1e-9 >= FIXED_STEP) {
      step(s, held, FIXED_STEP);
      s.accumulator -= FIXED_STEP;
      if (s.screen !== "in-mine") {
        s.accumulator = 0;
        break;
      }
    }
  } else s.accumulator = 0;
  api.audio.loop(C.CUES.music);
  const drilling = s.screen === "in-mine" && !s.panel && !!s.drilling,
    thrust = s.screen === "in-mine" && !s.panel && s.miner.state === "jetpack";
  for (const [cue, enabled] of [
    [C.CUES.drill, drilling],
    [C.CUES.thrust, thrust],
  ] as const) {
    if (enabled) api.audio.loop(cue);
    else api.audio.stop(cue);
  }
  if (
    s.screen === "in-mine" &&
    s.miner.fuel < C.FUEL_TIERS[s.tiers.fuel - 1] * C.LOW_FUEL_FRACTION &&
    Math.floor(s.simTime / 2) !== Math.floor(state.simTime / 2)
  )
    s.sounds.push(C.CUES.alarmFuel);
  if (s.screen === "in-mine" && s.coreTimer !== null) {
    const period = s.coreTimer < 15 ? 0.25 : s.coreTimer < 40 ? 0.5 : 1;
    if (Math.floor(s.simTime / period) !== Math.floor(state.simTime / period))
      s.sounds.push(C.CUES.alarmCore);
  }
  for (const cue of s.sounds) api.audio.play(cue);
  s.sounds = [];
  s.muted = api.audio.muted();
  return s;
}
export const game: Game<DeepcoreState, DeepcoreDebugApi> = {
  initialize,
  update,
  render,
};
