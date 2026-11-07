export type JournalThemeId = 'neurips' | 'cvpr' | 'nature' | 'ieee';

export type NodeSalienceRole =
  | 'hero'       // 论文核心创新模块 (Ours) -> 唯一高饱和强调色
  | 'signal'     // 主干数据流/关键模块 -> 主题主信号色
  | 'secondary'  // 辅助/正交验证分支 -> 次信号色
  | 'neutral'    // 常规算子/Baseline/已有方法 -> 克制浅灰/极淡中性色
  | 'container'  // 阶段分组框 -> 极淡背景 + 虚线/细实线外框
  | 'alert';     // 瓶颈/Failure Case/误差高亮 -> 警示色

export interface ThemeColorToken {
  name: string;        // TikZ color name e.g. 'nips_blue'
  label: string;       // Chinese display name e.g. '科研蓝'
  fillHex: string;     // Soft tint hex for SVG canvas rendering e.g. '#E8F1FA'
  strokeHex: string;   // Crisp border hex e.g. '#2B5B84'
  tikzFill: string;    // TikZ fill spec e.g. 'nips_blue!14'
  tikzStroke: string;  // TikZ draw spec e.g. 'nips_blue!85!black'
}

export interface JournalChartStyleSpec {
  spineMode: 'open_left_bottom' | 'closed_box'; // Nature 强制 open_left_bottom (L型)，IEEE/NeurIPS 可用 closed_box
  defaultShowGrid: boolean;                     // Nature 强制 false
  tickDirection: 'out' | 'in';                  // Nature 强制 'out'
  preferDirectEndLabels: boolean;               // <=4 条曲线优先末端直接标注
  requireDistinctMarkers: boolean;              // IEEE 黑白打印友好要求
}

export interface JournalTheme {
  id: JournalThemeId;
  name: string;
  venueBadge: string;
  description: string;
  defaultLineWidth: string;      // e.g. '0.7pt'
  defaultRoundedCorners: string; // e.g. '2.5pt'
  arrowTip: string;              // e.g. '-Stealth' or '-Latex'
  fontFamily: string;
  palette: ThemeColorToken[];
  chartColors: string[];         // Hex colors for PGFPlots series
  tikzPreambleColors: string;    // \definecolor{...} definitions

  // --- 结构化顶刊规范字段 (借鉴 nature-skills) ---
  columnWidthMm: { single: number; double: number }; // 如 Nature: { single: 89, double: 183 }
  panelLabelFormat: 'lowercase_bold' | 'parenthesized'; // '\textbf{a}' vs '(a)'
  minFontSizeLatex: '\\scriptsize' | '\\footnotesize';
  colorRoles: Record<NodeSalienceRole, { fill: string; stroke: string }>;
  lineSemantics: {
    primaryFlow: 'solid';
    containerBoundary: 'dashed';
    feedbackOrAuxFlow: 'dotted';
  };
  chartSpec: JournalChartStyleSpec;
  preferredPrimitives: string[];
  doNotUse: string[];
  styleRules: string;
}

