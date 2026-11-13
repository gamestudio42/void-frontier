# Changelog

## Unreleased: gamepad

- Play with a controller: left stick to fly, right stick to aim, RT/LT to fire, LB to mine, B to brake, A to dock or jump, Y to cruise, RB for the next target.
- Menus and station panels work with the d-pad and A; B goes back.
- Prompts, the HUD and the tutorial name controller buttons while you use one, and keys again when you touch the keyboard.
- Controller vibration on hits, kills and death (a setting).

## Unreleased: cruise

- Cruise autopilot: point the cursor at a station, gate or waypoint and press J. The ship burns, coasts, flips and brakes on its own thrusters, steers round rocks and stops at the bay's approach lane or in the gate ring. Any flight key takes control back; a pirate closing in drops it.
- Before you press J, the destination it would pick is tagged on screen; while it flies, a dashed course and a panel show where and what it is doing.
- Dots ahead of the ship mark where it will be over the next five seconds.

## Unreleased: impact

- Bumps teach before they kill: the shield takes most of a collision and a scrape costs little; a crash at speed still hurts.
- A shield taking a collision flares blue and crackles; only hull damage flashes the screen red.
- Longer, thicker tracers and a white-hot flash where rounds hit the hull.
- Your kills land: a short hold, a moment of slow motion, a gold ring and a kick.
- When the stop point is off screen, a red chevron on the edge shows where and how far.

## Unreleased: first minutes

- The hull bar shows again on the ship and target panels (a shipyard style was hiding it).
- A browser without WebGL gets a message instead of a black screen.
- The docking checklist appears only when you approach the bay.
- New games start with flight assist on (a setting); the first flight teaches Newtonian flight by switching it off.
- The first flight no longer asks again for what you already did (scan, mine, dock, fight, fleet).
- Pirates far off are not targeted on their own; the gate patrol at the Outpost sits further out.
- The mining laser shows a faint line and a notice when it touches no rock, and no longer hides the rock it cuts.
- The destroyed card says what broke the ship: who shot it, what it hit and how fast.
- The camera keeps your ship readable at speed and in fights.

## 0.96.0: look and feel

- Lighter flight HUD with arcs around the ship; press I for every readout.
- Closer camera, giant structures, and a sky, light and mood for each sector.
- More detailed hulls, missile smoke, staged explosions, a new jump effect.
- Station panel beside the ship; portraits on mission briefings.
- Aim at a system with T, then board disabled pirates with F.

## 0.95.0: release candidate

- Campaign of 15 missions with a choice that changes the ending.
- Weapons: gatling, railgun, homing missiles; refit each mount at a station.
- Hulls: Bulwark frigate and Magpie salvager. Four new modules.
- Contracts: salvage, patrol and recon. Sectors: the Graveyard and Ember Reach, with their own rules.
- Music follows the moment; rebindable keys, text size, reduced flashes; longer tutorial.
- A tougher Dreadmaw, now with an escort and missiles.
- Save format 8 with migration.

## 0.7.1: polish

- Medium graphics quality is now faster than high on ordinary screens; first frame rates measured on a real graphics chip (`docs/PERFORMANCE.md`).
- An ending card closes the campaign; the map marks the current mission's sector.
- Sounds for missions, the end of the story and fleet events.
- Hangar cards no longer stretch their rows; the menu no longer says "prototype".

## 0.7.0: campaign and content

- Campaign "The Bastion Signal": six missions ending with the Dreadmaw flagship.
- Bastion Watch, a military station of the new Frontier Guard, with its own hauler route.
- Higher hull prices, from measured income (`docs/BALANCE.md`).
- Fleet ships refuel and repair at every stop and survive rock grazes; haulers roll pirate risk once per sector.
- Save format 7 with migration.

## 0.6.0: autonomous fleet

- Hire pilots at station crew boards; wages every 5 minutes and a commission on sales.
- Orders for crewed ships: mine, trade or fly as a wingman; real in your sector, simulated elsewhere.
- Fleet panel (O), crew tab, fleet markers on radar, screen and map, fleet notices.
- Save format 6 with migration.

## 0.5.0: advanced sandbox

- Fleet and hangar: own several ships, each parked with its cargo, modules and damage.
- Shipyards at Outpost Alpha and Ferrum Refinery; buy, board and sell hulls.
- New hulls: Prospector miner (mining laser Mk II) and Lancer fighter (Ferrum standing).
- Save format 5 with migration.

## 0.4.0: dynamic universe

- Shared economy with production and consumption at every station.
- NPC haulers on three routes, real in your sector and simulated elsewhere; pirates hunt them.
- Seven economy events with news; escort contracts; reputation reacts to haulers.
- Save format 4 with migration.

## 0.3.0: depth

- Subsystem damage by hit position, with effects, smoke, alarms and repair.
- Factions with their own reputation, docking rules and gated equipment.
- Module slots, six new modules and resale.
- Save format 3 with migration.

## 0.2.0: spatial expansion

- Four sectors on a gate network: Outpost Alpha, Industrial Belt, Pirate Territory, Anomaly Zone.
- Jump gates, sector memory and a sector map.
- Ferrum Refinery (trade runs) and Black Harbour (pirate den), Marauder gunship.
- Gravity well with platinum and exotic matter; points of interest to discover.
- Contracts across sectors and stations; save format 2 with migration.

## 0.1.0: vertical slice

The MVP from the specification, built in seven milestones:

1. **Flight.** Newtonian flight on a fixed 60 Hz simulation: main, reverse, lateral and rotation thrusters, boost, fuel, mass, flight assist, brake, mouse steering, navigation HUD.
2. **Outpost Alpha.** A modular station, three asteroid fields with three rock types, continuous collision detection with damage, procedural visuals, radar.
3. **Combat.** Autocannons and a laser with heat and energy, predictive aim, shields, armour and hull, pirate raiders with physics-honest AI.
4. **Mining.** Scanner, mining laser, ore chunks and a tractor, a hold limited by mass and volume, salvage.
5. **Station economy.** Skill-based docking, a market priced by stock, repair, refuel, four upgrades, insurance.
6. **Contracts.** Deliveries, mining orders and bounties with deadlines, reputation and elite contracts.
7. **Polish.** Main menu, pause menu, versioned local saves, settings, procedural audio, guided first flight.
