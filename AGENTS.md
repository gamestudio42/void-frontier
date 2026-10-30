# AGENTS.md

Instructions for AI coding agents working on Void Frontier. Read `docs/GDD.md`, `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` before changing code, then the GameStudio42 standards in `.gs42/standards/` (start with `.gs42/standards/AGENTS.md`). This file wins over the studio defaults where they differ.

## Core principle

**Physics before content.** One ship that flies well is worth more than twenty that fly badly. Every feature must keep the flight model honest: thrust is the only thing that changes a ship's motion.

## Rules

1. Work one milestone at a time, in `docs/ROADMAP.md` order. A milestone is done when its acceptance criteria have automated tests that pass and the build runs in a browser. Compiling is not done.
2. `packages/kernel`, `packages/content` and `packages/simulation` are pure deterministic TypeScript: no DOM, no wall clock, no `Math.random`, no transcendental `Math` functions (use `sin`, `cos`, `atan2` from the kernel). ESLint enforces this; do not disable the rule.
3. Flight assists, AI pilots and autopilots fire thrusters. Only `integrationSystem` and `collisionSystem` write a body's position, velocity, angle or angular velocity.
4. React has no game rules. It reads `HudStore` snapshots and calls game actions. The renderer reads the simulation and never writes to it.
5. Game numbers live in `packages/content/data/` and are validated by the Zod schemas in `packages/content/src/schema.ts`. No magic gameplay numbers in systems.
6. Every new system gets unit tests in `packages/<package>/test/`; player-visible flows get a Playwright test in `e2e/`.
7. Run `pnpm check` (typecheck, lint, unit tests) and `pnpm build` before each commit. Run `pnpm e2e` when the HUD, input or loop changes.
8. Original work only: no names, art, text, ship designs or UI from the games that inspired this one. Third-party assets need a license entry in `docs/assets.md`.
9. Code, comments, docs and commits in English. Player text goes through `apps/game/src/locales/` (English source, `pt-BR` translation).
10. Commits use the studio format in `.gitmessage`: `[TAG] area: short description`, with the reason in the body.
11. If a rule in the docs proves wrong in practice, implement the simplest alternative that keeps the pillars, record it in `docs/DECISIONS.md` and continue.

## Invariants (each has a test)

- With no force, velocity is preserved bit for bit.
- Turning alone never changes the velocity vector.
- More mass (cargo, fuel) means less linear and angular acceleration for the same thrust.
- An empty tank produces no thrust.
- Flight assist and the brake stop the ship by burning fuel through thrusters.
- The same commands from the same state give the same result, bit for bit.
- A ship cannot tunnel through a rock at any speed it can reach.
- Collisions conserve momentum between movable bodies; static bodies never move.
- Hull damage is zero at or below the safe impact speed and grows with impact energy above it.
- The same sector seed produces the same asteroid field, with no overlaps and clear zones respected.
- Weapon damage goes shield → armour → hull; a ship never damages itself.
- Rounds and beams are blocked by rocks and the station.
- AI ships never change velocity faster than their engines allow.
- The hold never exceeds its mass or volume limit, and its mass is part of the ship's mass.
- Ore is conserved: what leaves a rock arrives as chunks, and what a tractor collects leaves the chunk.
- Trades are atomic: goods and credits move together or not at all; credits never go negative.
- A docked ship does not move, fire or take damage.
- A contract pays once: it leaves the active list when it completes, fails or is abandoned.
- Save → load → save gives identical data; damaged files and files from newer versions are refused with a reason.
- When the save format changes, bump `SAVE_VERSION` and add a migration; never edit old saves in place.
- Jumping preserves the player, credits, contracts and clock; leaving and re-entering a sector preserves what was mined and traded there.
- Every gate has a matching gate on the far side (checked at load).
- Subsystem damage comes only from hull damage at a position; health stays within 0..1 and engines never give less than 35% thrust.
- A ship never holds more modules of a kind than it has slots.
- Station markets are the economy's objects: never copy them into a sector; a hauler's cargo leaves one market and reaches the other, or is lost.
- Owned ships are the fleet's `PlayerState` records: a ship is boarded or sold only at the station where it is parked, and exactly one fleet entry is flying.
- A weapon mount only takes weapons of its trigger group (`weaponGroup`); stored ships carry their fit in `loadout`.
- Campaign steps use objectives the game already has; a new objective kind needs schema, `campaign.ts`, locale strings and a test that plays through it.
- A fleet ship exists as an entity only in the simulated sector; elsewhere it is route state. Call `stowFleet` (or capture its state) before a world is dropped, and never keep fleet entity ids across worlds.

## Commands

```bash
pnpm install
pnpm dev          # browser build at http://localhost:5173
pnpm check        # typecheck + lint + unit tests
pnpm e2e          # Playwright flight tests (starts its own dev server)
pnpm build        # production web build in apps/game/dist
```
