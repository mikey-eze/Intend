
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

**2026-10-02 — Scroll reliability, Earth approach, and collision rewrite**

Journey (`script.js`):

- **Root cause of "one wheel → instant Earth":** `MAX_TARGET_RATE` was `0.00105` per millisecond, so `journeyTarget` chased raw scroll at ~0.063/sec and a single wheel flick traversed the whole journey in ~950 ms. Reduced to `0.000085`; the 0 → 1 journey now takes **≥ 11.8 s** no matter how violent the input.
- **Renamed** `target`/`current` → `journeyTarget`/`journeyCurrent` to make the pipeline explicit: native scroll → rate-limited target → per-section smoothed current → stage progress.
- **Removed all idle-time progression.** The old `galaxyIdleScale` and `earthIdleZoom` grew the galaxy/Earth on `elapsedTime`, so the scene kept flying forward with no input. Every visual is now a pure function of `journeyCurrent`.
- **Per-section damping** replaces one global value: galaxy `2.2` (cinematic), reveal `4.0`, approach `7.5` (responsive, so the Earth approach feels faster than the galaxy), world entry `3.0`. Verified identical at 60/120/144 Hz.
- **Earth is a real approach.** Scale is exponential from `0.12` (small, far) to `5.5` (fills view) across playhead `0.63 → 0.90`, so it is visibly small when first revealed and does not reach full size until the end of its window.
- **One-way lock is real, not cosmetic.** `lockWorld()` pins `scrollY` and the scroll handler forces it back. Deliberately avoided `overflow:hidden`, which would remove the scrollbar, widen the layout ~15 px and resize the canvas on the exact frame of world entry.
- Space layers are hidden and the `rAF` chain stops on lock, so the star canvas stops burning frames.

Collision (`voxel-world.js`):

- **`checkWallCollision()` was a no-op** — it computed wall distances inside an empty `if` body and did nothing, so the player walked through everything. Replaced with AABB-vs-`solidSet` resolution (`boxHitsSolid`, `groundBelow`, `resolveHorizontal`) on one axis at a time, so the player slides along walls instead of sticking.
- **The wall was porous.** It was built with `x += 2`, leaving a 1-block gap at every odd coordinate; the 0.64-wide player box fit straight through. Now stepped by 1, with corner bastions, mid-wall watchtowers, and a hard `clampToDistrict()` interior bound.
- **Step-up let the player climb tree trunks.** The 1-block step-over escape hatch applied to any block, so a grounded player stepped onto a 1-block trunk and walked over it. Added `noStepSet`: trunks, wall and houses are marked un-steppable, terrain is not.
- **Step-up lift is now exact** (`groundBelow` of the target surface) rather than a flat `+1.0`, which previously left the player half a block below the plateau where the next ground sweep pulled them back down.
- **Gravity no longer gated on pointer lock.** `updatePlayer` returned early when unlocked, so the player hung in mid-air during the cinematic and after ESC. Only *input* is gated now.
- `unstickFromSolid()` on spawn; fall-out-of-world recovery below y = −12.
- Removed dead `clampToWorld` and the malformed comment banner above it.

Verified with a headless harness (since removed) that rebuilt the world and re-ran the collision code: 14/14 checks — wall blocks all four sides, houses and trunks block passage, zero solid penetration across 16 patrol directions, jump rises and lands, idle player does not drift or sink, and all 8 key district locations are reachable on foot.
