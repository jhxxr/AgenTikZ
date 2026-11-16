# Coordinate mapping and fidelity

Inspect the actual reference. Record uncertain labels/colors as uncertain. Unless a genuine authorized measurement tool was used, call positions and colors visual estimates, not programmatic pixel measurements.

Choose one scale s in cm/pixel for reference dimensions W,H:
- x = (px-W/2)*s
- y = (H/2-py)*s

Apply the same scale to widths, heights, radii, offsets and line/label placement. Do not independently stretch each panel. Preserve aspect ratio, topology and observed spacing rather than forcing a generic academic grid.

Use local definecolor names for reference colors. Preserve repeated channel/token/window identities, exact known mask complements and visible arrow semantics. Do not recolor to a journal palette or normalize all shapes into rectangular modules. If a detail is not readable, ask for essential evidence or explain the approximation.

Use the exact TeX path for faithful custom shapes/macros; editable named cm nodes are optional when they preserve fidelity. Imported examples use other coordinate conventions and full document setup: adapt their geometry to this one canvas rather than copying those execution steps.

Compare the rendered proposal image to the reference, checking proportions, bounding boxes, annotations, crossings and line meanings. A successful compile does not prove 1:1 accuracy. Keep `% @diagram-design {"mode":"reproduction","preserveColors":true,"preserveGeometry":true}` so automatic repair does not silently recolor or realign the reproduction.
