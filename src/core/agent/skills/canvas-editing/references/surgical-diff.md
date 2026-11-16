# Surgical edits and limited response fallback

Preferred route: read get_canvas_source, then propose_surgical_diff with exact search/replace strings plus latest revision/sourceHash. Every search must match exactly once; include enough unchanged context to disambiguate. Preserve unrelated whitespace, comments, IDs and local definitions. A full proposal is appropriate for new figures/requested redesigns or a complete revision of a pending draft.

Pending manual drafts are not live source. A surgical tool edit based on draft text will not correctly refine the pending draft; submit its full revised source or use propose_layout_repair(proposalId). Automatic edits can be live immediately: reread source/version before each next edit.

## Only when canvas proposal tools are unavailable

State that limitation. Advice or a code fence is not an applied change. ACP may parse a complete fallback into a reviewable proposal; never claim application until the host reports it.

For a local edit, one fenced tikz/latex block can contain exact hunks:
```tikz
<<<<<<< SEARCH
\node[dl_block] (input) at (0,0) {Old label};
=======
\node[dl_block] (input) at (0,0) {New label};
>>>>>>> REPLACE
```

This is syntax only: use the user's exact current source, not the illustrative input node. For a new/full replacement use one complete fenced tikzpicture, no document preamble. Never offer an incomplete/truncated snippet as a complete replacement. Do not duplicate a successful tool proposal with fallback code.
Optional canvas directive (only for a requested theme switch/camera fit): `@agent-action {"theme":"cvpr","fitCanvas":true}` on its own line. Report it as a requested UI action, not proof of saved/applied source, and don't use it to recolor a faithful reproduction.
