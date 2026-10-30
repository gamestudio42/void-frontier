# Changelog

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
