# Hybrid vector and illustration directives

Use this reference only when the requested figure needs an image asset (hardware, specimen, sample cutout) alongside vector elements. An @agent-image declaration is an asset request, not proof that an image has been generated or a file exists. This skill does not add image-generation, filesystem, shell or browser tools.

A compatible comment plus image node:
```tikz
% @agent-image {"nodeId":"img_specimen","prompt":"Isolated scientific specimen illustration, no text labels","path":"figures/assets/ai/img_specimen.png","aspectRatio":"1:1"}
\node[inner sep=0pt, draw=none, fill=none, minimum width=2.4cm, minimum height=2.0cm, subtype=image] (img_specimen) at (2.2,4.5) {\includegraphics[width=2.4cm]{figures/assets/ai/img_specimen.png}};
```

Choose a meaningful nodeId and a project-relative asset path. Supported aspectRatio values: 1:1, 16:9, 4:3, 3:2; optional stylePreset: flat_vector, isometric_3d, bio_medical, hardware_render. Plain-text @agent-image directives are also recognized, but source comments preserve metadata through subsequent edits.

Keep annotations, scientific labels and arrows as editable vectors. If a generator/asset is unavailable, report the missing asset; do not claim it exists or that preview succeeded. Respect user-controlled generation and tool authorization. Decorative images must not imply unsupported experimental evidence.
