# Academic Architecture Diagram Design Thinking Guide (顶会架构图画图思路与视觉叙事方法论)

This guide distills the visual storytelling, layout architecture, data-state representation, and color semantics from four representative top-venue deep learning figures:
1. **SWSA Spiking Transformer**: Macro-to-micro dashed callout + side-by-side baseline comparison (`Vanilla SSA` vs `SWSA`) + visual icon legend.
2. **BI-MCGNN Multi-Scale Graph Network**: `(a)` End-to-end dual-stream overview + `(b)`/`(c)` beveled innovation sub-panels + 3D tensor/pyramid dimensionality evolution.
3. **Masked EEG Autoencoder (MAE + Momentum Alignment)**: State-tracking multi-stripe tokens + complement-masked 2D heatmaps + trainable (black) vs target/loss (grey) arrow semantics.
4. **Dual-Stream Riemannian + Temporal Bi-LSTM**: Domain-authentic intermediate visualizations (raw EEG -> bandpass filter banks -> covariance matrices & scalp topoplots) + inter-layer mathematical manifold transitions + gated fusion.

---

## 1. Hierarchical Progressive Disclosure (宏观到微观的渐进式展开叙事)

Complex models fail visually when every sub-layer is flattened into a single level. Choose one of three structural patterns to separate macro flow from micro mechanics:

- **Pattern A: Main Pipeline Capsule + Dashed Projection Callout (主干胶囊 + 虚线放大展开框)**
  - Represent complex modules as a single compact block (`SWSA`, `Encoder`, `Predictor`, `Reconstructor`) in the main pipeline so the end-to-end flow reads in 3 seconds.
  - Place a dashed rounded callout container nearby and connect the capsule's corners to the callout's corners with two diverging dashed/tinted projection lines.
  - **Baseline Contrast Trick**: When your paper modifies a standard block (e.g. `Vanilla SSA` -> `SWSA`), place the baseline block and your proposed block side-by-side using identical node styles so reviewers immediately see the structural delta (such as the added `DWT -> Conv -> IDWT` branch).
- **Pattern B: `(a)` End-to-End Overview + `(b)/(c)` Innovation Sub-Panels (总-分多面板解耦)**
  - Dedicate the top half `(a)` to the macro dual-stream or encoder-decoder pipeline, and place each core methodological contribution in its own beveled sub-panel `(b)`, `(c)` at the bottom.
- **Pattern C: Stage-Partitioned Dashed Envelopes (按处理阶段划分虚线功能域)**
  - Enclose each conceptual stage (`Filter Bank`, `Spatial Info Stream`, `Temporal Info Stream`, `Feature Fusion`, `Decision Making`) in a labeled dashed container. Use trapezoidal dashed envelopes (`\TrapezoidEncoder`) when visually indicating feature compression or bottleneck encoding.

---

## 2. Visualizing Data State Evolution ("具象特征快照"：画出数据在层间的形态变化)

Never draw a diagram of only boxes and arrows. Show **what the tensor looks like** between the boxes so the math is visually self-evident:

- **Cross-Layer Color & Mask State Tracking (跨层色彩与掩码状态追踪)**
  - In self-supervised, token-based, or masked architectures (MAE / ViT), assign each row/channel a distinct color ramp and each column a distinct shade.
  - When patches are masked (drawn with inner white squares), reflect that exact survival state in downstream token strips: e.g. `Encoded Tokens` only renders the color stripes of unmasked rows in each column and leaves fully masked columns blank; `Predictor` fills in the masked columns; `Select` isolates those predicted columns; and `+` merges them with the skip-connected encoded tokens before `Reconstructor` outputs the complement-masked target grid.
- **Cross-Stage Color-Coded Window Correspondence (跨阶段滑动窗口色彩锚定)**
  - When slicing an input signal into time windows ($t_1, t_2, \dots, t_n$) or frequency bands ($\delta, \theta, \alpha, \beta, \gamma$), draw colored dashed window frames (e.g. red for $t_1$, green for $t_2$, purple for $t_n$) directly over the input waveform, and reuse those **exact same red/green/purple dashed frames** around the extracted feature maps (such as scalp topoplot rows) feeding into the corresponding unrolled recurrent cells ($t_1, t_2, t_n$).
- **Inter-Layer Mathematical Space & Dimension Annotations (层间流形与张量维度标注)**
  - Place concise mathematical transition labels directly above the arrows connecting processing blocks (e.g. $\mathbf{C}_i \in \mathbb{R}^{N\times N} \to \mathbf{C}_i \in \mathbb{R}^{R\times R} \to \delta_R(\mathbf{C}, \mathbf{C}_i) \to \mathbf{C}_{\text{ref}} \in \mathcal{M} \to \mathbf{T}_{\mathbf{C}_{\text{ref}}}\mathcal{M} \to \mathbb{R}^{R\times(R+1)/2}$). This bridges the visual figure and the paper's equations.
- **Geometric Dimensionality Progression (几何形态随张量维度演进)**
  - Match the visual icon's geometry to the tensor's order: 2D/3D graphs (`\GraphBox`) or 2D heatmaps (`\CovMatrixIcon`, `\TopoMapNode`) for structured spatial features -> 3D isometric segmented bars (`F^{TB}`) or cuboids for fused feature embeddings -> tapered 3D wireframe pyramids (`Output layer`) for dimensionality-reducing MLP heads -> discrete colored circles for final class logits (`NC / AD / FTD`).

---

## 3. Semantic Color System & Arrow Grammar (语义化配色体系与箭头语法)

- **Operator-Bound Color Palette (算子功能绑定专属色相)**
  - Bind each color to a specific mathematical role across the entire figure:
    - Linear / Projection layers: Soft Peach (`#FBE5D7`)
    - Normalization (`BN` / `LN`): Warm Gold/Yellow (`#FFE699`) or Slate Blue (`#6D7F9B`)
    - Convolution (`Conv` / `Conv 2D`): Soft Sage Green (`#E2F0D9`)
    - Spectral / Wavelet / Attention blocks (`DWT`, `IDWT`, `SWSA`, `Transformer`): Sky/Cornflower Blue (`#BDD7EF` / `#80B2F7` / `#9DC3E6`)
    - Pooling / Reduction / Metric ops (`MP`, `DimRed`, `AffInv`): Plum / Mauve (`#C882C2` / `#7C5A74`)
    - Tangent / Manifold projection: Olive Gold (`#9E8D65`)
    - Dense / Classification (`FC`): Forest Green (`#54813A`) or Lavender (`#B9C1EF`)
    - Nonlinear / Spiking / Gating operators (`LIF`, `\oplus`, `\otimes`, `+`, `x`): Crisp White circles with Red waveforms or Gold operator circles (`#BC901E`).
- **Pathway-Typed Arrows (按数据流性质区分箭头样式)**
  - **Stream Identity**: In multi-branch networks, color the arrows and dashed containers by branch (e.g. `#2B6DA8` Blue for Temporal pathway vs `#E07A38` Orange for Spectral pathway).
  - **Gradient vs Stop-Gradient / Loss Evaluation**: Use crisp black arrows (`line width=1.1pt`) for the primary forward/trainable pathway, thick grey arrows (`#7F7F7F`) for target generation, masking, or loss evaluation inputs (`Alignment Loss`, `Reconstruction Loss`), and thicker orthogonal lines (`line width=1.4pt`) for long-range skip/residual connections.
- **Depth via Opacity Cascade (透明度递减表达多尺度/多时间步堆叠)**
  - When showing a sliding window or multi-scale operation across $K$ steps (`Scale 1, 2, 3`), stack the frames diagonally using a `\foreach` loop with monotonically decreasing opacity (`1.0 -> 0.8 -> 0.65 -> 0.45`) so the foreground step is crisp while background steps recede naturally.

---

## 4. Spatial Grid & Orthogonal Routing Discipline (空间网格对齐与正交布线准则)

- **Strict Columnar & Baseline Alignment**: Parallel streams (e.g. Temporal vs Spectral pathways, or multi-stage `LSTM -> Norm -> LSTM -> Norm` columns) must lock to identical X-coordinates so the reader's eye can scan vertically to compare stages.
- **Dedicated Clearance Tracks for Residual/Bypass Lines**: Route residual (`\oplus`), skip, and gating bypass lines along dedicated horizontal tracks above or below the layer blocks using 90-degree orthogonal corners (`--`), never crossing through text or blocks.
- **Self-Contained Visual Dictionary (内嵌图例闭环)**: Whenever more than 3 compact symbolic icons are used (`\oplus`, `\otimes`, `LIF`, `MP`, `DWT`, `IDWT`), include a rounded Legend box in a corner of the canvas so the figure is self-explanatory.
