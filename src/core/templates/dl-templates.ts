import { JournalThemeId } from '../../types/theme';
import { NodeSubtype, PgfChartType } from '../../types/tikz-ast';

export interface PrimitiveLibraryItem {
  id: string;
  name: string;
  category: 'dl' | 'chart';
  badge: string;
  description: string;
  subtype?: NodeSubtype;
  chartType?: PgfChartType;
  generateSnippet: (idSuffix: number, x: number, y: number) => string;
}

export type TemplateCategory =
  | 'all'
  | 'transformer'
  | 'vision_multimodal'
  | 'generative'
  | 'data_charts';

export interface FullFigureTemplate {
  id: string;
  title: string;
  venue: string;
  category: Exclude<TemplateCategory, 'all'>;
  themeId: JournalThemeId;
  description: string;
  tags: string[];
  recommendedPan?: { x: number; y: number };
  recommendedZoom?: number;
  tikzCode: string;
}

export const PRIMITIVE_LIBRARY: PrimitiveLibraryItem[] = [
  {
    id: 'prim_mha',
    name: 'Multi-Head Attention',
    category: 'dl',
    badge: 'Attention',
    description: '带顶刊暖杏配色的多头注意力核心块',
    subtype: 'mha',
    generateSnippet: (idx, x, y) =>
      `  \\node[mha_block, fill=nips_amber!16, draw=nips_amber!85!black, minimum width=3.2cm, minimum height=0.95cm] (mha_${idx}) at (${x.toFixed(1)}, ${y.toFixed(1)}) {Multi-Head Attention \\\\ {\\scriptsize $h=8,\\ d_k=64$}};`,
  },
  {
    id: 'prim_addnorm',
    name: 'Add & LayerNorm',
    category: 'dl',
    badge: 'Norm',
    description: '紧凑型残差归一化层（鼠尾草绿）',
    subtype: 'addnorm',
    generateSnippet: (idx, x, y) =>
      `  \\node[addnorm_block, fill=nips_sage!15, draw=nips_sage!85!black, minimum width=3.2cm, minimum height=0.65cm] (ln_${idx}) at (${x.toFixed(1)}, ${y.toFixed(1)}) {Add \\& LayerNorm};`,
  },
  {
    id: 'prim_ffn',
    name: 'Feed-Forward / SwiGLU',
    category: 'dl',
    badge: 'Layer',
    description: '标准前馈网络或线性投影模块（牛津科研蓝）',
    subtype: 'block',
    generateSnippet: (idx, x, y) =>
      `  \\node[dl_block, fill=nips_blue!14, draw=nips_blue!85!black, minimum width=3.2cm, minimum height=0.85cm] (ffn_${idx}) at (${x.toFixed(1)}, ${y.toFixed(1)}) {SwiGLU Feed-Forward \\\\ {\\scriptsize $\\text{SiLU}(xW_1) \\odot xW_3$}};`,
  },
  {
    id: 'prim_cuboid',
    name: '3D 特征图张量块',
    category: 'dl',
    badge: '3D Tensor',
    description: '可调通道厚度与高宽的 3D 卷积/视觉特征图块 (C×H×W)',
    subtype: 'cuboid',
    generateSnippet: (idx, x, y) =>
      `  \\node[feature_cube, subtype=cuboid, fill=cvpr_navy!14, draw=cvpr_navy!85!black, minimum width=1.25cm, minimum height=2.2cm, depth=0.6cm, channels={64\\times 64\\times 256}] (feat_${idx}) at (${x.toFixed(1)}, ${y.toFixed(1)}) {$\\mathbf{F}_{${idx}}$};`,
  },
  {
    id: 'prim_conv',
    name: 'Conv / Cross-Block',
    category: 'dl',
    badge: 'Vision',
    description: '卷积特征提取或跨模态交互模块（青绿）',
    subtype: 'conv',
    generateSnippet: (idx, x, y) =>
      `  \\node[conv_block, fill=cvpr_teal!14, draw=cvpr_teal!85!black, minimum width=2.8cm, minimum height=0.85cm] (conv_${idx}) at (${x.toFixed(1)}, ${y.toFixed(1)}) {Conv $3\\times 3$ + SiLU};`,
  },
  {
    id: 'prim_op_add',
    name: '算子圆节点 (⊕ / ⊗)',
    category: 'dl',
    badge: 'Operator',
    description: '逐元素相加 \\oplus、相乘 \\otimes 或拼接算子圆节点',
    subtype: 'op_circle',
    generateSnippet: (idx, x, y) =>
      `  \\node[op_circle, circle, fill=white, draw=nips_slate!85!black, minimum size=0.65cm] (op_${idx}) at (${x.toFixed(1)}, ${y.toFixed(1)}) {$\\oplus$};`,
  },
  {
    id: 'prim_container',
    name: '虚线模块分组框',
    category: 'dl',
    badge: 'Group',
    description: '用于包裹 Encoder Stage 或子模块的浅底虚线容器框',
    subtype: 'container',
    generateSnippet: (idx, x, y) =>
      `  \\node[stage_box, subtype=container, dashed, fill=nips_slate!6, draw=nips_slate!60, minimum width=5.2cm, minimum height=4.6cm, rounded corners=4pt] (stage_${idx}) at (${x.toFixed(1)}, ${y.toFixed(1)}) {$\\times N$ Transformer Stage};`,
  },
  {
    id: 'prim_math',
    name: 'LaTeX 公式标注',
    category: 'dl',
    badge: 'Math',
    description: '无边框纯数学公式或张量维度符号标注',
    subtype: 'math',
    generateSnippet: (idx, x, y) =>
      `  \\node[subtype=math, draw=none, fill=none] (math_${idx}) at (${x.toFixed(1)}, ${y.toFixed(1)}) {$\\mathcal{L}_{\\text{total}} = \\mathcal{L}_{\\text{ce}} + \\lambda \\|\\theta\\|_2^2$};`,
  },
  {
    id: 'prim_caption',
    name: '子图图注 (a) / (b)',
    category: 'dl',
    badge: 'Caption',
    description: '顶刊子图图注与模块说明文字，支持自由拖拽与双击修改',
    subtype: 'caption',
    generateSnippet: (idx, x, y) =>
      `  \\node[subcaption, subtype=caption, draw=none, fill=none, minimum width=4.8cm, minimum height=0.55cm] (cap_${idx}) at (${x.toFixed(1)}, ${y.toFixed(1)}) {\\textbf{(a)} Proposed Architecture Sub-module};`,
  },
  // PGFPlots Data Chart Primitives
  {
    id: 'chart_line',
    name: '训练/Scaling 曲线 (含误差带)',
    category: 'chart',
    badge: 'PGFPlots',
    description: '带标准差误差棒/阴影带的顶刊折线对比图',
    chartType: 'line',
    generateSnippet: (idx, x, y) =>
      [
        `  \\begin{scope}[shift={(${x.toFixed(1)}, ${y.toFixed(1)})}]`,
        `    \\begin{axis}[`,
        `      id=line_chart_${idx},`,
        `      chart_type=line, width=5.6cm, height=4.0cm,`,
        `      title={Scaling Law \\& Convergence},`,
        `      xlabel={Compute Scale ($\\times 10^{20}$ FLOPs)},`,
        `      ylabel={Validation Accuracy (\\%)},`,
        `      grid=major, grid style={dashed, gray!25},`,
        `      legend style={at={(0.04, 0.94)}, anchor=north west, font=\\scriptsize, draw=gray!40, fill=white, fill opacity=0.9}`,
        `    ]`,
        `      \\addplot[color=#2B5B84, line width=0.85pt, mark=*] coordinates { (1, 73.2) +- (0, 1.1) (2, 78.9) +- (0, 0.9) (3, 83.4) +- (0, 0.7) (4, 86.8) +- (0, 0.6) };`,
        `      \\addlegendentry{Ours (AgentTikZ)}`,
        `      \\addplot[color=#D97706, line width=0.85pt, mark=square*, dashed] coordinates { (1, 69.5) +- (0, 1.4) (2, 74.1) +- (0, 1.2) (3, 77.6) +- (0, 1.0) (4, 79.8) +- (0, 0.9) };`,
        `      \\addlegendentry{Baseline}`,
        `    \\end{axis}`,
        `  \\end{scope}`,
      ].join('\n'),
  },
  {
    id: 'chart_bar',
    name: '消融实验分组柱状图',
    category: 'chart',
    badge: 'PGFPlots',
    description: '用于多数据集或多指标消融对比的分组柱状图',
    chartType: 'bar',
    generateSnippet: (idx, x, y) =>
      [
        `  \\begin{scope}[shift={(${x.toFixed(1)}, ${y.toFixed(1)})}]`,
        `    \\begin{axis}[`,
        `      id=bar_chart_${idx},`,
        `      ybar, bar width=7pt, width=5.6cm, height=4.0cm,`,
        `      title={Ablation Study on Benchmarks},`,
        `      xlabel={Dataset Benchmark},`,
        `      ylabel={Top-1 Score (\\%)},`,
        `      grid=major, grid style={dashed, gray!25},`,
        `      legend style={at={(0.04, 0.94)}, anchor=north west, font=\\scriptsize, draw=gray!40, fill=white, fill opacity=0.9}`,
        `    ]`,
        `      \\addplot[color=#2B5B84, line width=0.75pt] coordinates { (ImageNet, 84.6) (COCO, 54.2) (ADE20K, 51.8) };`,
        `      \\addlegendentry{Ours}`,
        `      \\addplot[color=#B4690E, line width=0.75pt] coordinates { (ImageNet, 81.2) (COCO, 50.4) (ADE20K, 47.9) };`,
        `      \\addlegendentry{w/o Cross-Attn}`,
        `    \\end{axis}`,
        `  \\end{scope}`,
      ].join('\n'),
  },
  {
    id: 'chart_heatmap',
    name: '注意力/混淆矩阵热力图',
    category: 'chart',
    badge: 'PGFPlots',
    description: '展示 Token 注意力矩阵或类别混淆矩阵的科研热力图',
    chartType: 'heatmap',
    generateSnippet: (idx, x, y) =>
      [
        `  \\begin{scope}[shift={(${x.toFixed(1)}, ${y.toFixed(1)})}]`,
        `    \\begin{axis}[`,
        `      id=heatmap_${idx},`,
        `      chart_type=heatmap, colormap/viridis, width=4.8cm, height=4.0cm,`,
        `      title={Cross-Attention Matrix $\\mathbf{A}$},`,
        `      xlabel={Key Tokens ($K$)},`,
        `      ylabel={Query Tokens ($Q$)},`,
        `      grid=none`,
        `    ]`,
        `      \\addplot[color=#2B5B84] coordinates { (1, 1) (2, 2) (3, 3) (4, 4) };`,
        `      \\addlegendentry{Attention Weight}`,
        `      % heatmap_matrix: [[0.84,0.08,0.05,0.03],[0.07,0.78,0.10,0.05],[0.04,0.11,0.76,0.09],[0.02,0.05,0.09,0.84]]`,
        `    \\end{axis}`,
        `  \\end{scope}`,
      ].join('\n'),
  },
  {
    id: 'chart_boxplot',
    name: '误差分布箱线图 (Boxplot)',
    category: 'chart',
    badge: 'PGFPlots',
    description: '展示多次随机种子实验的中位数、四分位距与离群分布',
    chartType: 'boxplot',
    generateSnippet: (idx, x, y) =>
      [
        `  \\begin{scope}[shift={(${x.toFixed(1)}, ${y.toFixed(1)})}]`,
        `    \\begin{axis}[`,
        `      id=boxplot_${idx},`,
        `      chart_type=boxplot, boxplot/draw direction=y, width=5.2cm, height=4.0cm,`,
        `      title={Multi-Seed Stability ($n=10$)},`,
        `      xlabel={Architecture Variant},`,
        `      ylabel={F1 Score (\\%)},`,
        `      grid=major`,
        `    ]`,
        `      \\addplot+[boxplot prepared={label=Vanilla, median=74.2, upper quartile=76.5, lower quartile=71.8, upper whisker=79.0, lower whisker=68.5}] coordinates {};`,
        `      \\addplot+[boxplot prepared={label=+Pre-LN, median=79.8, upper quartile=81.9, lower quartile=77.6, upper whisker=84.1, lower whisker=75.0}] coordinates {};`,
        `      \\addplot+[boxplot prepared={label=Ours, median=85.1, upper quartile=86.6, lower quartile=83.7, upper whisker=88.4, lower whisker=81.5}] coordinates {};`,
        `    \\end{axis}`,
        `  \\end{scope}`,
      ].join('\n'),
  },
];

export const FULL_FIGURE_TEMPLATES: FullFigureTemplate[] = [
  // ==========================================================================
  // TEMPLATE 1: NeurIPS / ICLR Joint Pre-LN Transformer + Scaling Plot
  // ==========================================================================
  {
    id: 'tpl_neurips_transformer_joint',
    title: 'Pre-LN Transformer 架构 + Scaling 实验联合图',
    venue: 'NeurIPS / ICLR',
    category: 'transformer',
    themeId: 'neurips',
    description:
      '顶刊经典左架构右实验联合布局：(a) Pre-LN SwiGLU 完整模块含对称残差跳线与 ⊕ 算子，(b) PGFPlots 误差带收敛曲线，统一 1.2cm 垂直步进网格',
    tags: ['Transformer', 'Residual Skip', 'PGFPlots', 'Figure 1'],
    recommendedPan: { x: 75, y: 520 },
    recommendedZoom: 1,
    tikzCode: `% ============================================================================
% AgentTikZ — NeurIPS / ICLR Joint Architecture & Scaling (Publication-Grade)
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
% \\label{fig:transformer_scaling}`,
  },

  // ==========================================================================
  // TEMPLATE 2: Parallel Multi-Branch Q-K-V Attention & Gated Fusion (ICLR/ICML)
  // ==========================================================================
  {
    id: 'tpl_iclr_qkv_attention',
    title: '并行三分支 Q-K-V 注意力与门控融合机制细节图',
    venue: 'ICLR / ICML',
    category: 'transformer',
    themeId: 'neurips',
    description:
      '精细微观结构图：Query / Key / Value 三路等距并行投影、缩放点积、Causal Softmax 路由与门控残差输出，算子节点严格居中',
    tags: ['Q-K-V Branches', 'Parallel Layout', 'Dot-Product', 'Micro-Block'],
    recommendedPan: { x: 90, y: 510 },
    recommendedZoom: 1,
    tikzCode: `% ============================================================================
% AgentTikZ — Parallel Q-K-V Scaled Dot-Product Attention (Publication-Grade)
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
% \\label{fig:qkv_micro_architecture}`,
  },

  // ==========================================================================
  // TEMPLATE 3: CVPR / ICCV Multi-Scale 3D Feature Pyramid (FPN / U-Net)
  // ==========================================================================
  {
    id: 'tpl_cvpr_3d_pyramid',
    title: '多尺度 3D 视觉特征金字塔与自顶向下融合 (FPN / U-Net)',
    venue: 'CVPR / ICCV',
    category: 'vision_multimodal',
    themeId: 'cvpr',
    description:
      '多阶段 3D 特征图立方体 (C×H×W) 空间降采样、通道递增与自顶向下 FPN 跨尺度融合，backbone 与 neck 严格 x 对齐',
    tags: ['3D Feature Cube', 'Backbone', 'FPN Fusion', 'Vision'],
    recommendedPan: { x: 80, y: 480 },
    recommendedZoom: 1,
    tikzCode: `% ============================================================================
% AgentTikZ — CVPR / ICCV Multi-Scale 3D Feature Pyramid (Publication-Grade)
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
% \\label{fig:cvpr_3d_fpn}`,
  },

  // ==========================================================================
  // TEMPLATE 4: Vision-Language Multimodal Alignment (CLIP / VLM Style)
  // ==========================================================================
  {
    id: 'tpl_vlm_multimodal_alignment',
    title: '视觉-语言双流多模态对齐架构 + 相似度热力图 (VLM / CLIP)',
    venue: 'CVPR / NeurIPS',
    category: 'vision_multimodal',
    themeId: 'cvpr',
    description:
      '严格对称双塔架构：视觉 ViT Patch 编码流与文本 Causal Attention 编码流，⊗ 对比算子精确居中，右侧跨模态余弦相似度热力图',
    tags: ['Multimodal VLM', 'Dual Encoder', 'Contrastive Heatmap', '3D Tokens'],
    recommendedPan: { x: 75, y: 500 },
    recommendedZoom: 1,
    tikzCode: `% ============================================================================
% AgentTikZ — Vision-Language Contrastive Alignment (Publication-Grade)
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
% \\label{fig:vlm_alignment}`,
  },

  // ==========================================================================
  // TEMPLATE 5: Diffusion / Flow Matching Denoising Pipeline (ICML / NeurIPS)
  // ==========================================================================
  {
    id: 'tpl_diffusion_denoising_pipeline',
    title: 'Latent Diffusion / Flow Matching 条件去噪生成管线 (DiT)',
    venue: 'ICML / NeurIPS',
    category: 'generative',
    themeId: 'neurips',
    description:
      '等距横向流水线：高斯噪声潜变量 → Spatial Self-Attention → AdaLN-Zero 条件调制 → 去噪输出，条件路径从上方清晰注入',
    tags: ['Diffusion / DiT', 'Flow Matching', 'AdaLN Conditioning', 'Generative'],
    recommendedPan: { x: 75, y: 485 },
    recommendedZoom: 1,
    tikzCode: `% ============================================================================
% AgentTikZ — Conditional Latent Diffusion Transformer (Publication-Grade)
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
% \\label{fig:diffusion_dit_pipeline}`,
  },

  // ==========================================================================
  // TEMPLATE 6: Nature (NPG) Multi-Panel Experimental Data Dashboard
  // ==========================================================================
  {
    id: 'tpl_nature_dashboard',
    title: 'Nature 风格：多面板科研实验图表 (Line + Bar + Boxplot)',
    venue: 'Nature / Science',
    category: 'data_charts',
    themeId: 'nature',
    description:
      'NPG 配色规范双联实验图：(a) 三曲线误差带收敛对比 (b) 三组消融柱状图，严格等宽等高 5.8cm × 4.4cm，子图注精确居中',
    tags: ['PGFPlots', 'Grouped Bar', 'Error Band', 'Nature NPG'],
    recommendedPan: { x: 75, y: 475 },
    recommendedZoom: 1,
    tikzCode: `% ============================================================================
% AgentTikZ — Nature (NPG) Multi-Panel Experimental Figure (Publication-Grade)
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
% \\label{fig:nature_evaluation}`,
  },
];
