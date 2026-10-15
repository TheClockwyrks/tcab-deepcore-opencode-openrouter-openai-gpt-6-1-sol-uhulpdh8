import * as C from "./constants";
import manifest from "../assets/manifest.json";
import {
  camera,
  cell,
  clamp,
  depth,
  grounded,
  footprints,
  jet,
  loadKg,
  minerCell,
  minable,
  slots,
  tile,
  type DeepcoreState,
} from "./model";
import {
  checkDeath,
  cue,
  die,
  fx,
  gas,
  hurt,
  note,
  summary,
} from "./transactions";
export interface Held {
  left: number;
  right: number;
  down: number;
  up: number;
}
export const FIXED_STEP = 1 / 120;
function solidAt(s: DeepcoreState, c: number, r: number, ignore: boolean) {
  if (ignore && s.drilling?.col === c && s.drilling.row === r) return false;
  return tile(s, c, r).kind !== "tunnel";
}
function move(s: DeepcoreState, dx: number, dy: number) {
  const m = s.miner,
    ignore = s.drilling?.dir === "down";
  if (dx) {
    let x = clamp(m.x + dx, 0, C.WORLD_W - C.MINER_W);
    const col = Math.floor((dx > 0 ? x + C.MINER_W - 0.001 : x) / C.TILE);
    for (
      let r = Math.floor((m.y + 0.01) / C.TILE);
      r <= Math.floor((m.y + C.MINER_H - 0.01) / C.TILE);
      r++
    )
      if (solidAt(s, col, r, ignore)) {
        x = dx > 0 ? col * C.TILE - C.MINER_W : (col + 1) * C.TILE;
        break;
      }
    m.x = x;
  }
  if (dy) {
    let y = m.y + dy;
    const row = Math.floor((dy > 0 ? y + C.MINER_H - 0.001 : y) / C.TILE);
    for (
      let c = Math.floor((m.x + 0.01) / C.TILE);
      c <= Math.floor((m.x + C.MINER_W - 0.01) / C.TILE);
      c++
    )
      if (solidAt(s, c, row, ignore)) {
        y = dy > 0 ? row * C.TILE - C.MINER_H : (row + 1) * C.TILE;
        if (dy > 0 && m.vy > C.IMPACT_SAFE_SPEED) {
          const damage = (m.vy - C.IMPACT_SAFE_SPEED) * C.IMPACT_DAMAGE_RATE;
          hurt(s, damage);
          fx(s, "impact-dust", m.x + C.MINER_W / 2, y + C.MINER_H);
          cue(s, C.CUES.impact);
          s.shake = Math.max(s.shake, 0.5);
        }
        m.vy = 0;
        break;
      }
    m.y = y;
  }
}
function breakCell(s: DeepcoreState, c: number, r: number) {
  const t = tile(s, c, r);
  s.grid[r][c] = cell("tunnel", t.band);
  if (t.ore) {
    if (slots(s) < C.CARGO_TIERS[s.tiers.cargo - 1]) {
      s.cargo[t.ore] = (s.cargo[t.ore] ?? 0) + 1;
      fx(
        s,
        "ore-sparkle",
        (c + 0.5) * C.TILE,
        (r + 0.5) * C.TILE,
        manifest.colors[t.ore],
      );
      cue(s, C.CUES.orePickup);
      note(s, `+ ${C.MINERALS.find((o) => o.id === t.ore)!.name}`);
    } else note(s, "cargo full");
  }
  if (t.material) {
    s.satchel[t.material]++;
    fx(s, "material-shimmer", (c + 0.5) * C.TILE, (r + 0.5) * C.TILE);
    cue(s, C.CUES.materialChime);
    note(s, `${t.material.toUpperCase()} secured  /  Return to the launch pad`);
  }
  if (t.kind === "gas") gas(s, c, r);
  if (t.kind === "lava") {
    hurt(
      s,
      (t.band === "coreshell"
        ? C.LAVA_DRILL_CORESHELL
        : C.LAVA_DRILL_DEEPSTONE) *
        (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]),
      "lava",
    );
    cue(s, C.CUES.lavaSizzle);
    fx(s, "lava-embers", (c + 0.5) * C.TILE, (r + 0.5) * C.TILE);
  }
}
function drill(s: DeepcoreState, h: Held, dt: number, onGround: boolean) {
  const m = s.miner;
  let target: DeepcoreState["drilling"] = null;
  if (m.drill && onGround && !h.up && m.fuel > 0) {
    if (h.down) {
      if (s.drilling?.dir === "down") target = { ...s.drilling };
      else
        target = {
          col: Math.floor((m.x + C.MINER_W / 2) / C.TILE),
          row: Math.round((m.y + C.MINER_H) / C.TILE),
          dir: "down",
        };
    } else if (h.left || h.right) {
      const dir = h.right ? "right" : "left",
        x = dir === "right" ? m.x + C.MINER_W : m.x;
      const edge = x / C.TILE;
      if (Math.abs(edge - Math.round(edge)) < 0.015)
        target = {
          col: Math.round(edge) - (dir === "left" ? 1 : 0),
          row: Math.floor((m.y + C.MINER_H / 2) / C.TILE),
          dir,
        };
    }
  }
  if (target) {
    const t = tile(s, target.col, target.row);
    if (
      !minable(t) &&
      !(t.kind === "core" && target.dir === "down" && s.coreTimer === null)
    )
      target = null;
  }
  if (!target) {
    s.drilling = null;
    s.hitTime = 0;
    return;
  }
  if (
    s.drilling?.col !== target.col ||
    s.drilling.row !== target.row ||
    s.drilling.dir !== target.dir
  )
    s.hitTime = 0;
  s.drilling = target;
  s.hitTime += dt;
  const { col, row } = target;
  const t = tile(s, col, row);
  if (t.kind === "core") {
    if (s.hitTime + 1e-8 >= C.DRILL_HIT_INTERVAL) {
      m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
      s.satchel.coreSample = true;
      s.coreTimer = C.CORE_TIMER;
      s.coreGround = null;
      s.drilling = null;
      s.hitTime = 0;
      fx(s, "core-extract", (col + 0.5) * C.TILE, row * C.TILE);
      cue(s, C.CUES.materialChime);
      note(s, "CORE SAMPLE EXTRACTED  /  90 seconds to ignition");
    }
    return;
  }
  let health = t.health!;
  while (s.hitTime + 1e-8 >= C.DRILL_HIT_INTERVAL && health > 0 && m.fuel > 0) {
    s.hitTime -= C.DRILL_HIT_INTERVAL;
    m.fuel = Math.max(0, m.fuel - C.DRILL_HIT_FUEL);
    health -= C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1];
  }
  s.grid[row][col] = { ...t, health: Math.max(0, health) };
  const sink =
    target.dir === "down" &&
    tile(s, col, row + 1).kind !== "tunnel" &&
    tile(s, col, row + 1).kind !== "lava";
  if (sink && m.travel) {
    const progress = clamp(
      1 -
        health / C.BAND_HEALTH[t.band!] +
        ((s.hitTime / C.DRILL_HIT_INTERVAL) *
          C.DRILL_DAMAGE_TIERS[s.tiers.drill - 1]) /
          C.BAND_HEALTH[t.band!],
      0,
      1,
    );
    m.y = row * C.TILE - C.MINER_H + progress * C.TILE;
    m.vy = 0;
  }
  if (health <= 0) {
    breakCell(s, col, row);
    if (sink && m.travel) m.y = (row + 1) * C.TILE - C.MINER_H;
    s.drilling = null;
  }
  if (
    Math.floor(s.elapsedSeconds * 20) !==
    Math.floor((s.elapsedSeconds - dt) * 20)
  )
    fx(
      s,
      "drill-debris",
      (col + 0.5) * C.TILE,
      target.dir === "down" ? m.y + C.MINER_H : m.y + C.MINER_H / 2,
      {
        topsoil: "#b5a17a",
        rockbed: "#a9bdba",
        deepstone: "#8c92b8",
        coreshell: "#c48079",
      }[t.band!],
    );
}
export function step(s: DeepcoreState, h: Held, dt: number) {
  if (s.screen !== "in-mine") return;
  s.elapsedSeconds += dt;
  s.miner.hurt = Math.max(0, s.miner.hurt - dt);
  s.shake = Math.max(0, s.shake - dt);
  s.effects = s.effects
    .map((e) => ({ ...e, age: e.age + dt }))
    .filter((e) => e.age < 2.4);
  if (s.notice) {
    s.notice.age += dt;
    if (s.notice.age > C.NOTICE_DELAY + C.NOTICE_FADE) s.notice = null;
  }
  if (s.launchTime !== null) {
    s.launchTime += dt;
    if (
      Math.floor(s.launchTime * 15) !== Math.floor((s.launchTime - dt) * 15)
    ) {
      const pad = footprints.find((b) => b.id === "launch-pad")!;
      fx(
        s,
        "launch-exhaust",
        pad.x + pad.w / 2,
        C.SURFACE_Y - s.launchTime * s.launchTime * 110,
      );
    }
    if (s.launchTime > 3.5) {
      s.screen = "victory";
      s.menuIndex = 0;
      summary(s, null);
    }
    return;
  }
  checkDeath(s);
  if (s.screen !== "in-mine") return;
  if (s.coreTimer !== null) {
    s.coreTimer = Math.max(0, s.coreTimer - dt);
    if (!s.coreTimer) {
      const p = s.coreGround ?? minerCell(s);
      fx(s, "core-detonation", (p.col + 0.5) * C.TILE, (p.row + 0.5) * C.TILE);
      s.shake = 2.4;
      cue(s, C.CUES.gasExplosion);
      const lethal =
        s.satchel.coreSample ||
        Math.hypot(
          s.miner.x + C.MINER_W / 2 - (p.col + 0.5) * C.TILE,
          s.miner.y + C.MINER_H / 2 - (p.row + 0.5) * C.TILE,
        ) <=
          C.CORE_BLAST_TILES * C.TILE;
      s.coreTimer = null;
      s.coreGround = null;
      s.satchel.coreSample = false;
      if (lethal) die(s, "core-detonation");
    }
  }
  if (s.screen !== "in-mine" || s.panel) {
    checkDeath(s);
    return;
  }
  const m = s.miner,
    onGround = grounded(s),
    thrust = !!h.up && m.fuel > 0,
    dir = h.right - h.left;
  if (dir) m.facing = dir > 0 ? "east" : "west";
  const load = loadKg(s) / jet(s).liftLimitKg;
  if (m.y + C.MINER_H > C.SURFACE_Y + 0.1)
    m.fuel = Math.max(0, m.fuel - C.LIFE_SUPPORT_BURN * dt);
  if (thrust)
    m.fuel = Math.max(
      0,
      m.fuel -
        (C.THRUST_BURN_MAX +
          (C.THRUST_BURN_MIN - C.THRUST_BURN_MAX) *
            Math.min(1, Math.max(0, -m.vy) / C.CRUISE_SPEED)) *
          C.THRUST_BURN_SIZE_MULT[s.worldSize] *
          dt,
    );
  if (dir && !onGround) m.fuel = Math.max(0, m.fuel - C.AIR_BURN * dt);
  if (m.travel) {
    m.vx =
      m.hurt > 0 && Math.abs(m.vx) > C.WALK_SPEED
        ? m.vx * Math.max(0, 1 - dt * 6)
        : dir * C.WALK_SPEED;
    move(s, m.vx * dt, 0);
  }
  drill(s, h, dt, onGround);
  if (m.travel) {
    if (thrust)
      m.vy = Math.max(
        -jet(s).emptyClimb * (1 - (1 - C.CLIMB_CAP_FLOOR) * Math.min(1, load)),
        m.vy - jet(s).emptyAccel * Math.max(0, 1 - load) * dt,
      );
    else if (!s.drilling)
      m.vy = Math.min(
        C.FALL_TERMINAL_EMPTY +
          (C.FALL_TERMINAL_LOADED - C.FALL_TERMINAL_EMPTY) * Math.min(1, load),
        m.vy + C.GRAVITY * dt,
      );
    if (s.drilling?.dir !== "down") move(s, 0, m.vy * dt);
  }
  const left = Math.floor((m.x - 0.1) / C.TILE),
    right = Math.floor((m.x + C.MINER_W + 0.1) / C.TILE),
    top = Math.floor((m.y - 0.1) / C.TILE),
    bottom = Math.floor((m.y + C.MINER_H + 0.1) / C.TILE);
  let lava = false;
  for (let r = top; r <= bottom; r++)
    for (let c = left; c <= right; c++)
      if (
        tile(s, c, r).kind === "lava" &&
        !(s.drilling?.col === c && s.drilling.row === r)
      )
        lava = true;
  if (lava) {
    hurt(
      s,
      C.LAVA_CONTACT_DPS * (1 - C.RADIATOR_TIERS[s.tiers.radiator - 1]) * dt,
      "lava",
    );
    if (
      Math.floor(s.elapsedSeconds * 6) !==
      Math.floor((s.elapsedSeconds - dt) * 6)
    ) {
      fx(s, "lava-embers", m.x + C.MINER_W / 2, m.y + C.MINER_H);
      cue(s, C.CUES.lavaSizzle);
    }
  }
  const previous = m.state;
  m.state = s.drilling
    ? s.drilling.dir === "down"
      ? "drill-down"
      : "drill-side"
    : m.hurt > 0
      ? "hurt"
      : m.fuel <= 0 && depth(s) > 0
        ? "fuel-out"
        : thrust
          ? "jetpack"
          : !grounded(s)
            ? "fall"
            : dir
              ? "walk"
              : "idle";
  m.animTime = previous === m.state ? m.animTime + dt : 0;
  if (
    thrust &&
    Math.floor(s.elapsedSeconds * 15) !==
      Math.floor((s.elapsedSeconds - dt) * 15)
  )
    fx(s, "jetpack-exhaust", m.x + 18, m.y + C.MINER_H - 8);
  if (
    Math.floor(s.elapsedSeconds / C.GAS_SEEP_PERIOD) !==
    Math.floor((s.elapsedSeconds - dt) / C.GAS_SEEP_PERIOD)
  ) {
    for (
      let r = Math.max(1, Math.floor(s.camY / C.TILE));
      r <= Math.min(s.coreRow, Math.ceil((s.camY + C.VIEW_H) / C.TILE));
      r++
    )
      for (
        let c = Math.max(1, Math.floor(s.camX / C.TILE));
        c <=
        Math.min(C.PLAYABLE_COL_MAX, Math.ceil((s.camX + C.VIEW_W) / C.TILE));
        c++
      )
        if (tile(s, c, r).kind === "gas")
          fx(s, "gas-seep", (c + 0.5) * C.TILE, (r + 0.5) * C.TILE);
  }
  s.deepestDepthMeters = Math.max(s.deepestDepthMeters, depth(s));
  camera(s, dt);
  checkDeath(s);
}
