/*
 * SAIF.OS journey controller
 *
 * Space → galaxy → Earth approach → world entry.
 *
 * PIPELINE
 *   native scroll (wheel)      → rawScroll
 *   rate-limited chase         → journeyTarget
 *   per-section exponential    → journeyCurrent
 *   stage mapping              → galaxy / Earth / voxel progress
 *
 * Two properties this file must guarantee:
 *
 *  1. ONE wheel gesture can never skip the journey. `journeyTarget` chases
 *     raw scroll at a fixed *rate per millisecond* (MAX_TARGET_RATE), so the
 *     playhead covers 0 → 1 in at least 1 / MAX_TARGET_RATE ms no matter how
 *     violent the input. This is the actual fix for "one big wheel lands on
 *     Earth instantly".
 *
 *  2. NO idle-time progression. Every visual is a pure function of
 *     journeyCurrent. Stop scrolling and the scene stops. There is no
 *     elapsedTime term feeding galaxy or Earth scale.
 *
 * Damping is per-section, not global: the galaxy is cinematic and slow, the
 * Earth approach is noticeably faster so the user feels forward travel, and
 * world entry is controlled. All smoothing is deltaTime-based and therefore
 * identical at 60 / 120 / 144 Hz. delta is hard-clamped so a tab switch or a
 * GC pause cannot teleport the playhead.
 */

const galaxy  = document.querySelector('.galaxy');
const earth   = document.querySelector('.earth');
const earthUI = document.querySelector('.earth-ui');
const oldUI   = document.querySelector('.old-ui');
const canvas  = document.querySelector('#space-dust');
const context = canvas.getContext('2d');

const stars = [];
const distantStars = [];

let width = 0;
let height = 0;
let lastTime = performance.now();

/* ═══════════════════════════════════════════════════════════════════
   JOURNEY STAGES
   Real physical distance between each beat — the Earth approach in
   particular occupies a wide window (0.63 → 0.90) so the planet is
   visibly small → huge rather than fading in already oversized.
═════════════════════════════════════════════════════════════════════ */
const STAGE = {
    GALAXY_END:   0.42,   // travelling through the galaxy
    REVEAL_END:   0.56,   // galaxy fades, Earth is first visible (far)
    APPROACH_END: 0.90,   // Earth grows until it fills the view
    WORLD_END:    1.00,   // Earth → voxel world
};

let journeyTarget  = 0;   // rate-limited intent
let journeyCurrent = 0;   // smoothed value every visual reads
let worldLocked    = false;
let rawScroll      = 0;
let pinnedScrollY  = 0;

/*
 * Maximum playhead movement per millisecond.
 * 0.000085 → a full 0→1 journey takes >= ~11.8s of continuous travel.
 * Raise this and large wheel flicks start skipping beats; lower it and the
 * journey feels unresponsive. Tuned deliberately slow for the galaxy and
 * compensated later by per-section damping.
 */
const MAX_TARGET_RATE = 0.000085;

/* journeyCurrent at which the world is entered and scrolling is locked. */
const WORLD_LOCK_THRESHOLD = 0.995;

/* Per-section response. Cinematic → moderate → responsive → controlled. */
const DAMP_GALAXY   = 2.2;
const DAMP_REVEAL   = 4.0;
const DAMP_APPROACH = 7.5;
const DAMP_WORLD    = 3.0;

function journeyDamping(p) {
    if (p < STAGE.GALAXY_END)   return DAMP_GALAXY;
    if (p < STAGE.REVEAL_END)   return DAMP_REVEAL;
    if (p < STAGE.APPROACH_END) return DAMP_APPROACH;
    return DAMP_WORLD;
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function smootherStep(a, b, x) {
    if (a === b) return x >= b ? 1 : 0;
    x = clamp((x - a) / (b - a), 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
}

/* ── STAR SYSTEM ─────────────────────────────────────────────── */
/* Unchanged from the original IntendOS upload — forward-depth dust.
   Stars travel TOWARD the viewer along rays from the screen centre,
   with size and brightness scaling on proximity, and recycle when
   they pass the camera plane. */

function resetStar(star, randomDepth = false) {
    const angle = Math.random() * Math.PI * 2;
    const distance = Math.random() * 1.1 + 0.08;

    star.x = Math.cos(angle) * distance;
    star.y = Math.sin(angle) * distance;
    star.depth = randomDepth ? Math.random() * 0.96 + 0.04 : 1;
    star.size = Math.random() * 1.7 + 0.35;
    star.speed = Math.random() * 0.00038 + 0.00018;
    star.tone = ['#d7eaff', '#fff2d0', '#b7d6ff', '#f3d8bd'][Math.floor(Math.random() * 4)];
    star.twinkle = Math.random() * Math.PI * 2;
}

function resize() {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    canvas.width = width * ratio;
    canvas.height = height * ratio;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    stars.length = 0;
    distantStars.length = 0;

    for (let i = 0; i < Math.floor((width * height) / 11000); i++) {
        distantStars.push({
            x: Math.random(),
            y: Math.random(),
            size: Math.random() * 0.9 + 0.25,
            phase: Math.random() * Math.PI * 2,
            tone: ['#7897b2', '#a2b9c9', '#c7bda7'][Math.floor(Math.random() * 3)]
        });
    }

    for (let i = 0; i < Math.floor((width * height) / 5200); i++) {
        const star = {};
        resetStar(star, true);
        stars.push(star);
    }
}

function drawDistantStars(time) {
    for (const star of distantStars) {
        const driftX = Math.sin(time / 9000 + star.phase) * 1.5;
        const driftY = Math.cos(time / 11000 + star.phase) * 1;
        context.globalAlpha = 0.22 + (Math.sin(time / 1600 + star.phase) + 1) * 0.08;
        context.fillStyle = star.tone;
        context.beginPath();
        context.arc(star.x * width + driftX, star.y * height + driftY, star.size, 0, Math.PI * 2);
        context.fill();
    }
    context.globalAlpha = 1;
}

/* Warp increases as the journey advances — forward-travel perception. */
function speedFactor() {
    return 1 + smootherStep(0, STAGE.REVEAL_END, journeyCurrent) * 4;
}

function drawStars(delta, time) {
    const centerX = width / 2;
    const centerY = height / 2;

    for (const star of stars) {
        const previousDepth = star.depth;
        star.depth -= star.speed * delta * speedFactor();

        if (star.depth <= 0.035) {
            resetStar(star);
            continue;
        }

        const x = centerX + (star.x / star.depth) * width * 0.44;
        const y = centerY + (star.y / star.depth) * height * 0.44;
        const px = centerX + (star.x / previousDepth) * width * 0.44;
        const py = centerY + (star.y / previousDepth) * height * 0.44;

        if (x < -40 || x > width + 40 || y < -40 || y > height + 40) {
            resetStar(star);
            continue;
        }

        const brightness = Math.min(1, 0.24 + (1 - star.depth) * 1.2);
        const twinkle = 0.84 + Math.sin(time / 700 + star.twinkle) * 0.16;

        context.globalAlpha = brightness * twinkle;
        context.strokeStyle = star.tone;
        context.lineWidth = Math.max(0.35, star.size * (1.55 - star.depth));
        context.beginPath();
        context.moveTo(px, py);
        context.lineTo(x, y);
        context.stroke();

        if (star.depth < 0.3) {
            context.globalAlpha = brightness * 0.7;
            context.fillStyle = star.tone;
            context.beginPath();
            context.arc(x, y, star.size * 0.9, 0, Math.PI * 2);
            context.fill();
        }
    }
    context.globalAlpha = 1;
}

/* ── SCROLL INPUT ────────────────────────────────────────────── */
/*
 * Native document scroll is the only input. The listener is passive and
 * never calls preventDefault, so the browser keeps full ownership of the
 * gesture (trackpad momentum, scrollbar drag and keyboard all keep
 * working). It only *reads* position; it never writes it.
 */
function readNativeScroll() {
    // World entered: the journey is one-way. Force the page back to the
    // pinned position so scroll-up / scroll-down / scrollbar dragging cannot
    // move the document at all, and never recompute rawScroll.
    if (worldLocked) {
        if (Math.abs(window.scrollY - pinnedScrollY) > 0.5) {
            window.scrollTo(0, pinnedScrollY);
        }
        return;
    }
    const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    rawScroll = clamp(window.scrollY / maxScroll, 0, 1);
}

window.addEventListener('scroll', readNativeScroll, { passive: true });

window.addEventListener('resize', () => {
    resize();
    readNativeScroll();
});

/* ── PLAYHEAD INTEGRATION ────────────────────────────────────── */
function lockWorld() {
    if (worldLocked) return;
    worldLocked = true;
    journeyTarget = 1;
    journeyCurrent = 1;

    // Pin the native scroll position at the bottom. Deliberately NOT using
    // overflow:hidden — that would remove the scrollbar, widening the layout
    // by ~15px and resizing the canvas at the exact frame of world entry.
    // Holding scrollY fixed keeps the viewport dimensions stable while
    // making the lock real: the page can no longer be scrolled anywhere.
    pinnedScrollY = window.scrollY;

    // Voxel world listens for this to take over input permanently.
    if (typeof window.onSaifWorldLock === 'function') window.onSaifWorldLock();
    hideSpaceForever();
}

/*
 * Once the world is entered the journey is over for good. Hiding the space
 * layers here (rather than in the render loop) means they cannot flicker
 * back if the playhead is ever nudged, and the star canvas stops burning
 * frames on a scene nobody can see.
 */
function hideSpaceForever() {
    galaxy.style.display = 'none';
    earth.style.display = 'none';
    earthUI.style.display = 'none';
    oldUI.style.display = 'none';
    canvas.style.display = 'none';
}

function advanceJourney(delta) {
    if (worldLocked) return;

    // Rate-limited chase. `maxStep` is the whole safety mechanism: however
    // far rawScroll jumps, the target advances at most maxStep this frame.
    const difference = rawScroll - journeyTarget;
    const maxStep = MAX_TARGET_RATE * delta;

    if (Math.abs(difference) <= maxStep) {
        journeyTarget = rawScroll;
    } else {
        journeyTarget += Math.sign(difference) * maxStep;
    }

    journeyTarget = clamp(journeyTarget, 0, 1);

    // Per-section exponential smoothing — frame-rate independent.
    const damping = journeyDamping(journeyCurrent);
    const smoothing = 1 - Math.exp(-(delta / 1000) * damping);
    journeyCurrent += (journeyTarget - journeyCurrent) * smoothing;
    journeyCurrent = clamp(journeyCurrent, 0, 1);

    if (journeyCurrent >= WORLD_LOCK_THRESHOLD) lockWorld();
}

/* ── RENDER ──────────────────────────────────────────────────── */
function render(now) {
    // Hard clamp: tab switch / GC pause must not jump the playhead.
    const delta = Math.min(40, Math.max(1, now - lastTime));
    lastTime = now;

    if (worldLocked) {
        // Journey is over. The voxel world owns the frame from here — stop the
        // rAF chain and stop touching the space DOM every frame.
        return;
    }

    advanceJourney(delta);

    // lockWorld() may have fired inside advanceJourney. Bail before writing
    // any space styles, otherwise this frame would overwrite the world
    // overlay opacity that onSaifWorldLock just forced to 1.
    if (worldLocked) return;

    const playhead = journeyCurrent;

    /* GALAXY — long cinematic approach, then a zoom-through.
       No idle-time term: scale is purely a function of the playhead. */
    const galaxyApproach = smootherStep(0.00, STAGE.GALAXY_END, playhead) * 1.5;
    const galaxyZoom     = smootherStep(STAGE.GALAXY_END, STAGE.REVEAL_END, playhead) * 34;
    const galaxyScale    = 0.72 + galaxyApproach + galaxyZoom;
    const galaxyOpacity  = 1 - smootherStep(0.46, 0.58, playhead);

    galaxy.style.transform = `translate(-50%, -50%) scale(${galaxyScale})`;
    galaxy.style.opacity = String(galaxyOpacity);
    galaxy.style.display = galaxyOpacity > 0.005 ? 'block' : 'none';

    context.clearRect(0, 0, width, height);
    drawDistantStars(now);
    drawStars(delta, now);

    /* EARTH — a real approach, not a fade-in.
       Exposed well before it grows: at reveal it is ~0.12 of its base size,
       which is a small distant planet, and it does not reach full size
       until the very end of its window. */
    const earthReveal   = smootherStep(0.54, 0.63, playhead);
    const earthApproach = smootherStep(0.63, STAGE.APPROACH_END, playhead);

    // Exponential growth reads as distance closing; linear reads as a zoom.
    const EARTH_START = 0.12;   // far away — small
    const EARTH_END   = 5.5;    // fills the viewport
    const earthScale  = EARTH_START * Math.pow(EARTH_END / EARTH_START, earthApproach);

    // Hand off to the world in the last stretch of the approach.
    const earthFade = 1 - smootherStep(0.92, 0.99, playhead);

    earth.style.transform = `translate(-50%, -50%) scale(${earthScale})`;
    earth.style.opacity = String(earthReveal * earthFade);
    earth.style.display = earthReveal > 0.005 && earthFade > 0.005 ? 'block' : 'none';

    earthUI.style.opacity = String(smootherStep(0.66, 0.78, playhead));
    earthUI.style.display = earthUI.style.opacity > 0.01 ? 'flex' : 'none';

    oldUI.style.opacity = String(1 - smootherStep(0.44, 0.54, playhead));
    oldUI.style.display = oldUI.style.opacity > 0.01 ? 'flex' : 'none';

    /* EARTH → WORLD — the voxel scene crossfades in while Earth still fills
       the frame, so the cut reads as flying into the planet. */
    const voxelProgress = smootherStep(0.90, 0.995, playhead);
    if (typeof window.setVoxelProgress === 'function') {
        window.setVoxelProgress(voxelProgress);
    }

    requestAnimationFrame(render);
}

resize();
readNativeScroll();
requestAnimationFrame(render);
