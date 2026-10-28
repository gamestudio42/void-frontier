# Profile: web-game

Use this profile at the root of a React game client.

## Detection signals

- `package.json` lists `react` in dependencies, devDependencies, or
  peerDependencies

## What to read in the live tree

1. `package.json` scripts, especially `build`
2. The bundler config that sets `base` or the public path
3. README deploy notes (ZIP layout, `game_id`, host URL)
4. The game loop or store, and the screen you will change
5. The host contract if this repo documents the GameStudio42 game server

## Write locations

- Game rules and presentation stay in the client source.
- Build output and `node_modules` are not source. Do not commit them
  unless the repository already tracks a deliberate publish folder.

## Validation

Run the project's build. The artifact must contain `index.html` at its
root and must load under the published base path.
`gs42-standards validate --profile web-game` checks that `package.json`
has a `build` script. It does not run the build.
