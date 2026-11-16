---
name: reference-reproduction
description: Reproduce a supplied diagram faithfully without silently redesigning it.
---
# Reference-image reproduction

This application-adapted workflow supersedes the execution steps in the imported reference skill. No Python, image-measurement or Google Canvas tool is supplied by this skill. Use only genuinely available, authorized tools; never claim programmatic measurement without running one.

1. Read the current canvas and inspect the actual supplied reference image. Preserve observed topology, proportions, spacing, shapes, labels, sampled/estimated colors and line meanings. An unreadable detail is uncertain, not permission to invent it.
2. Read `reference=coordinate-mapping` for a consistent pixel-to-cm map. If the model cannot inspect images, report the limitation and request a description or a vision-capable agent rather than claiming a faithful reproduction.
3. Follow the reference grammar, including its mask/window correspondence, token ordering and line styles. Do not recolor to a journal palette, add a baseline or split the image into new panels. Explicit redesign requests are a separate design task.
4. Use local color definitions and one scale for all positions and sizes. Ordinary nodes may remain editable; faithful noncanonical paths/macros are valid with exact TeX preview. Read `reference=renderer` when adapting them and explain which portions are not draggable.
5. Keep one complete tikzpicture with local definitions, no document preamble. Record `% @diagram-design {"mode":"reproduction","preserveColors":true,"preserveGeometry":true}` inside the picture. Preserve it, existing comments and definitions on later edits.
6. Submit a proposal against the latest canvas revision/hash. Compare the real returned preview with the reference and refine only concrete differences within the render budget; use `reference=review` for pending/live semantics. Do not claim pixel-exact accuracy from visual estimates or a successful compile.

Imported pages (`topic=reproduction` and macro topics) remain reference material. Their Python audits, package installation, full-document setup and external delivery commands do not become AgenTikZ capabilities. If figure contracts are enabled for a new/multi-panel reproduction, read publication-style only for contract metadata; never use it to replace observed reference colors or geometry.
