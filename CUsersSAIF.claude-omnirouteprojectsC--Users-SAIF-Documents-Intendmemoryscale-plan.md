---
name: titan-scale-spatial-expansion
description: Expanding interior district + wall + Titan cinematic sightlines (Scale Phase follow-up)
metadata:
  type: project
---

Report (read-only, pre-implementation):

1. Spawn: SPAWN = {-16, 0, 0}, yaw=0 (faces -Z, toward wall at z=-24)
2. Houses: buildShinganshina grid at x=-23..21, z=-19..9 (12x8), 96 houses, 42% overlap resolved by grid
3. Avg spacing: ~4 units (3w + 1w street) — too tight for large-scale viewing
4. District: ~44x28 units — needs ~60x40 for cinematic scope
5. Wall: zMin=-24, zMax=16, x=-30..30, height 28 (stage 1 complete)
6. Wall-to-town: ~4-6 units (close — need wider open corridor)
7. Titan: (0,0,-28), rises behind wall, head at y55 above wall top 28
8. Titan direction: approaches +z (toward wall/player)
9. Camera: followDist 3.6, heightOffset 2.0 — too close/low for large scene
10. New district: wider streets (6-unit spacing), open central corridor toward wall, fewer houses (~60-72), keep landmarks
11. House spacing: 5-unit period (3w + 2w street) with open zones
12. Titan/player/wall alignment: spawn (-16,0) → wall center (0,-24) → Titan (0,-28) — same z-axis, clear sightline

Proposed structural changes (stages):
A. Redesign buildShinganshina() — wider spacing, open corridors, ~60-72 houses, keep landmarks/canals/trees
B. Camera: followDist 5.2 (from 3.6), heightOffset 2.4 (from 2.0) — wider view
D. Spawn yaw: keep 0 (already faces wall)
F. Verify: server running, open browser, scroll enter, observe

Constraints preserved: frozen env (grid/terrain/arch), single layer, spawn fixed, no overlap.
