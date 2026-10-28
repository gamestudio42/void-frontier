# Architecture

```text
apps/game            Vite + React shell: frame loop, input, HUD, i18n
packages/view3d      three.js renderer: ships, environment, camera, in-world instruments
packages/simulation  World, components and systems (pure, deterministic)
packages/content     Validated data: ships, sectors (Zod schemas + JSON)
packages/kernel      Math, deterministic trig, RNG, fixed-step clock
```

Dependencies point down only: `game → view3d → simulation → content, kernel`. The three deterministic packages (`kernel`, `content`, `simulation`) have no DOM and no clock, so they run the same in the browser, in Vitest and in future headless tools.

## Frame loop

`apps/game/src/game.ts` runs on `requestAnimationFrame`:

1. Turn the cursor into a world point (raycast onto the flight plane).
2. Build one `ShipCommand` from held keys and apply it to every step this frame.
3. `FixedStepper` converts the frame time into whole 1/60 s steps. Frames longer than 0.25 s and anything beyond 8 steps per frame are dropped, so a slow machine sees slow motion instead of a spiral of death. Dropped time is shown in the debug overlay.
4. The renderer interpolates between the previous and current body state with the leftover `alpha`.
5. Every 0.1 s the game publishes telemetry to `HudStore`, which React reads through `useSyncExternalStore`.

## Simulation

`World` is a small entity store: component maps (`bodies`, `ships`, `colliders`, `asteroids`, `stations`, `projectiles`, `pilots`, `beacons`) keyed by entity id, iterated in insertion order. `Simulation.step()` runs the systems in a fixed order:

| Order | System | Reads | Writes |
| --- | --- | --- | --- |
| 1 | `massSystem` | ship fuel, cargo, equipment | body mass and inertia |
| 2 | `aiSystem` | pilots, sensors, bodies | AI ship commands |
| 3 | `flightControlSystem` | command, flight mode, body state | thruster throttles |
| 4 | `thrusterSystem` | throttles, fuel | body force and torque, fuel |
| 5 | `integrationSystem` | force, torque, mass | velocity, position, angle |
| 6 | `collisionSystem` | colliders, bodies | velocity, angular velocity, position (push-out), ship hull, the spatial index; collision and destruction events |
| 7 | `weaponSystem` | commands, weapon mounts, spatial index | projectiles, beams, mining (ore extraction and chunks), heat, energy, shields; shot and hit events |
| 8 | `projectileSystem` | projectiles, spatial index | hits (swept ray), expiry |
| 9 | `pickupSystem` | pickups, tractors, holds | pickup motion, hold contents; collected and hold-full events |
| 10 | `scanExpirySystem` | scan readings | expired readings removed |
| 11 | `encounterSystem` | encounters | respawned pirate groups |
| 12 | `marketSystem` | market stock (1 Hz) | stock drifting toward base |
| 13 | `missionSystem` | contract board, player position and hold | deliveries completed, deadlines failed, board refreshed; contract events |

Later systems (mining, inventory, missions, economy) slot in following the order in the specification, section 14.4.

Components: `bodies`, `ships`, `colliders`, `asteroids`, `stations`, `beacons`. Static bodies (stations) have infinite mass and inertia, so forces and impulses cannot move them. `universe.ts` builds a sector from data: stations first, then each asteroid field from the sector seed, rejecting rocks that would overlap anything already placed or a clear zone.

Systems report what happened through `world.events` (`collision`, `shipDestroyed`). The game drains them after each frame's steps and hands them to the renderer for sparks, shake and explosions, and to the HUD for the damage flash.

## Collisions

All shapes are circles in body-local space: three along each ship hull, one per rock, and a few hundred along the station's modules (derived from `stations.json`).

1. Broad phase: a 96 m uniform grid over each body's swept bounding box (previous to current position).
2. Narrow phase: circle pairs. If the circles do not overlap at the end of the step, a swept test solves for the time of impact along the relative motion, so a ship at hundreds of m/s cannot pass through a 2 m rock.
3. Response: bodies are rewound to the time of impact, then an impulse with restitution and Coulomb friction is applied at the contact point (so off-centre hits spin the ship), followed by a positional push-out split by inverse mass.
4. Damage: impact energy above the safe speed, applied to every ship in the pair (see `docs/DECISIONS.md` 011).

The collision system also publishes its grid as `world.spatial`; weapons, projectiles, line-of-sight checks and proximity queries reuse it through `raycast` and `query`.

## Combat

- `combat.ts`: weapon mounts (cooldown, heat, overheat, gimbal), projectile spawning with velocity inheritance and seeded spread, beam raycasts, `leadPoint` (intercept solver) and `hostilesNear`.
- `damage.ts`: shield → armour → hull with per-weapon multipliers; `destroyShip` credits kills and removes the wreck's collider.
- `ai.ts`: pirate pilots (patrol, engage, retreat, avoidance) that only write ShipCommands, plus encounter spawning and respawn.
- `mining.ts`: ore extraction, rock resizing and break-up, pickups, tractor, scanner, jettison and pirate salvage. Ship mass includes the hold, so mining feeds straight into flight.
- `station.ts`: bay geometry, docking checks and lock, market pricing and trades, services, upgrades (rebuilding the effective ship definition) and market drift. Trades move goods and credits together or not at all.
- `missions.ts`: the contract board (offers, active, history, reputation), offer generation from `contracts.json`, accept, hand-in, abandon and `carryBoard` for a lost ship. It lives on `Simulation.missions` and reads the world; it never moves bodies.
- Gameplay randomness (spread, spawn headings, chunk scatter, contract offers) comes from `world.rng`, seeded from the sector, so fights replay exactly.

Only `integrationSystem` writes motion. Assists compute the force that would cancel a velocity component in one step and clamp it to what the thrusters can deliver.

## Determinism

The simulation avoids `Math.sin`, `Math.cos`, `Math.atan2` and friends because engines do not guarantee identical results. `packages/kernel/src/trig.ts` implements them with `+ − × ÷` and `sqrt`, which IEEE 754 makes exact. ESLint blocks the forbidden calls in deterministic packages. A test replays a scripted flight twice and compares the state bit for bit.

## Rendering

- Ships are procedural (`shipModel.ts`): boxes and cylinders scaled to the hull length, with additive cone plumes for every thruster group driven by the simulation's actual throttle.
- Environment: camera-centred starfield, a shader-wrapped dust field (the main speed cue), a snapping reference grid, a distant gas giant and pulsing beacons.
- Post-processing: bloom (engines and lamps) and ACES tone mapping through `EffectComposer`.
- Asteroids: per type, six procedural shapes (noise displacement, craters, mineral veins in vertex colours) at two levels of detail, drawn with `InstancedMesh`: about 36 draw calls for the whole belt.
- Station: built from the same module list the colliders use, with procedural plating, window and solar textures, blinking navigation lights and a chasing approach runway.
- Sky: a procedural nebula shader on a camera-centred sphere behind the starfield.
- Shadows: one directional sun with a 720 m shadow frustum that follows the camera focus.
- Particles: one pooled additive system (6000 points) for engine and RCS exhaust, impact sparks and dust, and explosions; plus a shockwave ring and a flash light per explosion.
- Combat effects (`combatFx.ts`): instanced tracers, beam meshes, a fresnel shield bubble per ship that flares at the hit direction, muzzle flashes and sparks through the particle system.
- Mining effects (`mining.ts` in view3d): instanced glowing ore chunks tinted by resource and tractor lines; the renderer adds the scanner wave, cutting sparks and rock break-up.
- Targeting overlay (`apps/game/src/targeting.ts`): a 2D canvas over the scene with brackets, lead marker, off-screen arrow, hit marker and scanner tags, drawn each frame from `worldToScreen`.
- Quality levels: high, medium and low adjust resolution, shadow map size, shadows and bloom (see `docs/DECISIONS.md` 013).
- Camera (`camera.ts`): perspective, 50° FOV, 55° tilt, 120 m base distance, exponential smoothing (0.15 s), velocity look-ahead and speed-based pull-back.
