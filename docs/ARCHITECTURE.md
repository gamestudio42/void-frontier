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

`World` is a small entity store: component maps (`bodies`, `ships`, `beacons`) keyed by entity id, iterated in insertion order. `Simulation.step()` runs the systems in a fixed order:

| Order | System | Reads | Writes |
| --- | --- | --- | --- |
| 1 | `massSystem` | ship fuel, cargo, equipment | body mass and inertia |
| 2 | `flightControlSystem` | command, flight mode, body state | thruster throttles |
| 3 | `thrusterSystem` | throttles, fuel | body force and torque, fuel |
| 4 | `integrationSystem` | force, torque, mass | velocity, position, angle |

Later systems (weapons, collisions, damage, mining, economy) slot in following the order in the specification, section 14.4.

Only `integrationSystem` writes motion. Assists compute the force that would cancel a velocity component in one step and clamp it to what the thrusters can deliver.

## Determinism

The simulation avoids `Math.sin`, `Math.cos`, `Math.atan2` and friends because engines do not guarantee identical results. `packages/kernel/src/trig.ts` implements them with `+ − × ÷` and `sqrt`, which IEEE 754 makes exact. ESLint blocks the forbidden calls in deterministic packages. A test replays a scripted flight twice and compares the state bit for bit.

## Rendering

- Ships are procedural (`shipModel.ts`): boxes and cylinders scaled to the hull length, with additive cone plumes for every thruster group driven by the simulation's actual throttle.
- Environment: camera-centred starfield, a shader-wrapped dust field (the main speed cue), a snapping reference grid, a distant gas giant and pulsing beacons.
- Post-processing: bloom (engines and lamps) and ACES tone mapping through `EffectComposer`.
- Camera (`camera.ts`): perspective, 50° FOV, 55° tilt, 120 m base distance, exponential smoothing (0.15 s), velocity look-ahead and speed-based pull-back.
