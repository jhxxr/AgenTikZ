/**
 * @fileoverview Agent Knowledge Engine:
 *   Serializes AgenTikZ's Component Library, Journal Theme Color Design System,
 *   Academic Drawing & Layout Engineering Rules, Surgical Diff Protocol, and
 *   live Canvas AST / Layout Diagnostics for the Right-Side ACP Agent.
 */

import { JournalThemeId } from '../../types/theme';
import { PRIMITIVE_LIBRARY } from '../templates/dl-templates';
import { JOURNAL_THEMES } from '../themes/journal-presets';
import { parseTikzDocument } from '../parser/parser';
import { analyzeTikzLayout, getThemeSemanticPalette } from './layout-diagnostics';

/**
 * Builds the comprehensive Agent Skill, Component Library, Color Palette,
 * Layout Engineering, and AST Diagnostic context passed to the ACP Agent.
 */
export function buildAgentSkillAndLibraryContext(
  activeThemeId: string = 'neurips',
  canvasTikz: string = '',
  selectedIds: string[] = []
): string {
  const themeId = (
    activeThemeId in JOURNAL_THEMES ? activeThemeId : 'neurips'
  ) as JournalThemeId;
  const theme = JOURNAL_THEMES[themeId];
  const palette = getThemeSemanticPalette(themeId);

  const primitiveLines = PRIMITIVE_LIBRARY.map(
    (p) =>
      `- [${p.category.toUpperCase()}] ${p.name} (${p.id}): ${p.description}\n  Snippet: ${p.generateSnippet(1, 0, 0).replace(/\n/g, ' ')}`
  );

  const sections: string[] = [
    '=== AGENTIKZ COMPONENT LIBRARY & VISUAL RENDERER SPECIFICATION ===',
    'AgenTikZ renders TikZ on an interactive vector canvas + LaTeX compiler. Use these canonical styles and node attributes so components render with rich visual fidelity:',
    '1. Neural & Architecture Blocks:',
    '   - Attention / Multi-Head Block: `\\node[mha_block, fill=' +
      palette.attention.fill +
      ', draw=' +
      palette.attention.stroke +
      ', minimum width=3.4cm, minimum height=0.85cm] (mha1) at (x, y) {Multi-Head\\\\[-1pt]\\scriptsize Self-Attention};`',
    '   - Backbone / Feed-Forward / Conv / Linear Block: `\\node[dl_block, fill=' +
      palette.backbone.fill +
      ', draw=' +
      palette.backbone.stroke +
      ', minimum width=3.4cm, minimum height=0.85cm] (ffn1) at (x, y) {Position-Wise\\\\[-1pt]\\scriptsize Feed-Forward};`',
    '   - Add & Norm / Residual Norm Block: `\\node[addnorm_block, fill=' +
      palette.norm.fill +
      ', draw=' +
      palette.norm.stroke +
      ', minimum width=3.4cm, minimum height=0.70cm] (norm1) at (x, y) {Add \\& Norm};`',
    '   - Embedding / Token / Input Block: `\\node[dl_block, fill=' +
      palette.embedding.fill +
      ', draw=' +
      palette.embedding.stroke +
      ', minimum width=3.2cm, minimum height=0.75cm] (emb1) at (x, y) {Input Embedding};`',
    '   - Output / Projection / Softmax Block: `\\node[dl_block, fill=' +
      palette.output.fill +
      ', draw=' +
      palette.output.stroke +
      ', minimum width=3.2cm, minimum height=0.75cm] (out1) at (x, y) {Linear \\& Softmax};`',
    '2. 3D Feature Tensor Cuboids (`subtype=cuboid`):',
    '   - `\\node[feature_cube, fill=' +
      palette.backbone.fill +
      ', draw=' +
      palette.backbone.stroke +
      ', minimum width=1.1cm, minimum height=1.6cm, subtype=cuboid, depth=0.45, channels={64,128,256}] (feat1) at (x, y) {$H\\times W\\times C$};`',
    '3. Mathematical Operators (`op_circle` / `subtype=operator`):',
    '   - `\\node[op_circle, minimum size=0.6cm] (add1) at (x, y) {$+$};` (use `$\\oplus$`, `$\\otimes$`, `$\\times$`, `$\\sigma$`)',
    '4. Stage Grouping Container (`stage_box` / `subtype=container`):',
    '   - `\\node[stage_box, fill=' +
      palette.neutral.containerFill +
      ', draw=' +
      palette.neutral.containerStroke +
      ', minimum width=4.8cm, minimum height=6.4cm, subtype=container] (enc_stage) at (x, y) {Encoder Layer $\\times N$};`',
    '   - CRITICAL CONTAINER RULE: `stage_box` MUST be declared FIRST in the TikZ code (background layer) before inner nodes, and its `{label}` text automatically renders as a top-left header badge. NEVER create extra standalone nodes at the top-left or top-right corners of a `stage_box` for the title or `$\\times N$` badge, or they will collide!',
    '5. Borderless Annotations, Edge Labels & Subcaptions (`subtype=math` / `subtype=caption`):',
    '   - Standalone math/edge annotations (`$(K, V)$`, `$(Q)$`, `$\\times N$`, notes) MUST include `draw=none, fill=none, subtype=math`:',
    '     `\\node[draw=none, fill=none, subtype=math, font=\\scriptsize] (kv_label) at (x, y) {$(K, V)$};`',
    '   - NEVER give pure text annotations a rectangular box style or omit `draw=none`, otherwise the canvas renders an ugly bordered white box over your arrows!',
    '6. Quantitative Charts (`pgfplots` inside `\\begin{scope}[shift={(x, y)}]`):',
    '   - Supported in-canvas charts: Line+CI (`\\addplot`), Grouped Bar (`ybar`), Attention/Ablation Heatmap (`matrix plot*`), Boxplot (`boxplot prepared`).',
    '',
    'Registered Primitive Library Snippets:',
    ...primitiveLines,
    '',
    `=== ACTIVE JOURNAL COLOR DESIGN SYSTEM (${theme.name} [${themeId}]) ===`,
    'NEVER output monochrome or plain white (`fill=white`) functional blocks! Every academic figure must use a cohesive, high-contrast semantic color hierarchy with soft fills (`!14` to `!18`) and darker matching borders (`!80!black` to `!85!black`):',
    `- Primary Attention / Core Innovation Module: \`fill=${palette.attention.fill}, draw=${palette.attention.stroke}\``,
    `- Secondary Backbone / Feed-Forward / Conv Module: \`fill=${palette.backbone.fill}, draw=${palette.backbone.stroke}\``,
    `- Normalization / Add & Norm / Gate Module: \`fill=${palette.norm.fill}, draw=${palette.norm.stroke}\``,
    `- Input / Embedding / Positional / Token Module: \`fill=${palette.embedding.fill}, draw=${palette.embedding.stroke}\``,
    `- Output Head / Loss / Prediction / Classifier: \`fill=${palette.output.fill}, draw=${palette.output.stroke}\``,
    `- Background Stage Container (\`stage_box\`): \`fill=${palette.neutral.containerFill}, draw=${palette.neutral.containerStroke}, dashed\``,
    '',
    '=== ACADEMIC DRAWING & GEOMETRIC LAYOUT RULES (ZERO OVERLAP GUARANTEE) ===',
    '1. Center-Coordinate System (`at (x, y)` is the CENTER of every node):',
    '   - Two vertically stacked nodes `(x, y1)` and `(x, y2)` with heights `h1` and `h2` have an edge-to-edge gap of `|y2 - y1| - (h1 + h2)/2`.',
    '   - NEVER set `|y2 - y1| == (h1 + h2)/2` (0cm gap)! That causes boxes to touch/collide and hides connecting arrows completely.',
    '   - REQUIRED VERTICAL STEP: For standard blocks (`height = 0.75cm..0.90cm`), use `Δy >= 1.45cm` (recommended `1.50cm..1.65cm`) so every arrow has `>= 0.60cm` of clean visible shaft + arrowhead.',
    '2. Horizontal Multi-Stream Separation:',
    '   - Parallel stacks (e.g., Encoder on the left, Decoder on the right) with `stage_box` width `4.6cm..5.0cm` MUST have center X coordinates separated by `Δx >= 6.2cm` (e.g., Encoder at `x = 4.5`, Decoder at `x = 11.2`), leaving a `>= 1.5cm` open routing corridor in between for cross-attention arrows and residual bypasses.',
    '3. Container (`stage_box`) Bounding Formula:',
    '   - If a stage wraps inner blocks from `y_min` to `y_max` (each of height `h`), set:',
    '     `stage_y = (y_min + y_max)/2 + 0.15`',
    '     `minimum height = (y_max - y_min) + h + 1.15cm`',
    '     `minimum width = max_inner_width + 1.35cm`',
    '4. Clean Orthogonal Routing (`\\draw`):',
    '   - Direct connection: `\\draw[-Stealth, thick] (src) -- (dst);`',
    '   - Right-side residual bypass: `\\draw[-Stealth, thick, dashed, rounded corners=4pt] (src.east) -- ++(0.95, 0) |- (dst.east);`',
    '   - Cross-module routing: `\\draw[-Stealth, thick, rounded corners=4pt] (enc_out.east) -- ++(1.1, 0) |- (dec_cross.west);`',
    '   - Always reference defined node IDs `(node_id)` or `(node_id.anchor)` as the start and end of every `\\draw` statement.',
    '',
    '=== SURGICAL DIFF PROTOCOL vs FULL REPLACEMENT ===',
    '- Mode A (Surgical Diff Patch — PREFERRED when modifying/refining an existing non-empty canvas):',
    '  When the user asks to adjust colors, fix spacing/overlaps, rename labels, add/remove a module, or tweak part of the current canvas, output `SEARCH/REPLACE` blocks inside a ```tikz code fence so only the targeted lines change:',
    '  ```tikz',
    '  <<<<<<< SEARCH',
    '  \\node[dl_block] (mha1) at (4.5, 3.0) {Multi-Head Attention};',
    '  =======',
    '  \\node[mha_block, fill=' +
      palette.attention.fill +
      ', draw=' +
      palette.attention.stroke +
      ', minimum width=3.4cm, minimum height=0.85cm] (mha1) at (4.5, 3.4) {Multi-Head Attention};',
    '  >>>>>>> REPLACE',
    '  ```',
    '- Mode B (Complete TikZ Figure — use when creating a new figure from scratch or doing a full architectural redesign):',
    '  Output a single complete ```tikz code block containing `\\begin{tikzpicture} ... \\end{tikzpicture}` with explicit numeric `at (x, y)` coordinates.',
    '- Optional Canvas Directive: You may emit `@agent-action {"theme":"cvpr","fitCanvas":true}` on its own line when switching journal themes or requesting canvas auto-fit.',
  ];

  const trimmedCanvas = canvasTikz.trim();
  if (trimmedCanvas) {
    try {
      const doc = parseTikzDocument(trimmedCanvas);
      const report = analyzeTikzLayout(doc, themeId);

      sections.push('');
      sections.push('=== LIVE CANVAS AST & GEOMETRIC DIAGNOSTICS ===');
      sections.push(
        `Parsed Elements: ${doc.nodes.length} nodes, ${doc.edges.length} edges, ${doc.charts.length} charts | Layout Health Score: ${report.score}/100`
      );

      if (selectedIds.length > 0) {
        sections.push(`Currently Selected Element IDs on Canvas: ${selectedIds.join(', ')}`);
      }

      if (doc.nodes.length > 0) {
        const nodeSummaries = doc.nodes.slice(0, 30).map((n) => {
          const w = (n.width ?? 2.2).toFixed(2);
          const h = (n.height ?? 0.9).toFixed(2);
          return `  * (${n.id}) [${n.subtype || n.styleClass || 'block'}] at (${n.x.toFixed(2)}, ${n.y.toFixed(2)}) size=${w}x${h}cm fill=${n.fill || 'none'} label="${n.label.replace(/\s+/g, ' ').slice(0, 38)}"`;
        });
        sections.push('Current Canvas Nodes (center x, y in cm):');
        sections.push(...nodeSummaries);
      }

      if (report.issues.length > 0) {
        sections.push('DETECTED LAYOUT / DESIGN ISSUES ON CURRENT CANVAS (Fix these proactively!):');
        for (const issue of report.issues.slice(0, 12)) {
          sections.push(`  ! [${issue.severity.toUpperCase()} / ${issue.kind}] ${issue.message}`);
        }
      } else {
        sections.push('Layout Check: No bounding-box collisions or missing theme colors detected.');
      }
    } catch {
      // Ignore parse errors on partial canvas
    }
  }

  return sections.join('\n');
}
