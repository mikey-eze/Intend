# SAIF.OS — Project Memory Diary

**Project:** SAIF.OS v9 — an animated, retro-terminal entry landing page for the IntendOS project.

**Location:** `C:\Users\SAIF\Documents\Intend\`

## Files

| File | Role |
|---|---|
| `index.html` | Entry point — `<canvas id="space-dust">`, galaxy/Earth images, old terminal UI, new Earth UI, CRT overlay |
| `style.css` | Starfield/CRT aesthetics (VT323 font), fixed scene, galaxy fade → Earth reveal sequence, media queries |
| `script.js` | Forward-depth star dust animation (streaks + twinkle), scroll-driven galaxy scale/fade and Earth growth, resize handler |
| `assets/galaxy.jpg` | 500×500 — spiral galaxy (blend mode `screen`) |
| `assets/earth-new.png` | 480×480 — pixel Earth |
| `README.txt` | Notes the star movement is borrowed from the original IntendOS upload |
| `CLAUDE.md` | This diary — design decisions, fixes, and session log |

## Entry Animation Sequence (scroll-driven)

1. **0–58%** — Galaxy slowly scales up from 0.72, distant + forward star dust streaks move toward camera.
2. **55–73%** — Galaxy fades out.
3. **70–88%** — Earth reveals (opacity) and starts growing from scale 1.
4. **82–96%** — `EARTH // 001 // CONNECTION ESTABLISHED` UI appears.

## Session Log

**2026-10-02 — Fixed "unven parts" (uneven/duplicate CSS + misaligned elements)**

CSS (`style.css`):

- **Duplicate `body` block** (lines 5–17) merged into one rule.
- **Duplicate `.earth` definition** (lines 201–221) removed. The `.stars-far/.stars-near/.stars-fast { display: none !important; }` block was left intact (those canvas-based star layers are hidden by design; the star movement is now handled by the canvas).
- **Viewport fit**: `html, body` `min-height` from `240vh` → `100vh`, so the `position: fixed; inset: 0` scene fills the viewport evenly instead of floating against a 2.4× taller page.
- **Alignment**: `top: 53%` → `top: 50%` on `.earth` so it shares the galaxy's center axis; size `min(30vw, 440px)` → `min(44vw, 640px)` so Earth scales proportionally to the galaxy on wide screens. Mobile media query preserved (`110vw` galaxy, `60vw` Earth, smaller fonts).

## Known state / next ideas

- No scroll-jacking: `wheel` is passive; smooth interpolation is done in JS easing.
- CRT scanline overlay at `z-index: 20`, full viewport, 8% opacity, with inset vignette.
- Images: galaxy is JPG (500×500), Earth PNG (480×480) — both fine.
- Possible future: touch-drag to "enter" on mobile, replace fixed `min-height` with actual scrollable content sections.
