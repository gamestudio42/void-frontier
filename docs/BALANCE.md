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

## What changed because of this

Hand mining was paying for every hull within minutes, so hull prices went up instead of cutting the lasers, which would change how mining feels:

| Hull | 0.6 price (cr) | 0.7 price (cr) |
| --- | --- | --- |
| Kestrel | 6,000 | 8,000 |
| Mule | 9,500 | 15,000 |
| Prospector | 11,000 | 25,000 |
| Lancer | 14,500 | 30,000 |

The whole campaign pays 12,000 cr.

## Still open

- Whether hand mining is still too rich needs real play; the script is only a ceiling.
