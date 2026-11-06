export type JournalThemeId = 'neurips' | 'cvpr' | 'nature' | 'ieee';

export interface ThemeColorToken {
  name: string;        // TikZ color name e.g. 'nips_blue'
  label: string;       // Chinese display name e.g. '科研蓝'
  fillHex: string;     // Soft tint hex for SVG canvas rendering e.g. '#E8F1FA'
  strokeHex: string;   // Crisp border hex e.g. '#2B5B84'
  tikzFill: string;    // TikZ fill spec e.g. 'nips_blue!14'
  tikzStroke: string;  // TikZ draw spec e.g. 'nips_blue!85!black'
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
}
