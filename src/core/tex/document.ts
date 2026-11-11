import { JOURNAL_THEMES } from '../themes/journal-presets';
import { normalizeLatexDocument, isCompleteLatexDocument } from './source';

export function buildStandaloneLatexDocument(
  tikzCode: string,
  themeId: keyof typeof JOURNAL_THEMES
): string {
  const normalized = normalizeLatexDocument(tikzCode);
  if (isCompleteLatexDocument(normalized)) return normalized;
  tikzCode = normalized;
  const theme = JOURNAL_THEMES[themeId] || JOURNAL_THEMES.neurips;
  const roles = theme.colorRoles;
  const allPreambleColors = Object.values(JOURNAL_THEMES)
    .map((t) => t.tikzPreambleColors)
    .join('\n');

  // Hoist any inline #RRGGBB hex color specs (e.g. color=#2B5B84 in \addplot)
  // to valid xcolor \definecolor{hex_RRGGBB}{HTML}{RRGGBB} definitions
  const hexColors = new Set<string>();
  const sanitizedTikz = tikzCode
    .replace(/#([0-9a-fA-F]{6})\b/g, (_m, hex: string) => {
      const upper = hex.toUpperCase();
      hexColors.add(upper);
      return `hex_${upper}`;
    })
    .replace(
      /every node\/\.style=\{font=\\small\}/g,
      'every node/.style={font=\\small, align=center}'
    );

  const customHexDefs = Array.from(hexColors)
    .map((hex) => `\\definecolor{hex_${hex}}{HTML}{${hex}}`)
    .join('\n');

  // The bundled Noto Sans CJK SC is the only CJK font used in figures; loading
  // it only when needed keeps Latin-only figures fast to compile.
  const hasCjk = /[\u3000-\u30ff\u3400-\u9fff\uff00-\uffef]/.test(tikzCode);
  const cjkPreamble = hasCjk ? '\\usepackage{agentikz-fonts}' : '';
  const optionalLibraries = [
    /blur shadow|shadows\.blur/.test(tikzCode) ? 'shadows.blur' : '',
    /\\matrix|matrix of/.test(tikzCode) ? 'matrix' : '',
    /canvas is [xyz]{2} plane/.test(tikzCode) ? '3d' : '',
  ].filter(Boolean);
  const tdplotPreamble = /\\tdplot/.test(tikzCode) ? '\\usepackage{tikz-3dplot}' : '';

  return [
    '\\documentclass[border=4pt]{standalone}',
    cjkPreamble,
    '\\usepackage{tikz}',
    '\\usepackage{pgfplots}',
    '\\usepackage{graphicx}',
    '\\usepackage{amsmath,mathtools,amssymb,bm}',
    tdplotPreamble,
    '\\pgfplotsset{',
    '  compat=1.18,',
    '  id/.code={},',
    '  chart_type/.code={},',
    '  subcaption/.code={},',
    '  uncertainty_note/.code={},',
    '  direct_labels/.code={},',
    '  title_offset/.code={},',
    '  xlabel_offset/.code={},',
    '  ylabel_offset/.code={},',
    '  legend_scale/.code={},',
    '  legend/.code={}',
    '}',
    '\\usepgfplotslibrary{statistics}',
    `\\usetikzlibrary{${['arrows.meta', 'positioning', 'calc', 'fit', 'backgrounds', 'shadings', 'shapes.geometric', ...optionalLibraries].join(',')}}`,
    '',
    `% --- Publication Theme Color Palette (${theme.venueBadge}) ---`,
    allPreambleColors,
    customHexDefs,
    '',
    '% --- AgenTikZ Semantic Attribute Keys & Default Node Styles ---',
    '\\tikzset{',
    '  every node/.append style={align=center},',
    '  subtype/.code={},',
    '  role/.code={},',
    '  depth/.code={},',
    '  channels/.code={},',
    '  sublabel/.code={},',
    `  dl_block/.style={draw=${roles.signal.stroke}, fill=${roles.signal.fill}, rounded corners=${theme.defaultRoundedCorners}, line width=${theme.defaultLineWidth}, minimum width=2.8cm, minimum height=0.82cm, align=center},`,
    `  mha_block/.style={draw=${roles.hero.stroke}, fill=${roles.hero.fill}, rounded corners=${theme.defaultRoundedCorners}, line width=${theme.defaultLineWidth}, minimum width=3.0cm, minimum height=0.92cm, align=center},`,
    `  addnorm_block/.style={draw=${roles.secondary.stroke}, fill=${roles.secondary.fill}, rounded corners=${theme.defaultRoundedCorners}, line width=${theme.defaultLineWidth}, minimum width=2.8cm, minimum height=0.65cm, align=center},`,
    `  conv_block/.style={draw=${roles.secondary.stroke}, fill=${roles.secondary.fill}, rounded corners=${theme.defaultRoundedCorners}, line width=${theme.defaultLineWidth}, minimum width=2.6cm, minimum height=0.85cm, align=center},`,
    `  feature_cube/.style={draw=${roles.signal.stroke}, fill=${roles.signal.fill}, line width=${theme.defaultLineWidth}, minimum width=1.2cm, minimum height=2.0cm, align=center},`,
    `  op_circle/.style={circle, draw=${roles.neutral.stroke}, fill=white, line width=${theme.defaultLineWidth}, minimum size=0.6cm, inner sep=1pt, align=center},`,
    `  stage_box/.style={draw=${roles.container.stroke}, fill=${roles.container.fill}, dashed, rounded corners=4pt, line width=${theme.defaultLineWidth}, align=center},`,
    '  subcaption/.style={draw=none, fill=none, align=center}',
    '}',
    '',
    '\\begin{document}',
    sanitizedTikz,
    '\\end{document}',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

export function buildPaperFigureEnvironment(
  tikzCode: string,
  caption: string,
  label: string
): string {
  return [
    '\\begin{figure}[t]',
    '  \\centering',
    tikzCode,
    `  \\caption{${caption}}`,
    `  \\label{${label}}`,
    '\\end{figure}',
  ].join('\n');
}
