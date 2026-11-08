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
        `      \\addlegendentry{Ours (AgenTikZ)}`,
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
