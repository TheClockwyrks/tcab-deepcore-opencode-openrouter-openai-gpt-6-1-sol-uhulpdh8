import type { RenderApi } from "@clockwyrks/simple-2d";
import { ParticleCanvasPlayer } from "@clockwyrks/particle-runtime/canvas";
import type { ParticleSystem } from "@clockwyrks/particle-runtime";
import * as C from "./constants";
import {
  cargoValue,
  clamp,
  depth,
  footprints,
  jet,
  loadKg,
  maxFuel,
  maxHull,
  scanner,
  slots,
  tile,
  type ReadState,
} from "./model";
import {
  cargoLine,
  controls,
  menuItems,
  menuRect,
  nearby,
  panelBox,
} from "./interface";
import manifest from "../assets/manifest.json";
const P = {
  bg: "#0d1b24",
  panel: "#132731",
  border: "#34505a",
  text: "#e0e5d7",
  muted: "#8fa5a7",
  gold: "#e8b666",
  teal: "#7adac0",
  red: "#ed795d",
};
type Context = CanvasRenderingContext2D;
function text(
  ctx: Context,
  str: string,
  x: number,
  y: number,
  size = 16,
  color = P.text,
  weight = "400",
  align: CanvasTextAlign = "left",
) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px ${size > 44 ? 'Impact, "Arial Narrow", sans-serif' : '"Courier New", monospace'}`;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(str, x, y);
}
function box(
  ctx: Context,
  x: number,
  y: number,
  w: number,
  h: number,
  color = P.panel,
  border = P.border,
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
}
function wrapped(
  ctx: Context,
  str: string,
  x: number,
  y: number,
  width: number,
  size = 12,
  color = P.text,
) {
  ctx.font = `${size}px "Courier New", monospace`;
  let row = "";
  for (const word of str.split(" ")) {
    const next = row ? row + " " + word : word;
    if (ctx.measureText(next).width > width && row) {
      text(ctx, row, x, y, size, color);
      y += 17;
      row = word;
    } else row = next;
  }
  if (row) text(ctx, row, x, y, size, color);
}
function image(
  ctx: Context,
  s: ReadState,
  path: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const img = s.resources.images[path];
  if (img) ctx.drawImage(img, x, y, w, h);
}
function line(
  ctx: Context,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = P.border,
) {
  ctx.beginPath();
  ctx.strokeStyle = color;
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function miner(
  ctx: Context,
  s: ReadState,
  x: number,
  y: number,
  scale = 1,
  state = s.miner.state,
  time = s.miner.animTime,
) {
  const count = manifest.frames[state];
  let frame = Math.floor(time * C.ANIM_FPS);
  frame = state === "hurt" ? Math.min(count - 1, frame) : frame % count;
  ctx.save();
  ctx.translate(x + (C.MINER_W / 2) * scale, y);
  if (s.miner.facing === "west") ctx.scale(-1, 1);
  image(
    ctx,
    s,
    `miner/${state}/frame${String(frame).padStart(2, "0")}.png`,
    (-C.MINER_SPRITE / 2) * scale,
    -(C.MINER_SPRITE - C.MINER_H) * scale,
    C.MINER_SPRITE * scale,
    C.MINER_SPRITE * scale,
  );
  ctx.restore();
}
function shaped(
  ctx: Context,
  s: ReadState,
  c: number,
  r: number,
  kind: "tunnel" | "lava",
  path: string,
) {
  const x = c * C.TILE,
    y = r * C.TILE,
    lip = 8;
  const open = (dc: number, dr: number) =>
    tile(s, c + dc, r + dr).kind === kind;
  const l = open(-1, 0),
    rr = open(1, 0),
    u = (r === 1 && kind === "tunnel") || open(0, -1),
    d = open(0, 1);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(
    x + (l ? 0 : lip),
    y + (u ? 0 : lip),
    C.TILE - (l ? 0 : lip) - (rr ? 0 : lip),
    C.TILE - (u ? 0 : lip) - (d ? 0 : lip),
    [u || l ? 0 : 12, u || rr ? 0 : 12, d || rr ? 0 : 12, d || l ? 0 : 12],
  );
  ctx.clip();
  image(ctx, s, path, x, y, C.TILE, C.TILE);
  ctx.restore();
  // Convex dirt nubs at diagonal solids preserve a rock lip at junctions.
  const corners = [
    [0, 0, -1, -1, l && u],
    [C.TILE, 0, 1, -1, rr && u],
    [0, C.TILE, -1, 1, l && d],
    [C.TILE, C.TILE, 1, 1, rr && d],
  ];
  for (const [cx, cy, dx, dy, both] of corners)
    if (both && tile(s, c + Number(dx), r + Number(dy)).kind !== kind) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x + Number(cx), y + Number(cy), lip, 0, Math.PI * 2);
      ctx.clip();
      image(
        ctx,
        s,
        `tiles/${tile(s, c, r).band ?? "topsoil"}-${(c + r) % C.TILE_VARIANTS}.png`,
        x,
        y,
        C.TILE,
        C.TILE,
      );
      ctx.restore();
    }
}
function drawCell(ctx: Context, s: ReadState, c: number, r: number) {
  const t = tile(s, c, r),
    x = c * C.TILE,
    y = r * C.TILE;
  const base = `tiles/${t.band ?? "topsoil"}-${Math.abs(c * 17 + r * 7) % C.TILE_VARIANTS}.png`;
  if (t.kind === "bedrock") {
    image(ctx, s, "tiles/bedrock.png", x, y, C.TILE, C.TILE);
    return;
  }
  if (t.kind === "core") {
    image(ctx, s, "tiles/bedrock.png", x, y, C.TILE, C.TILE);
    image(ctx, s, "materials/core.png", x, y, C.TILE, C.TILE);
    return;
  }
  image(ctx, s, base, x, y, C.TILE, C.TILE);
  if (t.kind === "tunnel") shaped(ctx, s, c, r, "tunnel", "tiles/tunnel.png");
  if (t.kind === "lava")
    shaped(
      ctx,
      s,
      c,
      r,
      "lava",
      `hazards/lava/frame0${Math.floor(s.elapsedSeconds * 6) % 4}.png`,
    );
  if (t.kind === "stone")
    image(ctx, s, `tiles/stone-${(r + c) % 2}.png`, x, y, C.TILE, C.TILE);
  if (t.ore) image(ctx, s, `ore/${t.ore}.png`, x, y, C.TILE, C.TILE);
  if (t.material)
    image(ctx, s, `materials/${t.material}.png`, x, y, C.TILE, C.TILE);
  if (t.health !== null && t.band && t.health < C.BAND_HEALTH[t.band])
    image(
      ctx,
      s,
      `tiles/crack/frame0${clamp(Math.floor((1 - t.health / C.BAND_HEALTH[t.band]) * C.CRACK_FRAMES), 0, C.CRACK_FRAMES - 1)}.png`,
      x,
      y,
      C.TILE,
      C.TILE,
    );
  ctx.strokeStyle = "#0a161b20";
  ctx.strokeRect(x + 0.5, y + 0.5, C.TILE - 1, C.TILE - 1);
}
function particles(ctx: Context, s: ReadState) {
  // Playback is reconstructed from immutable event age. Rendering never advances
  // the authoritative simulation, and paused frames reproduce the same particles.
  const logical = new Proxy(ctx, {
    get(target, key) {
      if (key === "canvas") return { width: 320, height: 320 };
      const value = Reflect.get(target, key, target);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, key, value) {
      return Reflect.set(target, key, value, target);
    },
  });
  for (const e of s.effects) {
    const margin = e.name === "core-detonation" ? 800 : 180;
    if (
      e.x < s.camX - margin ||
      e.x > s.camX + C.VIEW_W + margin ||
      e.y < s.camY - margin ||
      e.y > s.camY + C.VIEW_H + margin
    )
      continue;
    const system = s.resources.effects[e.name];
    if (!system) continue;
    ctx.save();
    ctx.translate(e.x - 160, e.y - 160);
    if (e.name === "core-detonation") {
      ctx.translate(160, 160);
      ctx.scale(2.5, 2.5);
      ctx.translate(-160, -160);
    }
    ctx.save();
    ctx.globalAlpha = 0;
    const authored = system as ParticleSystem;
    const definition: ParticleSystem = e.tint
      ? {
          ...authored,
          emitters: authored.emitters.map((em) => ({
            ...em,
            particle: {
              ...em.particle,
              colorGradient: [
                { color: e.tint!, at: 0 },
                ...(em.particle?.colorGradient ?? []).filter((c) => c.at > 0),
              ],
            },
          })),
        }
      : authored;
    const player = new ParticleCanvasPlayer(definition, logical, {
      seed: e.seed,
      clear: false,
      pixelRadius: 4,
    });
    ctx.restore();
    // These authored systems have constant particle velocities and no forces or
    // subemitters, so one age-sized step reconstructs their exact live position.
    player.simulator.step(e.age * 1000);
    player.update(0);
    ctx.restore();
  }
}
function world(ctx: Context, s: ReadState) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  ctx.clip();
  image(ctx, s, "surface/sky.png", 0, C.HUD_H, C.VIEW_W, C.VIEW_H);
  const shake =
    s.shake > 0
      ? Math.sin(s.simTime * 93) * Math.max(C.ICON_SIZE / 10, s.shake * 7)
      : 0;
  ctx.translate(
    -s.camX + shake,
    C.HUD_H - s.camY + Math.cos(s.simTime * 77) * s.shake * 5,
  );
  const c0 = Math.max(0, Math.floor(s.camX / C.TILE)),
    c1 = Math.min(C.WORLD_COLS - 1, Math.ceil((s.camX + C.VIEW_W) / C.TILE));
  const r0 = Math.max(1, Math.floor(s.camY / C.TILE)),
    r1 = Math.min(s.coreRow, Math.ceil((s.camY + C.VIEW_H) / C.TILE));
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) drawCell(ctx, s, c, r);
  if (s.camY < C.SURFACE_Y) {
    for (let x = 0; x < C.WORLD_W; x += 160)
      if (Math.floor(x / C.TILE) !== C.CAVE_MOUTH_COL)
        image(ctx, s, "surface/ground.png", x, C.SURFACE_Y - 4, 160, 32);
    for (const b of footprints) {
      image(ctx, s, `surface/${b.id}.png`, b.x, b.y, b.w, b.h);
      if (b.id === "launch-pad") {
        image(
          ctx,
          s,
          `rocket/stage${s.launchTime !== null ? 0 : s.installed}.png`,
          b.x,
          b.y - 142,
          180,
          260,
        );
        if (s.launchTime !== null)
          ctx.drawImage(
            s.resources.images["rocket/stage5.png"],
            60,
            0,
            80,
            240,
            b.x + 60,
            b.y - 142 - s.launchTime * s.launchTime * 110,
            80,
            240,
          );
      }
      text(
        ctx,
        b.id.replace(/-/g, " ").toUpperCase(),
        b.x + b.w / 2,
        b.y - 13,
        12,
        P.muted,
        "400",
        "center",
      );
    }
    image(
      ctx,
      s,
      "surface/cave-mouth.png",
      C.CAVE_MOUTH_COL * C.TILE,
      C.SURFACE_Y - 20,
      80,
      100,
    );
    text(
      ctx,
      "↓  MINE ACCESS",
      C.CAVE_MOUTH_COL * C.TILE + 40,
      C.SURFACE_Y - 39,
      13,
      P.gold,
      "700",
      "center",
    );
  }
  if (s.launchTime === null) miner(ctx, s, s.miner.x, s.miner.y);
  if (s.coreGround) {
    const x = s.coreGround.col * C.TILE,
      y = s.coreGround.row * C.TILE;
    image(ctx, s, "materials/core-sample.png", x, y, 80, 80);
    text(
      ctx,
      `${s.coreTimer?.toFixed(1)}s`,
      x + 40,
      y - 8,
      19,
      P.red,
      "700",
      "center",
    );
  }
  particles(ctx, s);
  ctx.restore();
  // Discreet depth rail and geographical telemetry, kept out of the sightline.
  const band =
    C.BANDS[
      Math.min(
        3,
        Math.floor(
          (Math.max(0, depth(s)) / (s.coreRow * C.METERS_PER_ROW)) * 4,
        ),
      )
    ];
  box(ctx, 22, 80, 188, 48, "#10232bdf");
  text(ctx, `STRATUM 0${C.BANDS.indexOf(band) + 1}`, 36, 99, 10, P.gold);
  text(ctx, band.toUpperCase(), 36, 119, 14, P.text, "700");
  const target = scanner(s);
  if (target.locked) {
    box(ctx, 450, 80, 380, 46, "#102a33ee");
    text(
      ctx,
      `${target.dirY > 0 ? "↓" : "↑"} ${target.dirX > 0 ? "→" : "←"}  ${target.target?.toUpperCase()}   ${target.distanceTiles?.toFixed(1)} TILES`,
      640,
      109,
      16,
      P.teal,
      "700",
      "center",
    );
  }
  if (s.satchel.coreSample) {
    box(ctx, 414, 142, 452, 70, "#382c2a", P.red);
    text(
      ctx,
      `CORE UNSTABLE  ${s.coreTimer?.toFixed(1)}s`,
      640,
      172,
      25,
      P.gold,
      "700",
      "center",
    );
    text(
      ctx,
      "RETURN TO IGNITION  /  J TO JETTISON",
      640,
      195,
      12,
      P.text,
      "400",
      "center",
    );
  }
  const near = nearby(s);
  if (near && !s.panel) {
    box(ctx, 440, 604, 400, 51, "#142b34ed", P.gold);
    text(
      ctx,
      `E  /  ${near.id.replace(/-/g, " ").toUpperCase()}`,
      640,
      635,
      17,
      P.gold,
      "700",
      "center",
    );
  }
  if (!s.panel) {
    text(
      ctx,
      "A D  MOVE     S  DRILL     W / SPACE  THRUST",
      26,
      710,
      13,
      P.muted,
    );
    text(
      ctx,
      `CAMP 04  /  ${s.mode.toUpperCase()}  /  ${s.worldSize.toUpperCase()}`,
      1254,
      710,
      11,
      P.muted,
      "400",
      "right",
    );
  }
}
function gauge(
  ctx: Context,
  s: ReadState,
  name: string,
  x: number,
  value: number,
  max: number,
  color: string,
) {
  image(ctx, s, `icons/${name}.png`, x, 15, C.ICON_SIZE, C.ICON_SIZE);
  text(ctx, name.toUpperCase(), x + 34, 20, 10, P.muted);
  text(ctx, `${Math.ceil(value)} / ${max}`, x + 34, 37, 14, color, "700");
  box(ctx, x + 34, 43, 124, 3, "#2b3c43", "");
  ctx.fillStyle = color;
  ctx.fillRect(x + 34, 43, 124 * clamp(value / max, 0, 1), 3);
}
function hud(ctx: Context, s: ReadState) {
  box(ctx, 0, 0, C.STAGE_W, C.HUD_H, "#10212a", "#34464b");
  gauge(
    ctx,
    s,
    "fuel",
    20,
    s.miner.fuel,
    maxFuel(s),
    s.miner.fuel / maxFuel(s) < C.LOW_FUEL_FRACTION ? P.red : P.gold,
  );
  gauge(
    ctx,
    s,
    "hull",
    208,
    s.miner.hull,
    maxHull(s),
    s.miner.hull / maxHull(s) < C.LOW_HULL_FRACTION ? P.red : P.teal,
  );
  image(ctx, s, "icons/cargo.png", 402, 15, 24, 24);
  text(ctx, "CARGO", 436, 20, 10, P.muted);
  text(
    ctx,
    `${slots(s)}/${C.CARGO_TIERS[s.tiers.cargo - 1]}   ${Math.round(loadKg(s))}kg`,
    436,
    39,
    14,
    slots(s) >= C.CARGO_TIERS[s.tiers.cargo - 1] ? P.red : P.text,
    "700",
  );
  if (loadKg(s) >= jet(s).liftLimitKg)
    text(ctx, C.OVERLOAD, 555, 20, 10, P.red, "700");
  image(ctx, s, "icons/credits.png", 635, 15, 24, 24);
  text(ctx, "CREDITS", 668, 20, 10, P.muted);
  text(ctx, Math.floor(s.credits).toLocaleString(), 668, 39, 15, P.gold, "700");
  image(ctx, s, "icons/depth.png", 779, 15, 24, 24);
  text(ctx, "DEPTH", 811, 20, 10, P.muted);
  text(ctx, `${Math.floor(depth(s))} m`, 811, 39, 15, P.text, "700");
  for (const [i, m] of C.MATERIALS.entries()) {
    ctx.globalAlpha = s.satchel[m] ? 1 : 0.24;
    image(ctx, s, `icons/${m}.png`, 935 + i * 34, 16, 24, 24);
  }
  ctx.globalAlpha = 1;
  for (const c of controls(s).filter((c) =>
    ["inventory", "pause", "mute"].includes(c.id),
  )) {
    box(ctx, c.x, c.y, c.w, c.h, "#1a3039");
    text(ctx, c.label, c.x + c.w / 2, c.y + 23, 13, P.muted, "700", "center");
  }
}
function menuBackdrop(ctx: Context, s: ReadState) {
  image(ctx, s, "surface/sky.png", 0, 0, C.STAGE_W, C.STAGE_H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(640, 0, 640, 720);
  ctx.clip();
  const path = new Set([
    "3,0",
    "3,1",
    "3,2",
    "4,2",
    "5,2",
    "5,3",
    "5,4",
    "5,5",
    "4,5",
    "3,5",
    "2,5",
    "2,6",
    "2,7",
    "2,8",
  ]);
  for (let r = 0; r < 10; r++)
    for (let c = 0; c < 9; c++) {
      const x = 626 + c * 80,
        y = 20 + r * 80;
      image(
        ctx,
        s,
        `tiles/${r < 3 ? "topsoil" : r < 7 ? "rockbed" : "deepstone"}-${(c * 2 + r) % 3}.png`,
        x,
        y,
        80,
        80,
      );
      if (path.has(`${c},${r}`)) {
        ctx.save();
        ctx.beginPath();
        ctx.roundRect(x + 7, y, 66, 80, 12);
        ctx.clip();
        image(ctx, s, "tiles/tunnel.png", x, y, 80, 80);
        ctx.restore();
      } else if ((c * 7 + r * 3) % 9 === 0)
        image(
          ctx,
          s,
          `ore/${["cuprite", "marlite", "ferron", "cobaltine"][(r + c) % 4]}.png`,
          x,
          y,
          80,
          80,
        );
    }
  const glow = ctx.createRadialGradient(1065, 388, 10, 1065, 388, 200);
  glow.addColorStop(0, "#e8bc6550");
  glow.addColorStop(1, "#e8bc6500");
  ctx.fillStyle = glow;
  ctx.fillRect(800, 180, 480, 440);
  miner(ctx, s, 1048, 342, 1.35, "drill-down", s.simTime);
  ctx.restore();
  const gradient = ctx.createLinearGradient(480, 0, 950, 0);
  gradient.addColorStop(0, "#0d1b24");
  gradient.addColorStop(1, "#0d1b2400");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1000, 720);
  ctx.fillStyle = "#0d1b2455";
  ctx.fillRect(640, 0, 640, 720);
  text(ctx, "04 / OUTER RIM PROSPECTING DIVISION", 86, 75, 12, P.muted);
  line(ctx, 86, 93, 548, 93);
  text(ctx, "A SOLO EXTRACTION EXPEDITION", 86, 147, 11, P.gold, "700");
  text(ctx, "DEPTH IS CHEAP.", 1250, 624, 17, P.gold, "700", "right");
  text(ctx, "THE CLIMB IS EVERYTHING.", 1250, 650, 17, P.text, "700", "right");
  text(
    ctx,
    "SECTOR 09  /  SIGNAL LOST",
    1250,
    686,
    10,
    P.muted,
    "400",
    "right",
  );
}
function menus(ctx: Context, s: ReadState) {
  const mine = s.screen === "paused";
  if (mine) {
    ctx.fillStyle = "#08131ee8";
    ctx.fillRect(0, C.HUD_H, C.STAGE_W, C.VIEW_H);
  } else menuBackdrop(ctx, s);
  let heading: string = C.TITLE_TEXT,
    sub = "Beneath a dead world. One way home.";
  if (s.screen === "mode-select") {
    heading = "THE STAKES";
    sub = "Choose what a failed expedition costs.";
  }
  if (s.screen === "size-select") {
    heading = "THE DESCENT";
    sub = "Same rock. A longer way back.";
  }
  if (s.screen === "how-to-play") {
    heading = "FIELD MANUAL";
    sub = "Bring the haul home. Build your escape.";
  }
  if (s.screen === "paused") {
    heading = "HOLD POSITION";
    sub = "The mine can wait.";
  }
  if (s.screen === "victory") {
    heading = "SIGNAL FOUND";
    sub = "You built a way off this rock.";
  }
  if (s.screen === "game-over") {
    heading = "SIGNAL LOST";
    sub =
      s.summary?.deathCause === "fuel-out"
        ? "Life support depleted. The climb was too far."
        : s.summary?.deathCause === "core-detonation"
          ? "The Core Sample destabilized."
          : "Pressure suit integrity lost.";
  }
  text(ctx, heading, 81, 244, heading.length > 12 ? 62 : 82, P.text, "900");
  box(ctx, 86, 265, 42, 4, P.gold, "");
  text(ctx, sub, 86, 305, 16, P.muted);
  for (const [i, item] of menuItems(s).entries()) {
    const r = menuRect(s, i)!;
    const selected = i === s.menuIndex;
    box(
      ctx,
      r.x,
      r.y,
      r.w,
      r.h,
      selected ? "#d8ad65" : "#172b34",
      selected ? "#f3cd86" : "#354b53",
    );
    text(
      ctx,
      item,
      r.x + 22,
      r.y + 33,
      17,
      selected ? "#14232a" : P.text,
      "700",
    );
    text(
      ctx,
      selected ? "↗" : "·",
      r.x + r.w - 24,
      r.y + 33,
      20,
      selected ? "#14232a" : P.muted,
      "700",
      "right",
    );
  }
  if (s.screen === "mode-select") {
    text(ctx, "STANDARD", 580, 372, 13, P.teal, "700");
    text(ctx, "Restore your last Save Pad checkpoint.", 580, 396, 13, P.text);
    text(ctx, "HARDCORE", 580, 447, 13, P.red, "700");
    text(
      ctx,
      "Death deletes your save. No second chances.",
      580,
      471,
      13,
      P.text,
    );
  }
  if (s.screen === "size-select")
    C.WORLD_SIZES.forEach((size, i) => {
      text(
        ctx,
        `${Math.round(C.STANDARD_ROWS * C.WORLD_SIZE_SCALE[size]) * C.METERS_PER_ROW} m TO THE CORE`,
        550,
        377 + i * 68,
        15,
        P.gold,
        "700",
      );
    });
  if (s.screen === "how-to-play") {
    box(ctx, 75, 325, 1130, 255, "#10232bf5");
    const lines = [
      [
        "01  DIG & HAUL",
        "A/D or ←/→ to move. Hold S/↓ to drill.",
        "Cut down or sideways, never up. W/↑/SPACE fires the jetpack.",
        "Sell ore at camp. Buy fuel, repairs, and seven upgrade tracks.",
      ],
      [
        "02  KNOW YOUR LIMIT",
        "Fuel pays for the climb; heavy cargo burns more.",
        "I opens cargo. Drop ore to escape an overload. 1–6 use supplies.",
        "Gas explodes. Lava burns. Upgrade hull and the radiator.",
      ],
      [
        "03  BUILD YOUR ESCAPE",
        "Fabricate five rocket components at the launch pad.",
        "A scanner finds Resonite and Cryenite. The Core Sample lasts 90s.",
        "E activates camp buildings. Save at the pad. ESC pauses.",
      ],
    ];
    lines.forEach((col, i) =>
      col.forEach((str, j) =>
        j === 0
          ? text(ctx, str, 96 + i * 370, 356, 14, P.gold, "700")
          : wrapped(ctx, str, 96 + i * 370, 356 + j * 54, 332, 12),
      ),
    );
    text(
      ctx,
      "STANDARD: restore your last save.  HARDCORE: death deletes it.  Save only at the camp pad.",
      96,
      563,
      11,
      P.muted,
    );
  }
  if (s.summary && (s.screen === "victory" || s.screen === "game-over")) {
    box(ctx, 560, 333, 600, 241, "#132a33ee");
    const rows = [
      [
        "DEEPEST REACH",
        `${Math.floor(s.summary.deepestDepthMeters).toLocaleString()} m`,
      ],
      [
        "CREDITS EARNED",
        `${Math.floor(s.summary.creditsEarned).toLocaleString()} CR`,
      ],
      [
        "EXPEDITION TIME",
        `${Math.floor(s.summary.elapsedSeconds / 60)}m ${Math.floor(s.summary.elapsedSeconds % 60)}s`,
      ],
      ["ROCKET ASSEMBLY", `${s.summary.componentsInstalled} / 5`],
      ["DEATH RULE", s.summary.mode.toUpperCase()],
    ];
    rows.forEach(([a, b], i) => {
      text(ctx, a, 585, 368 + i * 40, 12, P.muted);
      text(ctx, b, 1132, 368 + i * 40, 15, P.gold, "700", "right");
    });
  }
  text(ctx, "↑ ↓  SELECT     ENTER  CONFIRM", 86, 680, 11, P.muted);
  text(ctx, "ORIGINAL SURVEY  /  DEEPCORE", 86, 704, 9, "#5e777e");
}
function supplyIcon(
  ctx: Context,
  id: string,
  x: number,
  y: number,
  enabled: boolean,
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = enabled ? 1 : 0.35;
  if (id === "dynamite" || id === "plastic-explosives") {
    for (let i = 0; i < 3; i++) box(ctx, 2 + i * 6, 4, 5, 17, P.red, "");
    box(ctx, 0, 10, 22, 3, P.gold, "");
    line(ctx, 15, 3, 20, 0, P.gold);
  } else if (id === "quantum-teleporter" || id === "matter-transmitter") {
    ctx.strokeStyle = P.teal;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(12, 12, 9, 5, Math.PI / 3, 0, Math.PI * 2);
    ctx.ellipse(12, 12, 9, 5, -Math.PI / 3, 0, Math.PI * 2);
    ctx.stroke();
    box(ctx, 10, 10, 4, 4, P.gold, "");
  } else if (id === "nanobots") {
    box(ctx, 9, 2, 6, 20, P.teal, "");
    box(ctx, 2, 9, 20, 6, P.teal, "");
  } else {
    box(ctx, 4, 6, 16, 17, P.gold, "");
    box(ctx, 8, 2, 8, 5, P.gold, "");
    box(ctx, 8, 11, 8, 7, P.panel, "");
  }
  ctx.restore();
}
function panel(ctx: Context, s: ReadState) {
  if (!s.panel) return;
  ctx.fillStyle = "#07121bc4";
  ctx.fillRect(0, C.HUD_H, C.STAGE_W, C.VIEW_H);
  const b = panelBox;
  box(ctx, b.x, b.y, b.w, b.h, "#132831", "#5b7071");
  box(ctx, b.x, b.y, 5, b.h, P.gold, "");
  text(ctx, "CAMP SERVICES  /  04", 188, 126, 10, P.gold, "700");
  text(
    ctx,
    s.panel.replace(/-/g, " ").toUpperCase(),
    188,
    164,
    28,
    P.text,
    "700",
  );
  line(ctx, 188, 182, 1092, 182);
  if (s.panel === "fuel-depot") {
    text(
      ctx,
      `FUEL  ${Math.ceil(s.miner.fuel)} / ${maxFuel(s)}`,
      216,
      244,
      23,
      P.gold,
      "700",
    );
    text(
      ctx,
      `HULL  ${Math.ceil(s.miner.hull)} / ${maxHull(s)}`,
      216,
      413,
      23,
      P.teal,
      "700",
    );
    image(ctx, s, "surface/fuel-depot.png", 780, 240, 270, 177);
    text(ctx, "NO FREE RIDES.", 915, 480, 18, P.gold, "700", "center");
    text(
      ctx,
      "Every climb has a price.",
      915,
      509,
      12,
      P.muted,
      "400",
      "center",
    );
  }
  if (s.panel === "ore-market") {
    let y = 222;
    for (const o of C.MINERALS)
      if (s.cargo[o.id]) {
        image(ctx, s, `ore/${o.id}.png`, 214, y - 23, 28, 28);
        text(ctx, `${o.name}   ×${s.cargo[o.id]}`, 258, y, 15);
        text(
          ctx,
          `${o.value * (s.cargo[o.id] ?? 0)} CR`,
          720,
          y,
          15,
          P.gold,
          "700",
          "right",
        );
        y += 26;
      }
    if (!slots(s))
      text(
        ctx,
        "Your next fortune is still underground.",
        220,
        262,
        15,
        P.muted,
      );
    text(ctx, "HAUL VALUE", 820, 238, 12, P.muted);
    text(
      ctx,
      `${cargoValue(s).toLocaleString()} CR`,
      820,
      283,
      29,
      P.gold,
      "700",
    );
    text(ctx, "Materials stay in your satchel.", 820, 319, 11, P.muted);
  }
  if (s.panel === "inventory") {
    text(
      ctx,
      cargoLine(s),
      210,
      214,
      14,
      loadKg(s) >= jet(s).liftLimitKg ? P.red : P.gold,
      "700",
    );
    text(ctx, "ORE  /  PRESS A ROW TO DROP ONE", 210, 237, 10, P.muted);
    text(ctx, "FIELD SUPPLIES", 646, 222, 12, P.gold, "700");
    if (!slots(s)) text(ctx, "Cargo bay empty.", 210, 275, 14, P.muted);
    text(
      ctx,
      `RESONITE ${s.satchel.resonite}   CRYENITE ${s.satchel.cryenite}`,
      646,
      548,
      13,
      P.teal,
    );
    if (loadKg(s) >= jet(s).liftLimitKg)
      text(
        ctx,
        `${C.OVERLOAD}  /  SHED WEIGHT TO CLIMB`,
        210,
        620,
        12,
        P.red,
        "700",
      );
  }
  if (s.panel === "launch-pad") {
    image(ctx, s, `rocket/stage${s.installed}.png`, 250, 250, 225, 325);
    C.ROCKET_COMPONENTS.forEach((c, i) => {
      const done = i < s.installed;
      text(
        ctx,
        `${done ? "✓" : i + 1}  ${c.name.toUpperCase()}`,
        600,
        234 + i * 64,
        17,
        done ? P.teal : P.text,
        "700",
      );
      text(
        ctx,
        `${c.credits.toLocaleString()} CR${c.material ? " + " + c.material.toUpperCase() : ""}`,
        633,
        257 + i * 64,
        12,
        P.muted,
      );
    });
  }
  const activeControls = controls(s).filter(
    (c) =>
      !["inventory", "pause", "mute", "close", "dismiss-notice"].includes(
        c.id,
      ) && c.enabled,
  );
  const focused =
    activeControls[s.panelFocus % Math.max(1, activeControls.length)];
  for (const c of controls(s).filter(
    (c) => !["inventory", "pause", "mute", "dismiss-notice"].includes(c.id),
  )) {
    box(
      ctx,
      c.x,
      c.y,
      c.w,
      c.h,
      focused?.id === c.id && focused.subject === c.subject
        ? "#2e4b50"
        : c.enabled
          ? "#203d46"
          : "#1a2e36",
      focused?.id === c.id && focused.subject === c.subject
        ? P.gold
        : c.enabled
          ? "#617b77"
          : "#2b4149",
    );
    const supply = c.id === "buy-item" || c.id === "use-item";
    if (supply)
      supplyIcon(ctx, c.subject!, c.x + 12, c.y + c.h / 2 - 12, c.enabled);
    text(
      ctx,
      c.label,
      c.x + (supply ? 46 : 14),
      c.y + c.h / 2 + 5,
      c.h < 30 ? 11 : 14,
      c.enabled ? P.text : "#526c74",
      "700",
    );
    if (c.detail)
      text(
        ctx,
        c.detail,
        c.x + c.w - 14,
        c.y + c.h / 2 + 5,
        c.h < 30 ? 11 : 12,
        c.enabled ? P.gold : "#526c74",
        "400",
        "right",
      );
  }
  text(
    ctx,
    `${Math.floor(s.credits).toLocaleString()} CR AVAILABLE`,
    1090,
    648,
    12,
    P.gold,
    "700",
    "right",
  );
}
export function render(s: ReadState, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (["in-mine", "paused"].includes(s.screen)) {
    world(ctx, s);
    hud(ctx, s);
    if (s.screen === "in-mine") panel(ctx, s);
  }
  if (s.screen !== "in-mine") menus(ctx, s);
  if (s.screen === "in-mine" && s.notice && s.notice.age >= C.NOTICE_DELAY) {
    const gas = s.notice.hazard === "gas";
    box(ctx, 300, 574, 680, 112, "#263238f5", P.red);
    text(
      ctx,
      gas
        ? "VOLATILE GAS  /  WATCH THE ROCK BREATHE"
        : "THERMAL DAMAGE  /  MOLTEN ROCK",
      322,
      604,
      17,
      P.gold,
      "700",
    );
    text(
      ctx,
      gas
        ? "Gas cannot be shielded. Upgrade your hull before going deeper."
        : "A radiator reduces heat. Plan a route around lava pools.",
      322,
      631,
      13,
      P.text,
    );
    text(ctx, "Keep moving. Click to dismiss.", 322, 660, 11, P.muted);
  }
  if (
    s.noteTime > 0 &&
    s.screen === "in-mine" &&
    !(s.notice && s.notice.age >= C.NOTICE_DELAY)
  ) {
    const y = s.panel ? 674 : 655;
    box(ctx, 340, y, 600, 34, "#142d36ee");
    text(ctx, s.note, 640, y + 23, 13, P.gold, "700", "center");
  }
}
