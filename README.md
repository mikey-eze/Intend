# SAIF.OS — A Cinematic Web-Based World

**SAIF.OS** is a personal, browser-based interactive experience that turns a scrolling landing page into a journey through space, toward Earth, and into a third-person voxel world inspired by *Attack on Titan*'s Shiganshina.

Rather than presenting everything at once, the experience reveals itself in stages: begin in space, travel through a galaxy, approach Earth, and cross into the world below.

> **Project status:** Experimental prototype in active development. The cinematic journey and local third-person world are the core of the project; environment-building and gameplay systems are still being iterated on.

## The idea

Most portfolio pages ask you to click through sections. SAIF.OS is designed as a small interactive journey:

1. **SPACE** — the opening scene establishes scale and atmosphere.
2. **GALAXY** — the view moves into a wider cosmic setting.
3. **EARTH APPROACH** — Earth comes into focus through a staged zoom.
4. **SHIGANSHINA WORLD** — the experience transitions into a Three.js voxel scene with third-person controls.

Scrolling is rate-limited to keep the sequence cinematic rather than letting one large scroll jump straight to the end. Entering the world is intended to be a one-way transition for the current session.

## Features

- **Scroll-driven cinematic:** a staged SPACE → GALAXY → EARTH → WORLD progression.
- **Earth approach sequence:** a dedicated approach phase before world entry.
- **3D voxel world:** a browser-rendered scene powered by Three.js.
- **Third-person controls:** movement, sprinting, jumping, and mouse camera.
- **Attack on Titan-inspired direction:** Shiganshina as the setting, with an Eren-inspired player concept, companion characters, and a Colossal Titan event planned as part of the experience.
- **No framework-heavy app shell:** built primarily with HTML, CSS, and JavaScript.

The project is being developed incrementally. Details of the world, character behavior, collision, and cinematic events may change as the prototype evolves.

## Run locally

Because the project loads JavaScript ES modules, open it through a local HTTP server instead of double-clicking `index.html` as a `file://` URL. Direct file loading can cause browser module/CORS errors.

### Option A: Python

From the project directory, run:

```bash
python -m http.server 8123
```

Then open:

**http://127.0.0.1:8123/index.html**

Keep the terminal running while testing.

### Option B: VS Code Live Server

Open the project folder in VS Code, start the Live Server extension on `index.html`, and use the local HTTP URL it provides.

Three.js is loaded as an ES module from jsDelivr, so the browser needs an internet connection for that dependency unless you change the project to serve it locally.

## Controls

Once the 3D world is active:

| Input | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint |
| `Space` | Jump |
| Mouse | Rotate the camera |
| Click inside the game | Capture the mouse |
| `Esc` | Release the mouse |

Controls become relevant after the cinematic transitions into the game.

## Project structure

| File or folder | Purpose |
|---|---|
| `index.html` | Main page and scene markup |
| `style.css` | Page styling and cinematic presentation |
| `script.js` | Scroll journey and page interaction |
| `voxel-world.js` | Three.js world, player, and world-side gameplay logic |
| `assets/` | Visual assets used by the experience |
| `inspo/` | Visual references for world-building |

The repository also includes diagnostic scripts and captured screenshots from development. These are useful for debugging, but are not required to understand the main experience.

## Development principles

- **Build in stages.** Keep the cinematic journey stable while iterating on the 3D environment.
- **Prefer small, verifiable changes.** Avoid rewriting working systems to fix a local issue.
- **Test over HTTP.** Module loading should be checked from a local web server, not a `file://` page.
- **Be honest about prototype status.** Screenshots and successful syntax checks are not substitutes for testing the actual in-browser experience.

## Roadmap

- [ ] Rebuild the Shiganshina environment in deliberate stages, starting from a clean foundation.
- [ ] Establish terrain, scale, and a readable Wall Maria silhouette.
- [ ] Add a coherent town layout, roads, houses, and environmental detail.
- [ ] Refine collision and safe player spawn placement.
- [ ] Improve the timing and visual clarity of the Colossal Titan event.
- [ ] Capture current, representative screenshots of each stage of the journey.
- [ ] Separate temporary diagnostics from the main source files.

Roadmap items are goals, not claims that the work is already finished.

## Inspiration and credits

SAIF.OS is an independent, fan-inspired experiment drawing visual inspiration from *Attack on Titan* and its Shiganshina setting. It is not an official game or affiliated with the rights holders.

- [Three.js](https://threejs.org/) — 3D rendering library
- [jsDelivr](https://www.jsdelivr.com/) — CDN used for the Three.js module

## License

No license has been specified yet. Until a license is added, assume that standard copyright applies to this repository and that reuse is not automatically granted.
