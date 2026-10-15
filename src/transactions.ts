import * as C from "./constants";
import {
  camera,
  cargoValue,
  cell,
  copy,
  depth,
  footprints,
  initial,
  jet,
  loadKg,
  maxFuel,
  maxHull,
  minerCell,
  tile,
  type DeepcoreState,
  type ReadState,
} from "./model";
import { generate, resize } from "./world";
export const SAVE_KEY = "deepcore.expedition.v1";
export function storageRead(): string | null {
  try {
    return globalThis.localStorage?.getItem(SAVE_KEY) ?? null;
  } catch {
    return null;
  }
}
export function storageWrite(data: string | null): boolean {
  try {
    if (!globalThis.localStorage) return false;
    if (data === null) globalThis.localStorage.removeItem(SAVE_KEY);
    else globalThis.localStorage.setItem(SAVE_KEY, data);
    return true;
  } catch {
    return false;
  }
}
export function note(s: DeepcoreState, text: string) {
  s.note = text;
  s.noteTime = 3.8;
}
export function fx(
  s: DeepcoreState,
  name: string,
  x: number,
  y: number,
  tint?: string,
) {
  s.effects.push({
    name,
    x,
    y,
    age: 0,
    seed: Math.floor(Math.random() * 1000000),
    tint,
  });
}
export function cue(s: DeepcoreState, name: C.CueName) {
  s.sounds.push(name);
}
export function start(s: ReadState): DeepcoreState {
  const n = initial(s.resources as DeepcoreState["resources"], s.muted);
  resize(n, s.worldSize);
  n.mode = s.mode;
  n.grid = generate(n.coreRow);
  n.screen = "in-mine";
  n.simTime = s.simTime;
  storageWrite(null);
  camera(n, 0);
  note(n, "CAMP 04  /  Dig. Haul. Build your way home.");
  return n;
}
export function summary(s: DeepcoreState, cause: C.DeathCause | null) {
  s.summary = {
    deepestDepthMeters: s.deepestDepthMeters,
    creditsEarned: s.creditsEarned,
    elapsedSeconds: s.elapsedSeconds,
    mode: s.mode,
    componentsInstalled: s.installed,
    deathCause: cause,
  };
}
export function die(s: DeepcoreState, cause: C.DeathCause) {
  if (s.screen !== "in-mine" || s.launchTime !== null) return;
  s.coreTimer = null;
  s.coreGround = null;
  s.satchel.coreSample = false;
  s.panel = null;
  s.menuIndex = 0;
  s.screen = "game-over";
  if (cause === "fuel-out" && !s.drilling) {
    s.miner.state = "fuel-out";
    s.miner.animTime = 0;
  }
  summary(s, cause);
  fx(s, "death-burst", s.miner.x + C.MINER_W / 2, s.miner.y + C.MINER_H / 2);
  cue(s, C.CUES.death);
  if (s.mode === "hardcore") {
    s.hasSave = false;
    s.saveData = null;
    storageWrite(null);
  }
}
export function checkDeath(s: DeepcoreState) {
  if (s.miner.hull <= 0) die(s, "hull-destroyed");
  else if (s.miner.fuel <= 0 && s.miner.y + C.MINER_H > C.SURFACE_Y + 0.1)
    die(s, "fuel-out");
}
export function hurt(
  s: DeepcoreState,
  damage: number,
  hazard?: C.NoticeHazard,
) {
  if (damage <= 0) return;
  s.miner.hull = Math.max(0, s.miner.hull - damage);
  s.miner.hurt = C.HURT_TIME;
  if (hazard && !s.noticesFired[hazard]) {
    s.noticesFired[hazard] = true;
    s.notice = { hazard, age: 0 };
  }
  checkDeath(s);
}
export function gas(s: DeepcoreState, c: number, r: number) {
  const x = (c + 0.5) * C.TILE,
    y = (r + 0.5) * C.TILE;
  fx(s, "gas-explosion", x, y);
  cue(s, C.CUES.gasExplosion);
  s.shake = 1;
  const dx = s.miner.x + C.MINER_W / 2 - x,
    dy = s.miner.y + C.MINER_H / 2 - y,
    d = Math.hypot(dx, dy);
  if (d <= C.GAS_BLAST_TILES * C.TILE) {
    hurt(
      s,
      C.GAS_DAMAGE_MIN +
        ((C.GAS_DAMAGE_MAX - C.GAS_DAMAGE_MIN) *
          Math.max(0, (r - 1) / (s.coreRow - 1) - 0.25)) /
          0.75,
      "gas",
    );
    if (s.miner.travel) {
      s.miner.vx = (dx / (d || 1)) * C.GAS_KNOCKBACK;
      s.miner.vy = (dy / (d || 1)) * C.GAS_KNOCKBACK;
    }
  }
}
export function canFabricate(s: ReadState) {
  const c = C.ROCKET_COMPONENTS[s.installed];
  return (
    !!c &&
    s.credits >= c.credits &&
    (!c.material ||
      (c.material === "core-sample"
        ? s.satchel.coreSample
        : s.satchel[c.material] > 0))
  );
}
export function canUseItem(s: ReadState, item: C.ItemId): boolean {
  if (!s.items[item]) return false;
  if (item === "nanobots") return s.miner.hull < maxHull(s);
  if (item === "emergency-fuel") return s.miner.fuel < maxFuel(s);
  if (item === "matter-transmitter")
    return (
      s.miner.x !== C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2 ||
      s.miner.y !== C.SURFACE_Y - C.MINER_H ||
      s.miner.vx !== 0 ||
      s.miner.vy !== 0
    );
  if (item === "dynamite" || item === "plastic-explosives") {
    const p = minerCell(s),
      radius =
        item === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
    for (
      let r = Math.max(1, p.row - radius);
      r <= Math.min(s.coreRow - 1, p.row + radius);
      r++
    )
      for (
        let c = Math.max(1, p.col - radius);
        c <= Math.min(C.PLAYABLE_COL_MAX, p.col + radius);
        c++
      )
        if (
          !["bedrock", "material", "core", "tunnel"].includes(
            tile(s, c, r).kind,
          )
        )
          return true;
    return false;
  }
  return true;
}
export function transact(
  s: DeepcoreState,
  control: string,
  subject: string | null = null,
) {
  switch (control) {
    case "drop-ore": {
      const ore = subject as C.OreId;
      if ((s.cargo[ore] ?? 0) > 0) {
        s.cargo[ore]!--;
        if (!s.cargo[ore]) delete s.cargo[ore];
      }
      break;
    }
    case "sell": {
      const value = cargoValue(s);
      s.credits += value;
      s.creditsEarned += value;
      s.cargo = {};
      note(
        s,
        value
          ? `Haul sold  /  +${value.toLocaleString()} CR`
          : "Cargo bay empty",
      );
      if (value) cue(s, C.CUES.fabricate);
      break;
    }
    case "buy-fuel":
    case "fill-fuel":
    case "buy-repair":
    case "repair-full": {
      const fuel = control.includes("fuel"),
        max = fuel ? maxFuel(s) : maxHull(s),
        current = fuel ? s.miner.fuel : s.miner.hull,
        price = fuel ? C.FUEL_PRICE : C.REPAIR_PRICE,
        increment =
          control === "buy-fuel"
            ? C.FUEL_BUY_INCREMENT
            : control === "buy-repair"
              ? C.REPAIR_BUY_INCREMENT
              : Infinity;
      if (
        Number.isFinite(increment) &&
        s.credits < Math.max(0, Math.min(max - current, increment)) * price
      ) {
        note(s, "Not enough Credits");
        break;
      }
      const amount = Math.max(
        0,
        Math.min(max - current, increment, s.credits / price),
      );
      s.credits -= amount * price;
      if (fuel) s.miner.fuel += amount;
      else s.miner.hull += amount;
      note(
        s,
        amount ? `${fuel ? "Fuel" : "Hull"} restored` : "No purchase available",
      );
      if (amount) cue(s, C.CUES.fabricate);
      break;
    }
    case "buy-upgrade": {
      const track = subject as C.TrackName,
        t = s.tiers[track];
      if (t >= C.MAX_TIER[track] || s.credits < C.UPGRADE_PRICES[t - 1]) {
        note(s, "Upgrade unavailable");
        break;
      }
      const fuel = maxFuel(s),
        hull = maxHull(s);
      s.credits -= C.UPGRADE_PRICES[t - 1];
      s.tiers[track]++;
      s.miner.fuel += maxFuel(s) - fuel;
      s.miner.hull += maxHull(s) - hull;
      cue(s, C.CUES.fabricate);
      note(s, `${track.toUpperCase()} upgraded to tier ${t + 1}`);
      break;
    }
    case "buy-item": {
      const item = C.ITEMS.find((i) => i.id === subject)!;
      if (s.credits < item.price) {
        note(s, "Not enough Credits");
        break;
      }
      s.credits -= item.price;
      s.items[item.id]++;
      cue(s, C.CUES.fabricate);
      note(s, `${item.name} acquired`);
      break;
    }
    case "use-item":
      useItem(s, subject as C.ItemId);
      break;
    case "jettison":
      if (s.satchel.coreSample) {
        s.satchel.coreSample = false;
        s.coreGround = minerCell(s);
        note(s, "Sample jettisoned. Move clear of the blast.");
      }
      break;
    case "fabricate": {
      if (!canFabricate(s)) {
        note(s, "Credits or required material missing");
        break;
      }
      const c = C.ROCKET_COMPONENTS[s.installed];
      s.credits -= c.credits;
      if (c.material === "core-sample") {
        s.satchel.coreSample = false;
        s.coreTimer = null;
      } else if (c.material) s.satchel[c.material]--;
      s.installed++;
      cue(s, C.CUES.fabricate);
      note(s, `${c.name} installed  /  ${s.installed}/5`);
      break;
    }
    case "launch":
      if (s.installed === C.ROCKET_COMPONENTS.length && s.launchTime === null) {
        s.launchTime = 0;
        s.panel = null;
        s.hasSave = false;
        s.saveData = null;
        storageWrite(null);
        const pad = footprints.find((b) => b.id === "launch-pad")!;
        fx(s, "launch-exhaust", pad.x + 90, C.SURFACE_Y);
        cue(s, C.CUES.launch);
        s.shake = 1.6;
      }
      break;
    case "save": {
      if (s.coreTimer !== null) {
        note(s, "Cannot save with an unstable Core Sample");
        break;
      }
      const data = JSON.stringify({
        grid: s.grid,
        mode: s.mode,
        worldSize: s.worldSize,
        credits: s.credits,
        creditsEarned: s.creditsEarned,
        tiers: s.tiers,
        installed: s.installed,
        items: s.items,
        cargo: s.cargo,
        satchel: s.satchel,
        fuel: s.miner.fuel,
        hull: s.miner.hull,
        elapsedSeconds: s.elapsedSeconds,
        deepestDepthMeters: s.deepestDepthMeters,
        noticesFired: s.noticesFired,
      });
      if (storageWrite(data)) {
        s.saveData = data;
        s.hasSave = true;
        note(s, "Expedition saved at Camp 04");
        cue(s, C.CUES.fabricate);
      } else note(s, "Storage unavailable. Expedition not saved.");
      break;
    }
    case "dismiss-notice":
      s.notice = null;
      break;
  }
}
export function restore(s: ReadState): DeepcoreState {
  if (!s.saveData) return copy(s);
  try {
    const p = JSON.parse(s.saveData);
    const n = initial(
      s.resources as DeepcoreState["resources"],
      s.muted,
      s.saveData,
    );
    resize(n, p.worldSize);
    for (const key of [
      "grid",
      "mode",
      "credits",
      "creditsEarned",
      "tiers",
      "installed",
      "items",
      "cargo",
      "satchel",
      "elapsedSeconds",
      "deepestDepthMeters",
      "noticesFired",
    ] as const)
      Object.assign(n, { [key]: p[key] });
    n.miner.fuel = p.fuel;
    n.miner.hull = p.hull;
    n.screen = "in-mine";
    n.simTime = s.simTime;
    camera(n, 0);
    return n;
  } catch {
    return copy(s);
  }
}
function useItem(s: DeepcoreState, item: C.ItemId) {
  if (!s.items[item]) {
    note(s, "No supply held");
    return;
  }
  if (
    (item === "nanobots" && s.miner.hull >= maxHull(s)) ||
    (item === "emergency-fuel" && s.miner.fuel >= maxFuel(s))
  ) {
    note(s, "Already at maximum");
    return;
  }
  const p = minerCell(s);
  if (item === "dynamite" || item === "plastic-explosives") {
    const radius =
      item === "dynamite" ? C.DYNAMITE_RADIUS : C.PLASTIC_EXPLOSIVES_RADIUS;
    let changed = false;
    for (let r = p.row - radius; r <= p.row + radius; r++)
      for (let c = p.col - radius; c <= p.col + radius; c++) {
        const t = tile(s, c, r);
        if (
          r < 1 ||
          r >= s.coreRow ||
          c < 1 ||
          c > C.PLAYABLE_COL_MAX ||
          ["bedrock", "material", "core", "tunnel"].includes(t.kind)
        )
          continue;
        if (t.kind === "gas") gas(s, c, r);
        s.grid[r][c] = cell("tunnel", t.band);
        changed = true;
      }
    if (!changed) {
      note(s, "Nothing to blast");
      return;
    }
    fx(
      s,
      "gas-explosion",
      s.miner.x + C.MINER_W / 2,
      s.miner.y + C.MINER_H / 2,
    );
    cue(s, C.CUES.gasExplosion);
    s.shake = 1;
    s.drilling = null;
  } else if (item === "nanobots")
    s.miner.hull = Math.min(maxHull(s), s.miner.hull + C.NANOBOT_HULL);
  else if (item === "emergency-fuel")
    s.miner.fuel = Math.min(maxFuel(s), s.miner.fuel + C.EMERGENCY_FUEL);
  else {
    const spawn = C.SPAWN_COL * C.TILE + (C.TILE - C.MINER_W) / 2;
    if (
      item === "matter-transmitter" &&
      s.miner.x === spawn &&
      s.miner.y === C.SURFACE_Y - C.MINER_H &&
      s.miner.vx === 0 &&
      s.miner.vy === 0
    ) {
      note(s, "Already at camp");
      return;
    }
    let y = C.SURFACE_Y - C.MINER_H,
      vy = 0;
    if (item === "quantum-teleporter") {
      const height =
        s.nextTeleportHeight ??
        C.TELEPORT_HEIGHT_TILES_MIN +
          Math.random() *
            (C.TELEPORT_HEIGHT_TILES_MAX - C.TELEPORT_HEIGHT_TILES_MIN);
      y -= height * C.TILE;
      vy =
        s.nextTeleportSpeed ??
        C.TELEPORT_SPEED_MIN +
          Math.random() * (C.TELEPORT_SPEED_MAX - C.TELEPORT_SPEED_MIN);
      s.nextTeleportHeight = null;
      s.nextTeleportSpeed = null;
    }
    s.miner.x = spawn;
    s.miner.y = y;
    s.miner.vx = 0;
    s.miner.vy = vy;
    s.drilling = null;
    camera(s, 0);
  }
  s.items[item]--;
  fx(
    s,
    item.includes("teleport") || item === "matter-transmitter"
      ? "core-extract"
      : "material-shimmer",
    s.miner.x + C.MINER_W / 2,
    s.miner.y + C.MINER_H / 2,
  );
  cue(s, C.CUES.materialChime);
  note(s, `${C.ITEMS.find((i) => i.id === item)!.name} used`);
  checkDeath(s);
}
export function expeditionFacts(s: ReadState) {
  return { depth: depth(s), load: loadKg(s), limit: jet(s).liftLimitKg };
}
