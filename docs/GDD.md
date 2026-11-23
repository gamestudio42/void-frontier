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
- **Newtonian mode**: no input, no change. Spin continues too.
- **Assisted mode** (new games launch in it; a setting can change that): any axis without input is driven to zero velocity by its thrusters, and rotation is damped. It is a pilot aid, not a speed limit.
- **Brake** (Space): every thruster works to stop translation and rotation, in either mode.
- **Mouse steering** (on by default, V toggles): a controller fires the rotation thrusters to point the nose at the cursor without overshoot. Q and E override it.
- No speed cap. The turn rate is capped only in the sense that rotation thrusters stop pushing past the rated rate.
- **Cruise** (J): an autopilot to the station, gate or waypoint under the cursor. It only drives thrusters: burn, coast, flip, brake on the main engine, with a detour round rocks on its course. It stops at a station's approach lane (docking stays manual) or inside a gate ring. Any flight key, a pirate hunting the player within 1.5 km, or 20 s without progress ends it. Numbers in `packages/content/data/cruise.json`.

Ship numbers live in `packages/content/data/ships.json`. The starter scout (`kestrel`) has 18.8 m/s² of main acceleration when empty and full of fuel; 5 t of cargo drops that by about 37%.

## Readability

- Blue line and blue compass triangle: where the nose points (heading).
- Amber line and amber compass arrow: where the ship is going (course). Drift is the angle between them.
- Red ring: where the brake would stop the ship at the current orientation (d = v² / 2a per local axis).
- Fading dots: where the ship will be in one to five seconds if nothing changes.
- Cyan ring and dashed line: the cruise destination; before J is pressed, the destination it would pick is tagged.
- Space dust and the plane grid give a sense of speed; beacons are fixed landmarks.
- The camera does not rotate with the ship, leads in the direction of travel and pulls back as speed rises, but never so far that your ship drops below a tenth of the screen height (7% in a fight, 4.5% against a boss).
- The docking checklist shows only on an approach: within 60 m of the bay, in the corridor with the nose on the bay, or closing on it.

## Sound

- All procedural (no audio files). Buses for effects, ambience, interface and music, into a limiter; heavy events duck the music and ambience.
- One-shots in layers (attack, body, tail) with pitch and variant changes, quieter and duller with distance, and a space reverb send. A voice budget keeps firefights readable.
- Adaptive score: drone, pad, pulse, drums and brass stems follow how intense the moment is (hostiles near, pilots hunting you, recent fire, low hull, the boss). Calm in dock.

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
| J | Cruise to the station, gate or waypoint under the cursor; again to stop |
| M | Sector map |
| G | Graphics quality (high, medium, low) |
| F3 | Debug overlay |
| Esc / P | Pause menu (save, load, settings) |
| H | Controls panel |

With a controller (standard mapping): left stick thrust and strafe, right stick aims the nose, RT guns, LT laser, LB mining laser, B brake, L3 boost, R3 flight assist, A dock / undock / jump / board, X scanner, Y cruise, RB next target, d-pad ← aim at a system, → fleet, ↑ ↓ zoom, View map, Menu pause. Over menus and panels the d-pad or left stick moves focus, A presses and B goes back. Prompts follow the device last used.

On a phone or tablet (`pointer: coarse`, or the first touch), the same commands are on screen: drag Accelerate for thrust and strafe, drag Steer (or drag on the empty view) to point the nose, and hold Brake, Fire, Laser, Mine and Boost. Mode, Scan, Dock, Target, Fleet, Cruise and Pause are taps. Tutorial and tip text name those controls. Mouse and keyboard on a desktop are unchanged. Portrait keeps the title and the flight-mode label on one line and parks the readouts off the ship.

## Outpost Alpha (milestone 2)

- **Station.** A modular frontier station at the sector origin: core with a lit habitat band, a habitat ring, solar arrays, tanks and a docking bay on the east side with a green approach-light runway. The player starts 360 m east, nose toward the bay. Docking itself arrives with the economy (milestone 5).
- **Asteroids.** Three fields: Copper Reach to the north-east (dense, mixed), Titan Shoal to the north-west (titanium-rich, larger rocks) and a sparse scatter across the sector. Rock types: ferrous (iron), cupric (copper) and titanic (titanium), each with its own look, density and future mining yield. Rocks drift and tumble slowly.
- **Collisions.** Everything solid bounces with some energy loss (restitution 0.3) and friction, and off-centre hits spin the ship. Damage grows with impact energy above 3 m/s closing speed, scaled down until 15 m/s so a scrape costs little and a crash a lot. The shield takes 70% of each blow while it has charge and flares blue; the hull takes the rest. Careful flying near rocks is the skill, and a heavy ship hits harder.
- **Destruction.** At zero hull the ship breaks apart in an explosion; `R` relaunches from the start.
- **Reading danger.** Radar (1.4 km, north-up), nearest-object distance, a collision warning when contact is under five seconds away at a damaging speed, camera shake and a red flash on hull damage. When the brake's stop point is off screen, a red chevron on the edge shows where it is and how far.

## Combat (milestone 3)

- **Weapons.** The Kestrel carries two autocannons (left mouse) and a laser (right mouse). Rounds keep the ship's velocity, so firing while sliding matters. Guns swivel up to 6° (laser 3°) onto the target's lead point; outside that cone they fire where the nose points.
- **Defences.** Shield, then armour, then hull. Shields recharge 3–4 s after the last hit. The laser is 1.4× against shields and 0.7× against hulls; the autocannon is the reverse (0.6× and 1.2×). Burn shields with the laser, finish with the guns.
- **Limits.** Guns heat up and lock out at 100% until they cool to 30%. The laser drains the reactor.
- **Pirates.** Jackal raiders patrol south of the station and in Copper Reach. They notice you within 950 m, close to about 230 m, circle, lead their shots and hold fire when a rock is in the way. Badly hurt, they run, and come back once their shields recover. Destroyed groups return after 60–90 s.
- **Archetypes (0.97).** Each pirate flies one of `pirates.json`'s archetypes, named on the target panel: the *skirmisher* circles at 230 m (Jackals by default); the *brawler* burns straight in to ram, mass against mass (Marauders, and the Graveyard scrappers); the *kiter* holds 560 m and fires homing missiles, boosting away when pressed (the Pirate Territory gate watch and the Anomaly Zone scavengers). The Dreadmaw is a fearless flagship.
- **Squads.** A group of two or more flies behind its first ship, the leader; wings fight what comes near it.
- **Morale.** Every pirate starts with its archetype's courage. Hull damage wears it down (0.7 per hull share), a squadmate's death costs 0.25 and the leader's 0.35; six quiet seconds start it recovering. Under 0.3 the pirate breaks and runs for 9 s, then regroups. Broken and under 45% hull, it may surrender instead (60%): it brakes, cuts its guns, stops counting as a hostile and shows pale brackets. Boarding a surrendered ship pays 1.6× the usual strongbox as ransom. The target panel shows a pirate's nerve: steady, wavering or fleeing.
- **Reading the fight.** Red brackets on hostiles, the target panel with shield and hull, a yellow lead diamond, an edge arrow when the target is off screen, a hit marker, long tracers, shield flares, a white-hot flash where rounds bite the hull, and sparks. Your kills hold the picture for a beat, run slow for a moment and ring out in gold. The camera pulls back to keep both ships in frame, as far as the ship-size floor allows.

## Mining (milestone 4)

- **Find.** Press R: a scanner wave (900 m) tags rocks with their resource and ore left (Fe, Cu, Ti) for 30 s and colours them on the radar. Big rocks hold more: ore grows with cross-section.
- **Cut.** The mining laser (middle mouse or X) works best within 70 m and fades to a quarter at 160 m. It heats up and uses a little energy. Each 4 units cut fly off as a glowing chunk.
- **Fracture (0.97).** Every rock has a rich vein on one side, which turns as the rock tumbles; a scan shows it as a bright arc on nearby rocks. Cutting on the vein yields 1.5×, anywhere else 0.7×. The laser heats the rock (small rocks faster); a ring around the rock and a bar in the HUD show the heat against a sweet spot (0.5–0.85), where the cut yields 1.4× (cold 0.8×). Past 1.0 the rock cracks: a quarter of its ore is lost and the rest splits into two or three drifting fragments with real mass, or crumbles into loose ore if they would be too small. Exotic rocks are volatile and explode instead, hurting ships within 70 m. Pulsing the laser on the vein pays about 1.5× the old flat rate; holding the trigger blind loses ore to cracks. The camera moves in while the laser is on a rock. Fleet miners pulse their lasers and never crack a rock. Numbers in `mining.json`.
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

- The game opens on the main menu over the live station scene. New game starts the guided first sortie: the ship leaves the bay on its own under cinema bars while the camera pulls out, and control comes back after 3.5 s (or at once, on any flight key). Without the tutorial, a new game starts docked.
- The first sortie is a quiet pocket: the sector's pirate groups and raids stay away until the lessons end (or are skipped), then return after 45 s. The fight lesson sends one Jackal straight at the player.
- The tutorial teaches one verb per step and moves on only when it has happened: accelerate, brake (with the brake itself, before any speed is worth fearing), switch assist off, coast, turn without changing course, kill the drift, assist back on, scan, mine 8 units, dock, sell, fight, fleet. Scanning, mining, docking, fighting and opening the fleet count even when done ahead of their step. The campaign card waits for the lessons to end.
- Contextual tips appear at the moment they apply, one at a time: closing fast on something (brake), shields down while hit (boost away), hunted with nothing locked (Tab), guns overheated, spinning or coasting in Newtonian flight, low fuel, a full hold, and a long trip flown by hand (cruise). Each shows at most three times ever, with gaps between tips; danger pushes a calmer tip aside. They can be turned off in the settings. Numbers in `tutorial.json`.
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
- **Outfitting.** The Kestrel has 1 engine, 2 utility and 2 defence slots. Modules: engine tuning, afterburner or fuel optimizer (engine); cargo frame, deep scanner, tractor Mk II, repair drones, combat computer, heat sink, salvage rig (utility); reinforced hull, shield capacitor, armour plating, countermeasures, EMP projector (defence). Removing a module refunds half. The afterburner, countermeasures and EMP projector also give a verb on their own key (dash, chaff, EMP pulse) and come in Mk I–III; a higher tier replaces the lower one in its slot, trades it in for half its price, and shows on the hull.

## Dynamic universe (0.4)

- **Living markets.** Outpost Alpha mines iron and copper and burns machine parts; Ferrum Refinery turns ore into machine parts. Stock moves every second whether you are there or not.
- **Haulers.** Three hauler routes keep the two stations supplied. You meet them on the lanes; pirates hunt them. A lost hauler spills part of its cargo and its goods never arrive.
- **Events.** Every four to seven minutes something happens: a shortage, a glut, pirate raids in a sector, a platinum or titanium rush. The station news shows what is running and for how long.
- **Escorts.** Before a hauler leaves, its station posts an escort contract. Fly with it and be within 2 km when it docks. Save a hauler from pirates and its faction remembers; shoot one and it remembers that too.

## Advanced sandbox (0.5)

- **Fleet.** Buy hulls at a station shipyard. Every ship you own stays where you left it, with its cargo, modules and damage. Dock where it is parked to fly it or sell it.
- **Hulls.** Kestrel scout (8,000 cr, all-rounder), Mule hauler (15,000 cr, 20 t hold), Prospector miner (25,000 cr, mining laser Mk II, long tractor), Lancer fighter (30,000 cr at Ferrum Refinery with Ferrum standing +15, or at Bastion Watch with Guard standing +15; three autocannons).

## Autonomous fleet (0.6)

- **Crew.** Outpost Alpha and Ferrum Refinery each list three pilots for hire, refreshed every 15 minutes. A pilot has piloting, mining and combat from 1 to 5, a hiring fee of two wages, and a wage every 5 minutes. Up to six pilots. Every few trips a pilot improves.
- **Orders.** Put a pilot aboard a parked ship and give it an order: *mine* one of six fields and sell the ore at that field's station; *trade* one good between two stations; or *wingman*, flying beside you. Recall sends a ship to the next station.
- **Where they are.** In your sector fleet ships fly for real (gold on the radar, pilot name on screen); elsewhere they run on the clock and may meet pirates once per sector they cross.
- **Money.** Sales go straight to your account, less the pilot's 25% commission. The fleet panel (O) shows each ship's net earnings and a log.

## Campaign (0.7)

- **The Bastion Signal.** A distress call leads from a wreck near the Outpost to a starving garrison, an ancient relay and the warlord Kess Varo's flagship, the Dreadmaw. Six missions, 12,000 cr in all, and enough Guard standing to buy the Lancer at Bastion Watch.
- **Bastion Watch.** The Frontier Guard's station in the Anomaly Zone buys parts, titanium, platinum, salvage and exotic matter. If its parts convoy is lost, it runs short and pays more.

## Towards 1.0 (0.95)

- **Weapons.** Gatling (fast, short range, strong on hulls), railgun (slow, long, heavy, uses energy), missile rack (turns toward your target). Refit each mount in the Outfitting tab; the old weapon goes in part exchange at half its price.
- **Hulls.** Bulwark frigate (60,000 cr at Bastion Watch, Guard +30) and Magpie salvager (20,000 cr at Ferrum Refinery, double salvage).
- **Places.** The Graveyard (beyond the Anomaly Zone, hulks full of salvage, shields recharge at half speed) and Ember Reach (beyond Pirate Territory, rich ore, weapons cool slowly).
- **Contracts.** Salvage orders, patrols past relay beacons, and recon with a scanner pulse at a beacon.
- **Job conditions.** Some contracts carry a condition that makes them a piloting job, for more pay: fragile cargo that cracks above 2 g of felt acceleration (thrust is fine; boost, dashes and bumps are not) and pays for what arrives intact; volatile cargo that blows up in the hold on a hard bump or a hull hit; a rush at about half the time; and no-brake runs whose bonus is lost the moment the brake is used.
- **Named clients.** Eight recurring clients across the three lawful factions (an optics house that ships glass, a field medic in a hurry, a courier syndicate betting on no-brake runs, a demolitions firm, a sergeant hunting raiders, and others) post jobs of their own kind with their own condition. Each job done for one adds 4% to their pay, up to 20%; a failed or abandoned one takes a job back.
- **Career.** Merit from finished contracts (10, elite 18), pirates destroyed (3), discoveries (6), story missions (12) and every 1,000 cr sold (2) raises the pilot through six ranks, from Drifter to Frontier Legend, at 40, 120, 260, 480 and 800 merit. Each rank pays a one-time bonus (500 to 12,000 cr); Contractor and Ace let you hold one more contract each, Veteran and Legend add a job to every board. The thresholds aim for the first rank within the first quarter hour and the next ones every 15 to 30 minutes; this has not been measured in play yet.
- **Licences.** Bought at any station once the rank allows: freight (+20% on deliveries and escorts) and mining (+20% on mining orders) at Licensed Pilot for 2,500 cr; salvage (+20% on salvage and recon, 4,000 cr) and combat (+20% on bounties and patrols, plus 80 cr for every pirate your ships destroy, 6,000 cr) at Contractor.
- **Stakes.** Three levels of investment in any friendly station (4,000, 10,000 and 22,000 cr; Licensed Pilot, Contractor and Veteran): 15/25/35% off repairs and fuel there, one or two more jobs on its board, elite jobs from level 2 whatever your standing, and dividends of 300/900/2,000 cr per game hour, paid when you dock there, for at most four hours away.
- **Sector bosses.** Every sector past Outpost Alpha has a boss (Pirate Territory's is the Dreadmaw of the story). A boss is a hull made much tougher, drawn half again as big with a gold shield and a ☠ marker, and while guarded only 10% of weapon damage gets through; collisions cost it 15% of what they would. Each one opens up its own way, shown on a bar at the bottom of the screen with its hull, phase marks and a hint:
  - **The Quarry Ram** (Industrial Belt, a Marauder at ×3.5 hull): a brawler that will not steer around anything while it charges. Make it hit a rock at 10 m/s or more and it is open for 6 s. Phases at 66% and 33% bring two Jackals each.
  - **The Gravewell Hound** (Anomaly Zone, a Jackal at ×6 hull, faster): open while within 620 m of the well's core and 2 s after. At 50% two Jackals join.
  - **The Scrap Leviathan** (Graveyard, a Dreadmaw hull): three Jackals feed its shield; while they are all down it is open. At 66% three new Jackals take over the guard, at 33% two Marauders.
  - **The Furnace** (Ember Reach, a Marauder at ×4 hull and ×1.4 damage): open while one of its guns is locked out by heat and 1 s after; Ember Reach's slow cooling makes that about 12 s a minute against a target that stays in its sights. At 50% two Jackals join.
  - Beating one pays 5,000 to 8,000 cr, 40 to 50 merit and 6 to 10 salvage; it is back in its lair two game hours later. Bosses never flee or surrender. Their numbers have not been tuned in play.
- **Photo mode and accessibility.** F9 pauses the game into a free camera (WASD, Q/E, R/F, wheel; Enter saves a PNG). Settings offer colour-blind correction (protanopia, deuteranopia, tritanopia) over the whole screen, a radio switch, reduced flashes, text size, camera shake and rumble switches and key remapping.
- **Radio.** The cast talks in flight, one short line at a time (at least 3 s apart, each trigger at most once every 40 s), with the speaker's portrait under the mission card. Dispatch calls incidents, a failing hull and promotions; Cmdr. Oyelaran calls contacts, an open boss guard and a boss kill; the Ferrum foreman a full hold; Kess Varo taunts at elites, traps and bosses; and each sector greets you on arrival in its own voice. Lines rotate through variants.
- **Fleet stories.** Hired pilots remember being saved by you (a pirate that had them in its sights and had hurt them in the last 10 s, shot down by you), and bosses and elites brought down within 2 km of them, up to five memories each. They say so on the radio at the time, and bring the latest one up by sector name when they launch with you ("I still owe you one for Ember Reach").
- **Elites.** When a pirate group spawns (at sector load, on respawn, or as a distress-call trap) its leader may come out elite: never in Outpost Alpha, 12% of the time in the Industrial Belt, 25-30% in the Anomaly Zone, Pirate Territory and the Graveyard, and 40% in Ember Reach. The Graveyard and Ember Reach roll two affixes, the rest one. Affixes: armored (hull ×1.7, +15% armour, ×1.25 mass), swift (thrust ×1.4, turning ×1.3), regenerating (shield recharge ×3, after a third of the delay), overcharged (gun damage ×1.35, less heat), volatile (a 220 m, 180-damage blast when it dies) and relentless (shield ×1.4, never runs or surrenders). An elite is bigger, wears a violet shield, gets a ◆ marker within sensor range and lists its affixes on the target panel. Destroying one pays 300 cr per affix, 6 merit on top of the kill's, and two extra salvage drops. The Dreadmaw is never elite.
- **Incidents.** An encounter director reads how hot things are around you (pirates near, damage traded, kills) and, after a fight peaks, leaves 40 seconds of breathing room. Only in a calm stretch (75 seconds after you arrive in a sector, then every 110 to 210 calm seconds) does it start an incident, chosen by the sector's weights: a **distress call** 1.3 to 2.2 km away that pays 700 cr and some cargo if you reach it within 150 s, or springs two Jackals on you (never in Outpost Alpha, 60% of the time in Pirate Territory); a **micrometeor storm**, announced 8 s ahead, that sends a 25-second stream of rock across your path (a parked scout loses most of its shield; moving targets fare better); a **solar flare**, announced 12 s ahead, that holds the shields of every ship out of cover at zero for 18 s (a rock of 18 m or more, or a station, between you and the sun is cover); and an **unstable wreck** that spills salvage and blows 50 s later, hurting everything within 320 m. Incidents are not saved and end with a jump. Their frequency and the storm's bite have not been tuned in play yet.
- **Story.** After the Dreadmaw you decide Kess Varo's fate. Justice pays less and earns the Guard's trust; the deal pays well and costs it. Each leads to its own last missions and ending.

## Look and feel (0.96)

- **Flight.** Shield and hull sit as two arcs around the ship, speed beneath it. Panels stay small until you press I.
- **Boarding.** Select a target, press T to aim at its engines or reactor, and break it. Close to 90 m at matched speed and press F for its strongbox and salvage.

## Not yet

Crew, a procedural universe and larger story contracts. See `docs/ROADMAP.md`.
