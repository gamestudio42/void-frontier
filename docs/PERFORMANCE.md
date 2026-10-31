# Performance

Measured on 2026-10-30 on a laptop's integrated Intel UHD (Raptor Lake-P), in Chrome through ANGLE and OpenGL, with other applications open. The scene is a heavy one: the player firing at every pirate in the sector, next to a dense asteroid field. Each figure is frames per second over 8 seconds.

| Resolution | High | Medium | Low |
| --- | --- | --- | --- |
| 1920x1080 | 47 to 51 | 55 to 59 | 59 to 60 |
| 1280x720 | 60 | 60 | 60 |

- The 720p and the 1080p rows were measured in separate runs, and only 720p had four fleet ships in the scene.
- Automatic quality steps down after 3 seconds under 45 fps.
- A simulation step costs about 0.4 ms at 60 fps on this machine.
- Medium was as slow as high on a 1x screen until 0.7.1, when it gained half-resolution bloom and a 0.85 resolution cap.


## 0.95 measurements (2026-10-30)

Same chip, on an otherwise idle machine, at 1920x1080. Twenty ships in a fight beside a 620-rock sector, measured with a development build.

| Measure | Result | Spec target |
| --- | --- | --- |
| Frame rate, high, medium and low | 60 fps | 60 |
| Active ships | 20 | 20 |
| Rocks in the sector | 620 | 500 visible |
| Rounds in flight, natural fight | 47 at peak | 200 |
| Rounds injected on purpose, 98 to 210 in flight, high quality | 52 fps with other work running | 200 at 60 fps (not shown) |
| JavaScript heap | 43 to 54 MB | Under 1 GB |
| Load to main menu, production build from localhost | 354 to 549 ms | Under 10 s |

Load time excludes the network. The earlier table above was taken with other applications open, which is why high is slower there.

## 0.96 measurement (2026-10-30)

Same chip, 1920x1080, high quality, inside the Graveyard with its giant hulks and other work running: 46 fps at about 107 draw calls, before the giants were lowered and scaled down. Automatic quality steps down below 45 fps.

## Other hardware and browsers (2026-10-30)

At 1920x1080, development build, 6 seconds each.

| Setup | Scene | Quality | Frame rate |
| --- | --- | --- | --- |
| Chrome, NVIDIA RTX 4050 Laptop | 20 ships fighting | High | 60 fps |
| Firefox | Outpost, just undocked | High | 37 fps, then 57 fps on a quieter machine |
| Firefox | Outpost, just undocked | Medium | 52 fps |
| Firefox | Outpost, just undocked | Low | 57 fps |

- Firefox hides the real graphics chip, reporting "Intel HD Graphics, or similar", so which GPU it used is unconfirmed. The screens were checked and looked right, with no page errors.
- Medium scoring under high and low in Firefox is measurement noise from one short run on each.

## Not measured

Safari: WebKit needs system packages not installed here, and Playwright's WebKit would still not be Safari. Windows, macOS and phones.
