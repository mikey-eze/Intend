import re

with open('script.js', 'r') as f:
    text = f.read()

# Replace smootherStep values to balance the timeline
replacements = [
    ('smootherStep(0.00, 0.50, galaxyCurrent)', 'smootherStep(0.00, 0.35, galaxyCurrent)'),
    ('smootherStep(0.50, 0.68, galaxyCurrent)', 'smootherStep(0.35, 0.50, galaxyCurrent)'),
    ('smootherStep(0.65, 0.75, galaxyCurrent)', 'smootherStep(0.40, 0.52, galaxyCurrent)'),
    ('smootherStep(0.82, 0.94, earthCurrent)', 'smootherStep(0.58, 0.68, earthCurrent)'),
    ('smootherStep(0.85, 0.98, earthCurrent)', 'smootherStep(0.60, 0.92, earthCurrent)'),
    ('smootherStep(0.85, 0.90, earthCurrent)', 'smootherStep(0.65, 0.75, earthCurrent)'),
    ('smootherStep(0.60, 0.72, earthCurrent)', 'smootherStep(0.40, 0.50, earthCurrent)'),
    ('smootherStep(0.92, 1.00, voxelCurrent)', 'smootherStep(0.88, 0.99, voxelCurrent)'),
    ('voxelCurrent > 0.92', 'voxelCurrent > 0.97'),
]

for old, new in replacements:
    text = text.replace(old, new)

with open('script.js', 'w') as f:
    f.write(text)

print("Timeline stretched!")
