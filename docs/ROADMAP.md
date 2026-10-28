# Roadmap

The plan follows section 19 of the specification. Each milestone ends with a build that runs in the browser and automated tests for its acceptance criteria.

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Foundation + flight physics | Done |
| 2 | Environment: asteroid field, station, collisions | Next |
| 3 | Combat: autocannon, laser, predictive aim, first pirate AI | Planned |
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

Known limits: no collisions yet (ships pass through beacons), no audio, no saves, performance not yet measured on low-end hardware.

## Milestone 2: environment (next)

Asteroid field with three asteroid types, a station, collision detection and response with damage proportional to impact, improved camera. Decide in an ADR whether collisions use Rapier 2D queries or a small custom broad phase; either way the custom integrator stays the single source of motion.
