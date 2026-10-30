# Roadmap

The plan follows section 19 of the specification. Each milestone ends with a build that runs in the browser and automated tests for its acceptance criteria.

| # | Milestone | Status |
| --- | --- | --- |
| 1 | Foundation + flight physics | Done |
| 2 | Environment: asteroid field, station, collisions | Done |
| 3 | Combat: autocannon, laser, predictive aim, first pirate AI | Done |
| 4 | Mining: scanner, mining laser, cargo, variable mass from ore | Done |
| 5 | Station and economy: docking, market, repair, refuel, upgrades | Done |
| 6 | Missions: delivery, mining and bounty contracts, reputation | Done |
| 7 | Polish and release: menus, settings, audio, saves, tutorial | Done |

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

## Milestone 6: missions (done)

- [x] Contract rules as data (`contracts.json`): slots, limits, rewards, deadlines, reputation, penalties
- [x] Deterministic contract board at the station, refreshed over time
- [x] Delivery: sealed crates loaded on acceptance (heavy, unsellable), completed by stopping within 60 m of a relay beacon; Gate relay sits in pirate space and pays more
- [x] Mining: bring a given ore to the station and hand it in
- [x] Bounty: destroy pirates after accepting, then report back
- [x] Deadlines, abandoning, failure; history of the last contracts
- [x] Reputation from -100 to +100: completions raise it, failures lower it; it raises payouts and unlocks elite contracts
- [x] Losing the ship fails deliveries but keeps other contracts, their time and their progress
- [x] Contracts tab, in-flight tracker, waypoints with edge arrows, radar markers, completion notices

Known limits: one faction and one station; no escort or salvage contracts yet.

## Milestone 7: polish and release (done)

- [x] Main menu over the live scene: continue, new game (with or without the guided first flight), load, settings, controls
- [x] Pause menu (Esc): resume, save, load, settings, controls, main menu
- [x] Saves: versioned, deterministic snapshot of the player, economy, rocks, loose ore and contracts; FNV-1a checksum; migration chain; IndexedDB with a localStorage fallback; autosave on docking and every two minutes; three manual slots; export and import as JSON files
- [x] Settings: graphics quality (automatic or fixed), master, effects and music volume, camera shake, mouse steering, language; remembered per browser
- [x] Procedural audio with Web Audio: engine rumble, RCS hiss, guns, laser and mining beams, shield and hull hits, collisions, explosions, rock break-up, scanner ping, pickups, docking clamps, contract jingles and an ambient pad score
- [x] Guided first flight: ten steps from undocking to selling ore, each checked against the live simulation, skippable
- [x] HUD tidy-ups: docking checklist waits until you have left the bay, menus hide the HUD

Known limits: performance has been checked with software rendering only; it still needs a pass on real low-end GPUs. Audio is synthesised, not recorded.

## MVP 0.1 status

All seven milestones are complete and tagged `v0.1.0`: the vertical slice from section 18 of the specification is playable end to end.

## 0.2: spatial expansion (done)

Section 23 of the specification: several sectors, jumps, exploration.

- [x] Four sectors on one gate network: Outpost Alpha, Industrial Belt, Pirate Territory and Anomaly Zone, each with its own seed, fields, encounters, sky and planet
- [x] Paired jump gates: fly into the ring under 30 m/s and press F; you come out near the far gate already moving inward
- [x] Sector memory: rocks mined, markets traded and loose ore stay as you left them; the clock runs on across jumps, so contract deadlines hold
- [x] Ferrum Refinery in the Industrial Belt: pays more for ore, sells machine parts cheap; trade runs between stations
- [x] Black Harbour, a pirate den that refuses docking, guarded by the new Marauder gunship
- [x] Anomaly Zone gravity well: a real force (a = k / d²) that thrusters must fight, with platinum and exotic-matter rocks close to it
- [x] Two new resources: platinum ore and exotic matter
- [x] Points of interest: derelicts and caches found by flying to them, hidden deposits found by scanning; one-time rewards
- [x] Contracts across sectors: deliveries to other stations (dock to deliver) and to relays in any sector; waypoints lead to the right gate
- [x] Sector map (M) with the gate network, danger, discoveries and contract destinations
- [x] Save format 2 with a migration from version 1 saves
- [x] Insurance always relaunches you at Outpost Alpha; every sector keeps its memory

Known limits: one hand-built set of sectors (no procedural universe yet); NPC traders and a dynamic regional economy are the 0.4 plan.

## 0.3: depth (done)

- [x] Subsystems on every ship: engines, reactor, sensors, shield generator, cargo hold and each weapon mount
- [x] Damage by zone: the side a hit lands on decides what breaks (tail: engines; nose: sensors and guns; middle: reactor, shield generator, hold)
- [x] Effects: weaker thrust (never below 35%), slower reactor, capped and slower shields, shorter sensor and scanner range, silent guns, a leaking hold
- [x] Station repairs cover subsystems; repair drones patch them in flight
- [x] Three factions: Outpost Authority, Ferrum Combine, Free Pirates; reputation per faction from contracts and pirate kills
- [x] Faction effects: contract pay and elite offers per faction, docking refused at -25, faction-gated equipment
- [x] Module slots (engine, utility, defence) with six new modules and a 50% resale
- [x] Damage diagram for your ship and your target, smoke and sparks from damaged sections, alarms
- [x] Save format 3 with a migration from version 2

## 0.4: dynamic universe (done)

- [x] A shared economy: every station produces and consumes on the clock, in every sector, and its market is the same object wherever you trade
- [x] Three NPC hauler routes between Outpost Alpha and Ferrum Refinery, loading real stock and delivering it
- [x] Haulers fly as real ships in the sector you are in (routed out of the bay and around station hulls) and run on the clock elsewhere
- [x] Pirates hunt haulers; a lost hauler drops part of its cargo and its goods never arrive, so stations run short and prices climb
- [x] Off-screen haulers face a per-sector pirate risk unless escorted
- [x] Seven economy events (shortages, a glut, pirate raids that spawn real raiders, two mineral rushes) with timers and news
- [x] Escort contracts posted before a hauler leaves; paid when it docks with you nearby, failed if it is lost
- [x] Reputation reacts: firing on a hauler costs its faction's trust, killing pirates that are attacking one earns it
- [x] Frontier news at stations, notices in flight, hauler labels on screen, raid alerts on the map
- [x] Save format 4 with a migration from version 3

## 0.5: advanced sandbox (done)

- [x] A fleet: every ship you own is parked at a station with its own cargo, modules and damage
- [x] Shipyards at Outpost Alpha and Ferrum Refinery; hulls cost credits and some need standing
- [x] Five player hulls: Kestrel scout, Mule hauler, Prospector miner, Lancer fighter (Ferrum standing)
- [x] Board any ship parked where you are docked; sell parked ships for 60% of the hull plus half their modules
- [x] Miner hull and mining laser Mk II; ship-specific models for miner and fighter
- [x] Save format 5 with a migration from version 4

## 0.6: autonomous fleet (done)

- [x] Hauler route code shared by NPC haulers and the player's fleet (`routes.ts`), with no change to haulers
- [x] Crew boards at lawful stations: pilots with piloting, mining and combat skills, a hiring fee and a wage per 5-minute cycle; unpaid pilots quit
- [x] Orders for crewed ships: mine a field and sell at its station, trade between two stations (buying only while the margin holds after the pilot's commission), or fly as a wingman
- [x] Real ships in the player's sector (fleet miners cut rocks, wingmen hold formation and fight threats near the player), clock-driven elsewhere with one pirate roll per sector crossed
- [x] Ship losses: half the hold spills, the pilot ejects and waits at the nearest station
- [x] Wingmen launch with the player, jump through gates with them and park where they dock
- [x] Crew tab, orders on hangar cards, fleet panel (O) with net earnings and a log, gold fleet markers on radar and screen, fleet counts on the map, notices
- [x] Save format 6 with a migration from version 5

## 0.7: campaign and content (done)

- [x] Campaign "The Bastion Signal": six data-driven missions (discover, kill, deliver, boss), with a card, briefings and an on-screen marker
- [x] Bastion Watch: a military station of the new Frontier Guard in the Anomaly Zone, with a crew board, combat modules and the Lancer
- [x] A hauler route carries parts from Ferrum Refinery to Bastion Watch, completing the spec's ore, parts, garrison chain
- [x] The Dreadmaw, a boss flagship that returns repaired if you leave its sector
- [x] Income measured (`docs/BALANCE.md`), hull prices raised
- [x] Fixes: haulers roll pirate risk once per sector; fleet ships refuel and repair at every stop, survive rock grazes, and only report real attacks
- [x] Save format 7 with a migration from version 6

## 1.0: complete game (next)

More content, narrative and polish, per the spec. To be planned.
