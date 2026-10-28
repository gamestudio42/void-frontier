# Roadmap

The plan follows section 19 of the specification. Each milestone ends with a build that runs in the browser and automated tests for its acceptance criteria.

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Foundation + flight physics | Done |
| 2 | Environment: asteroid field, station, collisions | Done |
| 3 | Combat: autocannon, laser, predictive aim, first pirate AI | Done |
| 4 | Mining: scanner, mining laser, cargo, variable mass from ore | Done |
| 5 | Station and economy: docking, market, repair, refuel, upgrades | Done |
| 6 | Missions: delivery, mining and bounty contracts, reputation | Next |
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

## Milestone 4: mining (done)

- [x] Resources as data (iron, copper, titanium ore and salvage) with mass, volume, price and colour
- [x] Ore per rock from its size and type; rocks shrink as they are mined, small ones break apart, large ones leave a husk
- [x] Mining laser: full rate inside its optimal range, falling to 25% at maximum range; ejects ore chunks from the cut
- [x] Tractor pulls chunks into the hold; the hold is limited by mass and volume and its mass feeds the flight model
- [x] Scanner pulse (R) reveals composition and ore left for 30 s; tags on screen and colours on the radar
- [x] Jettison (K twice) drops the hold behind the ship
- [x] Destroyed pirates drop salvage
- [x] Effects: amber cutting beam with sparks and dust, glowing chunks, tractor lines, scanner wave, rock break-up
- [x] HUD: hold bar and contents, mining readout, scanner status, pickup feed, hold-full warning

Known limits: ore cannot be sold until the station economy (next); no refining.

## Milestone 5: station and economy (done)

- [x] Docking as a piloting skill: within 12 m of the bay centre, under 3 m/s relative speed, nose within 15° of the bay axis, no hostiles within 450 m; refusals say why
- [x] Approach guide: corridor and target ring in the world, a live checklist on the HUD
- [x] Docked ships are held in the bay: no motion, no weapons, no damage
- [x] The game starts docked at Outpost Alpha with 800 credits
- [x] Market with buy and sell prices from stock (scarcity raises prices, a big sale lowers them unit by unit), drifting back to base stock over time
- [x] Machine parts as the first trade good (bulky: volume matters)
- [x] Repair and refuel, spending what the player can afford
- [x] Four upgrades: engine tuning, reinforced hull, cargo frame, shield capacitor; each adds mass
- [x] Insurance on loss: relaunch at the station with upgrades and 90% of credits; the hold is lost
- [x] Station panel (market, services, upgrades), credits on the HUD

Known limits: one station, so trade routes wait for more sectors; no saves until the polish milestone.

## Milestone 6: missions (next)

Contract board at the station with delivery, mining and bounty contracts, rewards, history and basic reputation.
