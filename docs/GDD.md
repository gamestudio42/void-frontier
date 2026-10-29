# Void Frontier: game design

Status: 0.4 dynamic universe (economy, haulers, events, escorts). The full vision and the original Portuguese specification are in `docs/reference/void-frontier-spec-v0.1-pt.md`.

## Fantasy

You are an independent pilot on a remote frontier with a small working ship, and you make a living by flying it well: mining, hauling, fighting pirates and upgrading the ship you depend on.

## Pillars

1. **Honest Newtonian flight.** The ship keeps moving until thrusters push it otherwise. Where the nose points and where the ship goes are separate, and piloting skill is real progression.
2. **Ships are machines.** Mass, fuel, thrusters and modules have consequences you can feel. A loaded hauler is slow to turn; a light scout is twitchy.
3. **Choose how you earn.** Mining, trading, contracts and combat are parallel ways to grow, all through the same flight model.
4. **One small sector done well.** A complete, fun loop beats a large empty universe.

## Core loop (vertical slice target)

Dock → pick a contract → undock → fly → mine, fight or collect → return → dock → sell → upgrade → repeat.

Milestones 1–6 deliver the specification's full loop: start docked, select a contract, undock, fly, mine, fight or deliver, return, dock, sell, complete the contract, earn credits, upgrade, repeat.

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
| Middle mouse / X | Mining laser |
| R | Scanner pulse; relaunch after the ship is destroyed |
| K (twice) | Jettison the hold |
| F | Dock (when the approach checks are green) / undock / jump through a gate |
| M | Sector map |
| G | Graphics quality (high, medium, low) |
| F3 | Debug overlay |
| Esc / P | Pause menu (save, load, settings) |
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

## Mining (milestone 4)

- **Find.** Press R: a scanner wave (900 m) tags rocks with their resource and ore left (Fe, Cu, Ti) for 30 s and colours them on the radar. Big rocks hold more: ore grows with cross-section.
- **Cut.** The mining laser (middle mouse or X) works best within 70 m and fades to a quarter at 160 m. It heats up and uses a little energy. Each 4 units cut fly off as a glowing chunk.
- **Collect.** The tractor pulls chunks within 60 m into the hold. Small rocks crumble when empty; large ones shrink to a husk.
- **Carry.** The hold takes 6 t. Every tonne lowers acceleration and turn rate, so a full hold makes you slow prey; K twice dumps it.
- **Salvage.** Pirate wrecks drop salvage chunks you can collect the same way.

## Station and economy (milestone 5)

- **Docking.** Fly into the bay and stop: within 12 m of the bay centre, below 3 m/s, nose within 15° of the bay axis. A dashed corridor and a ring mark the approach, and a checklist turns green item by item. F docks; the station refuses with hostiles within 450 m. Docked, the ship is safe.
- **Market.** Outpost Alpha buys all three ores and salvage, sells iron, copper and machine parts. Prices follow stock: selling a full hold of one ore lowers its price as you go, and stock recovers over a few minutes, which rewards mixing what you mine.
- **Services.** Repair (1.5 cr per hull point) and refuel (1.2 cr per kg), as far as your credits go.
- **Upgrades.** Engine tuning (+15% thrust, 1,200 cr), reinforced hull (+400 hull, +5% armour, 1,500 cr), cargo frame (+3 t, +10 m³, 1,000 cr) and shield capacitor (+150 shield, faster recharge, 1,400 cr). Each adds mass.
- **Loss.** Insurance relaunches you at the station with upgrades and 90% of credits; the hold is gone.

## Contracts (milestone 6)

- **Board.** Four offers at the station; one is replaced every four minutes and taken offers are replaced at once. Up to three active contracts.
- **Delivery.** Sealed crates (120 kg each, unsellable) go into the hold on acceptance. Stop within 60 m of the relay beacon below 6 m/s to deliver. Reach, Shoal and Gate relays; Gate is in pirate space and pays 45% more.
- **Mining.** Bring a set amount of iron, copper or titanium ore and hand it in at the station.
- **Bounty.** Destroy one to three pirates after accepting, then hand in.
- **Deadlines and reputation.** Every contract has a time limit. Completing raises outpost reputation (+3 to +6); failing (-6) or abandoning (-4) lowers it. Each point is +0.5% pay; from +20, elite contracts appear (bigger and better paid).
- **Readability.** The Contracts tab opens first when docked; in flight a tracker lists objectives and timers, delivery relays get a waypoint, an edge arrow and a radar ring, and a notice confirms each outcome.

## First session (milestone 7)

- The game opens on the main menu over the live station scene. New game starts docked with the guided first flight switched on.
- The tutorial teaches one verb per step and moves on only when it has happened: undock, accelerate, coast, turn without changing course, brake, flight assist, scan, mine 8 units, dock, sell.
- Progress is saved automatically on every docking and every two minutes, and manually to three slots from the pause menu. Continue loads the most recent save.

## The frontier (0.2)

| Sector | Character | What it offers |
| --- | --- | --- |
| Outpost Alpha | Home, medium danger | Outpost station, mixed belt, a derelict |
| Industrial Belt | Busy, low danger | Ferrum Refinery (best ore prices, cheap machine parts), dense iron, titanium and platinum belts, a hidden deposit |
| Pirate Territory | Hostile, high danger | Black Harbour pirate den (no docking), Marauder gunship, raider packs, a smugglers' cache and a gunship wreck |
| Anomaly Zone | Strange, low pirate presence | A gravity well, exotic-matter crystals and platinum near it, an ancient structure |

- **Gates.** Each sector has two gates; fly into the ring under 30 m/s and press F. The map (M) shows the network.
- **Gravity well.** Pull grows as 1/d². At 250 m from the core it is close to a scout's full main thrust; the richest rocks sit there. Watch the gravity readout and keep fuel.
- **Exploration.** A "?" marks a signal; fly within 90 m of derelicts and caches to search them. Deposits only show up on a scanner pulse in range. Each pays once.
- **Trade runs.** Ore sells best at the refinery; machine parts are cheap there and worth more at the outpost. Station deliveries pay for the trip between them.

## Depth (0.3)

- **Subsystems.** Where a hit lands decides what breaks. Engines (tail) cut thrust to as little as 35%; the reactor slows energy; the shield generator caps and slows the shield; sensors lose range and, wrecked, the scanner; the hold leaks cargo; a gun at 0% stays silent. Smoke shows damaged sections; the ship panel and target panel show a damage diagram.
- **Repairs.** Station repairs fix hull, systems and mounts together. Repair drones patch the worst system in flight after five quiet seconds, using reactor energy.
- **Factions.** Outpost Authority (Outpost Alpha), Ferrum Combine (Industrial Belt) and the hostile Free Pirates. Each lawful faction tracks your reputation: contracts move the issuer's, every pirate destroyed raises both. At -25 or below their stations refuse docking. The Ferrum combat computer needs +20 with them.
- **Outfitting.** The Kestrel has 1 engine, 2 utility and 2 defence slots. Modules: engine tuning or afterburner (engine); cargo frame, deep scanner, tractor Mk II, repair drones, combat computer (utility); reinforced hull, shield capacitor, armour plating (defence). Removing a module refunds half.

## Dynamic universe (0.4)

- **Living markets.** Outpost Alpha mines iron and copper and burns machine parts; Ferrum Refinery turns ore into machine parts. Stock moves every second whether you are there or not.
- **Haulers.** Three hauler routes keep the two stations supplied. You meet them on the lanes; pirates hunt them. A lost hauler spills part of its cargo and its goods never arrive.
- **Events.** Every four to seven minutes something happens: a shortage, a glut, pirate raids in a sector, a platinum or titanium rush. The station news shows what is running and for how long.
- **Escorts.** Before a hauler leaves, its station posts an escort contract. Fly with it and be within 2 km when it docks. Save a hauler from pirates and its faction remembers; shoot one and it remembers that too.

## Not yet

 docking, economy, missions, saves, audio and the second ship in play (it is defined in content). See `docs/ROADMAP.md`.
