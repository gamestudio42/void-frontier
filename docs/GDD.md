# Void Frontier: game design

Status: flight prototype (milestone 1). The full vision and the original Portuguese specification are in `docs/reference/void-frontier-spec-v0.1-pt.md`.

## Fantasy

You are an independent pilot on a remote frontier with a small working ship, and you make a living by flying it well: mining, hauling, fighting pirates and upgrading the ship you depend on.

## Pillars

1. **Honest Newtonian flight.** The ship keeps moving until thrusters push it otherwise. Where the nose points and where the ship goes are separate, and piloting skill is real progression.
2. **Ships are machines.** Mass, fuel, thrusters and modules have consequences you can feel. A loaded hauler is slow to turn; a light scout is twitchy.
3. **Choose how you earn.** Mining, trading, contracts and combat are parallel ways to grow, all through the same flight model.
4. **One small sector done well.** A complete, fun loop beats a large empty universe.

## Core loop (vertical slice target)

Dock → pick a contract → undock → fly → mine, fight or collect → return → dock → sell → upgrade → repeat.

Milestone 1 delivers only the *fly* beat. It has to feel good on its own before anything else is built on it.

## Flight model (milestone 1)

- 2D movement plane rendered in 3D, fixed 60 Hz simulation, semi-implicit Euler.
- Mass = dry hull + equipment + cargo + fuel. Moment of inertia = mass × gyration radius², so cargo slows turning as well as acceleration.
- Thruster groups: main (forward), reverse, lateral (left/right) and rotation. Boost multiplies main thrust and costs much more fuel.
- Fuel burns in proportion to thrust delivered (kg per mega-newton-second). An empty tank means no thrust at all.
- **Newtonian mode** (default): no input, no change. Spin continues too.
- **Assisted mode**: any axis without input is driven to zero velocity by its thrusters, and rotation is damped. It is a pilot aid, not a speed limit.
- **Brake** (Space): every thruster works to stop translation and rotation, in either mode.
- **Mouse steering** (on by default, V toggles): a controller fires the rotation thrusters to point the nose at the cursor without overshoot. Q and E override it.
- No speed cap. The turn rate is capped only in the sense that rotation thrusters stop pushing past the rated rate.

Ship numbers live in `packages/content/data/ships.json`. The starter scout (`kestrel`) has 18.8 m/s² of main acceleration when empty and full of fuel; 5 t of cargo drops that by about 37%.

## Readability

- Blue line and blue compass triangle: where the nose points (heading).
- Amber line and amber compass arrow: where the ship is going (course). Drift is the angle between them.
- Red ring: where the brake would stop the ship at the current orientation (d = v² / 2a per local axis).
- Space dust and the plane grid give a sense of speed; beacons are fixed landmarks.
- The camera does not rotate with the ship, leads in the direction of travel and pulls back as speed rises.

## Controls

| Input | Action |
| --- | --- |
| W / S | Main engine / reverse thrusters |
| A / D | Lateral thrusters |
| Q / E | Rotate left / right |
| Mouse | Point the nose at the cursor (V toggles) |
| Shift | Boost |
| Space | Brake |
| C | Toggle flight assist |
| Wheel, + / − | Zoom (0.5× to 2×) |
| L | Load or unload 5 t of test cargo (until mining exists) |
| F3 | Debug overlay |
| Esc / P | Pause |
| H | Controls panel |

## Not in milestone 1

Combat, mining, docking, economy, missions, saves, audio, collisions and the second ship in play (it is defined in content). See `docs/ROADMAP.md`.
