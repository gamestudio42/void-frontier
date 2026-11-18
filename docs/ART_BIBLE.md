# Art bible

How Void Frontier looks, and why. This is the reference for every model, texture, effect
and colour choice; when the code and this page disagree, fix one of them. Numbers here
come from the content and the renderer as they are today.

## Pillars

1. **Hard, worn, industrial.** Ships are tools that have been repaired more times than
   painted. Flat facets, plating seams, exposed tanks and radiators. No chrome, no organic
   curves, no glow for its own sake.
2. **Read at a glance from above.** The camera looks down from far away. Every ship must be
   recognisable by silhouette and engine glow alone at 30 px long; faction comes from
   colour, role from shape.
3. **Light tells you what matters.** Emissive colour is information: engines, weapons,
   danger, loot. If something glows, the player should be able to say why.
4. **Every sector has its own weather.** A sector is identified by its sky tint, sun, planet
   and grade before any label is read.

## Palette

### Base (`packages/view3d/src/palette.ts`)

| Role | Hex | Use |
|---|---|---|
| Space | `#05070b` | Clear colour behind the nebula |
| Hull | `#8a8f94` | Default unpainted plating |
| Hull dark | `#3a3f45` | Structure, recesses, pylons |
| Hull accent | `#c8892c` | Hazard trim, amber paint |
| Panel | `#5d646b` | Plates and covers |
| Window | `#9fe4ff` | Lit glass |

### Factions

Each faction owns one hue for UI, markers, shields and paint accents. Everything else on
its ships stays in the base hull greys.

| Faction | Hue | Hex | Shape language |
|---|---|---|---|
| Outpost Authority (the player's home) | Cyan | `#6fd3ff` | Tidy, symmetric, white-grey panels with cyan glass |
| Ferrum Combine | Ochre | `#e0b24a` | Heavy, boxy, tanks and gantries, soot-dark, amber work lights |
| Frontier Guard | Sage | `#8fd18a` | Modular and clean, repeated blocks, sensor masts |
| Free Pirates | Red | `#ff5a4a` | Angular, asymmetric, patched plates, rust, red running lights |
| Haulers (any lawful) | Green | `#7dffb2` | Long and slow: spine, containers, big engines |

### Emissive language

| Glow | Colour | Meaning |
|---|---|---|
| Engine core / plume | `#bfe8ff` / `#4aa8ff` | Main engine burn |
| RCS | `#d8f2ff` | Manoeuvring thrusters |
| Boost | `#ff9a3c` | Afterburner, and the dash verb |
| Player tracers | warm white-gold | Own fire |
| Pirate tracers and beams | red-orange | Hostile fire |
| Micrometeors | dull amber | Hazard, nobody's fire |
| Mining laser | amber-gold | Cutting rock |
| Shields | faction hue (player cyan, pirate orange) | Shield bubble and hit ripples |
| Elite | violet `#ff5fd2` | Elite pirate shield and marker |
| Boss | gold | Boss shield, lair marker, bar |
| Loot | the resource colour | Floating ore and salvage |

Red is reserved for danger: hostile fire, hull damage, warnings. Do not use it for
decoration on lawful ships.

## Shape and scale

- Nose on +X in model space, keel on the flight plane; the renderer scales each mesh to
  `hull.length` from `ships.json`. The collision circle stays in the content.
- Silhouettes by role: interceptors are deltas and darts; gunships are wide with forward
  mass; haulers are long spines; capital ships are stepped decks with turrets.
- Greebles go on the top surface, which is what the camera sees. The underside can be
  plain.
- Sizes: Jackal 14 m, Lancer 15 m, Kestrel 16 m, Prospector 20 m, Marauder, Bulwark and
  Dreadmaw 22 m, Mule and Magpie 26 m; bosses are drawn at ×1.5. Stations span 280 to 610 m
  across; giants below the plane are kilometres.

## Materials

PBR, metal-roughness. Keep within these ranges so ships sit together under one sun.

| Surface | Roughness | Metalness |
|---|---|---|
| Painted plating | 0.65-0.8 | 0.15-0.3 |
| Bare metal, trusses | 0.45-0.6 | 0.6-0.8 |
| Rubber, ceramics, radiators | 0.85-1 | 0 |
| Glass (emissive) | 0.1 | 0 |

Occlusion is baked into the albedo; roughness and metal live in the ORM map (G and B).
Emissive goes in its own glow map so bloom picks it up and nothing else.

## Lighting and grade

One directional sun per sector (`look.sun`, `look.sunIntensity`), a cool hemisphere fill
and a low ambient. ACES filmic tone mapping at exposure 1.05, bloom on medium and high.

After tone mapping, each sector's `look.grade` sets its mood: `lift` pushes the shadows
toward a colour, `gain` tints the highlights, then saturation, contrast and a vignette
(`packages/view3d/src/grade.ts`). Keep grades subtle: lift under 0.04, gain within
±10%, so the faction colours and the HUD stay true.

| Sector | Mood | Sky tint | Grade |
|---|---|---|---|
| Outpost Alpha | Safe harbour: clear, blue, neutral | Blue | Cool shadows, near-neutral |
| Industrial Belt | Working sky: smog and furnace light | Brown-amber | Warm shadows, less saturation, more contrast |
| Pirate Territory | Hostile: blood-red haze | Red | Red shadows, punchy contrast, heavy vignette |
| Anomaly Zone | Wrong physics: violet glow | Violet | Violet shadows, more saturation |
| Graveyard | Dead and cold | Grey-blue | Desaturated (0.7), cold, heaviest vignette |
| Ember Reach | Near a hot star: orange and harsh | Orange | Warm shadows, cut blue in the highlights |

## Planets

Every sector has a gas giant far below the flight plane (`environment.planet`,
`packages/view3d/src/planet.ts`). It is scenery that gives scale and parallax, never an
obstacle.

- Surface: a latitude profile of 14 colours around the sector's hue, bent by turbulence,
  with storm ovals and darker poles, generated from the seed at 1024×512.
- Cloud deck: a second shell 0.8% larger, an alpha map of streaks covering `clouds` of the
  planet, turning faster than the surface.
- Atmosphere: a shell 5% larger with a Fresnel rim in the `atmosphere` colour, bright only
  on the sunlit side.
- Rings: optional, in planet radii, with lanes and gaps (Industrial Belt and Anomaly Zone
  have them).

## Stations

Stations are built from their data layout (core, ring, truss, panel, tank, dock), so what
is drawn is what the colliders describe. The docking bay keeps the collider volumes (two
side walls and a back wall, open at the mouth and on top so the camera sees in) and dresses
them: ribs on the inner walls with light panels in the faction's colour and warm work
lights under them, a deck painted with a landing circle, a centre cross and chevrons
pointing in, light strips along the deck edges, clamps either side of the pad, gantry
beams across the top, a lit control gallery, a crane and cargo at the back, and hazard
posts with amber beacons at the mouth. The approach runway of chasing green lights stays.
Two point lights per bay (faction-tinted overhead, warm at the back) are the budget.

## Asteroids

Rocks are noise-displaced icospheres with craters and mineral veins in the vertex colours,
one instanced mesh per type and shape. In the shader, a procedural bump in the rock's own
space adds fine relief at close range (no textures, no UVs; medium and high quality), and the vein mask glows in the
type's vein colour while the scanner's reading of that rock lasts: it pulses, then fades
over its last three seconds. That glow is the in-world answer to "what does this rock
hold", next to the label and the radar colour.

## Effects

- Hits: a bright flash at the impact, sparks thrown along the surface; shield hits ripple
  the bubble at the contact point.
- Kills: a staged explosion with debris and a shock ring; the presentation freezes for a
  beat (the simulation never does).
- Bosses with their guard open vent sparks; that is the cue to fire.
- Incidents: meteors are short amber streaks; a solar flare washes the screen warm; a
  reactor blast is the biggest explosion and ring in the game.

## UI

Dark translucent panels, amber (`#ffb347`) for labels and money, cyan (`#6fd3ff`) for the
player's own state, green (`#7dffb2`) for good and ready, red (`#ff6b5a`) for danger. Mono
for numbers. Panels stay out of the centre of the screen, where the ship is.

## Pipeline

Studio meshes come from `gamestudio42/assets/naves`: Blockbench mesh, atlas with a trim
sheet, ORM and glow, AO baked in Blender. The game keeps only the bake
(`packages/view3d/assets/<ship>/`: `hull.json`, `atlas.png`, `orm.png`, `glow.png`); see
`docs/assets.md` and decision 064. Atlases are 512 px for small and medium ships and 1024
for capital ships.

## Still to do

The art pass is split in parts; this page covers the whole of it.

1. Done: this bible, planets with atmosphere, clouds and rings, and a grade per sector.
2. Done: studio meshes for the five hulls that were procedural: Jackal, Mule, Prospector, Lancer, Magpie.
3. Done: a lit docking bay in every station, in its faction's colour (see Stations).
4. Done: asteroids with fine surface relief and veins that glow in the ore's colour while a scan reading lasts (see Asteroids).
