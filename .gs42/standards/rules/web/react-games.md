# React games

The web client is a game that happens to render with React. Simulation
state does not live in render state.

## Read first

- `package.json` scripts and the bundler config (`vite.config`,
  `webpack.config`, or equivalent)
- The existing game loop, store, or scene module
- How the current build addresses assets (relative paths or a `base`)

## Rules

- Follow the component and folder layout already in the repository.
- Keep simulation (positions, resources, timers, rules) outside React
  render. React reflects that state. Do not advance the rules inside
  render or in an effect that runs because the parent re-rendered.
- Player input goes through the project's input path. Do not bind a
  second global key listener beside the one the game already owns.
- No secrets, admin tokens, or private API hosts in client code. The
  bundle is public.
- Dependencies: prefer what `package.json` already has. Do not add a
  state library, physics library, or UI kit for one screen.
- Player-facing strings stay in the project's i18n source. English is
  the source language unless the repository says otherwise.
- Deterministic replays, seeds, or daily challenges use the project's
  existing RNG. Do not call `Math.random` in a system that the design
  treats as replayable.

## Scope

A feature lands in the scene that plays it. Do not rebuild the shell,
router, or menu chrome unless the task is about that chrome.
