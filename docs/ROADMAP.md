# Roadmap

The plan follows section 19 of the specification. Each milestone ends with a build that runs in the browser and automated tests for its acceptance criteria.

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Foundation + flight physics | Done |
| 2 | Environment: asteroid field, station, collisions | Done |
| 3 | Combat: autocannon, laser, predictive aim, first pirate AI | Done |
| 4 | Mining: scanner, mining laser, cargo, variable mass from ore | Next |
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

## Milestone 3: combat (done)

- [x] Weapons as data: autocannon (projectile) and laser (beam), with gimbal, heat, overheat lock-out and reactor energy
- [x] Rounds inherit the ship's velocity and are tested with a swept ray, so they never skip a target; asteroids and the station block fire
- [x] Predictive aim: guns swivel onto the target's lead point inside their gimbal; the HUD draws the lead marker
- [x] Defence layers: shield (recharges after a delay), armour (stops a fraction), hull; lasers are strong against shields, cannons against hulls
- [x] Pirate interceptor (Jackal) with its own livery and silhouette
- [x] Pirate AI: patrol, engage (close to range, match velocity, circle, fire with line-of-sight check), retreat when hurt, obstacle avoidance; flies only through ShipCommands
- [x] Encounters: two patrol groups in Outpost Alpha that respawn after being destroyed
- [x] Effects: tracers, laser beams, shield bubbles that flare where they are hit, muzzle flashes, hull sparks
- [x] HUD: target panel, brackets, lead marker, off-screen arrow, hit marker, shield, energy, weapon heat, kills; radar contacts; camera frames the target in a fight

Known limits: no subsystem damage yet (planned for 0.3), no missiles, no loot or bounty payout until the economy milestone, no audio.

## Milestone 4: mining (next)

Scanner, mining laser, ore extraction from the three rock types, cargo with mass and volume feeding the flight model, and collectable ore.
