# Geometry and routing

These are starting methods, not assertions of measured reference geometry or a guarantee that a figure is collision-free. Inspect the exact preview.

## Center coordinates and gaps

`at (x,y)` is a node's center. For vertically stacked heights h1,h2 the edge gap is `abs(y2-y1)-(h1+h2)/2`. A zero gap hides arrows and makes boxes touch. For 0.75–0.90cm blocks, a 1.45–1.65cm center step can be a starting point; recompute from actual sizes and final column width.

Horizontal stream separation is container width plus a routing corridor. For 4.6–5.0cm containers, 6.2cm separation is an example, not a required reference layout. Align repeated stages and label baselines.

## Containers

Declare stage_box first so it is behind its inner nodes. Its label is a top-left header badge: do not add another overlapping title or times-N badge.

For equal-height inner blocks from ymin to ymax, one starting bound is:
- center y = (ymin+ymax)/2 + 0.15
- height = (ymax-ymin) + block height + 1.15cm
- width = max inner width + 1.35cm

Adjust for actual header and routing space. Do not force these values onto a reference reproduction.

## Dedicated edge tracks

Connect defined IDs/anchors, keep bypass corridors outside labels and nodes, and reserve consistent clearances:
```tikz
\draw[-Stealth] (src) -- (dst);
\draw[-Stealth, rounded corners=4pt] (src.east) -- ++(0.95,0) |- (dst.east);
```

Only use src/dst if they are real defined nodes. Use the task's line grammar; a skip track need not be dashed. Check crossings, clipped text, cramped headers and arrowheads in the returned image. A parser bounding-box score is not a visual audit.
