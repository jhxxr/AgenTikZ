# Bounded proposal and visual review

Read get_canvas_source before edits; submit revision/hash to propose_* tools. A code block does not itself make a reviewable tool change.

1. Inspect cheap layout diagnostics when useful; submit the requested edit with propose_tikz_patch or propose_surgical_diff.
2. Trust returned status/applied. Manual mode leaves a pending draft; automatic mode applies valid edits immediately. Application is not saving or compilation, and cancellation/errors do not roll back applied edits.
3. Render that exact proposalId with render_canvas_preview. Preview never applies edits. Inspect the actual PNG for labels, clipping, arrows, missing elements, hierarchy and reference differences.
4. Refine only concrete defects. At most 3 distinct renders per in-app request; repeated identical previews are cached. External drafts follow their advertised budget. Stop sooner when adequate.

## Pending draft versus live canvas

Every surgical diff and propose_layout_repair without proposalId targets the current LIVE canvas. In manual mode that is still the original source, not the pending draft. To refine a pending draft, submit its complete revised source via propose_tikz_patch with the live version, or pass proposalId to propose_layout_repair. In automatic mode earlier edits may already be live: reread source/revision/hash before further edits, never reuse the initial version.

If visual review, TeX or image input is unavailable, report the limitation and use textual diagnostics. Compilation success and geometry scores are not visual verification. Never claim to have seen a missing/failed image. Figure previews do not validate manuscript builds; read actual get_paper_diagnostics and its stale-revision state for paper compilation.

Don't duplicate a successful tool proposal as replacement code. Summarize remaining limitations and actual review/application status.
