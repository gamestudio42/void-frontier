<p align="center">
  <img src="apps/game/public/favicon.svg" width="88" alt="Void Frontier emblem: a grey hull with an amber outline and a blue engine plume">
</p>

<h1 align="center">Void Frontier</h1>

<p align="center"><strong>No friction. No brakes you didn't fire yourself.</strong></p>

<p align="center">
  <a href="https://gamestudio42.github.io/void-frontier/"><img src="https://img.shields.io/badge/Play_in_browser-ffb347?style=for-the-badge&labelColor=05070b&color=ffb347" alt="Play Void Frontier"></a>
  <a href="https://github.com/gamestudio42/void-frontier/actions/workflows/pages.yml"><img src="https://img.shields.io/github/actions/workflow/status/gamestudio42/void-frontier/pages.yml?branch=main&style=for-the-badge&labelColor=05070b&label=Pages" alt="GitHub Pages deployment status"></a>
  <a href="https://github.com/gamestudio42"><img src="https://img.shields.io/badge/Game_Studio_42-05070b?style=for-the-badge&labelColor=05070b&color=6fd3ff" alt="Game Studio 42"></a>
</p>

<p align="center">
  A Newtonian space action RPG for the browser. Fly a small working ship around Outpost Alpha,
  a frontier station on the edge of an asteroid belt, where every change of speed or direction
  comes from a thruster you fired and every rock is solid. Mining, trading, contracts and
  pirates are on the way.
</p>

<p align="center">
  <a href="https://gamestudio42.github.io/void-frontier/">
    <img src="docs/screenshots/field.jpg" alt="A scout ship burns through an asteroid field past a banded gas giant, with the compass, hull, radar and a collision warning on the HUD" width="920">
  </a>
</p>

## Fly it

1. **Thrust and coast.** `W` fires the main engine. Let go and the ship keeps its speed forever. `S` fires the reverse thrusters, `A` and `D` the lateral ones.
2. **Point anywhere.** The nose follows the mouse (toggle with `V`, or turn with `Q` and `E`). Turning never changes where you are going: the blue line is your nose, the amber line is your path.
3. **Stop on purpose.** Hold `Space` to fire every thruster against your motion. The red ring shows where you would stop.
4. **Mine.** Press `R` to scan nearby rocks, then cut ore with the mining laser (middle mouse or `X`). The tractor pulls the chunks into your hold, and every tonne you carry makes the ship slower to accelerate and turn.
5. **Ask for help.** `C` switches on flight assist, which cancels drift and spin for you, using the same thrusters and the same fuel.
6. **Fight.** Pirates patrol the sector. Left mouse fires the autocannons, right mouse the laser, `Tab` picks a target. Burn shields with the laser, break the hull with the guns, and lead your shots: the guns swivel onto the yellow marker when it is close to your nose.
7. **Trade and upgrade.** Fly back into the station's bay slowly and lined up, press `F` to dock, sell your ore and salvage, repair, refuel and buy upgrades. Prices follow the station's stock.
8. **Mind the rocks.** Asteroids and the station are solid. Bump them gently and you bounce; hit them fast and the hull gives way. The radar, the nearest-object readout and the collision warning help you thread the field. `R` relaunches a lost ship.

<p align="center">
  <img src="docs/screenshots/combat.jpg" alt="The scout burns a pirate raider's shield with its laser while autocannon tracers close in; the target panel and lead marker are on the HUD" width="920">
</p>

<p align="center">
  <img src="docs/screenshots/mining.jpg" alt="The scout cuts a copper-rich rock with its amber mining laser while scanner tags label nearby rocks and the hold fills on the HUD" width="920">
</p>

<p align="center">
  <img src="docs/screenshots/market.jpg" alt="Docked at Outpost Alpha: the market lists ores, salvage and machine parts with stock, prices and buy and sell buttons" width="920">
</p>

<p align="center">
  <img src="docs/screenshots/station.jpg" alt="The scout approaches Outpost Alpha's docking bay, with its habitat ring, trusses and green approach lights" width="920">
</p>

The game opens in Portuguese for Portuguese-language browsers and in English otherwise; switch on the controls panel (`H`).

## Status

**Milestone 5 of 7: station and economy.** The core loop is closed: start docked, undock, mine or fight, dock again with a skill-based approach, sell at prices that follow the station's stock, repair, refuel and fit four upgrades. Earlier milestones built the flight model, Outpost Alpha, combat and mining. Contracts and a polish pass follow; see the [roadmap](docs/ROADMAP.md).

## Develop

With Node.js 22 and pnpm 10:

```sh
pnpm install
pnpm dev      # http://localhost:5173
pnpm check    # typecheck, lint and unit tests
pnpm e2e      # Playwright flight tests
pnpm build    # static build in apps/game/dist
```

The simulation is pure, deterministic TypeScript in `packages/simulation`, separate from the three.js renderer and the React HUD. Read [AGENTS.md](AGENTS.md), the [design](docs/GDD.md) and the [architecture](docs/ARCHITECTURE.md) before contributing.

## License

Code: [AGPL-3.0-or-later](LICENSE). Documentation: CC-BY-4.0. All current visuals (ships, station, asteroids, nebula, textures) are generated by the code; see [docs/assets.md](docs/assets.md).

Void Frontier is an original game. Its flight model is inspired by the Newtonian space-sim genre; it uses no names, art or code from other games.
