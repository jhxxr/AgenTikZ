# AgenTikZ renderer adaptation

The app supplies its document preamble. Canvas proposals contain one self-contained tikzpicture with needed local color/macro definitions, not documentclass, usepackage, geometry/font-package setup or document environments.

## Editable nodes

Use unique IDs, explicit numeric `at (x,y)` coordinates in cm and readable width/height. Optional styles include dl_block, mha_block, addnorm_block, conv_block, feature_cube, op_circle and stage_box. These are a vocabulary, not a prescribed architecture. Retrieve only needed snippets with get_component_library(componentId/category).

- Stage containers: declare first, before inner nodes; their label is already a header badge. Do not add a duplicate title/times-N node at its corners.
- Math/edge/caption annotations: `draw=none, fill=none, subtype=math` (or caption); otherwise the interactive renderer can display an unwanted white bordered box.
- Tensors: feature_cube/subtype=cuboid with explicit size, depth and only verified channels. Do not copy example tensor dimensions into a user's method.
- Edges: connect defined IDs with --, |- or -| and optional north/south/east/west anchors. Do not hide ordinary editable nodes in loops/macros.
- Charts: PGFPlots axis with explicit width/height, coordinates and `scope[shift={(x,y)}]` for panel placement. Primitive snippets may contain illustrative values, hard-coded colors or grids; adapt to actual data and theme chartSpec.

## Faithful complex content

Noncanonical PGF shapes, curves, masks, topoplots, nested scopes and macros may need exact TeX preview. They are allowed for fidelity but are not all individually draggable. Preserve the source rather than rewriting it solely to match the editable subset; accurately explain the limitation.

Reuse macro structure, not a complete example architecture. Fetch dependent definitions and local colors. Brace arithmetic coordinates `({#2},{#3})` inside macros. A reference page can start/end inside a definition: fetch surrounding lines using macroIndex and nextStartLine before using it.

Original reference scripts, Google Canvas commands and full-document setup are not installed or authorized by loading a skill. Never claim they ran.
