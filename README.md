# Deepcore

**Depth is cheap. The climb is everything.**

A browser-based, single-player dig-and-build expedition. Mine a procedurally generated planet, haul valuable ore back to camp on a weight-sensitive jetpack, and fabricate the five components of an escape rocket. Four geological strata hide thirteen minerals, two unique crystal nodes, gas pockets, lava pools, and an unstable Core Sample.

Choose **Standard** or **Hardcore**, then **Quick** (1,250 m), **Standard** (2,500 m), or **Marathon** (5,000 m). Upgrade seven equipment tracks, buy six field supplies, and manage the fuel that pays for every trip home. The Core Sample's ninety-second countdown continues even in a shop or the inventory.

## Run locally

Use Node.js 22.12 or newer and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. Everything runs in the browser; no account, backend, or external service is needed.

## Production build

```sh
npm ci
npm run build
npm run preview
```

The complete static site is emitted to **`dist/`**, including `dist/index.html`. Serve that directory with a static HTTP server. The bundled scripts and engine-loaded assets use relative URLs, so the site also works beneath a nested hosting path.

All artwork, animation frames, particle systems, music, and sound effects are already committed under **`assets/`**. The build only bundles these files; it never runs an asset-generation executable or downloads game content.

## Controls

| Input | Action |
| --- | --- |
| A / D or Left / Right | Walk or drift; drill sideways when grounded against a wall |
| S or Down | Drill downward while grounded |
| W, Up, or Space | Hold to fire the jetpack |
| E or Enter | Activate a camp building; confirm a menu or focused panel control |
| I | Open or close cargo and supplies |
| Escape or P | Close a panel; pause or resume |
| M | Toggle audio |
| J | Jettison a carried Core Sample |
| 1 | Dynamite |
| 2 | Plastic Explosives |
| 3 | Quantum Teleporter |
| 4 | Matter Transmitter |
| 5 | Regenerative Nanobots |
| 6 | Emergency Fuel |
| Up / Down in menus or panels | Select an entry or an enabled control |
| Backtick | Toggle the engine's read-only diagnostic overlay |

Menus, shops, inventory rows, and HUD controls also accept mouse, pen, and touch. Movement uses the keyboard. Audio unlocks on the first interaction.

### Your first haul

Hold S to open a shaft, or walk east to the marked mine access. Follow mineral seams sideways, and watch both fuel and cargo weight. Fly back through your own tunnels before the tank runs dry. Sell at the Ore Market, then buy fuel and hull repair at the Fuel Depot. Nothing refills automatically.

The cargo bay limits slots; the jetpack limits weight. If the load cannot lift, open the inventory and drop individual ore units. Exotic materials occupy a separate, weightless satchel.

Save explicitly at the **Save Pad**. There is one local browser slot and no autosave. Standard deaths allow restoring that save; Hardcore deaths delete it. A live Core Sample prevents saving, and launching consumes the save. If browser storage is unavailable, the expedition remains playable without saving.

## Verification

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The Vitest suite drives the actual Simple 2D engine over a native canvas and scripted clocks. It tests generation, immutable transitions, action and pointer input, drilling cadence, load-dependent flight, camera lead, fuel, hazards, economy, supplies, scanner behavior, persistence, death, and rocket launch.

## Source map

- `src/game.ts`: engine registration, asset loading, input, screens, and frame integration.
- `src/model.ts`: authoritative state, immutable transition helpers, and derived readings.
- `src/world.ts`: geological generation and depth-preserving grid resize.
- `src/simulation.ts`: render-free 120 Hz simulation, integrated from engine delta time.
- `src/transactions.ts`: purchases, supplies, hazards, save/restore, and expedition endings.
- `src/interface.ts`: shared visible controls and their exact hit regions.
- `src/render.ts`: camera-space world drawing and the interface; live playback of authored particle systems.
- `src/debug.ts`: the complete versioned automation surface, returned through `engine.debug`.
- `assets/author.mjs` and `assets/sound-effects.mjs`: original one-time asset-authoring recipes using `draw`, `draw-sheet`, `particle-2d`, `sfx-synth`, `sfx-sample`, and `music`. These are independent of the build.
- `showcase/`: player-facing description, captured screenshots, and an engine-recorded live-play replay. `assets/capture.mjs` recaptures these against the development server using project-local Playwright.

The engine owns the frame loop, input, audio, loading, canvas fitting, diagnostics, and draw recorder. Simulation and debug poses return new state values; rendering reconstructs effects from immutable event ages and does not advance gameplay.
