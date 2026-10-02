/*
 * script.js — SAIF.OS space journey controller
 *
 * Master journey: current = 0 → 1 over 400vh of page height.
 *
 *   0.00 – 0.50  SPACE / GALAXY APPROACH
 *                Galaxy idles + slowly grows even without scrolling.
 *                Stars rush toward camera. Speed scales with scroll.
 *
 *   0.50 – 0.68  GALAXY ZOOM-THROUGH
 *                Galaxy blows up to fill / exceed the screen.
 *
 *   0.65 – 0.75  GALAXY FADE
 *                Galaxy becomes transparent as you pass through it.
 *
 *   0.72 – 0.82  EARTH REVEAL
 *                Earth fades in from 0 — starts small, far away.
 *
 *   0.80 – 0.96  EARTH APPROACH
 *                Earth grows toward you. Idle + scroll controlled.
 *
 *   0.85 – 1.00  VOXEL WORLD TRANSITION
 *                Earth fills frame → voxel world fades in over it.
 *                (wider band = gentler camera journey)
 */

/* ── DOM refs ─────────────────────────────────────────────────── */
const galaxy  = document.querySelector(".galaxy");
const earth   = document.querySelector(".earth");
const earthUI = document.querySelector(".earth-ui");
const oldUI   = document.querySelector(".old-ui");

const canvas  = document.querySelector("#space-dust");
const context = canvas.getContext("2d");

/* ── Star pools ───────────────────────────────────────────────── */
const stars        = [];   // forward-rushing perspective dust
const distantStars = [];   // static background twinkle

/* ── Time / scroll state ──────────────────────────────────────── */
let width  = 0;
let height = 0;
let lastTime       = performance.now();
let introStartTime = lastTime;

let target  = 0;   // raw scroll progress  [0, 1]
let current = 0;   // smoothed progress    [0, 1]

/* ── Utilities ────────────────────────────────────────────────── */
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

/* Ken Perlin's smootherstep — S-curve between a and b */
function smootherStep(a, b, x) {
    x = clamp((x - a) / (b - a), 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
}

/* ── Star system ──────────────────────────────────────────────── */

/*
 * Stars begin at depth 1 (far) and shrink to 0 (camera).
 * Position is stored as normalised angle + distance so stars
 * originate in an invisible ring around the viewer's direction
 * and fly outward in screen-space as depth decreases — creating
 * the classic forward-travel streak effect.
 */
function resetStar(star, randomDepth = false) {
    const angle    = Math.random() * Math.PI * 2;
    const distance = Math.random() * 1.1 + 0.08;

    star.x = Math.cos(angle) * distance;
    star.y = Math.sin(angle) * distance;

    star.depth = randomDepth
        ? Math.random() * 0.96 + 0.04
        : 1;

    star.size  = Math.random() * 1.7 + 0.35;
    star.speed = Math.random() * 0.00038 + 0.00018;

    star.tone = [
        "#d7eaff",
        "#fff2d0",
        "#b7d6ff",
        "#f3d8bd"
    ][Math.floor(Math.random() * 4)];

    star.twinkle = Math.random() * Math.PI * 2;
}

function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);

    width  = window.innerWidth;
    height = window.innerHeight;

    canvas.width  = width  * ratio;
    canvas.height = height * ratio;

    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    stars.length        = 0;
    distantStars.length = 0;

    /* Distant static background stars */
    for (let i = 0; i < Math.floor((width * height) / 11000); i++) {
        distantStars.push({
            x:     Math.random(),
            y:     Math.random(),
            size:  Math.random() * 0.9 + 0.25,
            phase: Math.random() * Math.PI * 2,
            tone:  ["#7897b2", "#a2b9c9", "#c7bda7"][Math.floor(Math.random() * 3)]
        });
    }

    /* Forward-rushing perspective dust */
    for (let i = 0; i < Math.floor((width * height) / 5200); i++) {
        const star = {};
        resetStar(star, true);
        stars.push(star);
    }
}

function drawDistantStars(time) {
    for (const star of distantStars) {
        const driftX = Math.sin(time / 9000  + star.phase) * 1.5;
        const driftY = Math.cos(time / 11000 + star.phase) * 1;

        context.globalAlpha =
            0.22 + (Math.sin(time / 1600 + star.phase) + 1) * 0.08;

        context.fillStyle = star.tone;
        context.beginPath();
        context.arc(
            star.x * width  + driftX,
            star.y * height + driftY,
            star.size, 0, Math.PI * 2
        );
        context.fill();
    }
    context.globalAlpha = 1;
}

/*
 * Speed factor: base 1× idle, grows to 5× at peak scroll.
 * Capped at 5 (was 8) — prevents warp-speed visuals on fast scroll.
 * Mapped over 0.0–0.70 so the galaxy zoom phase feels intense.
 */
function speedFactor() {
    return 1 + smootherStep(0, 0.70, current) * 4;
}

function drawStars(delta, time) {
    const centerX = width  / 2;
    const centerY = height / 2;

    for (const star of stars) {
        const previousDepth = star.depth;

        star.depth -= star.speed * delta * speedFactor();

        if (star.depth <= 0.035) {
            resetStar(star);
            continue;
        }

        const x  = centerX + (star.x / star.depth)    * width  * 0.44;
        const y  = centerY + (star.y / star.depth)     * height * 0.44;
        const px = centerX + (star.x / previousDepth)  * width  * 0.44;
        const py = centerY + (star.y / previousDepth)  * height * 0.44;

        if (x < -40 || x > width + 40 || y < -40 || y > height + 40) {
            resetStar(star);
            continue;
        }

        const brightness = Math.min(1, 0.24 + (1 - star.depth) * 1.2);
        const twinkle    = 0.84 + Math.sin(time / 700 + star.twinkle) * 0.16;

        context.globalAlpha = brightness * twinkle;
        context.strokeStyle = star.tone;
        context.lineWidth   = Math.max(0.35, star.size * (1.55 - star.depth));

        /* Streak line toward camera */
        context.beginPath();
        context.moveTo(px, py);
        context.lineTo(x,  y);
        context.stroke();

        /* Close-up dot at very low depth */
        if (star.depth < 0.3) {
            context.globalAlpha = brightness * 0.7;
            context.fillStyle   = star.tone;
            context.beginPath();
            context.arc(x, y, star.size * 0.9, 0, Math.PI * 2);
            context.fill();
        }
    }

    context.globalAlpha = 1;
}

/* ── Scroll ───────────────────────────────────────────────────── */
function updateTarget() {
    /*
     * 400vh page → travel distance = 3 viewports of scrollable room.
     * We map the full scrollable range cleanly to [0, 1].
     */
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    target = maxScroll > 0
        ? clamp(window.scrollY / maxScroll, 0, 1)
        : 0;
}

/* ── Render loop ──────────────────────────────────────────────── */

/*
 * Track when the Earth section becomes active so idle timers are
 * correct. Reset to null if the user scrolls back before the
 * reveal threshold — prevents Earth appearing pre-zoomed on re-entry.
 */
let earthEnteredTime = null;

function render(now) {
    const delta = Math.min(40, now - lastTime || 16);
    lastTime = now;

    /* Ease scroll progress — feels like physical inertia */
    current += (target - current) * (1 - Math.exp(-delta * 0.0085));

    /* ── GALAXY ────────────────────────────────────────────────
     *
     * Idle approach: galaxy slowly enlarges even without scrolling.
     * It starts at scale ~0.72 and creeps forward at 0.000012/ms
     * so after 60 s idle it has grown visibly but not alarmingly.
     *
     * Scroll zoom:
     *   0.00–0.50 → gentle approach (scale 1 → ~3)
     *   0.50–0.68 → rapid zoom-through (scale 3 → ~40)
     *
     * Fade:
     *   0.65–0.75 → opacity 1 → 0  (galaxy disappears behind viewer)
     * ───────────────────────────────────────────────────────── */
    const galaxyIdleTime  = Math.max(0, now - introStartTime);
    const galaxyIdleScale = 1 + galaxyIdleTime * 0.000012;

    /* Approach phase 0→0.50 (gentle), zoom-through 0.50→0.68 */
    const galaxyApproach   = smootherStep(0.00, 0.50, current) * 2.5;
    const galaxyZoom       = smootherStep(0.50, 0.68, current) * 37;
    const galaxyScrollZoom = galaxyApproach + galaxyZoom;

    const galaxyScale   = galaxyIdleScale + galaxyScrollZoom;
    const galaxyOpacity = 1 - smootherStep(0.65, 0.75, current);

    galaxy.style.transform = `translate(-50%, -50%) scale(${galaxyScale})`;
    galaxy.style.opacity   = galaxyOpacity;

    /* ── SPACE DUST ───────────────────────────────────────────── */
    context.clearRect(0, 0, width, height);
    drawDistantStars(now);
    drawStars(delta, now);

    /* ── EARTH ─────────────────────────────────────────────────
     *
     * Reveal: opacity 0→1 over 0.72–0.82
     *
     * Scale: Earth appears small (scale 0.15) and grows toward viewer.
     * Two drivers:
     *   • idle drift — starts counting once Earth is revealed
     *   • scroll zoom — smooth push as user scrolls 0.80→0.96
     *
     * earthEnteredTime resets if user scrolls back before 0.72 so
     * the idle zoom restarts correctly on re-entry.
     * ───────────────────────────────────────────────────────── */
    const earthReveal = smootherStep(0.72, 0.82, current);

    if (earthReveal > 0 && earthEnteredTime === null) {
        /* Earth section entered — start the idle clock */
        earthEnteredTime = now;
    } else if (earthReveal <= 0 && earthEnteredTime !== null) {
        /* User scrolled back before the reveal — reset so idle
           zoom doesn't pre-load next time they scroll forward */
        earthEnteredTime = null;
    }

    /* Idle growth — starts at 0 when Earth first appears */
    const earthIdleTime = earthEnteredTime !== null
        ? Math.max(0, now - earthEnteredTime)
        : 0;
    const earthIdleZoom = earthIdleTime * 0.000010;   /* ~0.6 after 60 s */

    /* Scroll-driven approach — Earth rushes in when scrolling 0.80→0.96 */
    const earthScrollZoom = smootherStep(0.80, 0.96, current) * 16;

    /* Start Earth at 0.15 so it clearly begins small/distant */
    const earthScale = 0.15 + earthIdleZoom + earthScrollZoom;

    earth.style.transform = `translate(-50%, -50%) scale(${earthScale})`;
    earth.style.opacity   = earthReveal;

    /* Earth UI label */
    earthUI.style.opacity = smootherStep(0.85, 0.90, current);

    /* Old-UI (space HUD) fades out as galaxy disappears */
    oldUI.style.opacity = 1 - smootherStep(0.60, 0.72, current);

    /* ── VOXEL WORLD ───────────────────────────────────────────
     *
     * Wider band (0.85→1.00 instead of 0.88→1.00) gives the
     * camera more room to travel — feels less rushed.
     * Talks to voxel-world.js via window.setVoxelProgress().
     * ───────────────────────────────────────────────────────── */
    const voxelProgress = smootherStep(0.85, 1.00, current);
    if (typeof window.setVoxelProgress === "function") {
        window.setVoxelProgress(voxelProgress);
    }

    requestAnimationFrame(render);
}

/* ── INIT ─────────────────────────────────────────────────────── */
window.addEventListener("scroll", updateTarget, { passive: true });
window.addEventListener("resize", () => {
    resize();
    updateTarget();
});

resize();
updateTarget();
requestAnimationFrame(render);
