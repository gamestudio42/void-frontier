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

## Not measured

Dedicated graphics cards, Windows, macOS, Firefox, Safari and phones. The laptop's RTX 4050 could not be reached from a headless browser.
