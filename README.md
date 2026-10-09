# SAIF.OS — A Cinematic Journey Into a 3D World

**A small web experiment that turns a landing page into a journey through space and into a third-person voxel world.**

SAIF.OS is an interactive browser experience built with HTML, CSS, JavaScript, and Three.js. Scroll through a cinematic sequence—from deep space, across a galaxy, toward Earth, and finally into a world inspired by Shiganshina from *Attack on Titan*.

> **Status:** Experimental prototype in active development. Screenshots below are development captures and may not reflect the current state of every scene. The Shiganshina environment is being rebuilt in stages.

## Preview

| SPACE | GALAXY |
|---|---|
| ![SAIF.OS space opening](https://raw.githubusercontent.com/mikey-eze/Intend/main/_shot_1_space.png) | ![SAIF.OS galaxy scene](https://raw.githubusercontent.com/mikey-eze/Intend/main/_shot_2_galaxy.png) |

| EARTH APPROACH | WORLD TRANSITION |
|---|---|
| ![Earth from a distance](https://raw.githubusercontent.com/mikey-eze/Intend/main/_shot_3_earth_far.png) | ![Earth close-up](https://raw.githubusercontent.com/mikey-eze/Intend/main/_shot_4_earth_near.png) |

![SAIF.OS world scene development capture](https://raw.githubusercontent.com/mikey-eze/Intend/main/_shot_5_world.png)

## What we're building

The goal is to make the page feel like a continuous, playable journey instead of a conventional portfolio.

1. **SPACE** — begin with a quiet, atmospheric view of space.
2. **GALAXY** — travel into a wider cosmic scene.
3. **EARTH APPROACH** — zoom toward Earth in a distinct cinematic stage.
4. **SHIGANSHINA WORLD** — transition into a browser-rendered 3D voxel environment.

The world is inspired by the architecture and atmosphere of Shiganshina. The longer-term direction includes a dense town, a massive outer wall, environmental details, third-person exploration, companion characters, and a Colossal Titan event. These elements are a work in progress, not a claim that every feature is complete.

## Current features

- Scroll-driven, multi-stage cinematic sequence.
- Rate-limited scrolling to help prevent skipping through the journey.
- Dedicated Earth approach before the world transition.
- Three.js-powered 3D scene.
- Third-person movement, sprinting, jumping, and mouse camera controls.
- Primarily plain HTML, CSS, and JavaScript—without a large frontend framework.

## Run locally

You need **Node.js or Python** for a local server, plus an internet connection for the Three.js module currently loaded from jsDelivr.

### 1. Get the project

Clone the repository:

```bash
git clone https://github.com/mikey-eze/Intend.git
cd Intend
```

Or download the ZIP from GitHub and extract it.

### 2. Start a local web server

**Option A — Python (simple and recommended if Python is installed):**

```bash
python -m http.server 8123
```

On Windows, if `python` isn't recognized, try:

```cmd
py -m http.server 8123
```

**Option B — Node.js:**

If you have Node.js installed, you can use this command:

```bash
npx serve .
```

Follow the local URL printed by the command.

**Option C — VS Code Live Server:**

1. Open the extracted `Intend` folder in VS Code.
2. Install the **Live Server** extension if needed.
3. Right-click `index.html` and choose **Open with Live Server**.

### 3. Open the experience

For the Python server, visit:

**http://127.0.0.1:8123/index.html**

Keep the terminal running while using the page. Stop the server with `Ctrl + C`.

**Important:** Don't open `index.html` by double-clicking it. The project uses JavaScript modules, which can fail to load correctly from a `file://` URL.

## Controls

After the world becomes active:

| Input | Action |
|---|---|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint |
| `Space` | Jump |
| Mouse | Rotate the camera |
| Click inside the game | Capture the mouse |
| `Esc` | Release the mouse |

## Project map

| Path | Purpose |
|---|---|
| `index.html` | Main page markup |
| `style.css` | Layout and visual styling |
| `script.js` | Scroll journey and page interactions |
| `voxel-world.js` | Three.js scene, player, and world-side logic |
| `assets/` | Images and other visual assets |
| `inspo/` | Environment reference images |

The repository also contains development diagnostics and captured screenshots from debugging. Those files document the build process; they aren't all required to run the experience.

## Roadmap

- [ ] Rebuild the Shiganshina environment from a clean foundation.
- [ ] Establish terrain scale and a clear Wall Maria silhouette.
- [ ] Create a coherent town layout with streets and buildings.
- [ ] Add water, bridges, trees, and environmental details.
- [ ] Refine the spawn point, collision, and exploration feel.
- [ ] Polish the Titan event and cinematic timing.
- [ ] Replace older development captures with fresh screenshots as the world evolves.
- [ ] Separate temporary debugging artifacts from the core source files.

## Development approach

The project is built in small stages so the working cinematic journey can be preserved while the world is improved. Changes should be tested through a local HTTP server, and browser behavior should be verified separately from syntax checks.

## Credits

- [Three.js](https://threejs.org/) — 3D rendering
- [jsDelivr](https://www.jsdelivr.com/) — CDN for the current Three.js module

SAIF.OS is an independent fan-inspired project. It is not affiliated with or endorsed by the creators or rights holders of *Attack on Titan*.

## License

No license has been added yet. Until one is chosen, standard copyright applies and reuse is not automatically permitted.
