# Roadmap

The plan follows section 19 of the specification. Each milestone ends with a build that runs in the browser and automated tests for its acceptance criteria.

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Foundation + flight physics | Done |
| 2 | Environment: asteroid field, station, collisions | Done |
| 3 | Combat: autocannon, laser, predictive aim, first pirate AI | Next |
| 4 | Mining: scanner, mining laser, cargo, variable mass from ore | Planned |
| 5 | Station and economy: docking, market, repair, refuel, upgrades | Planned |
| 6 | Missions: delivery, mining and bounty contracts, reputation | Planned |
| 7 | Polish and release: menus, settings, audio, saves, tutorial | Planned |

Milestone 1 merges phases 1 and 2 of the specification, as its "First Milestone" brief asks.

## Milestone 1: foundation and flight (done)

- [x] pnpm monorepo, TypeScript strict, ESLint, Vitest, Playwright
- [x] Vite + React app, three.js scene, published on GitHub Pages
- [x] Fixed 60 Hz simulation with interpolation and a drop policy
- [x] Entity store and ordered systems
- [x] Keyboard and mouse input, mouse steering
- [x] Main, reverse, lateral and rotation thrusters; boost
- [x] Newtonian and assisted flight; brake
- [x] Fuel and variable mass (cargo and fuel)
- [x] Navigation HUD: speed, heading, course, drift, turn rate, stopping distance, fuel, mass, thrusters, mode
- [x] Camera follow with smoothing, zoom and look-ahead
- [x] Debug overlay (FPS, steps per frame, dropped time, draw calls)
- [x] English and Brazilian Portuguese interface

Known limits at the time: no collisions, no audio, no saves.

## Milestone 2: environment (done)

- [x] Outpost Alpha sector: station, three asteroid fields, beacons, clear zones around the station and spawn
- [x] Three asteroid types (ferrous, cupric, titanic) with density, look and a resource id for mining later
- [x] Deterministic field generation from the sector seed, power-law rock sizes, no overlaps
- [x] Data-driven modular station (core, habitat ring, trusses, solar arrays, tanks, docking bay); the same layout feeds visuals and colliders
- [x] Collision detection: grid broad phase, circle narrow phase, swept test against tunnelling
- [x] Collision response: restitution, friction, spin from off-centre hits; momentum conserved
- [x] Hull damage from impact energy above a safe speed; destruction, wreck and relaunch
- [x] Procedural rocks (noise, craters, mineral veins) drawn with instancing and two levels of detail
- [x] Nebula sky, dynamic shadows, engine and RCS particles, impact sparks, explosions, camera shake
- [x] HUD: hull, radar, nearest object, collision warning, damage flash, destroyed screen
- [x] Adaptive graphics quality (high, medium, low), `G` to choose, `?quality=` URL override

Known limits: docking is visual only until milestone 5; asteroids cannot be broken or mined yet; no audio; frame rate on low-end GPUs not yet measured on real hardware (the quality fallback covers it).

## Milestone 3: combat (next)

Autocannon and laser, projectiles that inherit ship velocity, predictive aim marker, shields, armour and hull, and a pirate scout whose AI flies with the same thrusters and limits as the player.
