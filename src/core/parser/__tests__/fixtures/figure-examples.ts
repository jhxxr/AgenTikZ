// Complex source fixtures used only by parser/export regression tests.
// No library metadata or AI composition references are shipped with the app.
export const FIGURE_PARSER_FIXTURES: Array<{ tikzCode: string }> = [
  { tikzCode: `% ============================================================================
% AgenTikZ — NeurIPS / ICLR Joint Architecture & Scaling (Publication-Grade)
% Uniform 1.2cm vertical grid · Symmetric residual bypasses · Clean axis labels
% ============================================================================
\\begin{tikzpicture}[
  >=Stealth,
  every node/.style={font=\\small}
]
  \\tikzset{
    dl_block/.style={draw=nips_blue!85!black, fill=nips_blue!14, rounded corners=2.5pt, line width=0.7pt, minimum width=3.4cm, minimum height=0.82cm},
    mha_block/.style={draw=nips_amber!85!black, fill=nips_amber!16, rounded corners=2.5pt, line width=0.75pt, minimum width=3.4cm, minimum height=0.95cm},
    addnorm_block/.style={draw=nips_sage!85!black, fill=nips_sage!15, rounded corners=2.0pt, line width=0.65pt, minimum width=3.4cm, minimum height=0.62cm},
    op_circle/.style={circle, draw=nips_slate!85!black, fill=white, line width=0.7pt, minimum size=0.58cm},
    stage_box/.style={draw=nips_slate!55, fill=nips_slate!5, dashed, rounded corners=4pt, line width=0.65pt}
  }

  % --- Background Encoder Stage Container (generous padding) ---
  \\node[stage_box, subtype=container, minimum width=5.8cm, minimum height=7.2cm] (encoder_stage) at (3.0, 5.1) {$\\times L$ Pre-LN Transformer Stage};

  % --- Input Token & Positional Embedding ---
  \\node[dl_block, fill=nips_purple!14, draw=nips_purple!85!black, minimum width=3.4cm, minimum height=0.72cm] (embed) at (3.0, 0.8) {Token + RoPE Embedding $\\mathbf{X}_0$};

  % --- Sub-layer 1: Multi-Head Self-Attention (1.2cm grid) ---
  \\node[addnorm_block] (ln1) at (3.0, 2.2) {RMSNorm ($\\text{LN}_1$)};
  \\node[mha_block] (mha) at (3.0, 3.4) {Multi-Head Self-Attention \\\\ {\\scriptsize $\\text{Softmax}(\\mathbf{Q}\\mathbf{K}^\\top / \\sqrt{d_k})\\mathbf{V}$}};
  \\node[op_circle] (add1) at (3.0, 4.6) {$\\oplus$};

  % --- Sub-layer 2: SwiGLU Feed-Forward Network (1.2cm grid) ---
  \\node[addnorm_block] (ln2) at (3.0, 5.8) {RMSNorm ($\\text{LN}_2$)};
  \\node[dl_block] (ffn) at (3.0, 7.0) {SwiGLU Feed-Forward \\\\ {\\scriptsize $\\text{SiLU}(\\mathbf{h}\\mathbf{W}_1) \\odot \\mathbf{h}\\mathbf{W}_3$}};
  \\node[op_circle] (add2) at (3.0, 8.2) {$\\oplus$};

  % --- Output Projection Head ---
  \\node[dl_block, fill=nips_rose!14, draw=nips_rose!85!black, minimum width=3.4cm, minimum height=0.72cm] (head) at (3.0, 9.6) {Linear Output Head $\\hat{\\mathbf{Y}}$};

  % --- Main Vertical Forward Connections ---
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (embed) -- (ln1);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (ln1) -- (mha);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (mha) -- (add1);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (add1) -- (ln2);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (ln2) -- (ffn);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (ffn) -- (add2);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (add2) -- (head);

  % --- Symmetric Orthogonal Residual Skip Bypasses (uniform 1.1cm offset) ---
  \\draw[-Stealth, line width=0.7pt, draw=nips_sage!85!black] (embed.east) -- ++(1.1, 0) |- node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize] {Residual} (add1.east);
  \\draw[-Stealth, line width=0.7pt, draw=nips_sage!85!black] (add1.west) -- ++(-1.1, 0) |- node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize] {Residual} (add2.west);

  % --- Right Panel: PGFPlots Scaling Curve (2.5cm gap from architecture) ---
  \\begin{scope}[shift={(8.0, 2.8)}]
    \\begin{axis}[
      id=scaling_plot,
      chart_type=line, width=6.0cm, height=5.0cm,
      title={Validation Accuracy vs.\\ Model Depth},
      xlabel={Transformer Depth $L$ (Layers)},
      ylabel={Zero-Shot Accuracy (\\%)},
      grid=major,
      grid style={dashed, gray!25},
      tick label style={font=\\scriptsize},
      label style={font=\\footnotesize},
      title style={font=\\footnotesize\\bfseries},
      legend style={at={(0.04, 0.94)}, anchor=north west, font=\\scriptsize, draw=gray!40, fill=white, fill opacity=0.9}
    ]
      \\addplot[color=#2B5B84, line width=0.85pt, mark=*] coordinates { (6, 74.5) +- (0, 1.1) (12, 80.2) +- (0, 0.9) (24, 84.8) +- (0, 0.7) (36, 87.4) +- (0, 0.6) };
      \\addlegendentry{Pre-LN + SwiGLU (Ours)}
      \\addplot[color=#D97706, line width=0.85pt, mark=square*, dashed] coordinates { (6, 72.1) +- (0, 1.4) (12, 76.8) +- (0, 1.2) (24, 79.5) +- (0, 1.1) (36, 78.9) +- (0, 1.5) };
      \\addlegendentry{Post-LN Baseline}
      \\addplot[color=#28664B, line width=0.85pt, mark=triangle*, densely dotted] coordinates { (6, 71.8) +- (0, 1.6) (12, 78.5) +- (0, 1.1) (24, 83.2) +- (0, 0.8) (36, 85.9) +- (0, 0.7) };
      \\addlegendentry{Pre-LN + GeLU}
    \\end{axis}
  \\end{scope}

  % --- Aligned Subfigure Captions ---
  \\node[subcaption, subtype=caption, draw=none, fill=none, minimum width=5.8cm, minimum height=0.55cm] (cap_a) at (3.0, -0.35) {\\textbf{(a)} Pre-LN SwiGLU Transformer Block};
  \\node[subcaption, subtype=caption, draw=none, fill=none, minimum width=6.0cm, minimum height=0.55cm] (cap_b) at (11.0, -0.35) {\\textbf{(b)} Depth Scaling \\& Stability};
\\end{tikzpicture}
% \\caption{Overview of the proposed Pre-LN SwiGLU Transformer architecture (a) and its scaling performance across model depths (b).}
% \\label{fig:transformer_scaling}` },
  { tikzCode: `% ============================================================================
% AgenTikZ — Parallel Q-K-V Scaled Dot-Product Attention (Publication-Grade)
% Three-way equidistant layout · Operators centered · Clean flow
% ============================================================================
\\begin{tikzpicture}[
  >=Stealth,
  every node/.style={font=\\small}
]
  \\tikzset{
    dl_block/.style={draw=nips_blue!85!black, fill=nips_blue!14, rounded corners=2.5pt, line width=0.7pt, minimum width=2.6cm, minimum height=0.8cm},
    mha_block/.style={draw=nips_amber!85!black, fill=nips_amber!16, rounded corners=2.5pt, line width=0.75pt, minimum width=3.6cm, minimum height=0.9cm},
    addnorm_block/.style={draw=nips_sage!85!black, fill=nips_sage!15, rounded corners=2.0pt, line width=0.65pt, minimum width=3.4cm, minimum height=0.68cm},
    op_circle/.style={circle, draw=nips_slate!85!black, fill=white, line width=0.7pt, minimum size=0.62cm},
    stage_box/.style={draw=nips_slate!55, fill=nips_slate!5, dashed, rounded corners=4pt, line width=0.65pt}
  }

  % --- Outer Attention Module Container (wider padding) ---
  \\node[stage_box, subtype=container, minimum width=10.4cm, minimum height=6.8cm] (attn_box) at (5.2, 5.1) {Scaled Dot-Product \\& Gated Attention Core};

  % --- Shared Input Hidden States ---
  \\node[addnorm_block, minimum width=4.4cm] (in_norm) at (5.2, 0.7) {Input Hidden States $\\mathbf{H} \\in \\mathbb{R}^{N \\times d}$};

  % --- Three Parallel Q / K / V (equidistant at x = 2.0, 5.2, 8.4) ---
  \\node[dl_block, fill=nips_blue!15, draw=nips_blue!85!black] (proj_q) at (2.0, 2.4) {Query $\\mathbf{Q} = \\mathbf{H}\\mathbf{W}_Q$};
  \\node[dl_block, fill=nips_blue!15, draw=nips_blue!85!black] (proj_k) at (5.2, 2.4) {Key $\\mathbf{K} = \\mathbf{H}\\mathbf{W}_K$};
  \\node[dl_block, fill=nips_purple!14, draw=nips_purple!85!black] (proj_v) at (8.4, 2.4) {Value $\\mathbf{V} = \\mathbf{H}\\mathbf{W}_V$};

  % --- Q·K Similarity (centered between Q and K) ---
  \\node[op_circle] (qk_matmul) at (3.6, 3.9) {$\\otimes$};
  \\node[mha_block, minimum width=3.8cm] (softmax) at (3.6, 5.2) {Scale $\\frac{1}{\\sqrt{d_k}}$ + Causal Softmax};

  % --- Attention·Value Aggregation (centered between Softmax output and V) ---
  \\node[op_circle] (av_matmul) at (6.6, 6.6) {$\\otimes$};
  \\node[dl_block, fill=nips_rose!14, draw=nips_rose!85!black, minimum width=3.8cm] (out_proj) at (6.6, 7.9) {Output Projection $\\mathbf{W}_O$};

  % --- Formula Callout ---
  \\node[subtype=math, draw=none, fill=none] (attn_eq) at (2.6, 7.8) {$\\mathbf{A} = \\text{Softmax}\\!\\left(\\frac{\\mathbf{Q}\\mathbf{K}^\\top}{\\sqrt{d_k}} + \\mathbf{M}\\right)$};

  % --- Branching & Merging Edges ---
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (in_norm.west) -| (proj_q.south);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (in_norm) -- (proj_k);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (in_norm.east) -| (proj_v.south);

  \\draw[-Stealth, line width=0.7pt, draw=nips_blue!85!black] (proj_q.north) |- (qk_matmul.west);
  \\draw[-Stealth, line width=0.7pt, draw=nips_blue!85!black] (proj_k.north) |- (qk_matmul.east);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (qk_matmul) -- (softmax);
  \\draw[-Stealth, line width=0.7pt, draw=nips_amber!85!black] (softmax.north) |- node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize] {Attn $\\mathbf{A}$} (av_matmul.west);
  \\draw[-Stealth, line width=0.7pt, draw=nips_purple!85!black] (proj_v.north) |- (av_matmul.east);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (av_matmul) -- (out_proj);
\\end{tikzpicture}
% \\caption{Detailed computation graph of the parallel Q-K-V scaled dot-product attention module with causal masking.}
% \\label{fig:qkv_micro_architecture}` },
  { tikzCode: `% ============================================================================
% AgenTikZ — CVPR / ICCV Multi-Scale 3D Feature Pyramid (Publication-Grade)
% Backbone & FPN blocks share x-coordinates · Clear volume shrinkage
% ============================================================================
\\begin{tikzpicture}[
  >=Stealth,
  every node/.style={font=\\small}
]
  % --- Backbone Stage Container (generous padding) ---
  \\node[stage_box, subtype=container, minimum width=11.6cm, minimum height=4.2cm] (backbone_stage) at (5.6, 5.0) {Hierarchical 3D Visual Backbone ($\\mathbf{C}_2 \\rightarrow \\mathbf{C}_5$)};

  % --- 3D Feature Map Volumes — progressive volume reduction ---
  \\node[feature_cube, subtype=cuboid, fill=cvpr_navy!14, draw=cvpr_navy!85!black, minimum width=0.9cm, minimum height=2.8cm, depth=0.4cm, channels={128\\times 128\\times 64}] (c2) at (1.6, 4.8) {$\\mathbf{C}_2$};
  \\node[feature_cube, subtype=cuboid, fill=cvpr_navy!14, draw=cvpr_navy!85!black, minimum width=1.15cm, minimum height=2.2cm, depth=0.55cm, channels={64\\times 64\\times 128}] (c3) at (4.2, 4.8) {$\\mathbf{C}_3$};
  \\node[feature_cube, subtype=cuboid, fill=cvpr_teal!14, draw=cvpr_teal!85!black, minimum width=1.45cm, minimum height=1.6cm, depth=0.7cm, channels={32\\times 32\\times 256}] (c4) at (7.0, 4.8) {$\\mathbf{C}_4$};
  \\node[feature_cube, subtype=cuboid, fill=cvpr_coral!15, draw=cvpr_coral!85!black, minimum width=1.8cm, minimum height=1.1cm, depth=0.9cm, channels={16\\times 16\\times 512}] (c5) at (9.8, 4.8) {$\\mathbf{C}_5$};

  % --- FPN Neck (same x as backbone stages) ---
  \\node[conv_block, fill=cvpr_gold!16, draw=cvpr_gold!85!black, minimum width=2.5cm, minimum height=0.85cm] (sppf) at (9.8, 1.5) {Deformable Attn \\\\ {\\scriptsize Context $\\mathbf{P}_5$}};
  \\node[conv_block, fill=cvpr_teal!14, draw=cvpr_teal!85!black, minimum width=2.5cm, minimum height=0.85cm] (p4) at (7.0, 1.5) {Top-Down Fusion $\\mathbf{P}_4$};
  \\node[conv_block, fill=cvpr_indigo!14, draw=cvpr_indigo!85!black, minimum width=2.5cm, minimum height=0.85cm] (p3) at (4.2, 1.5) {Multi-Scale Head $\\mathbf{P}_3$};
  \\node[conv_block, fill=cvpr_navy!14, draw=cvpr_navy!85!black, minimum width=2.3cm, minimum height=0.85cm] (p2) at (1.6, 1.5) {Dense Mask $\\mathbf{P}_2$};

  % --- Bottom-Up Connections (backbone) ---
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_navy!85!black] (c2) -- node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize] {$\\downarrow 2\\times$} (c3);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_navy!85!black] (c3) -- node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize] {$\\downarrow 2\\times$} (c4);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_teal!85!black] (c4) -- node[midway, fill=white, inner sep=1.5pt, font=\\scriptsize] {$\\downarrow 2\\times$} (c5);

  % --- Top-Down Connections (FPN neck) ---
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_coral!85!black] (c5) -- (sppf);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_gold!85!black] (sppf) -- node[pos=0.45, fill=white, inner sep=1.5pt, font=\\scriptsize] {$\\uparrow 2\\times$} (p4);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_teal!85!black, densely dashed] (c4) -- node[pos=0.35, fill=white, inner sep=1.5pt, font=\\scriptsize] {Lateral} (p4);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_teal!85!black] (p4) -- node[pos=0.45, fill=white, inner sep=1.5pt, font=\\scriptsize] {$\\uparrow 2\\times$} (p3);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_navy!85!black, densely dashed] (c3) -- node[pos=0.35, fill=white, inner sep=1.5pt, font=\\scriptsize] {Lateral} (p3);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_indigo!85!black] (p3) -- node[pos=0.45, fill=white, inner sep=1.5pt, font=\\scriptsize] {$\\uparrow 2\\times$} (p2);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_navy!85!black, densely dashed] (c2) -- (p2);
\\end{tikzpicture}
% \\caption{Multi-scale 3D feature pyramid network with bottom-up spatial downsampling and top-down lateral fusion.}
% \\label{fig:cvpr_3d_fpn}` },
  { tikzCode: `% ============================================================================
% AgenTikZ — Vision-Language Contrastive Alignment (Publication-Grade)
% Strictly symmetric dual towers · Centered ⊗ operator · Clear separation
% ============================================================================
\\begin{tikzpicture}[
  >=Stealth,
  every node/.style={font=\\small}
]
  % --- Vision Stream (x = 1.8, symmetric with Text at x = 5.0) ---
  \\node[feature_cube, subtype=cuboid, fill=cvpr_teal!14, draw=cvpr_teal!85!black, minimum width=1.2cm, minimum height=1.8cm, depth=0.5cm, channels={H\\times W\\times 3}] (img_in) at (1.8, 1.2) {$\\mathbf{I}_{\\text{img}}$};
  \\node[conv_block, fill=cvpr_teal!14, draw=cvpr_teal!85!black, minimum width=2.8cm, minimum height=0.9cm] (vit_enc) at (1.8, 3.2) {ViT Vision Encoder \\\\ {\\scriptsize Patch $14\\times 14$, $L{=}24$}};
  \\node[dl_block, fill=cvpr_navy!14, draw=cvpr_navy!85!black, minimum width=2.8cm, minimum height=0.75cm] (vis_proj) at (1.8, 5.0) {Visual Latents $\\mathbf{z}_v \\in \\mathbb{R}^{d}$};

  % --- Text Stream (x = 5.0, symmetric with Vision at x = 1.8) ---
  \\node[dl_block, fill=cvpr_gold!15, draw=cvpr_gold!85!black, minimum width=2.8cm, minimum height=0.8cm] (txt_in) at (5.0, 1.2) {Text Prompt $\\mathbf{T}_{\\text{text}}$};
  \\node[mha_block, fill=cvpr_gold!16, draw=cvpr_gold!85!black, minimum width=2.8cm, minimum height=0.9cm] (txt_enc) at (5.0, 3.2) {Text Transformer \\\\ {\\scriptsize Causal Attention, $L{=}12$}};
  \\node[dl_block, fill=cvpr_indigo!14, draw=cvpr_indigo!85!black, minimum width=2.8cm, minimum height=0.75cm] (txt_proj) at (5.0, 5.0) {Text Latents $\\mathbf{z}_t \\in \\mathbb{R}^{d}$};

  % --- Contrastive Similarity (centered at midpoint x = 3.4) ---
  \\node[op_circle] (sim_op) at (3.4, 6.5) {$\\otimes$};
  \\node[subtype=math, draw=none, fill=none] (info_nce) at (3.4, 7.7) {$\\mathcal{L}_{\\text{InfoNCE}} = -\\log \\frac{\\exp(\\langle \\mathbf{z}_v, \\mathbf{z}_t \\rangle / \\tau)}{\\sum_j \\exp(\\langle \\mathbf{z}_v, \\mathbf{z}_{t,j} \\rangle / \\tau)}$};

  % --- Connections ---
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_teal!85!black] (img_in) -- (vit_enc);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_teal!85!black] (vit_enc) -- (vis_proj);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_gold!85!black] (txt_in) -- (txt_enc);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_gold!85!black] (txt_enc) -- (txt_proj);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_navy!85!black] (vis_proj.north) |- (sim_op.west);
  \\draw[-Stealth, line width=0.75pt, draw=cvpr_indigo!85!black] (txt_proj.north) |- (sim_op.east);

  % --- Right Panel: Heatmap (3cm gap from dual towers) ---
  \\begin{scope}[shift={(8.2, 1.5)}]
    \\begin{axis}[
      id=clip_heatmap,
      chart_type=heatmap, colormap/viridis, width=5.2cm, height=4.6cm,
      title={Cross-Modal Cosine Similarity $\\mathbf{S}$},
      xlabel={Text Embeddings ($\\mathbf{z}_t$)},
      ylabel={Visual Embeddings ($\\mathbf{z}_v$)},
      grid=none
    ]
      \\addplot[color=#2B5B84] coordinates { (1, 1) (2, 2) (3, 3) (4, 4) };
      \\addlegendentry{Similarity}
      % heatmap_matrix: [[0.91,0.04,0.03,0.02],[0.03,0.88,0.06,0.03],[0.02,0.05,0.86,0.07],[0.01,0.03,0.05,0.91]]
    \\end{axis}
  \\end{scope}

  % --- Aligned Subfigure Captions ---
  \\node[subcaption, subtype=caption, draw=none, fill=none, minimum width=5.6cm, minimum height=0.55cm] (cap_vlm_a) at (3.4, -0.2) {\\textbf{(a)} Dual-Stream Vision-Language Encoder};
  \\node[subcaption, subtype=caption, draw=none, fill=none, minimum width=5.2cm, minimum height=0.55cm] (cap_vlm_b) at (10.8, -0.2) {\\textbf{(b)} Contrastive Alignment Matrix};
\\end{tikzpicture}
% \\caption{Dual-stream vision-language contrastive learning framework (a) and learned token-level similarity matrix (b).}
% \\label{fig:vlm_alignment}` },
  { tikzCode: `% ============================================================================
% AgenTikZ — Conditional Latent Diffusion Transformer (Publication-Grade)
% Equidistant horizontal pipeline · Clear top-down conditioning injection
% ============================================================================
\\begin{tikzpicture}[
  >=Stealth,
  every node/.style={font=\\small}
]
  % --- DiT Block Container (wider for equidistant layout) ---
  \\node[stage_box, subtype=container, minimum width=7.4cm, minimum height=4.8cm] (dit_stage) at (6.2, 3.8) {$\\times N$ AdaLN-Zero Diffusion Transformer (DiT)};

  % --- Left Input: Noisy Latent Tensor ---
  \\node[feature_cube, subtype=cuboid, fill=nips_purple!14, draw=nips_purple!85!black, minimum width=1.1cm, minimum height=2.0cm, depth=0.5cm, channels={z_t \\sim \\mathcal{N}(0,I)}] (zt) at (1.2, 3.6) {$\\mathbf{z}_t$};

  % --- Equidistant Horizontal Pipeline (gap = 2.0cm between centers) ---
  \\node[mha_block, fill=nips_amber!16, draw=nips_amber!85!black, minimum width=2.4cm, minimum height=0.9cm] (self_attn) at (4.2, 3.6) {Spatial-Temporal \\\\ {\\scriptsize Self-Attention}};
  \\node[op_circle] (mod_gate) at (6.2, 3.6) {$\\otimes$};
  \\node[dl_block, fill=nips_blue!14, draw=nips_blue!85!black, minimum width=2.4cm, minimum height=0.9cm] (dit_mlp) at (8.2, 3.6) {Pointwise MLP \\\\ {\\scriptsize AdaLN-Zero}};

  % --- Top Conditioning Inputs (centered above gate) ---
  \\node[addnorm_block, fill=nips_sage!15, draw=nips_sage!85!black, minimum width=3.2cm, minimum height=0.68cm] (cond_emb) at (6.2, 5.6) {Conditioning $\\tau_\\theta(t) + \\mathbf{c}_{\\text{text}}$};

  % --- Right Output: Predicted Clean Latent ---
  \\node[feature_cube, subtype=cuboid, fill=nips_rose!14, draw=nips_rose!85!black, minimum width=1.1cm, minimum height=2.0cm, depth=0.5cm, channels={\\hat{x}_0 = \\mathcal{D}(\\hat{z}_0)}] (x0) at (11.0, 3.6) {$\\hat{\\mathbf{x}}_0$};

  % --- Flow Matching Objective (below pipeline, unobstructed) ---
  \\node[subtype=math, draw=none, fill=none] (fm_eq) at (6.2, 0.7) {$\\mathcal{L}_{\\text{FM}}(\\theta) = \\mathbb{E}_{t, \\mathbf{z}_0, \\mathbf{z}_1} \\left\\| \\mathbf{v}_\\theta(\\mathbf{z}_t, t, \\mathbf{c}) - (\\mathbf{z}_1 - \\mathbf{z}_0) \\right\\|_2^2$};

  % --- Forward Connections ---
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (zt) -- (self_attn);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (self_attn) -- (mod_gate);
  \\draw[-Stealth, line width=0.7pt, draw=nips_sage!85!black] (cond_emb) -- node[pos=0.4, fill=white, inner sep=1.5pt, font=\\scriptsize] {$\\gamma, \\beta$} (mod_gate);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (mod_gate) -- (dit_mlp);
  \\draw[-Stealth, line width=0.7pt, draw=nips_slate!85!black] (dit_mlp) -- (x0);
\\end{tikzpicture}
% \\caption{Conditional Flow Matching / Diffusion Transformer (DiT) pipeline with adaptive layer norm (AdaLN-Zero) modulation.}
% \\label{fig:diffusion_dit_pipeline}` },
  { tikzCode: `% ============================================================================
% AgenTikZ — Nature (NPG) Multi-Panel Experimental Figure (Publication-Grade)
% Strictly equal panel sizes · NPG canonical palette · 0.55pt fine axis
% ============================================================================
\\begin{tikzpicture}[>=Latex]
  % Panel (a): Three-Curve Sample Efficiency with Error Bands
  \\begin{scope}[shift={(0.5, 1.0)}]
    \\begin{axis}[
      id=npg_line,
      chart_type=line, width=5.8cm, height=4.4cm,
      title={Sample Efficiency \\& Convergence},
      xlabel={Training Tokens (Billions)},
      ylabel={Zero-Shot Score (\\%)},
      grid=major,
      grid style={dashed, gray!25},
      tick label style={font=\\scriptsize},
      label style={font=\\footnotesize},
      title style={font=\\footnotesize\\bfseries},
      legend style={at={(0.04, 0.94)}, anchor=north west, font=\\scriptsize, draw=gray!40, fill=white, fill opacity=0.9}
    ]
      \\addplot[color=#E64B35, line width=0.85pt, mark=*] coordinates { (10, 68.4) +- (0, 1.0) (25, 76.2) +- (0, 0.8) (50, 82.9) +- (0, 0.6) (100, 87.1) +- (0, 0.5) };
      \\addlegendentry{Ours-7B}
      \\addplot[color=#3C5488, line width=0.85pt, mark=square*, dashed] coordinates { (10, 63.1) +- (0, 1.3) (25, 70.4) +- (0, 1.1) (50, 75.8) +- (0, 0.9) (100, 79.3) +- (0, 0.8) };
      \\addlegendentry{Standard-7B}
      \\addplot[color=#00A087, line width=0.85pt, mark=triangle*, densely dotted] coordinates { (10, 60.8) +- (0, 1.5) (25, 68.9) +- (0, 1.2) (50, 74.2) +- (0, 1.0) (100, 77.6) +- (0, 0.9) };
      \\addlegendentry{w/o Pre-training}
    \\end{axis}
  \\end{scope}

  % Panel (b): Three-Group Ablation Bar Chart (same dimensions)
  \\begin{scope}[shift={(7.3, 1.0)}]
    \\begin{axis}[
      id=npg_bar,
      ybar, bar width=7pt, width=5.8cm, height=4.4cm,
      title={Cross-Domain Generalization},
      xlabel={Evaluation Benchmark},
      ylabel={Top-1 Accuracy (\\%)},
      grid=major,
      grid style={dashed, gray!25},
      tick label style={font=\\scriptsize},
      label style={font=\\footnotesize},
      title style={font=\\footnotesize\\bfseries},
      legend style={at={(0.04, 0.94)}, anchor=north west, font=\\scriptsize, draw=gray!40, fill=white, fill opacity=0.9}
    ]
      \\addplot[color=#E64B35, line width=0.55pt] coordinates { (Math, 84.2) (Code, 79.6) (Vision, 88.1) };
      \\addlegendentry{Ours}
      \\addplot[color=#00A087, line width=0.55pt] coordinates { (Math, 80.1) (Code, 75.4) (Vision, 85.3) };
      \\addlegendentry{w/o Cross-Attn}
      \\addplot[color=#3C5488, line width=0.55pt] coordinates { (Math, 76.5) (Code, 71.2) (Vision, 82.4) };
      \\addlegendentry{Baseline}
    \\end{axis}
  \\end{scope}

  % Subfigure Captions (centered under each panel)
  \\node[subcaption, subtype=caption, draw=none, fill=none, minimum width=5.8cm, minimum height=0.55cm] (npg_cap_a) at (3.4, -0.2) {\\textbf{(a)} Token Scaling Efficiency};
  \\node[subcaption, subtype=caption, draw=none, fill=none, minimum width=5.8cm, minimum height=0.55cm] (npg_cap_b) at (10.2, -0.2) {\\textbf{(b)} Multi-Task Ablation};
\\end{tikzpicture}
% \\caption{Experimental evaluation following Nature Publishing Group (NPG) figure guidelines: (a) scaling efficiency across training tokens and (b) multi-domain accuracy.}
% \\label{fig:nature_evaluation}` }
];
