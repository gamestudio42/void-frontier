# Balance

Measured on 2026-10-30 with the 0.7 numbers. Re-measure after changing lasers, prices, wages or markets.

## Income per hour, mining

| Hull | Field | Flown (cr/h) | Average hired pilot (cr/h) |
| --- | --- | --- | --- |
| Kestrel | Copper Reach | 17,235 | 175 |
| Prospector | Copper Reach | 27,653 | 3,165 |
| Prospector | Mid Belt | 66,195 | 11,270 |

- **Flown** is an upper bound. A script mines, flies back at 55 m/s and sells for 8 game minutes from a fresh market, with no pirates, no scanning and no crash ever ending the run. A person will earn less, and prices fall as a market fills. No human play was measured.
- **Hired pilot** is one game hour off-screen, net of wages and the 25% commission. A single run can end early if the ship is lost.
- `packages/simulation/test/balance.test.ts` keeps flown above hired for a Prospector at Copper Reach. `crew.test.ts` keeps the hired belt figure under 14,500 cr/h.

### Fracture mining (0.97)

One game minute of a Kestrel cutting a 30 m ferrous rock with an unlimited hold, against the old flat 6 units/s (360 per minute). A first pass with 1.8× vein and 1.6× sweet spot gave 760 units pulsing on the vein (2.1×), so they were cut to the shipped 1.5× and 1.4×:

| Play (shipped numbers) | Units per minute | Against the old 360 |
| --- | --- | --- |
| Pulsing in the sweet spot, on the vein | 560 | 1.56× |
| Pulsing, off the vein | 264 | 0.73× |
| Holding the trigger, on the vein | 72 | 0.20× |
| Holding the trigger, off the vein | 116 | 0.32× |

Holding the trigger cracks the rock and the script does not chase the fragments, so those rows are a floor, not what a player who retargets would get.

The flown figures in the table above were not measured again: the 6 t hold, not the laser, limits a Kestrel's trip, so its cr/h moves less than the cutting rate. Re-measure them with the hand-mining script when the rest of Phase 2 changes prices.

## What changed because of this

Hand mining was paying for every hull within minutes, so hull prices went up instead of cutting the lasers, which would change how mining feels:

| Hull | 0.6 price (cr) | 0.7 price (cr) |
| --- | --- | --- |
| Kestrel | 6,000 | 8,000 |
| Mule | 9,500 | 15,000 |
| Prospector | 11,000 | 25,000 |
| Lancer | 14,500 | 30,000 |

The whole campaign pays 39,200 cr on the justice route and 49,200 cr on the deal route.

## Still open

- Whether hand mining is still too rich needs real play; the script is only a ceiling.

## The Dreadmaw, by scripted duel

Scripted pilots circle and fire everything they have; a person can do better and worse. Figures are from three seeds before the final reinforcement (hull 4,200, shield 1,200): the flagship now has hull 6,500 and shield 1,800, so fights run longer. Re-measure after any change.

| Attacker | Result |
| --- | --- |
| Kestrel or Lancer alone | Loses in 15 to 23 s |
| Bulwark alone | Wins in 27 to 29 s |
| Kestrel with two wingmen | Wins in 13 s |
| Lancer or Bulwark with two wingmen | Wins in 9 to 10 s |
