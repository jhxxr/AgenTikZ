import { JournalTheme, JournalThemeId, ThemeColorToken } from '../../types/theme';
import { AGENT_STYLE_GUIDES } from '../agent/style-guides';

export const JOURNAL_THEMES: Record<JournalThemeId, JournalTheme> = {
  neurips: {
    id: 'neurips',
    name: 'NeurIPS / ICLR Modern',
    venueBadge: 'NeurIPS · ICLR',
    description: '柔和低饱和学术色板，0.7pt 细线与 2.5pt 克制圆角，适合 Transformer 与机制架构图',
    defaultLineWidth: '0.7pt',
    defaultRoundedCorners: '2.5pt',
    arrowTip: '-Stealth',
    fontFamily: '"Computer Modern", "Latin Modern Roman", "Times New Roman", serif',
    palette: [
      {
        name: 'nips_blue',
        label: '牛津科研蓝',
        fillHex: '#EBF3FA',
        strokeHex: '#2B5B84',
        tikzFill: 'nips_blue!14',
        tikzStroke: 'nips_blue!85!black',
      },
      {
        name: 'nips_amber',
        label: '暖杏注意力橙',
        fillHex: '#FEF3E2',
        strokeHex: '#B4690E',
        tikzFill: 'nips_amber!16',
        tikzStroke: 'nips_amber!85!black',
      },
      {
        name: 'nips_sage',
        label: '鼠尾草残差绿',
        fillHex: '#EAF5EF',
        strokeHex: '#28664B',
        tikzFill: 'nips_sage!15',
        tikzStroke: 'nips_sage!85!black',
      },
      {
        name: 'nips_purple',
        label: '潜空间紫',
        fillHex: '#F3EEFA',
        strokeHex: '#5E438B',
        tikzFill: 'nips_purple!14',
        tikzStroke: 'nips_purple!85!black',
      },
      {
        name: 'nips_rose',
        label: '损失函数红',
        fillHex: '#FDEDED',
        strokeHex: '#9E3333',
        tikzFill: 'nips_rose!14',
        tikzStroke: 'nips_rose!85!black',
      },
      {
        name: 'nips_slate',
        label: '中性特征灰',
        fillHex: '#F3F5F8',
        strokeHex: '#475569',
        tikzFill: 'nips_slate!12',
        tikzStroke: 'nips_slate!85!black',
      },
    ],
    chartColors: ['#2B5B84', '#D97706', '#28664B', '#7C3AED', '#BE123C'],
    tikzPreambleColors: [
      '\\definecolor{nips_blue}{HTML}{2B5B84}',
      '\\definecolor{nips_amber}{HTML}{B4690E}',
      '\\definecolor{nips_sage}{HTML}{28664B}',
      '\\definecolor{nips_purple}{HTML}{5E438B}',
      '\\definecolor{nips_rose}{HTML}{9E3333}',
      '\\definecolor{nips_slate}{HTML}{475569}',
    ].join('\n'),
    columnWidthMm: { single: 139.7, double: 139.7 }, // NeurIPS single-column textwidth = 5.5in ≈ 139.7mm
    panelLabelFormat: 'parenthesized',
    minFontSizeLatex: '\\scriptsize',
    colorRoles: {
      hero: { fill: 'nips_amber!16', stroke: 'nips_amber!85!black' },
      signal: { fill: 'nips_blue!14', stroke: 'nips_blue!85!black' },
      secondary: { fill: 'nips_sage!15', stroke: 'nips_sage!85!black' },
      neutral: { fill: 'nips_slate!10', stroke: 'nips_slate!80!black' },
      container: { fill: 'nips_slate!5', stroke: 'nips_slate!55' },
      alert: { fill: 'nips_rose!14', stroke: 'nips_rose!85!black' },
    },
    lineSemantics: {
      primaryFlow: 'solid',
      containerBoundary: 'dashed',
      feedbackOrAuxFlow: 'dotted',
    },
    chartSpec: {
      spineMode: 'closed_box',
      defaultShowGrid: true,
      tickDirection: 'in',
      preferDirectEndLabels: false,
      requireDistinctMarkers: false,
    },
    preferredPrimitives: ['mha_block', 'dl_block', 'addnorm_block', 'op_circle', 'stage_box', 'residual_skip'],
    doNotUse: ['drop shadow', 'rainbow colormap', 'red-green contrast', '3D pie chart', '\\tiny'],
    styleRules: AGENT_STYLE_GUIDES.neurips,
  },
  cvpr: {
    id: 'cvpr',
    name: 'CVPR / ICCV Vision',
    venueBadge: 'CVPR · ICCV',
    description: '高辨识度多尺度视觉特征配色，支持 3D 特征图立方体与紧凑跳线布局',
    defaultLineWidth: '0.75pt',
    defaultRoundedCorners: '1.8pt',
    arrowTip: '-Stealth',
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    palette: [
      {
        name: 'cvpr_navy',
        label: 'Backbone 深蓝',
        fillHex: '#E6EFFA',
        strokeHex: '#1D4ED8',
        tikzFill: 'cvpr_navy!14',
        tikzStroke: 'cvpr_navy!85!black',
      },
      {
        name: 'cvpr_coral',
        label: 'Neck 珊瑚橙',
        fillHex: '#FFF0EB',
        strokeHex: '#C2410C',
        tikzFill: 'cvpr_coral!15',
        tikzStroke: 'cvpr_coral!85!black',
      },
      {
        name: 'cvpr_teal',
        label: 'Feature 青绿',
        fillHex: '#E6F7F5',
        strokeHex: '#0F766E',
        tikzFill: 'cvpr_teal!14',
        tikzStroke: 'cvpr_teal!85!black',
      },
      {
        name: 'cvpr_indigo',
        label: 'Head 靛紫',
        fillHex: '#EEF0FF',
        strokeHex: '#4338CA',
        tikzFill: 'cvpr_indigo!14',
        tikzStroke: 'cvpr_indigo!85!black',
      },
      {
        name: 'cvpr_gold',
        label: 'Attention 琥珀',
        fillHex: '#FEF9E7',
        strokeHex: '#A16207',
        tikzFill: 'cvpr_gold!16',
        tikzStroke: 'cvpr_gold!85!black',
      },
      {
        name: 'cvpr_gray',
        label: 'Stage 边框灰',
        fillHex: '#F4F5F7',
        strokeHex: '#334155',
        tikzFill: 'cvpr_gray!10',
        tikzStroke: 'cvpr_gray!85!black',
      },
    ],
    chartColors: ['#1D4ED8', '#EA580C', '#0F766E', '#4338CA', '#B91C1C'],
    tikzPreambleColors: [
      '\\definecolor{cvpr_navy}{HTML}{1D4ED8}',
      '\\definecolor{cvpr_coral}{HTML}{C2410C}',
      '\\definecolor{cvpr_teal}{HTML}{0F766E}',
      '\\definecolor{cvpr_indigo}{HTML}{4338CA}',
      '\\definecolor{cvpr_gold}{HTML}{A16207}',
      '\\definecolor{cvpr_gray}{HTML}{334155}',
    ].join('\n'),
    columnWidthMm: { single: 83.0, double: 174.6 },
    panelLabelFormat: 'parenthesized',
    minFontSizeLatex: '\\scriptsize',
    colorRoles: {
      hero: { fill: 'cvpr_coral!15', stroke: 'cvpr_coral!85!black' },
      signal: { fill: 'cvpr_navy!14', stroke: 'cvpr_navy!85!black' },
      secondary: { fill: 'cvpr_teal!14', stroke: 'cvpr_teal!85!black' },
      neutral: { fill: 'cvpr_gray!10', stroke: 'cvpr_gray!80!black' },
      container: { fill: 'cvpr_gray!6', stroke: 'cvpr_gray!60' },
      alert: { fill: 'cvpr_gold!16', stroke: 'cvpr_gold!85!black' },
    },
    lineSemantics: {
      primaryFlow: 'solid',
      containerBoundary: 'dashed',
      feedbackOrAuxFlow: 'dotted',
    },
    chartSpec: {
      spineMode: 'open_left_bottom',
      defaultShowGrid: false,
      tickDirection: 'out',
      preferDirectEndLabels: true,
      requireDistinctMarkers: false,
    },
    preferredPrimitives: ['feature_cube', 'conv_block', 'mha_block', 'op_circle', 'stage_box'],
    doNotUse: ['drop shadow', 'jet colormap', '\\tiny'],
    styleRules: AGENT_STYLE_GUIDES.cvpr,
  },
  nature: {
    id: 'nature',
    name: 'Nature / Science Minimal',
    venueBadge: 'Nature · NPG',
    description: 'NPG 经典高对比度极简色板，0.55pt 纤细轴线与无冗余装饰，最适合机制图与数据图表',
    defaultLineWidth: '0.55pt',
    defaultRoundedCorners: '1.5pt',
    arrowTip: '-Latex',
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
    palette: [
      {
        name: 'npg_blue',
        label: 'NPG 经典蓝',
        fillHex: '#EBF4F8',
        strokeHex: '#3C5488',
        tikzFill: 'npg_blue!14',
        tikzStroke: 'npg_blue!90!black',
      },
      {
        name: 'npg_red',
        label: 'NPG 绯红',
        fillHex: '#FCEEEB',
        strokeHex: '#E64B35',
        tikzFill: 'npg_red!14',
        tikzStroke: 'npg_red!85!black',
      },
      {
        name: 'npg_teal',
        label: 'NPG 翠青',
        fillHex: '#E8F7F4',
        strokeHex: '#00A087',
        tikzFill: 'npg_teal!14',
        tikzStroke: 'npg_teal!85!black',
      },
      {
        name: 'npg_sand',
        label: 'NPG 暖褐',
        fillHex: '#F9F2EC',
        strokeHex: '#B09C85',
        tikzFill: 'npg_sand!18',
        tikzStroke: 'npg_sand!85!black',
      },
      {
        name: 'npg_sky',
        label: 'NPG 天青',
        fillHex: '#ECF7FD',
        strokeHex: '#4DBBD5',
        tikzFill: 'npg_sky!15',
        tikzStroke: 'npg_sky!85!black',
      },
      {
        name: 'npg_dark',
        label: 'NPG 石墨灰',
        fillHex: '#F4F4F6',
        strokeHex: '#333333',
        tikzFill: 'npg_dark!10',
        tikzStroke: 'npg_dark!90!black',
      },
    ],
    chartColors: ['#E64B35', '#4DBBD5', '#00A087', '#3C5488', '#F39B7F'],
    tikzPreambleColors: [
      '\\definecolor{npg_blue}{HTML}{3C5488}',
      '\\definecolor{npg_red}{HTML}{E64B35}',
      '\\definecolor{npg_teal}{HTML}{00A087}',
      '\\definecolor{npg_sand}{HTML}{B09C85}',
      '\\definecolor{npg_sky}{HTML}{4DBBD5}',
      '\\definecolor{npg_dark}{HTML}{333333}',
    ].join('\n'),
    columnWidthMm: { single: 89.0, double: 183.0 },
    panelLabelFormat: 'lowercase_bold',
    minFontSizeLatex: '\\scriptsize',
    colorRoles: {
      hero: { fill: 'npg_red!14', stroke: 'npg_red!85!black' },
      signal: { fill: 'npg_blue!14', stroke: 'npg_blue!90!black' },
      secondary: { fill: 'npg_teal!14', stroke: 'npg_teal!85!black' },
      neutral: { fill: 'npg_dark!8', stroke: 'npg_dark!75!black' },
      container: { fill: 'npg_dark!4', stroke: 'npg_dark!50' },
      alert: { fill: 'npg_red!18', stroke: 'npg_red!90!black' },
    },
    lineSemantics: {
      primaryFlow: 'solid',
      containerBoundary: 'dashed',
      feedbackOrAuxFlow: 'dotted',
    },
    chartSpec: {
      spineMode: 'open_left_bottom',
      defaultShowGrid: false,
      tickDirection: 'out',
      preferDirectEndLabels: true,
      requireDistinctMarkers: false,
    },
    preferredPrimitives: ['op_circle', 'residual_skip', 'error_band', 'stage_box', 'dl_block'],
    doNotUse: ['grid', 'drop shadow', 'rainbow colormap', 'red-green contrast', '3D bar chart', '\\tiny'],
    styleRules: AGENT_STYLE_GUIDES.nature,
  },
  ieee: {
    id: 'ieee',
    name: 'IEEE / ACM Monochrome-Ready',
    venueBadge: 'IEEE · ACM',
    description: '兼顾彩色电子版与黑白印刷灰度层次，清晰线型对比与直角/微圆角工程风',
    defaultLineWidth: '0.65pt',
    defaultRoundedCorners: '1.0pt',
    arrowTip: '-Stealth',
    fontFamily: '"Times New Roman", "Latin Modern Roman", serif',
    palette: [
      {
        name: 'ieee_ink',
        label: '标准工程黑',
        fillHex: '#FFFFFF',
        strokeHex: '#0F172A',
        tikzFill: 'white',
        tikzStroke: 'black!90',
      },
      {
        name: 'ieee_blue',
        label: 'IEEE 皇家蓝',
        fillHex: '#EDF4FC',
        strokeHex: '#00629B',
        tikzFill: 'ieee_blue!12',
        tikzStroke: 'ieee_blue!90!black',
      },
      {
        name: 'ieee_silver',
        label: '浅灰填充层',
        fillHex: '#F1F5F9',
        strokeHex: '#334155',
        tikzFill: 'black!6',
        tikzStroke: 'black!80',
      },
      {
        name: 'ieee_amber',
        label: '信号强调金',
        fillHex: '#FEF5E7',
        strokeHex: '#9A5B13',
        tikzFill: 'ieee_amber!14',
        tikzStroke: 'ieee_amber!85!black',
      },
      {
        name: 'ieee_teal',
        label: '控制回路青',
        fillHex: '#EBF7F7',
        strokeHex: '#115E59',
        tikzFill: 'ieee_teal!12',
        tikzStroke: 'ieee_teal!85!black',
      },
      {
        name: 'ieee_midgray',
        label: '深灰容器框',
        fillHex: '#F8FAFC',
        strokeHex: '#475569',
        tikzFill: 'black!3',
        tikzStroke: 'black!65',
      },
    ],
    chartColors: ['#00629B', '#1E293B', '#9A5B13', '#115E59', '#64748B'],
    tikzPreambleColors: [
      '\\definecolor{ieee_blue}{HTML}{00629B}',
      '\\definecolor{ieee_amber}{HTML}{9A5B13}',
      '\\definecolor{ieee_teal}{HTML}{115E59}',
    ].join('\n'),
    columnWidthMm: { single: 88.9, double: 181.9 },
    panelLabelFormat: 'parenthesized',
    minFontSizeLatex: '\\scriptsize',
    colorRoles: {
      hero: { fill: 'ieee_amber!14', stroke: 'ieee_amber!85!black' },
      signal: { fill: 'ieee_blue!12', stroke: 'ieee_blue!90!black' },
      secondary: { fill: 'ieee_teal!12', stroke: 'ieee_teal!85!black' },
      neutral: { fill: 'black!5', stroke: 'black!80' },
      container: { fill: 'black!3', stroke: 'black!60' },
      alert: { fill: 'ieee_amber!18', stroke: 'black!90' },
    },
    lineSemantics: {
      primaryFlow: 'solid',
      containerBoundary: 'dashed',
      feedbackOrAuxFlow: 'dotted',
    },
    chartSpec: {
      spineMode: 'closed_box',
      defaultShowGrid: true,
      tickDirection: 'in',
      preferDirectEndLabels: false,
      requireDistinctMarkers: true,
    },
    preferredPrimitives: ['dl_block', 'op_circle', 'stage_box', 'residual_skip'],
    doNotUse: ['drop shadow', 'rainbow colormap', '\\tiny'],
    styleRules: AGENT_STYLE_GUIDES.ieee,
  },
};

/**
 * 动态生成与当前激活主题匹配的默认组件样式字典，彻底消除硬编码 `nips_*` 回退
 */
export function getThemeDefaultPreambleStyles(
  themeId: JournalThemeId = 'neurips'
): Record<string, Record<string, string>> {
  const theme = JOURNAL_THEMES[themeId] || JOURNAL_THEMES.neurips;
  const roles = theme.colorRoles;
  const lw = theme.defaultLineWidth;
  const rc = theme.defaultRoundedCorners;

  return {
    dl_block: {
      draw: roles.signal.stroke,
      fill: roles.signal.fill,
      'rounded corners': rc,
      'line width': lw,
      'minimum width': '2.8cm',
      'minimum height': '0.85cm',
    },
    mha_block: {
      draw: roles.hero.stroke,
      fill: roles.hero.fill,
      'rounded corners': rc,
      'line width': lw,
      'minimum width': '3.0cm',
      'minimum height': '0.95cm',
    },
    addnorm_block: {
      draw: roles.neutral.stroke,
      fill: roles.neutral.fill,
      'rounded corners': rc,
      'line width': lw,
      'minimum width': '2.8cm',
      'minimum height': '0.65cm',
    },
    conv_block: {
      draw: roles.secondary.stroke,
      fill: roles.secondary.fill,
      'rounded corners': rc,
      'line width': lw,
      'minimum width': '2.6cm',
      'minimum height': '0.85cm',
    },
    feature_cube: {
      draw: roles.signal.stroke,
      fill: roles.signal.fill,
      'line width': lw,
      'minimum width': '1.2cm',
      'minimum height': '2.2cm',
    },
    op_circle: {
      circle: 'true',
      draw: roles.neutral.stroke,
      fill: 'white',
      'line width': lw,
      'minimum size': '0.65cm',
    },
    stage_box: {
      draw: roles.container.stroke,
      fill: roles.container.fill,
      dashed: 'true',
      'rounded corners': '3.5pt',
      'line width': lw,
    },
    subcaption: {
      subtype: 'caption',
      draw: 'none',
      fill: 'none',
      'minimum width': '4.6cm',
      'minimum height': '0.55cm',
    },
  };
}

/**
 * 自动生成论文工程专属的 `styles/agentikz-macros.sty` 宏包文件内容。
 * 论文 `main.tex` 只需在导言区添加 `\usepackage{styles/agentikz-macros}`，
 * 即可在正文中零报错 `\input{figures/xxx.tikz}`。
 */
export function generateAgentikzMacrosSty(
  activeThemeId: JournalThemeId = 'nature',
  extraHexColors: string[] = []
): string {
  const theme = JOURNAL_THEMES[activeThemeId] || JOURNAL_THEMES.nature;
  const roles = theme.colorRoles;
  const lw = theme.defaultLineWidth;
  const rc = theme.defaultRoundedCorners;

  const allThemeColors = Object.values(JOURNAL_THEMES)
    .map((t) => `% [${t.venueBadge}]\n${t.tikzPreambleColors}`)
    .join('\n');

  const uniqueHexes = Array.from(
    new Set(extraHexColors.map((h) => h.replace(/^#/, '').toUpperCase()))
  ).filter((h) => /^[0-9A-F]{6}$/.test(h));

  const extraHexDefs = uniqueHexes
    .map((hex) => `\\definecolor{hex_${hex}}{HTML}{${hex}}`)
    .join('\n');

  return [
    '\\NeedsTeXFormat{LaTeX2e}',
    '\\ProvidesPackage{styles/agentikz-macros}[2026/11/07 AgenTikZ Self-Contained Figure Style Package]',
    '',
    '\\RequirePackage{tikz}',
    '\\RequirePackage{pgfplots}',
    '\\RequirePackage{graphicx}',
    '\\RequirePackage{amsmath,amssymb}',
    '\\pgfplotsset{',
    '  compat=1.18,',
    '  id/.code={},',
    '  chart_type/.code={},',
    '  subcaption/.code={},',
    '  title_offset/.code={},',
    '  xlabel_offset/.code={},',
    '  ylabel_offset/.code={},',
    '  legend_scale/.code={},',
    '  legend/.code={},',
    '  uncertainty_note/.code={}',
    '}',
    '\\usepgfplotslibrary{statistics}',
    '\\usetikzlibrary{arrows.meta,positioning,calc,fit,backgrounds,shadings,shapes.geometric}',
    '',
    '% --- All Publication Theme Color Tokens ---',
    allThemeColors,
    extraHexDefs,
    '',
    `% --- Active Theme Canonical Block Styles (${theme.name}) ---`,
    '\\tikzset{',
    '  every node/.append style={align=center},',
    '  subtype/.code={},',
    '  role/.code={},',
    '  depth/.code={},',
    '  channels/.code={},',
    '  sublabel/.code={},',
    '  image_path/.code={},',
    `  dl_block/.style={draw=${roles.signal.stroke}, fill=${roles.signal.fill}, rounded corners=${rc}, line width=${lw}, minimum width=2.8cm, minimum height=0.82cm, align=center},`,
    `  mha_block/.style={draw=${roles.hero.stroke}, fill=${roles.hero.fill}, rounded corners=${rc}, line width=${lw}, minimum width=3.0cm, minimum height=0.92cm, align=center},`,
    `  addnorm_block/.style={draw=${roles.neutral.stroke}, fill=${roles.neutral.fill}, rounded corners=${rc}, line width=${lw}, minimum width=2.8cm, minimum height=0.65cm, align=center},`,
    `  conv_block/.style={draw=${roles.secondary.stroke}, fill=${roles.secondary.fill}, rounded corners=${rc}, line width=${lw}, minimum width=2.6cm, minimum height=0.85cm, align=center},`,
    `  feature_cube/.style={draw=${roles.signal.stroke}, fill=${roles.signal.fill}, line width=${lw}, minimum width=1.2cm, minimum height=2.0cm, align=center},`,
    `  op_circle/.style={circle, draw=${roles.neutral.stroke}, fill=white, line width=${lw}, minimum size=0.6cm, inner sep=1pt, align=center},`,
    `  stage_box/.style={draw=${roles.container.stroke}, fill=${roles.container.fill}, dashed, rounded corners=3.5pt, line width=${lw}, align=center},`,
    '  subcaption/.style={draw=none, fill=none, align=center}',
    '}',
    '\\endinput',
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}


const ALL_COLOR_TOKENS: ThemeColorToken[] = Object.values(JOURNAL_THEMES).flatMap(
  (t) => t.palette
);

const STANDARD_TIKZ_COLORS: Record<string, { fill: string; stroke: string }> = {
  white: { fill: '#FFFFFF', stroke: '#334155' },
  black: { fill: '#F1F5F9', stroke: '#0F172A' },
  gray: { fill: '#F3F4F6', stroke: '#4B5563' },
  darkgray: { fill: '#E5E7EB', stroke: '#1F2937' },
  lightgray: { fill: '#F9FAFB', stroke: '#6B7280' },
  slate: { fill: '#F1F5F9', stroke: '#475569' },
  blue: { fill: '#EBF3FA', stroke: '#2563EB' },
  navy: { fill: '#E6EFFA', stroke: '#1E3A8A' },
  indigo: { fill: '#EEF0FF', stroke: '#4338CA' },
  cyan: { fill: '#ECFEFF', stroke: '#0891B2' },
  teal: { fill: '#E6F7F5', stroke: '#0D9488' },
  green: { fill: '#EAF5EF', stroke: '#16A34A' },
  sage: { fill: '#EAF5EF', stroke: '#28664B' },
  emerald: { fill: '#ECFDF5', stroke: '#059669' },
  lime: { fill: '#F7FEE7', stroke: '#65A30D' },
  olive: { fill: '#F4F6E8', stroke: '#4D7C0F' },
  orange: { fill: '#FEF3E2', stroke: '#D97706' },
  coral: { fill: '#FFF0EB', stroke: '#C2410C' },
  amber: { fill: '#FEF3C7', stroke: '#B45309' },
  gold: { fill: '#FEF9E7', stroke: '#A16207' },
  red: { fill: '#FDEDED', stroke: '#DC2626' },
  crimson: { fill: '#FCE7F3', stroke: '#BE123C' },
  rose: { fill: '#FFF1F2', stroke: '#E11D48' },
  pink: { fill: '#FDF2F8', stroke: '#DB2777' },
  magenta: { fill: '#FAE8FF', stroke: '#A21CAF' },
  purple: { fill: '#F3EEFA', stroke: '#7C3AED' },
  violet: { fill: '#F5F3FF', stroke: '#6D28D9' },
  yellow: { fill: '#FEFCE8', stroke: '#CA8A04' },
  brown: { fill: '#FBF3EE', stroke: '#78350F' },
};

const CUSTOM_TIKZ_COLORS: Record<string, { fill: string; stroke: string; baseHex: string }> = {};

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace(/^#/, '').trim();
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.slice(0, 2), 16);
    const g = parseInt(clean.slice(2, 4), 16);
    const b = parseInt(clean.slice(4, 6), 16);
    return isNaN(r) || isNaN(g) || isNaN(b) ? null : { r, g, b };
  }
  return null;
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (
    '#' +
    [clamp(r), clamp(g), clamp(b)]
      .map((c) => c.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function mixHex(hexA: string, hexB: string, weightA: number): string {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  if (!a || !b) return hexA;
  const w = Math.max(0, Math.min(1, weightA));
  return rgbToHex(
    a.r * w + b.r * (1 - w),
    a.g * w + b.g * (1 - w),
    a.b * w + b.b * (1 - w)
  );
}

/**
 * Scans TikZ source for `\definecolor{name}{HTML}{HEX}` or `\definecolor{name}{RGB}{r,g,b}`
 * and registers them for `resolveTikzColor`.
 */
export function registerCustomTikzColors(source: string): void {
  const htmlRegex = /\\definecolor\{\s*([a-zA-Z0-9_-]+)\s*\}\{\s*HTML\s*\}\{\s*#?([0-9a-fA-F]{6})\s*\}/g;
  let m: RegExpExecArray | null;
  while ((m = htmlRegex.exec(source)) !== null) {
    const name = m[1].trim();
    const baseHex = `#${m[2].toUpperCase()}`;
    const rgb = hexToRgb(baseHex);
    const isLight =
      rgb && (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255 > 0.78;
    CUSTOM_TIKZ_COLORS[name] = {
      baseHex,
      fill: isLight ? baseHex : mixHex(baseHex, '#FFFFFF', 0.16),
      stroke: isLight ? mixHex(baseHex, '#0F172A', 0.55) : baseHex,
    };
  }

  const rgbRegex = /\\definecolor\{\s*([a-zA-Z0-9_-]+)\s*\}\{\s*RGB\s*\}\{\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\}/g;
  while ((m = rgbRegex.exec(source)) !== null) {
    const name = m[1].trim();
    const r = Number(m[2]);
    const g = Number(m[3]);
    const b = Number(m[4]);
    const baseHex = rgbToHex(r, g, b);
    const isLight = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.78;
    CUSTOM_TIKZ_COLORS[name] = {
      baseHex,
      fill: isLight ? baseHex : mixHex(baseHex, '#FFFFFF', 0.16),
      stroke: isLight ? mixHex(baseHex, '#0F172A', 0.55) : baseHex,
    };
  }
}

/**
 * Resolves a TikZ color expression (e.g. `nips_blue!14`, `blue!15`, `black!80`, `#EBF3FA`)
 * to a clean SVG hex color suitable for the white canvas.
 */
export function resolveTikzColor(
  tikzColorSpec: string | undefined,
  role: 'fill' | 'stroke',
  activeThemeId: JournalThemeId = 'neurips'
): string {
  if (!tikzColorSpec) {
    return role === 'fill' ? '#FFFFFF' : '#1E293B';
  }
  const trimmed = tikzColorSpec.trim();
  if (trimmed === 'none') return 'none';
  if (trimmed.startsWith('#')) return trimmed;

  const parts = trimmed.split('!').map((s) => s.trim());
  const baseName = parts[0];
  const pct = parts.length > 1 ? parseFloat(parts[1]) : NaN;
  const secondColor = parts.length > 2 ? parts[2].toLowerCase() : undefined;

  // Check theme tokens first
  const token = ALL_COLOR_TOKENS.find((c) => c.name === baseName);
  if (token) {
    return role === 'fill' ? token.fillHex : token.strokeHex;
  }

  // Check user/agent \definecolor tokens
  const custom = CUSTOM_TIKZ_COLORS[baseName];
  if (custom) {
    if (!isNaN(pct)) {
      const targetHex =
        secondColor === 'black'
          ? '#0F172A'
          : secondColor && STANDARD_TIKZ_COLORS[secondColor]
            ? STANDARD_TIKZ_COLORS[secondColor].stroke
            : '#FFFFFF';
      return mixHex(custom.baseHex, targetHex, pct / 100);
    }
    return role === 'fill' ? custom.fill : custom.stroke;
  }

  // Check standard TikZ color names
  const std = STANDARD_TIKZ_COLORS[baseName.toLowerCase()];
  if (std) {
    if (baseName.toLowerCase() === 'black' && role === 'fill') {
      const match = trimmed.match(/black!(\d+)/);
      if (match) {
        const blackPct = parseInt(match[1], 10);
        if (blackPct <= 5) return '#F8FAFC';
        if (blackPct <= 12) return '#F1F5F9';
        if (blackPct <= 25) return '#E2E8F0';
      }
    }
    if (!isNaN(pct) && secondColor === 'black') {
      return mixHex(std.stroke, '#0F172A', pct / 100);
    }
    if (!isNaN(pct) && role === 'fill' && pct <= 45) {
      return mixHex(std.stroke, '#FFFFFF', Math.max(0.1, pct / 100));
    }
    return role === 'fill' ? std.fill : std.stroke;
  }

  const fallbackPalette = JOURNAL_THEMES[activeThemeId].palette[0];
  return role === 'fill' ? fallbackPalette.fillHex : fallbackPalette.strokeHex;
}

export function ptToPx(ptSpec: string | undefined, defaultPt = 0.7): number {
  if (!ptSpec) return defaultPt * 1.65;
  const num = parseFloat(ptSpec.replace(/[^0-9.]/g, ''));
  if (isNaN(num)) return defaultPt * 1.65;
  return Math.max(0.8, num * 1.65);
}
