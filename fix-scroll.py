import re

with open('script.js', 'r') as f:
    text = f.read()

# 1. Completely rewrite the Scroll / Render architecture
# We will use native window.scrollY but we will clamp how fast the target can change!
# This prevents one wheel tick from skipping steps.

scroll_logic = """/* ── Scroll Physics ─────────────────────────────────────────────────── */
let target = 0;
let current = 0;
let worldLocked = false;
let maxVelocity = 0.0015; // Max journey progress per ms

function updateTarget() {
    // 400vh is too small. We will change CSS to 1000vh shortly.
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (worldLocked) return;
    
    // We get the raw scroll position, but we DO NOT instantly set target to it.
    // We let the render loop crawl toward it.
    let rawTarget = maxScroll > 0 ? clamp(window.scrollY / maxScroll, 0, 1) : 0;
    
    // We need target to move gracefully toward rawTarget, clamped by velocity.
    window._rawTarget = rawTarget;
}

window.addEventListener("scroll", updateTarget, { passive: true });
window._rawTarget = 0;
"""

# Find the old Scroll section
text = re.sub(r'/\* ── Scroll ──.*?/\* ── Render loop ──.*? \*/\n', scroll_logic + '\n/* ── Render loop ──────────────────────────────────────────────── */\n', text, flags=re.DOTALL)


# Inside render loop:
render_start = """function render(now) {
    const delta = Math.min(40, now - lastTime || 16);
    lastTime = now;

    if (worldLocked) {
        window._rawTarget = 1;
        target = 1;
        current = 1;
    } else {
        // Enforce physical limits on how fast the target can change
        const dist = window._rawTarget - target;
        const maxStep = maxVelocity * delta;
        if (Math.abs(dist) > maxStep) {
            target += Math.sign(dist) * maxStep;
        } else {
            target = window._rawTarget;
        }

        // Smooth current physically toward target ensuring responsiveness
        // A damping of 3.5 feels tight but smooth. No 0.25 lag!
        current += (target - current) * (1 - Math.exp(-(delta / 1000) * 3.5));
    }
    
    /* Lock world permanently when we finish transition */
    if (current > 0.999 && !worldLocked) {
        worldLocked = true;
    }

    const playhead = current; // unified playhead for the whole journey
"""

# Replace render start up to GALAXY
text = re.sub(r'function render\(now\).*?/\* ── GALAXY ──', render_start + '\n    /* ── GALAXY ──', text, flags=re.DOTALL)

# Now fix the timeline boundaries to use uniform `playhead` instead of split currents
replacements = [
    ('galaxyCurrent', 'playhead'),
    ('earthCurrent', 'playhead'),
    ('voxelCurrent', 'playhead'),
    ('earthIdleZoom', '0'),
]

for old, new in replacements:
    text = text.replace(old, new)

with open('script.js', 'w') as f:
    f.write(text)

print("Updated script.js physics")
