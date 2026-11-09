/**
 * @fileoverview Publication Prompt Compiler
 *   Assembles the persistent journal style guide (`AGENT_STYLE_GUIDES[activeThemeId]`),
 *   structured `JournalTheme` rules (`preferredPrimitives`, `doNotUse`, `colorRoles`),
 *   and the 5-Point Figure Contract protocol (`% @figure-contract`, `% @panel`, `% @agent-image`)
 *   into the system context and user prompt prefix sent to the ACP Agent.
 */

import { JournalThemeId } from '../../types/theme';
import { JOURNAL_THEMES } from '../themes/journal-presets';
import { buildAgentStyleGuideBlock } from './style-guides';
import { buildDiagramDesignContext, resolveDiagramDesignMode, type DiagramDesignMode } from './diagram-design-policy';

export interface PromptCompilerOptions {
  enforcePublicationStyleGuide?: boolean;
  requireFigureContract?: boolean;
  diagramMode?: DiagramDesignMode;
}

/**
 * Builds the publication style & figure contract block to inject into Agent prompts.
 */
export function buildPublicationStyleSystemPrompt(
  activeThemeId: JournalThemeId | string = 'neurips',
  options: PromptCompilerOptions = {}
): string {
  const themeId: JournalThemeId =
    activeThemeId in JOURNAL_THEMES
      ? (activeThemeId as JournalThemeId)
      : 'neurips';
  const theme = JOURNAL_THEMES[themeId];
  const enforceStyle = options.enforcePublicationStyleGuide ?? true;
  const requireContract = options.requireFigureContract ?? true;

  if (!enforceStyle) {
    return '';
  }
  if (options.diagramMode === 'reproduction') {
    return [
      '=== REFERENCE REPRODUCTION: PRESERVE OBSERVED DESIGN ===',
      'The reference image/user instructions determine palette, proportions, shapes and arrow grammar. Journal styling is a fallback, not permission to redesign or recolor.',
      'Use local \\definecolor declarations for sampled reference colors. Preserve existing labels, masks, module topology and line meanings. Do not invent missing details or claim unperformed pixel measurements.',
      'Keep a self-contained figure fragment and follow the built-in drawing skill, review tools and exact visual preview.',
    ].join('\n');
  }

  const lines: string[] = [
    '=== PUBLICATION-GRADE STYLE DEFAULTS (TASK-SPECIFIC DRAWING SKILL TAKES PRIORITY) ===',
    'The built-in tikz-diagram-reproduction skill may use a defined operator-semantic palette. Journal-only color restrictions below are defaults; enforce them strictly only when the user explicitly requests that journal/monochrome style. Do not overwrite intentional reference or functional colors.',
    buildAgentStyleGuideBlock(themeId, requireContract),
    '',
    `Structured Theme Metadata (${theme.name} [${theme.id}]):`,
    `- Target Column Widths: Single-Column = ${theme.columnWidthMm.single}mm (${(theme.columnWidthMm.single / 10).toFixed(2)}cm), Double-Column = ${theme.columnWidthMm.double}mm (${(theme.columnWidthMm.double / 10).toFixed(2)}cm)`,
    `- Default Salience Color Hierarchy (neutral context + signal + 1–2 emphasized contributions; a semantic functional palette is also allowed):`,
    `  * Neutral Structural Baseline: fill=${theme.colorRoles.neutral.fill}, stroke=${theme.colorRoles.neutral.stroke}`,
    `  * Primary Signal (Main Pathway): fill=${theme.colorRoles.signal.fill}, stroke=${theme.colorRoles.signal.stroke}`,
    `  * Secondary Signal (Parallel / Contrast): fill=${theme.colorRoles.secondary.fill}, stroke=${theme.colorRoles.secondary.stroke}`,
    `  * Hero Accent (At most 1–2 Core Innovations!): fill=${theme.colorRoles.hero.fill}, stroke=${theme.colorRoles.hero.stroke}`,
    `- Line Semantics: primary = ${theme.lineSemantics.primaryFlow}; container = ${theme.lineSemantics.containerBoundary}; feedback/aux = ${theme.lineSemantics.feedbackOrAuxFlow}`,
    `- Chart Spine Rule: ${theme.chartSpec.spineMode === 'open_left_bottom' ? 'Open Left + Bottom L-spine (no top/right frame, no gridlines)' : 'Closed 4-sided box'}`,
    `- Preferred Primitives: ${theme.preferredPrimitives.join(', ')}`,
    `- Strictly Forbidden (DO NOT USE): ${theme.doNotUse.join(', ')}`,
    '',
    '=== HYBRID VECTOR + AI TRANSPARENT CUTOUT ILLUSTRATION PROTOCOL ===',
    '- When a figure needs physical hardware icons, biological specimens, 3D object renders, or input sample cutouts alongside TikZ vector boxes:',
    '  1. Emit an `@agent-image` comment directive above the node:',
    '     `% @agent-image {"nodeId":"img_specimen","prompt":"3D isometric microscope objective lens, clean scientific vector illustration","path":"figures/assets/ai/img_specimen.png","aspectRatio":"1:1"}`',
    '  2. Declare the corresponding image node with `subtype=image`:',
    '     `\\node[inner sep=0pt, minimum width=2.4cm, minimum height=2.0cm, subtype=image] (img_specimen) at (2.2, 4.5) {\\includegraphics[width=2.4cm]{figures/assets/ai/img_specimen.png}};`',
  ];

  return lines.join('\n');
}

/**
 * Prepends the active theme's publication style reminder to the user prompt when enabled.
 */
export function compileUserPromptWithStyleGuide(
  userPrompt: string,
  activeThemeId: JournalThemeId | string = 'neurips',
  options: PromptCompilerOptions = {}
): string {
  const enforceStyle = options.enforcePublicationStyleGuide ?? true;
  if (!enforceStyle) {
    return userPrompt.trim();
  }

  const themeId: JournalThemeId =
    activeThemeId in JOURNAL_THEMES
      ? (activeThemeId as JournalThemeId)
      : 'neurips';
  const theme = JOURNAL_THEMES[themeId];
  const requireContract = options.requireFigureContract ?? true;
  const mode = options.diagramMode ?? resolveDiagramDesignMode(userPrompt);
  if (mode === 'reproduction') {
    return `[参考图复刻 · tikz-diagram-reproduction]\n保留原图的配色、形状、比例、模块关系与线型含义；用局部颜色定义，不自动套用期刊配色。只有实际工具测量过才能声称像素精确，完成后渲染同一份待审源码并查看图片。\n\n${userPrompt.trim()}`;
  }

  const header = [
    `[常驻顶刊绘图规范 · 当前主题: ${theme.name} (${theme.venueBadge})]`,
    `- 构图与图形选择：先用内置 tikz-diagram-reproduction skill 选择总览/细节层级、数据状态图形和语义配色；不要只画同形矩形串联。`,
    `- 颜色与显著性控制：主题默认 Neutral=${theme.colorRoles.neutral.fill}, Signal=${theme.colorRoles.signal.fill}, Hero=${theme.colorRoles.hero.fill}；也可使用 skill 的算子语义色板，通过局部 \\definecolor 定义。一种角色始终同色，仅突出 1–2 个真实贡献；用户明确指定期刊/黑白规范时优先遵守。`,
    `- 线宽与线型语义：默认线宽 ${theme.defaultLineWidth}，箭头 ${theme.arrowTip}；若图中有 stage_box 容器，虚线 dashed 仅用于容器边界，辅助/反馈/残差旁路一律使用 dotted。`,
    `- 版式与字号底线：单栏 ${theme.columnWidthMm.single}mm / 双栏 ${theme.columnWidthMm.double}mm，最小字号 \\scriptsize（严禁 \\tiny），术语大小写严格规范（如 XGBoost, DeepSeek, ResNet, ViT）。`,
    requireContract
      ? `- 图件契约（Figure Contract）：多面板或新建完整图时，请在 \\begin{tikzpicture} 顶部写入 \`% @figure-contract {"claim":"...","archetype":"schematic_led_composite","columnMode":"double","heroIds":["..."]}\` 与 \`% @panel {"id":"a","label":"a","role":"mechanism","title":"..."}\` 声明每个面板的证据分工。`
      : null,
  ]
    .filter(Boolean)
    .join('\n');

  return `${header}\n\n${userPrompt.trim()}`;
}

export function compileAgentPrompt(params: {
  userPrompt: string;
  themeId: JournalThemeId;
  enforcePublicationStyle?: boolean;
  requireFigureContract?: boolean;
  allowAiCutoutIllustrations?: boolean;
}): string {
  const sys = buildPublicationStyleSystemPrompt(params.themeId, {
    enforcePublicationStyleGuide: params.enforcePublicationStyle ?? true,
    requireFigureContract: params.requireFigureContract ?? true,
    diagramMode: resolveDiagramDesignMode(params.userPrompt),
  });
  return `${buildDiagramDesignContext(params.userPrompt, params.themeId, resolveDiagramDesignMode(params.userPrompt))}\n\n${sys}\n\n${params.userPrompt.trim()}`;
}
