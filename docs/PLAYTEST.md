# Playtest: campaign to an ending

Date: 2026-11-10. Build: 0.96, dev server, quality locked to low.

## Hypothesis

A person can finish The Bastion Signal, and the flight fantasy stays readable while the story is on screen. The pillar under test is honest flight; the loop beat is the first minute after undock, then each story card.

## Who played

The session was played by the coding agent on a first pass through this build. The systems were already known from the code. The guided first flight was switched off, so this is not the path a new player gets by default. Audio could not be heard. The justice branch was finished in the live client. The deal branch was not played here; the unit test already walks both.

The first minutes used the game's own keys (`KeyW`, `Space`, `KeyX`, `ControlLeft`, `KeyR`) on the running page. After the death, later objectives were completed inside that same client by moving the ship, jumping its gates, docking and crediting kills, so every card and the ending were actually on screen. That second half is not a measure of how long a person takes to fly.

## Observations

- New game opens docked. The contract board covers the bay. Six offers sit in front of the ship, from 800 cr to 1,750 cr. The story card is absent until undock.
- After undock the card is "Pedido de socorro", 1/15, speaker Despacho, objective the wreck in Outpost Alpha, marker 1.87 km. A Jackal is already the target at 1.35 km. Three jobs are on screen at once: the distress, the pirate, and, a few seconds later, a collision warning.
- Holding main thrust, speed climbed through 169 m/s to 310.05 m/s and fuel fell from 500 kg to about 461 kg. Releasing thrust left the speed bit-identical at 310.0524831269046 while the tick advanced. The ship at that speed is a speck. The plume is a short bright streak. The mission marker had fallen behind, to 7.79 km, and the brake readout said 3.97 km to stop.
- Brake showed the FRENANDO banner. Speed fell from 310 m/s to 274 m/s in about two seconds, and fuel kept falling. The stop point itself was not in view.
- The mining laser ran, the hold went to 2.34 / 6.0 t of iron, and the beam was a thin line leaving the screen. The rock being cut was not in frame. No chunk was visible.
- Guns at 220 m from a Jackal heated both autocannons to 89% and did not destroy that ship in the sampled second. Tracers were short dashes. The player's shield fell to 12%. The target panel's bar stayed hard to read next to the shield bar, which did show 12%.
- The ship was then destroyed while the speed readout said 0 m/s and a Jackal was closing at about 50 m/s. The death card said the hull broke on impact and to keep approach speed low near rocks and the station. `R` relaunched at the station: hull full, cargo empty, credits 720 (90% of 800), campaign still on step 1, deaths 1.
- Walking the justice cards in that client, every briefing is one calm paragraph in the same card. Oyelaran speaks for most of the steps in the same register as Dispatch. The foreman has one line. Varo's choice is still told in the third person ("Varo oferece uma fortuna") even though the caption says Kess Varo. Portuguese lines name sectors in English: "Anomaly Zone", "Pirate Territory".
- Kill steps say "Destrua piratas" and a count, with no place marker. After the flagship, "Os últimos" asked for 5 pirates in a sector whose groups were already dead. Progress sat at 1/5 until groups were brought back. Deliveries show `current/target` (parts 0/20, salvage 25/25, titanium 20/30 before the rest was put aboard).
- Docking to finish a delivery hides the story card. The next briefing is not on screen at the station. It returns after undock.
- The choice is readable: "Entregar à Guarda · +4.000 cr" and "Ficar com o dinheiro · +12.000 cr".
- The ending card "Os ataques se calam" appeared over Ember Reach with "4 min · Naves perdidas: 1" and 43,370 cr. The 4 minutes and the credit total include the fast travel and one death, plus discovery cash picked up by visiting the wrecks. They are not a human play time and not the scripted income in `docs/BALANCE.md`.

## Interpretation

The flight pillar holds: coasting did not change velocity, and the brake spent fuel. It does not read at the speed a few seconds of thrust produces, because the ship, the plume and the stop point shrink out of the useful frame.

The story can be finished. It does not yet have speakers. The first minute asks for a wreck, a fight and collision avoidance before the player has been shown the brake, which is what the skipped tutorial is for. A death in that fight is explained as a fast approach even when the speed readout is zero and another ship is closing. The balance script never dies and never reads these cards, so it does not show this.

"Destrua piratas" with no marker stalls when the local groups are already down and respawn is a minute away. That is a pacing hole, not a missing system.

## Decision

Keep the flight model, the mission list and the choice. Change the first minute's picture and sound (Kestrel silhouette, thrust, mining cut, impact), and change the lines, portraits and the Dreadmaw moment so the speakers are not the same voice. Do not add a mission, a currency or a sector for this.

Not played: the tutorial path, the deal branch in the client, Safari, and any session with a person who does not know the keys.
