# AgenTikZ Scientific Figure & Publication Pipeline Skill

> Builtin Publication-Grade Specification (Nature / NPG · NeurIPS · CVPR · IEEE) — Inspired by [Yuan1z0825/nature-skills](https://github.com/Yuan1z0825/nature-skills)

When generating or editing TikZ / PGFPlots figures inside **AgenTikZ**, always follow these publication-grade rules:

## 1. Five-Point Figure Contract (`% @figure-contract`)

Every publication figure must establish its scientific narrative in the preamble of `\begin{tikzpicture}`:

```latex
% @figure-contract question="What single Results-level scientific question does this figure answer?"
% @figure-contract hero="id_of_hero_node_or_panel"
% @figure-contract unit="e.g. Accuracy (%), Latency (ms), C x H x W"
% @figure-contract uncertainty="mean ± SD (n = 5)"
% @panel id=a role=hero title="Proposed Architecture"
% @panel id=b role=ablation title="Quantitative Ablation"
```

## 2. Salience-Driven Color Budget (`1 Neutral + 1 Signal + 1 Hero Accent`)

- **Do NOT rainbow-color every module.** Color encodes **information salience**, not decoration:
  - **Neutral / Context (`role=context`)**: Input/Output/Data blocks use neutral palette tokens (`npg_sand!14`, `ml_slate!12`, `ieee_gray!12`).
  - **Signal (`role=signal`)**: Standard backbone/encoder stages share the primary signal token (`npg_blue!14`, `ml_indigo!14`, `cv_blue!14`, `ieee_navy!14`).
  - **Hero Accent (`role=hero`)**: At most **1–2 core contribution modules** receive the high-saturation hero accent (`npg_red!22`, `ml_violet!22`, `cv_orange!22`, `ieee_crimson!20`).

## 3. Single-Meaning Line Semantics

- `dashed` is reserved **exclusively for `stage_box` grouping containers**.
- Auxiliary feedback / distillation / gradient flows must use `dotted` (`[flow, dotted]`) when a `stage_box` is present so `dashed` never carries two conflicting meanings in the same figure.
- Residual skip connections must use orthogonal routing (`to path={|- (\tikztotarget)}` or `-- ++(0,1.2) -|`).

## 4. Quantitative PGFPlots Rules

- Nature / NPG & CVPR figures use open L-shaped axes (`axis x line*=bottom, axis y line*=left`), outward ticks (`tick align=outside`), and **no background grid** (`grid=none`), while keeping Y-axis tick numerals clearly visible.
- Every quantitative plot must specify units in `xlabel` / `ylabel` and declare uncertainty (`SD` / `SEM` / `95% CI`) via `% @chart id=chart_main uncertainty="mean ± SD (n=5)"`.

## 5. AI Cutout Illustrations (`% @agent-image`)

When a schematic requires a biomolecule, 3D hardware icon, or anatomical/organelle illustration that pure geometric TikZ cannot express cleanly, declare an `@agent-image` directive together with an `\includegraphics` node:

```latex
% @agent-image id=img_sensor path="figures/assets/ai/sensor_cutout.png" prompt="isometric silicon photonic sensor chip, flat scientific vector style, transparent background"
\node[inner sep=0pt] (img_sensor) at (0, 2.6) {\includegraphics[width=2.2cm]{figures/assets/ai/sensor_cutout.png}};
```

AgenTikZ's multi-provider pipeline (`gpt-image-2`, `Gemini`, `OpenRouter`) will generate the asset, run 2-stage post-processing (edge flood-fill solid background removal + RGBA alpha tight crop), and save it directly into the paper workspace.
