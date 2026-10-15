import * as C from "./constants";
import {
  cargoValue,
  footprints,
  jet,
  loadKg,
  maxFuel,
  maxHull,
  slots,
  type ReadState,
} from "./model";
import { canFabricate, canUseItem } from "./transactions";
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Control extends Rect {
  id: string;
  subject: string | null;
  label: string;
  enabled: boolean;
  detail?: string;
}
export function menuItems(s: ReadState): readonly string[] {
  switch (s.screen) {
    case "title":
      return s.hasSave ? C.TITLE_ITEMS : C.TITLE_ITEMS.slice(1);
    case "mode-select":
      return C.MODE_ITEMS;
    case "size-select":
      return C.SIZE_ITEMS;
    case "how-to-play":
      return C.HOW_TO_PLAY_ITEMS;
    case "paused":
      return C.PAUSE_ITEMS;
    case "victory":
      return C.VICTORY_ITEMS;
    case "game-over":
      return s.mode === "standard" && s.hasSave
        ? C.GAME_OVER_SAVE_ITEMS
        : C.GAME_OVER_ITEMS;
    default:
      return [];
  }
}
export function menuRect(s: ReadState, index: number): Rect | null {
  if (index < 0 || index >= menuItems(s).length) return null;
  return {
    x: 86,
    y:
      (s.screen === "how-to-play"
        ? 602
        : s.screen === "victory" || s.screen === "game-over"
          ? 482
          : 343) +
      index * 68,
    w: 420,
    h: 54,
  };
}
export const contains = (r: Rect, x: number, y: number) =>
  x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
export const panelBox = { x: 156, y: 94, w: 968, h: 572 };
export function controls(s: ReadState): Control[] {
  if (s.screen !== "in-mine") return [];
  const list: Control[] = [];
  const add = (
    id: string,
    subject: string | null,
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    enabled = true,
    detail?: string,
  ) => list.push({ id, subject, label, x, y, w, h, enabled, detail });
  add("inventory", null, "I  CARGO", 1020, 10, 110, 36);
  add("pause", null, "Ⅱ", 1140, 10, 48, 36);
  add("mute", null, s.muted ? "♪ OFF" : "♪", 1198, 10, 64, 36);
  if (s.notice && s.notice.age >= C.NOTICE_DELAY)
    add("dismiss-notice", null, "", 300, 574, 680, 112);
  const p = s.panel;
  if (!p) return list;
  add("close", null, "ESC  ×", 1010, 112, 88, 30);
  if (p === "fuel-depot") {
    add(
      "buy-fuel",
      null,
      `+${C.FUEL_BUY_INCREMENT} FUEL`,
      216,
      292,
      240,
      52,
      s.miner.fuel < maxFuel(s) &&
        s.credits >=
          Math.min(C.FUEL_BUY_INCREMENT, maxFuel(s) - s.miner.fuel) *
            C.FUEL_PRICE,
      `${C.FUEL_PRICE} CR / unit`,
    );
    add(
      "fill-fuel",
      null,
      "FILL TANK",
      478,
      292,
      240,
      52,
      s.miner.fuel < maxFuel(s) && s.credits > 0,
    );
    add(
      "buy-repair",
      null,
      `+${C.REPAIR_BUY_INCREMENT} HULL`,
      216,
      461,
      240,
      52,
      s.miner.hull < maxHull(s) &&
        s.credits >=
          Math.min(C.REPAIR_BUY_INCREMENT, maxHull(s) - s.miner.hull) *
            C.REPAIR_PRICE,
      `${C.REPAIR_PRICE} CR / point`,
    );
    add(
      "repair-full",
      null,
      "FULL REPAIR",
      478,
      461,
      240,
      52,
      s.miner.hull < maxHull(s) && s.credits > 0,
    );
  } else if (p === "ore-market")
    add(
      "sell",
      null,
      C.SELL,
      810,
      560,
      240,
      52,
      slots(s) > 0,
      `${cargoValue(s).toLocaleString()} CR`,
    );
  else if (p === "upgrade-shop")
    C.TRACKS.forEach((t, i) => {
      const tier = s.tiers[t],
        price = C.UPGRADE_PRICES[tier - 1];
      add(
        "buy-upgrade",
        t,
        t.toUpperCase(),
        210,
        196 + i * 56,
        856,
        46,
        tier < C.MAX_TIER[t] && s.credits >= price,
        `T${tier} → ${tier < C.MAX_TIER[t] ? `T${tier + 1}   ${upgradeEffect(t, tier + 1)}   /   ${price} CR` : "MAX"}`,
      );
    });
  else if (p === "supply-depot")
    C.ITEMS.forEach((it, i) =>
      add(
        "buy-item",
        it.id,
        `${i + 1}  ${it.name}`,
        210,
        204 + i * 65,
        856,
        52,
        s.credits >= it.price,
        `${s.items[it.id]} held   /   ${it.price.toLocaleString()} CR`,
      ),
    );
  else if (p === "launch-pad")
    add(
      s.installed === 5 ? "launch" : "fabricate",
      null,
      s.installed === 5 ? C.LAUNCH : C.FABRICATE,
      786,
      574,
      270,
      50,
      s.installed === 5 || canFabricate(s),
    );
  else if (p === "inventory") {
    const ores = C.MINERALS.filter((o) => s.cargo[o.id]);
    ores.forEach((o, i) =>
      add(
        "drop-ore",
        o.id,
        `−  ${o.name}`,
        210,
        245 + i * 25,
        390,
        23,
        true,
        `${s.cargo[o.id]} × ${o.weightKg} kg`,
      ),
    );
    C.ITEMS.forEach((it, i) => {
      if (s.items[it.id])
        add(
          "use-item",
          it.id,
          `${C.USE}  ${i + 1}  ${it.name}`,
          646,
          250 + i * 44,
          418,
          36,
          canUseItem(s, it.id),
          `×${s.items[it.id]}`,
        );
    });
    if (s.satchel.coreSample)
      add("jettison", null, C.JETTISON, 646, 570, 418, 42);
  }
  return list;
}
export function upgradeEffect(t: C.TrackName, tier: number) {
  const i = tier - 1;
  switch (t) {
    case "fuel":
      return `${C.FUEL_TIERS[i]} charge`;
    case "hull":
      return `${C.HULL_TIERS[i]} hull`;
    case "cargo":
      return `${C.CARGO_TIERS[i]} slots`;
    case "drill":
      return `power ${tier}`;
    case "jetpack":
      return `${C.JETPACK_TIERS[i].liftLimitKg} kg lift`;
    case "radiator":
      return `${C.RADIATOR_TIERS[i] * 100}% heat shield`;
    case "scanner":
      return `${C.SCANNER_TIERS[i] ?? 0} tiles`;
  }
}
export function nearby(s: ReadState) {
  if (s.miner.y + C.MINER_H > C.SURFACE_Y + 1) return null;
  const x = s.miner.x + C.MINER_W / 2;
  return footprints.find((b) => x >= b.x - 20 && x <= b.x + b.w + 20) ?? null;
}
export function cargoLine(s: ReadState) {
  return `${slots(s)} / ${C.CARGO_TIERS[s.tiers.cargo - 1]} SLOTS    ${Math.round(loadKg(s))} / ${jet(s).liftLimitKg} KG`;
}
