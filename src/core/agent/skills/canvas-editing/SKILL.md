---
name: canvas-editing
description: Make local canvas changes and refine proposals without replacing unrelated source.
---
# Local canvas editing

1. Read get_canvas_source for the current source, revision and sourceHash. Use get_selected_elements or get_canvas_ast only when exact spans or geometry are needed. An omitted inline canvas is not an empty canvas: read the tool instead of asking the user to attach it again.
2. Preserve unrelated content, comments, colors, node IDs, definitions and `% @diagram-design` / figure metadata. A reproduction pragma protects geometry and colors; do not use automatic repair to silently redesign it.
3. Use propose_surgical_diff for exact, unique SEARCH/REPLACE changes to the live canvas. Use propose_tikz_patch only for a requested full redesign or full revised draft; a redesign uses scientific-diagram-design. Read `reference=surgical-diff` for the limited code-fence fallback when proposal tools are unavailable.
4. In manual mode the pending draft is NOT the live canvas. Refine a pending draft by sending its full revised source, or pass proposalId to propose_layout_repair. Every surgical edit still targets the live source, not the pending draft. In automatic mode edits may already be applied: reread source/revision/hash before the next edit.
5. Read `reference=layout` for overlap/routing issues and `reference=renderer` for unfamiliar constructs. Retrieve only needed component examples; a label change does not require a design skill, color palette or macro library.
6. Inspect cheap diagnostics first. For visual changes, render the exact proposal when available, inspect the actual image and refine only concrete defects; read `reference=review` if needed. Respect the host render budget and stop when adequate.
7. Summarize actual returned status/applied. Preview is not application; application is not saving or compilation. Errors/cancellation do not roll back already applied edits. Never duplicate a successful tool proposal as a replacement code block.
8. If a requested redesign also needs journal styling or a new figure contract, read publication-style according to the task flags. A trivial label change should not force style/contract metadata regeneration.
