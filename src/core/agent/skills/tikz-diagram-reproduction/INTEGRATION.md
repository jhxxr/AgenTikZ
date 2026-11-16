# AgenTikZ integration

Imported on 2026-11-09 from the user-provided `tikz-diagram-reproduction` skill.
`SKILL.md`, both reference documents and `scripts/measure_diagram.py` are preserved
as supplied. The application does not depend on the original desktop folder.

The application now supplies only a short execution contract, skill catalog and
current task state. Four application-adapted workflows are available through
`get_diagram_design_skill`: scientific-diagram-design, reference-reproduction,
canvas-editing and publication-style. `action=list` reads metadata without loading
skill bodies; `skillId` reads a workflow and `reference` selects a detailed page.
Pi, ACP and external MCP clients share this interface; Pi native skill discovery
is not enabled. Only skill text still visible in genuine session context is reused.

The original guide and four macro templates remain available through the legacy
`topic=design/reproduction/swsa/gnn/mae/riemannian` path, including the original
pagination and macroIndex. They are tagged `contentKind=reference`, not executable
application instructions. Adapted workflows are host-tagged with a skill ID,
version and `contentKind=adapted-skill` and never override permissions or user intent.
Detailed design/color/geometry teaching and primitive snippets are no longer
injected every turn. Theme data and components still come from get_theme_palette
and get_component_library; example values are not user measurements.

The app retains its review/proposal boundaries and exact TeX preview. The source
skill's Google Canvas delivery commands and Python measurement/audit instructions
do not imply installed tools or script execution. Standard editable nodes use cm
coordinates; complex faithful macros/paths use the exact-preview route. Full
document/font/geometry preambles from the examples are not canvas proposals.

`% @diagram-design` records whether colors and geometry must be preserved.
Reference reproduction is not automatically recolored, realigned or relabeled.
Original designs may use the skill's functional palette with local color
definitions; explicit user-requested journal/monochrome constraints take priority.
