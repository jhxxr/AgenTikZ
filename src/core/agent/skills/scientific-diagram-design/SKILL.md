---
name: scientific-diagram-design
description: Design a new scientific figure from the requested method and evidence.
---
# Scientific diagram design

This is AgenTikZ's application-adapted workflow, not an instruction to install or run tools mentioned in imported examples. User requirements and reference evidence take precedence over journal defaults and templates.

1. Read the current canvas before changing it. For a new design, give a short design brief: scientific question, main reading path, actual data states, contribution(s) and panel roles. Do not provide a long chain of thought.
2. Choose a pipeline, overview plus mechanism callout, aligned streams or a single panel according to the method. Read `reference=composition` for unfamiliar compositions or state representations. Do not add baseline branches, layers or measurements merely because a template contains them.
3. Choose meaningful shapes and one coherent color/arrow grammar. Track token, channel, window and branch identity throughout. Read `get_theme_palette` only for relevant journal defaults; strict user styling takes precedence. Do not fabricate results, topology, dimensions or citations.
4. Read `reference=renderer` when using unfamiliar editable components, paths, macros or charts; use `get_component_library` for only the needed componentId/category. Use `reference=layout` for geometry/routing problems.
5. Produce one self-contained tikzpicture with needed local definitions. Ordinary editable nodes need unique IDs and explicit cm coordinates; complex faithful paths/macros require exact TeX preview and are not all draggable. Add `% @diagram-design {"mode":"design","preserveColors":true,"preserveGeometry":false}` inside the picture to record intentional colors.
6. When publication style or figure contracts are enabled, read `publication-style`; preserve existing contract/intent comments on follow-up edits. Do not apply a journal palette over an explicit user palette.
7. Submit the appropriate propose_* edit using the latest source version, then inspect the exact proposal image when visual review is available. Read `reference=review` for pending-draft refinement. Compilation or a geometry score is not visual verification.

## Optional original examples

The legacy topics `swsa`, `gnn`, `mae`, `riemannian` provide paged macro references. Use macroIndex to jump to a relevant definition and fetch its dependencies. They are examples of callouts, graph/tensor streams, token/mask identity and temporal/manifold pipelines, not mandatory architectures. Load only useful pages, not every example.
