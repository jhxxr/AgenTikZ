import type { JournalThemeId } from '../../types/theme';

export type DiagramDesignMode = 'design' | 'reproduction';
export type DiagramRecipeId = 'swsa' | 'gnn' | 'mae' | 'riemannian';

export const DIAGRAM_SKILL_NAME = 'tikz-diagram-reproduction';
export const DIAGRAM_SKILL_TOPICS = ['design', 'reproduction', 'swsa', 'gnn', 'mae', 'riemannian'] as const;
export type DiagramSkillTopic = typeof DIAGRAM_SKILL_TOPICS[number];

export interface DiagramDesignIntent {
  mode: DiagramDesignMode;
  preserveColors?: boolean;
  preserveGeometry?: boolean;
}

/** An explicit source pragma keeps follow-up edits faithful to the original design intent. */
export function readDiagramDesignIntent(source: string): DiagramDesignIntent | undefined {
  const match = /^\s*%\s*@diagram-design\s+(\{[^\r\n]*\})\s*$/m.exec(source);
  if (!match) return undefined;
  try {
    const value = JSON.parse(match[1]);
    if (!value || (value.mode !== 'design' && value.mode !== 'reproduction')) return undefined;
    return { mode: value.mode, preserveColors: value.preserveColors === true,
      preserveGeometry: value.preserveGeometry === true };
  } catch { return undefined; }
}

export function resolveDiagramDesignMode(prompt: string, source = ''): DiagramDesignMode {
  // Explicit new design/redesign wins over a previous reproduction pragma.
  if (/重新设计|重新构图|原创设计|redesign|design\s+(?:a\s+)?new/i.test(prompt)) return 'design';
  if (/(?:不要|不用|无需|不必)(?:照图|复刻|复现|还原)|(?:do\s+not|don'?t)\s+(?:replicate|reproduce|copy)/i.test(prompt)) return 'design';
  if (/复刻|复现|还原|照(?:着)?(?:这|此|原|参考)?(?:张)?图|一比一|1\s*[:：]\s*1|保留原(?:图|配色)|reproduc|replicat|pixel[- ]accurate|match\s+(?:the\s+)?reference/i.test(prompt)) {
    return 'reproduction';
  }
  return readDiagramDesignIntent(source)?.mode ?? 'design';
}

export function preserveReproductionIntent(source: string): string {
  const pragma = '% @diagram-design {"mode":"reproduction","preserveColors":true,"preserveGeometry":true}';
  const existing = /^\s*%\s*@diagram-design\s+\{[^\r\n]*\}[ \t]*$/m;
  return existing.test(source) ? source.replace(existing, () => pragma) : `${pragma}\n${source}`;
}

const RECIPES: Record<DiagramRecipeId, { matches: RegExp; title: string; guidance: string }> = {
  swsa: {
    matches: /swsa|spik|脉冲|wavelet|小波|dwt|idwt|self[- ]attention|transformer/i,
    title: 'SWSA: overview + mechanism callout + baseline contrast',
    guidance: 'Keep the end-to-end pipeline compact. Expand only the modified attention/spectral module in a callout, and align baseline/proposed modules on the same grid so the changed branch is obvious. Use LIF circles only for actual spiking neurons; DWT/Conv/IDWT only when present in the user method. Candidate macros: LayerBlock, LIFNode, LinearBNLIF, AddNode, MulNode.',
  },
  gnn: {
    matches: /gnn|gcn|graph|图神经|多尺度|multi[- ]scale|多流|dual[- ]stream|双流|fusion|融合|tensor|张量/i,
    title: 'BI-MCGNN: (a) overview + (b)/(c) innovations + shape evolution',
    guidance: 'Align parallel streams by processing stage; use small graph snapshots for topology, cuboids/segmented bars for embeddings, and a tapered head only if dimensions actually shrink. Put each contribution in a separate detail panel with matching overview references. New designs use flat lightweight panels; beveled/shadow panels are preserved only for explicit reproduction. Candidate macros: GraphBox, VLayerBlock, GreyTile, PatchNode.',
  },
  mae: {
    matches: /\bmae\b|masked|masking|掩码|遮蔽|自编码|autoencoder|momentum|动量|token|令牌|vit|self[- ]supervis/i,
    title: 'MAE: track token identity and mask complements across stages',
    guidance: 'Draw patched input -> visible-token subset -> prediction -> masked selection -> merge -> reconstruction only when those stages exist. Reuse the SAME row/channel colors and token ordering throughout. Visible and masked sets must be exact complements; reconstruction must preserve provenance. Distinguish trainable forward paths from target/stop-gradient/loss inputs. Candidate macros: StripeToken, TokenStrip, PatchedEEGGrid, ModelBar, EmbedPlus.',
  },
  riemannian: {
    matches: /riemann|黎曼|manifold|流形|covariance|协方差|topoplot|脑地形|lstm|rnn|时序|temporal|\beeg\b|脑电/i,
    title: 'Riemannian + temporal: authentic data states and synchronized time windows',
    guidance: 'Use waveform/filter-bank snapshots, covariance matrices, manifold-to-tangent annotations, and aligned recurrent columns as appropriate to the actual method. The same time-window or band identity must keep its color on waveform crops, downstream feature maps and recurrent inputs. Show mathematical spaces on transition arrows without inventing dimensions. Candidate macros: LSTMColumn, TrapezoidEncoder, CovMatrixIcon, TopoMapNode, GateCircle.',
  },
};

export function selectDiagramRecipes(prompt: string): DiagramRecipeId[] {
  return (Object.keys(RECIPES) as DiagramRecipeId[]).filter((id) => RECIPES[id].matches.test(prompt)).slice(0, 2);
}

export function buildDiagramDesignContext(
  prompt: string, themeId: JournalThemeId, mode: DiagramDesignMode = 'design',
): string {
  const selected = selectDiagramRecipes(prompt);
  return [
    `=== BUILT-IN DRAWING SKILL: ${DIAGRAM_SKILL_NAME} ===`,
    `Task mode: ${mode}. This user-provided skill is built in for ALL drawing agents (Pi and ACP).`,
    'Precedence: the user request and reference evidence > this task-specific drawing skill > journal defaults > example templates. Follow the app tool/review boundaries throughout.',
    'DESIGN BEFORE CODE: identify the scientific question, main reading path, data states, actual novel module(s), panel/callout breakdown, shape vocabulary, color-to-role map, and arrow meanings. Use a short design brief (a few sentences), then draw; do not expose a long chain of thought.',
    'COMPOSITION: choose pipeline+zoom callout, (a) overview+(b)/(c) mechanism panels, aligned parallel streams, or stage envelopes according to the method. A simple method may use one panel. Keep the overview readable in three seconds. Compare baseline/proposed on a shared grid only when that comparison is requested or supported.',
    'SHAPE VOCABULARY: operations -> compact rounded or vertical layer bars; tensors -> cuboids/segmented bars with meaningful dimensional progression; tokens -> striped tiles/sequences; mask state -> visible/hidden grid cells; graph data -> node-link snapshots; covariance -> matrices; temporal signals -> waveform/window snapshots and aligned recurrent columns; compression -> tapered encoder/head; add/multiply/gating -> distinct operator circles. Use standard flowchart diamonds only for real decisions and cylinders only for actual storage. Do not turn every data state into a rectangle labeled with a noun.',
    'DATA-STATE CONTINUITY: the same token/channel/window/branch keeps its color and ordering through all stages. Masked and visible indices must be complements. Feature snapshots illustrate structure, not fabricated experimental results; never invent measured EEG, topology, values or dimensions.',
    mode === 'reproduction'
      ? 'REFERENCE FIDELITY: preserve the observed topology, aspect ratio, spacing, shapes, labels, sampled colors, window/mask correspondence and line meanings. Do NOT recolor to the journal palette, add panels or redesign. Keep unreadable details explicitly uncertain. Use reference colors with local \\definecolor; do not pretend a visually estimated color or coordinate was programmatically measured.'
      : 'SEMANTIC COLOR: choose one coherent functional palette, not a new color for every box. Suggested skill mapping: Linear/Projection=peach FBE5D7; BN/LN/gates=gold FFE699; Conv=sage E2F0D9; Attention/Wavelet=blue BDD7EF or 9DC3E6; metric/reduction=plum 7C5A74; tangent/manifold=olive 9E8D65; FC=forest 54813A or lavender B9C1EF. Use only the 3–5 families needed; keep neutral containers and reserve strong salience for 1–2 real contributions. Do not automatically treat all attention layers as novel. Define the chosen colors locally with \\definecolor{name}{HTML}{RRGGBB}. Dark FC/metric blocks need text=white. With an explicitly requested strict journal/monochrome style, map these functional roles to that style instead; theme colors remain useful defaults.',
    'ARROW GRAMMAR: forward/trainable flow=crisp dark solid; target/stop-gradient/loss input=grey and labeled; branch colors may identify parallel streams; residual/skip=gapped orthogonal tracks, normally solid. In NEW designs dashed boundaries/projection links mean grouping/zoom only; auxiliary feedback is dotted, so one line style has one meaning. In reproduction retain the reference grammar and provide a legend. Add a compact legend for unfamiliar symbols/colors.',
    'LAYOUT: align comparable stages and repeated columns; reserve channels for long skips and callout links; size gaps from actual node bounds and final column width. Keep label baselines, font sizes, padding, 3D projections and line widths consistent. Do not flatten all inner operations into the overview or shrink labels to hide collisions.',
    'DELIVERY ADAPTER: standard editable diagrams use uniquely named nodes and explicit numeric cm coordinates. For reference pixels at width W and height H, choose ONE scale s in cm/pixel, map x=(px-W/2)*s and y=(H/2-py)*s, then scale all sizes consistently. Noncanonical PGF node shapes and complex faithful paths, masks, topoplots or macros use exact TeX preview; a single self-contained tikzpicture plus local definitions is allowed. Explain that such portions are not individually draggable. Never claim arbitrary macros are editable. Reuse macro STRUCTURE, not complete example architectures. Brace arithmetic macro coordinates ({#2}, {#3}).',
    `SOURCE INTENT: add a comment inside the picture: % @diagram-design {"mode":"${mode}","preserveColors":true,"preserveGeometry":${mode === 'reproduction'}}. This protects intentional styling from automatic repair. The app supplies the document preamble: do not paste \\documentclass, \\usepackage, document environments, geometry or font-package setup into a canvas proposal.`,
    'EVIDENCE AND REVIEW: use get_canvas_source before changes, submit propose_* tools, render_canvas_preview on the exact pending draft, inspect the actual image and refine only concrete defects within the render budget. A geometry score is not visual verification. Preserve user content on local edits. Python measurement/audit helpers in the original skill are references, not available Pi tools; do not claim to run scripts or produce pixel-exact measurements unless a real measurement tool was used.',
    'PROGRESSIVE REFERENCES: call get_diagram_design_skill with topic=design/reproduction/swsa/gnn/mae/riemannian for the original design guide or paged macro examples. Use its macroIndex to jump to a relevant definition. Load only useful pages, not all four full templates. Examples are visual vocabulary, never a limit on what the user can draw.',
    ...(selected.length ? selected.map((id) => `Selected reference (${id}): ${RECIPES[id].title}\n${RECIPES[id].guidance}`)
      : ['Available reference families: swsa (callout/comparison), gnn (parallel streams/tensors), mae (tokens/masks), riemannian (manifold/temporal). Use only if relevant.']),
    `Active journal: ${themeId}; its sizing/typography defaults apply unless the task requires preserving a reference.`,
  ].join('\n\n');
}
