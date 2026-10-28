# Void Frontier: game design

Status: combat in Outpost Alpha (milestone 3). The full vision and the original Portuguese specification are in `docs/reference/void-frontier-spec-v0.1-pt.md`.

## Fantasy

You are an independent pilot on a remote frontier with a small working ship, and you make a living by flying it well: mining, hauling, fighting pirates and upgrading the ship you depend on.

## Pillars

1. **Honest Newtonian flight.** The ship keeps moving until thrusters push it otherwise. Where the nose points and where the ship goes are separate, and piloting skill is real progression.
2. **Ships are machines.** Mass, fuel, thrusters and modules have consequences you can feel. A loaded hauler is slow to turn; a light scout is twitchy.
3. **Choose how you earn.** Mining, trading, contracts and combat are parallel ways to grow, all through the same flight model.
4. **One small sector done well.** A complete, fun loop beats a large empty universe.

## Core loop (vertical slice target)

Dock → pick a contract → undock → fly → mine, fight or collect → return → dock → sell → upgrade → repeat.

Milestones 1 and 2 deliver the *fly* beat in a real place: a station to approach and an asteroid belt to thread. Flying has to feel good on its own before anything else is built on it.

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
| Left mouse / Ctrl | Fire autocannons |
| Right mouse / Alt | Fire laser |
| Tab | Next target |
| Shift | Boost |
| Space | Brake |
| C | Toggle flight assist |
| Wheel, + / − | Zoom (0.5× to 3.5×) |
| L | Load or unload 5 t of test cargo (until mining exists) |
| R | Relaunch after the ship is destroyed |
| G | Graphics quality (high, medium, low) |
| F3 | Debug overlay |
| Esc / P | Pause |
| H | Controls panel |

## Outpost Alpha (milestone 2)

- **Station.** A modular frontier station at the sector origin: core with a lit habitat band, a habitat ring, solar arrays, tanks and a docking bay on the east side with a green approach-light runway. The player starts 360 m east, nose toward the bay. Docking itself arrives with the economy (milestone 5).
- **Asteroids.** Three fields: Copper Reach to the north-east (dense, mixed), Titan Shoal to the north-west (titanium-rich, larger rocks) and a sparse scatter across the sector. Rock types: ferrous (iron), cupric (copper) and titanic (titanium), each with its own look, density and future mining yield. Rocks drift and tumble slowly.
- **Collisions.** Everything solid bounces with some energy loss (restitution 0.3) and friction, and off-centre hits spin the ship. Damage grows with impact energy above 3 m/s closing speed: careful flying near rocks is the skill, and a heavy ship hits harder.
- **Destruction.** At zero hull the ship breaks apart in an explosion; `R` relaunches from the start.
- **Reading danger.** Radar (1.4 km, north-up), nearest-object distance, a collision warning when contact is under five seconds away at a damaging speed, camera shake and a red flash on damage.

## Combat (milestone 3)

- **Weapons.** The Kestrel carries two autocannons (left mouse) and a laser (right mouse). Rounds keep the ship's velocity, so firing while sliding matters. Guns swivel up to 6° (laser 3°) onto the target's lead point; outside that cone they fire where the nose points.
- **Defences.** Shield, then armour, then hull. Shields recharge 3–4 s after the last hit. The laser is 1.4× against shields and 0.7× against hulls; the autocannon is the reverse (0.6× and 1.2×). Burn shields with the laser, finish with the guns.
- **Limits.** Guns heat up and lock out at 100% until they cool to 30%. The laser drains the reactor.
- **Pirates.** Jackal raiders patrol south of the station and in Copper Reach. They notice you within 950 m, close to about 230 m, circle, lead their shots and hold fire when a rock is in the way. Badly hurt, they run, and come back once their shields recover. Destroyed groups return after 60–90 s.
- **Reading the fight.** Red brackets on hostiles, the target panel with shield and hull, a yellow lead diamond, an edge arrow when the target is off screen, a hit marker, shield flares and sparks. The camera pulls back to keep both ships in frame.

## Not yet

Mining, docking, economy, missions, saves, audio and the second ship in play (it is defined in content). See `docs/ROADMAP.md`.
