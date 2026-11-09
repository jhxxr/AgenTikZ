---
name: tikz-diagram-reproduction
description: Replicate complex academic figures, neural network architectures, GNNs, Transformers, Masked Autoencoders (MAE), RNN/LSTM temporal streams, Riemannian geometry pipelines, multi-panel schematics, and 3D tensor diagrams into pixel-accurate, modular, self-contained TikZ LaTeX code, or design new publication-grade architecture diagrams using top-venue visual storytelling principles. Use whenever the user uploads an image of a diagram to reproduce/redraw in TikZ or LaTeX, or asks to design/draw an academic architecture figure.
---
# TikZ Diagram Reproduction & Academic Figure Design

Reproduce complex single-panel or multi-panel academic figures into 1:1 proportional, self-contained, and modular TikZ (`.tex`) code - or design new publication-grade architecture diagrams - by combining top-venue **Visual Storytelling & Design Thinking** (`references/design_thinking_guide.md`), programmatic computer-vision measurement (`scripts/measure_diagram.py`), and reusable **TikZ Macro Blocks** (`references/macro_templates.md`).

## When to Use

- The user uploads an image of an architecture diagram (CNN, Transformer, SNN, GNN, RNN/LSTM, Masked Autoencoder, Riemannian manifold pipeline, or multi-stream fusion network), flowchart, or scientific schematic and asks to replicate or redraw it in TikZ or LaTeX.
- The user asks to design, draw, or polish an academic model architecture diagram following top-conference (CVPR/NeurIPS/ICML/IEEE) visual design principles.
- The user wants flat or hardcoded TikZ diagram code refactored into clean, reusable macro blocks.

## Core Design Thinking (顶会架构图画图思路)

Before writing TikZ code - whether replicating a reference figure or designing a new one - analyze the figure's visual narrative across four dimensions (detailed in `references/design_thinking_guide.md`):

1. **Hierarchical Progressive Disclosure (宏观到微观的渐进式展开)**:
   - Keep the main pipeline clean by encapsulating complex sub-networks into compact capsules and expanding them via **dashed projection callout boxes** (e.g. `Encoder` / `Predictor` / `Reconstructor` callouts, or side-by-side `Vanilla SSA` vs `SWSA` contrast), **multi-panel `(a)` overview + `(b)/(c)` innovation sub-panels**, or **stage-partitioned dashed envelopes** (`Spatial Stream`, `Temporal Stream`, `Feature Fusion`, `Decision Making`).
2. **Concrete Feature Snapshots Over Abstract Boxes (用"具象特征快照"展示数据形态演进)**:
   - Draw the intermediate tensor/data state between layers so the math is visually self-evident:
     - **State-Tracking Color Stripes & Complement Masks**: In token/masked models (MAE/ViT), assign each row/channel a color ramp and track exact unmasked vs masked color stripes across `Patched Input` -> `Encoded Tokens` (unmasked subset) -> `Prediction` -> `Select` (masked subset) -> `+` skip merge -> `Reconstructed Output` (complement mask).
     - **Cross-Stage Window Color Anchoring**: Use the same colored dashed frames (e.g. red $t_1$, green $t_2$, purple $t_n$) on raw/filtered input signals and on downstream extracted feature maps (such as scalp topoplot rows) feeding into unrolled recurrent cells ($t_1, t_2, t_n$).
     - **Inter-Layer Manifold & Dimension Transitions**: Place exact mathematical spaces ($\mathbf{C}_i \in \mathbb{R}^{N\times N} \to \mathbf{C}_{\text{ref}} \in \mathcal{M} \to \mathbf{T}_{\mathbf{C}_{\text{ref}}}\mathcal{M}$) on inter-block arrows, and evolve geometric shapes from 2D/3D graphs/heatmaps to 3D vector bars (`F^{TB}`) to 3D wireframe MLP pyramids to class circles.
3. **Semantic Color System & Arrow Grammar (语义化配色与流向箭头语法)**:
   - Bind colors strictly to operator roles (Peach = `Linear`, Gold = `BN`/Gating, Green = `Conv`/Dark `FC`, Sky Blue = `Wavelet`/`Attention`/`Transformer`, Plum/Olive = `Manifold/Metric Ops`).
   - Differentiate arrows by role: branch-colored arrows for parallel pathways (e.g. Blue = Temporal, Orange = Spectral), crisp black arrows for trainable forward paths, thick grey arrows for stop-gradient/target/loss inputs, and opacity cascades (`1.0 -> 0.45`) for multi-scale/temporal sliding window stacks.
4. **Grid Alignment & Orthogonal Routing (严格网格对齐与正交跳连)**:
   - Lock parallel streams and repeated stages (`LSTM -> Norm`) to shared X/Y grid axes, route residual/bypass connections along dedicated orthogonal clearance tracks, and include a self-contained visual Legend box whenever custom symbolic icons (`\oplus`, `\otimes`, `LIF`, `DWT`) are used.

## Execution Steps

### 1. Programmatic Visual Measurement and Coordinate Mapping

When replicating a reference image, measure it programmatically in Python (`Pillow`, `numpy`, `opencv-python`) using `scripts/measure_diagram.py`:

- **Establish a 1:1 pixel coordinate system**: Read the image dimensions `(W, H)` and configure the `tikzpicture` with `x=0.25mm, y=-0.25mm` and `\useasboundingbox (0,0) rectangle (W,H);`. Every pixel coordinate `(px, py)` maps directly to `(px, py)` in TikZ.
- **Extract exact bounding boxes, radii, and mask sets**: Use interior flood-filling or non-white bounding-box scans (`mean(axis=2) < 235`) for blocks/containers, perimeter fitting for `(cx, cy, r)` circles, and cell-center brightness checks to extract exact masked `(r/c)` coordinate lists and their mathematical complements.
- **Sample exact interior RGB colors**: Filter out near-white background (`>235`) and dark border (`<65`) pixels inside each bounding box to compute the median RGB hex value (`#RRGGBB`), and define semantic `\definecolor{...}{HTML}{...}` entries in the preamble.

### 2. Font Encoding, Contrast, and Size Calibration

- **Prevent LuaLaTeX font warnings**: Include `\usepackage[T1]{fontenc}` alongside `\usepackage[scaled=0.92]{helvet}` and `\usepackage{mathptmx}` so regular, bold, and italic fonts render properly without falling back to Computer Modern warnings.
- **Calibrate font sizes and contrast**: At `x=0.25mm` (`1 unit = 0.7087 pt`), the LaTeX font size in `pt` matches the measured pixel cap-height almost 1:1. Distinguish `+90` vs `-90` vertical text rotation and set `text=white` on dark-filled blocks.

### 3. Modular Macro Block Abstraction

Structure the TikZ code around reusable macro blocks (see `references/macro_templates.md`):

- **Elementary & composite layer macros**: `\LayerBlock`, `\VLayerBlock`, `\DarkVBlock`, `\FCBlock`, `\ModelBar`, `\AddNode`, `\MulNode`, `\GateCircle`, `\GreyTile`, `\LinearBNLIF`, `\LIFLinearBN`.
- **Multi-stripe token & masked heatmap macros (MAE / ViT / SSL)**: `\StripeToken`, `\TokenStrip`, and `\PatchedEEGGrid` (handling unmasked, masked, and complement-reconstructed modes).
- **Unrolled RNN/LSTM columns, covariance heatmaps & scalp topoplots**: `\LSTMColumn`, `\TrapezoidEncoder`, `\CovMatrixIcon` (diagonal-distance coloring), and `\TopoMapNode` (clipped multi-stop axial/radial shadings with electrode dots).
- **Graph topology, 3D tensors & beveled panels**: `\GraphBox` (local shifted scopes with Bezier arcs), 3-face isometric tensor bars/cuboids/wireframe pyramids, and `\BevelPanel` (multi-ring drop-shadow containers).
- **Brace-wrap all macro coordinates**: Always enclose macro coordinate arguments in curly braces `({#2}, {#3})` inside macro definitions so `pgfmath` evaluates coordinate expressions cleanly.

### 4. Automated Verification and Canvas Delivery

- **Automated color and delimiter audit**: Run `verify_tex_file(tex_path)` from `scripts/measure_diagram.py` to confirm balanced `{...}`, `(...)`, `\begin{...}` / `\end{...}` blocks and verify that every color name in `fill=`, `draw=`, `top/bottom/middle color=` is defined.
- **File size budget for Canvas**: Keep embedded waveform polylines at 24 to 55 points per trace so the complete self-contained `.tex` file stays under 30 KB and opens directly in PDF Canvas via `google:show_file`.

## Gotchas

- **Undefined color names across templates**: Always run `verify_tex_file()` in `scripts/measure_diagram.py` to catch missing `\definecolor` declarations.
- **Unbraced math in TikZ coordinates**: Always write `at ({#2}, {#3})` inside macro definitions.
- **Missing `T1` font encoding in LuaLaTeX**: Always include `\usepackage[T1]{fontenc}` when loading `helvet` or `mathptmx`.
- **Do not include `__pycache__` or `.tex` files inside `skill_dir`**: Keep templates inside `references/macro_templates.md` and remove `__pycache__` before calling `skills:update_skill`.
