import { JournalThemeId } from '../../types/theme';
import {
  ParsedTikzDocument,
  TikzNodeElement,
} from '../../types/tikz-ast';
import { parseTikzDocument } from '../parser/parser';
import {
  deleteElementsFromSource,
  formatCoordNum,
  patchEdgeElement,
  patchElementsCoordinates,
  patchNodeLabel,
  patchNodeOptions,
} from '../parser/patcher';
import { JOURNAL_THEMES } from '../themes/journal-presets';
import { CANONICAL_ACADEMIC_TERMS } from './style-guides';

export interface LayoutIssue {
  id: string;
  severity: 'error' | 'warning' | 'info';
  kind:
    | 'overlap'
    | 'arrow_clearance'
    | 'container_bounds'
    | 'unstyled_nodes'
    | 'label_box'
    | 'salience_overuse'
    | 'dashed_conflict'
    | 'font_floor'
    | 'term_capitalization'
    | 'chart_contract';
  elementIds: string[];
  message: string;
  suggestion: string;
}

export interface LayoutDiagnosticReport {
  score: number;
  issues: LayoutIssue[];
  overlapCount: number;
  tightEdgeCount: number;
  containerIssueCount: number;
  unstyledNodeCount: number;
  labelBoxCount: number;
}

export interface AutoRepairResult {
  repairedCode: string;
  repairedTikz: string;
  appliedFixes: string[];
  reportBefore: LayoutDiagnosticReport;
  reportAfter: LayoutDiagnosticReport;
  tikzCode: string;
  repairs: string[];
  beforeReport: LayoutDiagnosticReport;
  afterReport: LayoutDiagnosticReport;
}

export interface SemanticThemePalette {
  attention: { fill: string; stroke: string };
  backbone: { fill: string; stroke: string };
  norm: { fill: string; stroke: string };
  embedding: { fill: string; stroke: string };
  output: { fill: string; stroke: string };
  neutral: { fill: string; stroke: string; containerFill: string; containerStroke: string };
}

export function getThemeSemanticPalette(
  themeId: JournalThemeId
): SemanticThemePalette {
  const theme = JOURNAL_THEMES[themeId] || JOURNAL_THEMES.neurips;
  const p = theme.palette;
  switch (themeId) {
    case 'cvpr':
      return {
        backbone: { fill: p[0].tikzFill, stroke: p[0].tikzStroke }, // cvpr_navy
        output: { fill: p[1].tikzFill, stroke: p[1].tikzStroke },   // cvpr_coral
        norm: { fill: p[2].tikzFill, stroke: p[2].tikzStroke },     // cvpr_teal
        embedding: { fill: p[3].tikzFill, stroke: p[3].tikzStroke },// cvpr_indigo
        attention: { fill: p[4].tikzFill, stroke: p[4].tikzStroke },// cvpr_gold
        neutral: {
          fill: p[5].tikzFill,
          stroke: p[5].tikzStroke,
          containerFill: 'cvpr_gray!8',
          containerStroke: 'cvpr_gray!65',
        },
      };
    case 'nature':
      return {
        backbone: { fill: p[0].tikzFill, stroke: p[0].tikzStroke }, // npg_blue
        attention: { fill: p[1].tikzFill, stroke: p[1].tikzStroke },// npg_red
        norm: { fill: p[2].tikzFill, stroke: p[2].tikzStroke },     // npg_teal
        embedding: { fill: p[3].tikzFill, stroke: p[3].tikzStroke },// npg_sand
        output: { fill: p[4].tikzFill, stroke: p[4].tikzStroke },   // npg_sky
        neutral: {
          fill: p[5].tikzFill,
          stroke: p[5].tikzStroke,
          containerFill: 'npg_dark!6',
          containerStroke: 'npg_dark!55',
        },
      };
    case 'ieee':
      return {
        backbone: { fill: p[1].tikzFill, stroke: p[1].tikzStroke }, // ieee_blue
        attention: { fill: p[3].tikzFill, stroke: p[3].tikzStroke },// ieee_amber
        norm: { fill: p[4].tikzFill, stroke: p[4].tikzStroke },     // ieee_teal
        embedding: { fill: p[2].tikzFill, stroke: p[2].tikzStroke },// ieee_silver
        output: { fill: p[1].tikzFill, stroke: p[1].tikzStroke },   // ieee_blue
        neutral: {
          fill: p[5].tikzFill,
          stroke: p[5].tikzStroke,
          containerFill: 'black!4',
          containerStroke: 'black!55',
        },
      };
    case 'neurips':
    default:
      return {
        backbone: { fill: p[0].tikzFill, stroke: p[0].tikzStroke }, // nips_blue
        attention: { fill: p[1].tikzFill, stroke: p[1].tikzStroke },// nips_amber
        norm: { fill: p[2].tikzFill, stroke: p[2].tikzStroke },     // nips_sage
        embedding: { fill: p[3].tikzFill, stroke: p[3].tikzStroke },// nips_purple
        output: { fill: p[4].tikzFill, stroke: p[4].tikzStroke },   // nips_rose
        neutral: {
          fill: p[5].tikzFill,
          stroke: p[5].tikzStroke,
          containerFill: 'nips_slate!6',
          containerStroke: 'nips_slate!55',
        },
      };
  }
}

function isPlainOrUncolored(node: TikzNodeElement): boolean {
  if (
    node.subtype === 'caption' ||
    node.subtype === 'math' ||
    node.subtype === 'image' ||
    node.subtype === 'op_circle' ||
    node.subtype === 'container'
  ) {
    return false;
  }
  const rawFill = (node.rawOptions?.['fill'] || '').trim().toLowerCase();
  if (!rawFill) {
    return true;
  }
  const f = (node.fill || rawFill).trim().toLowerCase();
  if (!f || f === 'white' || f === 'none' || f === 'black!2' || f === 'gray!5') {
    return true;
  }
  return false;
}

function looksLikeBorderlessAnnotation(node: TikzNodeElement): boolean {
  if (node.subtype === 'math' || node.subtype === 'caption') return false;
  const idAndClass = `${node.id} ${node.styleClass || ''}`.toLowerCase();
  const lbl = node.label.trim();
  if (
    /label|note|annot|repeat|title_label|kv_label|q_label/i.test(idAndClass)
  ) {
    return true;
  }
  if (
    /^\(\s*[QKV,\s]+\s*\)$/i.test(lbl) ||
    /^\$?\\times\s*[A-Za-z0-9]+\$?$/i.test(lbl)
  ) {
    return true;
  }
  return false;
}

function normalizeAcademicTermsInText(text: string): {
  normalized: string;
  changedTerms: string[];
} {
  let normalized = text;
  const changedTerms: string[] = [];
  for (const { pattern, canonical } of CANONICAL_ACADEMIC_TERMS) {
    normalized = normalized.replace(pattern, (match) => {
      if (match !== canonical) {
        changedTerms.push(`${match}→${canonical}`);
      }
      return canonical;
    });
  }
  return { normalized, changedTerms };
}

/**
 * Analyzes a parsed TikZ document for geometric overlaps, arrow clearance,
 * container framing issues, missing theme styling, and Nature-Skills publication rules.
 */
export function analyzeTikzLayout(
  docOrSource: ParsedTikzDocument | string,
  activeThemeId: JournalThemeId = 'neurips'
): LayoutDiagnosticReport {
  const doc =
    typeof docOrSource === 'string'
      ? parseTikzDocument(docOrSource, activeThemeId)
      : docOrSource;
  const issues: LayoutIssue[] = [];
  let overlapCount = 0;
  let tightEdgeCount = 0;
  let containerIssueCount = 0;
  let unstyledNodeCount = 0;
  let labelBoxCount = 0;

  const regularNodes = doc.nodes.filter((n) => n.subtype !== 'container');
  const containers = doc.nodes.filter((n) => n.subtype === 'container');

  // 1. Check for borderless annotations rendered as bordered blocks
  for (const node of regularNodes) {
    if (looksLikeBorderlessAnnotation(node)) {
      labelBoxCount++;
      issues.push({
        id: `label_box_${node.id}`,
        severity: 'warning',
        kind: 'label_box',
        elementIds: [node.id],
        message: `标注节点 "${node.id}" 缺少 draw=none, fill=none，被渲染为带边框矩形`,
        suggestion: `添加 subtype=math, draw=none, fill=none 转为无边框公式/文字标注`,
      });
    }
  }

  // 2. Check 2D bounding-box overlaps between non-container nodes
  for (let i = 0; i < regularNodes.length; i++) {
    for (let j = i + 1; j < regularNodes.length; j++) {
      const a = regularNodes[i];
      const b = regularNodes[j];
      const dx = Math.abs(a.x - b.x);
      const dy = Math.abs(a.y - b.y);
      const minW = (a.width + b.width) / 2;
      const minH = (a.height + b.height) / 2;

      // Overlap if strictly intersecting by more than 0.04cm in both axes
      if (dx < minW - 0.04 && dy < minH - 0.04) {
        overlapCount++;
        issues.push({
          id: `overlap_${a.id}_${b.id}`,
          severity: 'error',
          kind: 'overlap',
          elementIds: [a.id, b.id],
          message: `节点 "${a.id}" 与 "${b.id}" 发生几何重叠 (Δx=${dx.toFixed(2)}cm, Δy=${dy.toFixed(2)}cm)`,
          suggestion: `增大节点中心间距至 Δy ≥ ${(minH + 0.55).toFixed(2)}cm 或 Δx ≥ ${(minW + 0.6).toFixed(2)}cm`,
        });
      }
    }
  }

  // 3. Check connected node arrow clearance
  for (const edge of doc.edges) {
    if (edge.routeType !== 'direct') continue;
    const from = doc.nodes.find((n) => n.id === edge.from);
    const to = doc.nodes.find((n) => n.id === edge.to);
    if (!from || !to) continue;
    if (from.subtype === 'container' || to.subtype === 'container') continue;

    const dx = Math.abs(from.x - to.x);
    const dy = Math.abs(from.y - to.y);

    if (dx < 0.45 && dy >= 0.01) {
      // Vertically connected
      const gap = dy - (from.height + to.height) / 2;
      if (gap < 0.32) {
        tightEdgeCount++;
        issues.push({
          id: `tight_edge_${edge.id}`,
          severity: gap <= 0.05 ? 'error' : 'warning',
          elementIds: [from.id, to.id],
          kind: 'arrow_clearance',
          message: `相连节点 "${from.id} → ${to.id}" 垂直净距仅 ${gap.toFixed(2)}cm，箭头空间不足`,
          suggestion: `将垂直步进 Δy 调整为 ≥ ${((from.height + to.height) / 2 + 0.6).toFixed(2)}cm`,
        });
      }
    } else if (dy < 0.45 && dx >= 0.01) {
      // Horizontally connected
      const gap = dx - (from.width + to.width) / 2;
      if (gap < 0.35) {
        tightEdgeCount++;
        issues.push({
          id: `tight_edge_${edge.id}`,
          severity: gap <= 0.05 ? 'error' : 'warning',
          elementIds: [from.id, to.id],
          kind: 'arrow_clearance',
          message: `相连节点 "${from.id} → ${to.id}" 水平净距仅 ${gap.toFixed(2)}cm，箭头过短`,
          suggestion: `将水平步进 Δx 调整为 ≥ ${((from.width + to.width) / 2 + 0.65).toFixed(2)}cm`,
        });
      }
    }
  }

  // 4. Check container bounds
  for (const c of containers) {
    const cLeft = c.x - c.width / 2;
    const cRight = c.x + c.width / 2;
    const cBottom = c.y - c.height / 2;
    const cTop = c.y + c.height / 2;

    const children = regularNodes.filter(
      (n) =>
        n.subtype !== 'caption' &&
        n.subtype !== 'math' &&
        n.x >= cLeft - 0.2 &&
        n.x <= cRight + 0.2 &&
        n.y >= cBottom - 0.2 &&
        n.y <= cTop + 0.2
    );

    for (const child of children) {
      const overflows =
        child.x - child.width / 2 < cLeft + 0.1 ||
        child.x + child.width / 2 > cRight - 0.1 ||
        child.y - child.height / 2 < cBottom + 0.1 ||
        child.y + child.height / 2 > cTop - 0.15;
      if (overflows) {
        containerIssueCount++;
        issues.push({
          id: `container_overflow_${c.id}_${child.id}`,
          severity: 'warning',
          kind: 'container_bounds',
          elementIds: [c.id, child.id],
          message: `容器 "${c.id}" 边界过紧或与内部节点 "${child.id}" 重叠`,
          suggestion: `自动重算容器中心与宽高，预留 ≥0.55cm 内边距`,
        });
        break;
      }
    }
  }

  // 5. Check unstyled / plain white functional blocks
  const unstyled = regularNodes.filter(isPlainOrUncolored);
  if (unstyled.length > 0) {
    unstyledNodeCount = unstyled.length;
    issues.push({
      id: 'unstyled_nodes',
      severity: 'info',
      kind: 'unstyled_nodes',
      elementIds: unstyled.map((n) => n.id),
      message: `${unstyled.length} 个功能模块未应用 ${JOURNAL_THEMES[activeThemeId]?.name || activeThemeId} 科研主题配色（显示为纯白框）`,
      suggestion: `按视觉显著度预算（1 Neutral + 1 Signal + 1 Hero Accent）分配主题色板填充与描边`,
    });
  }

  // 6. Check Single-Meaning Dashed Rule (Nature Skills: dashed for containers OR edges, not both)
  const dashedEdges = doc.edges.filter((e) => e.dashed && !e.dotted);
  if (containers.length > 0 && dashedEdges.length > 0) {
    issues.push({
      id: 'dashed_conflict',
      severity: 'info',
      kind: 'dashed_conflict',
      elementIds: dashedEdges.map((e) => e.id),
      message: `图中已使用 dashed 虚线作为容器框 (${containers.length} 个)，同时又有 ${dashedEdges.length} 条连线使用 dashed，违反「单一线型语义」规范`,
      suggestion: `将反馈/残差/辅助连线自动转换为 dotted 点线，保持 dashed 仅代表分组容器边界`,
    });
  }

  // 7. Check Minimum Font Floor (\tiny is <5pt after column reduction)
  if (/\\tiny\b/.test(doc.fullSource)) {
    issues.push({
      id: 'font_floor_tiny',
      severity: 'warning',
      kind: 'font_floor',
      elementIds: [],
      message: `检测到 \\tiny 字号指令，缩印至单栏 (89mm) 后将低于 5pt 出版可读下限`,
      suggestion: `自动升级 \\tiny 为 \\scriptsize，确保印刷字号 ≥ 5.5pt`,
    });
  }

  // 8. Check Canonical Academic Term Capitalization
  const termErrors: string[] = [];
  const termNodeIds: string[] = [];
  for (const n of doc.nodes) {
    const { changedTerms } = normalizeAcademicTermsInText(
      `${n.label} ${n.sublabel || ''}`
    );
    if (changedTerms.length > 0) {
      termErrors.push(...changedTerms);
      termNodeIds.push(n.id);
    }
  }
  if (termErrors.length > 0) {
    issues.push({
      id: 'term_capitalization',
      severity: 'info',
      kind: 'term_capitalization',
      elementIds: termNodeIds,
      message: `学术专有名词大小写不规范：${Array.from(new Set(termErrors)).slice(0, 4).join(', ')}`,
      suggestion: `一键规范化专有名词拼写（如 XGBoost, DeepSeek, ResNet, LoRA）`,
    });
  }

  const penalty =
    overlapCount * 18 +
    tightEdgeCount * 10 +
    containerIssueCount * 8 +
    labelBoxCount * 8 +
    Math.min(15, unstyledNodeCount * 3);
  const score = Math.max(10, Math.min(100, 100 - penalty));

  return {
    score,
    issues,
    overlapCount,
    tightEdgeCount,
    containerIssueCount,
    unstyledNodeCount,
    labelBoxCount,
  };
}

/**
 * Salience-driven color assignment (Nature Skills 3-color budget:
 * 1 Neutral + 1-2 Signal + at most 1-2 Hero Accent modules).
 */
function pickSalienceColorForNode(
  node: TikzNodeElement,
  palette: SemanticThemePalette,
  heroCountSoFar: number
): {
  fill: string;
  stroke: string;
  styleClass?: string;
  isHero: boolean;
} {
  const text = `${node.id} ${node.label} ${node.sublabel || ''} ${node.styleClass || ''}`.toLowerCase();

  // Explicit hero role or core innovative/attention mechanism (capped at 2 hero blocks per figure)
  const wantsHero =
    node.salienceRole === 'hero' ||
    node.subtype === 'mha' ||
    /attention|mha|self-attn|cross-attn|hero|ours|novel|core|fusion|routing/i.test(
      text
    );

  if (wantsHero && heroCountSoFar < 2) {
    return {
      fill: palette.attention.fill,
      stroke: palette.attention.stroke,
      styleClass: 'mha_block',
      isHero: true,
    };
  }

  // Secondary signal (Norm / Conv / Neck / Feature)
  if (
    node.salienceRole === 'secondary' ||
    node.subtype === 'addnorm' ||
    node.subtype === 'conv' ||
    /add\s*\\?&\s*norm|layernorm|rmsnorm|norm|condition|adaln|conv|pool|fpn|neck/i.test(
      text
    )
  ) {
    return {
      fill: palette.norm.fill,
      stroke: palette.norm.stroke,
      styleClass: node.subtype === 'conv' ? 'conv_block' : 'addnorm_block',
      isHero: false,
    };
  }

  // Input / Output / Baseline / Context -> Neutral low-saturation framing
  if (
    node.salienceRole === 'neutral' ||
    /input|output|baseline|frozen|prior|source|target|token|embed/i.test(text)
  ) {
    return {
      fill: palette.neutral.fill,
      stroke: palette.neutral.stroke,
      styleClass: 'dl_block',
      isHero: false,
    };
  }

  // Primary Signal (Backbone / FFN / Encoder / Decoder)
  return {
    fill: palette.backbone.fill,
    stroke: palette.backbone.stroke,
    styleClass: node.subtype === 'cuboid' ? 'feature_cube' : 'dl_block',
    isHero: false,
  };
}

/**
 * Deterministically repairs layout overlaps, tight vertical/horizontal arrow spacing,
 * container framing, borderless annotations, salience-driven theme colors,
 * single-meaning dashed/dotted lines, font floor, and academic term capitalization.
 */
export function autoRepairTikzLayout(
  source: string,
  activeThemeId: JournalThemeId = 'neurips',
  options: {
    fixOverlaps?: boolean;
    fixContainers?: boolean;
    applyThemeColors?: boolean;
    upgradeComponents?: boolean;
  } = {}
): AutoRepairResult {
  const {
    fixOverlaps = true,
    fixContainers = true,
    applyThemeColors = true,
    upgradeComponents = true,
  } = options;

  let currentSource = source;
  const appliedFixes: string[] = [];
  const docBefore = parseTikzDocument(currentSource, activeThemeId);
  const reportBefore = analyzeTikzLayout(docBefore, activeThemeId);

  if (docBefore.nodes.length === 0 && docBefore.charts.length === 0) {
    return {
      repairedCode: currentSource,
      repairedTikz: currentSource,
      appliedFixes,
      reportBefore,
      reportAfter: reportBefore,
      tikzCode: currentSource,
      repairs: appliedFixes,
      beforeReport: reportBefore,
      afterReport: reportBefore,
    };
  }

  const theme = JOURNAL_THEMES[activeThemeId] || JOURNAL_THEMES.neurips;
  const palette = getThemeSemanticPalette(activeThemeId);

  // ── Step 0: Upgrade \tiny font floor & normalize canonical academic terms ──
  if (/\\tiny\b/.test(currentSource)) {
    currentSource = currentSource.replace(/\\tiny\b/g, '\\scriptsize');
    appliedFixes.push('将 \\tiny 过小字号升级为 \\scriptsize (保障缩印后 ≥5.5pt)');
  }

  // ── Step 1: Merge duplicate container title/repeat badges & upgrade components ──
  if (upgradeComponents) {
    let doc = parseTikzDocument(currentSource, activeThemeId);
    const containers = doc.nodes.filter((n) => n.subtype === 'container');
    const spansToDelete: Array<{ start: number; end: number }> = [];
    const containerTitleUpdates = new Map<string, string>();

    for (const c of containers) {
      const cLeft = c.x - c.width / 2 - 0.4;
      const cRight = c.x + c.width / 2 + 0.4;
      const cTop = c.y + c.height / 2;

      // Find standalone title/repeat nodes sitting near the top border of this container
      const headerBadges = doc.nodes.filter(
        (n) =>
          n.id !== c.id &&
          n.subtype !== 'container' &&
          !doc.edges.some((e) => e.from === n.id || e.to === n.id) &&
          n.x >= cLeft &&
          n.x <= cRight &&
          Math.abs(n.y - cTop) <= 0.75 &&
          (/title|repeat|header|stage_label/i.test(
            `${n.id} ${n.styleClass || ''}`
          ) ||
            /^\$?\\times\s*[A-Za-z0-9]+\$?$/i.test(n.label.trim()) ||
            /encoder layer|decoder layer|stage/i.test(n.label.trim()))
      );

      if (headerBadges.length > 0) {
        const badgeTexts = headerBadges.map((b) => b.label.trim()).filter(Boolean);
        const combinedTitle = [c.label.trim(), ...badgeTexts]
          .filter(Boolean)
          .join(' · ');
        if (combinedTitle) {
          containerTitleUpdates.set(c.id, combinedTitle);
        }
        for (const b of headerBadges) {
          spansToDelete.push({ start: b.span.start, end: b.span.end });
        }
      }
    }

    if (spansToDelete.length > 0) {
      currentSource = deleteElementsFromSource(currentSource, spansToDelete);
      appliedFixes.push(
        `合并 ${spansToDelete.length} 个重复容器角标至 stage_box 标题栏`
      );
    }

    for (const [cId, newTitle] of containerTitleUpdates.entries()) {
      doc = parseTikzDocument(currentSource, activeThemeId);
      const cNode = doc.nodes.find((n) => n.id === cId);
      if (cNode) {
        currentSource = patchNodeLabel(currentSource, cNode, newTitle);
      }
    }

    // Upgrade borderless annotation nodes, containers, op_circles & canonical term casing
    doc = parseTikzDocument(currentSource, activeThemeId);
    let upgradedCount = 0;
    let termFixedCount = 0;
    for (const node of doc.nodes) {
      let freshDoc = parseTikzDocument(currentSource, activeThemeId);
      let freshNode = freshDoc.nodes.find((n) => n.id === node.id);
      if (!freshNode) continue;

      const lblNorm = normalizeAcademicTermsInText(freshNode.label);
      const subNorm = freshNode.sublabel
        ? normalizeAcademicTermsInText(freshNode.sublabel)
        : { normalized: freshNode.sublabel, changedTerms: [] };
      if (
        lblNorm.changedTerms.length > 0 ||
        subNorm.changedTerms.length > 0
      ) {
        currentSource = patchNodeLabel(
          currentSource,
          freshNode,
          lblNorm.normalized,
          subNorm.normalized
        );
        termFixedCount++;
        freshDoc = parseTikzDocument(currentSource, activeThemeId);
        freshNode = freshDoc.nodes.find((n) => n.id === node.id);
        if (!freshNode) continue;
      }

      if (looksLikeBorderlessAnnotation(freshNode)) {
        const isWideNote = freshNode.width >= 5.5;
        currentSource = patchNodeOptions(currentSource, freshNode, {
          subtype: isWideNote ? 'caption' : 'math',
          draw: 'none',
          fill: 'none',
        });
        upgradedCount++;
      } else if (
        freshNode.subtype === 'container' &&
        freshNode.rawOptions['subtype'] !== 'container'
      ) {
        currentSource = patchNodeOptions(currentSource, freshNode, {
          subtype: 'container',
          dashed: 'true',
          fill: freshNode.fill || palette.neutral.containerFill,
          draw: freshNode.stroke || palette.neutral.containerStroke,
          'rounded corners': '4pt',
        });
        upgradedCount++;
      } else if (
        freshNode.label.trim() === '+' ||
        freshNode.label.trim() === '$+$' ||
        freshNode.label.trim() === '$\\oplus$'
      ) {
        if (freshNode.subtype !== 'op_circle' && freshNode.width <= 1.2) {
          currentSource = patchNodeOptions(currentSource, freshNode, {
            subtype: 'op_circle',
            circle: 'true',
            fill: 'white',
            draw: palette.neutral.stroke,
            'minimum size': '0.62cm',
            'minimum width': undefined,
            'minimum height': undefined,
          });
          const afterOptsDoc = parseTikzDocument(currentSource, activeThemeId);
          const afterNode = afterOptsDoc.nodes.find((n) => n.id === freshNode.id);
          if (afterNode && (afterNode.label === '+' || afterNode.label === '$+$')) {
            currentSource = patchNodeLabel(currentSource, afterNode, '$\\oplus$');
          }
          upgradedCount++;
        }
      }
    }
    if (upgradedCount > 0) {
      appliedFixes.push(`规范化升级 ${upgradedCount} 个标准组件与无边框公式标注`);
    }
    if (termFixedCount > 0) {
      appliedFixes.push(`规范化 ${termFixedCount} 个节点的学术专有名词大小写`);
    }
  }

  // ── Step 2: Apply Salience-Driven Journal Theme Colors & Single-Meaning Line Semantics ──
  if (applyThemeColors) {
    let doc = parseTikzDocument(currentSource, activeThemeId);
    let coloredNodeCount = 0;
    let heroCountSoFar = 0;

    for (const node of doc.nodes) {
      if (!isPlainOrUncolored(node)) continue;
      const freshDoc = parseTikzDocument(currentSource, activeThemeId);
      const freshNode = freshDoc.nodes.find((n) => n.id === node.id);
      if (!freshNode) continue;

      const sem = pickSalienceColorForNode(
        freshNode,
        palette,
        heroCountSoFar
      );
      if (sem.isHero) heroCountSoFar++;

      const patches: Record<string, string | undefined> = {
        fill: sem.fill,
        draw: sem.stroke,
        'rounded corners':
          freshNode.roundedCorners || theme.defaultRoundedCorners,
        'line width': freshNode.lineWidth || theme.defaultLineWidth,
      };
      if (sem.styleClass === 'mha_block' && freshNode.subtype === 'mha') {
        patches['subtype'] = 'mha';
      } else if (
        sem.styleClass === 'addnorm_block' &&
        freshNode.subtype === 'addnorm'
      ) {
        patches['subtype'] = 'addnorm';
      }
      currentSource = patchNodeOptions(currentSource, freshNode, patches);
      coloredNodeCount++;
    }

    // Colorize edges & enforce Single-Meaning Dashed vs Dotted rule
    doc = parseTikzDocument(currentSource, activeThemeId);
    const hasContainerBox = doc.nodes.some((n) => n.subtype === 'container');
    let dottedConvertedCount = 0;

    for (const edge of doc.edges) {
      const freshDoc = parseTikzDocument(currentSource, activeThemeId);
      const freshEdge = freshDoc.edges.find((e) => e.id === edge.id);
      if (!freshEdge) continue;
      const isResidual =
        freshEdge.routeType === 'residual_left' ||
        freshEdge.routeType === 'residual_right' ||
        /residual|skip/i.test(freshEdge.styleClass || '');
      const isCross =
        /memory|cross|feedback|aux/i.test(freshEdge.styleClass || '') ||
        Math.abs(
          (freshDoc.nodes.find((n) => n.id === freshEdge.from)?.x ?? 0) -
            (freshDoc.nodes.find((n) => n.id === freshEdge.to)?.x ?? 0)
        ) >= 2.5;

      if (!freshEdge.rawOptions['draw']) {
        const strokeColor = isResidual
          ? palette.norm.stroke
          : isCross
            ? palette.attention.stroke
            : palette.neutral.stroke;
        const shouldBeDotted = hasContainerBox && (isResidual || freshEdge.dashed);
        if (shouldBeDotted && freshEdge.dashed) {
          dottedConvertedCount++;
        }
        currentSource = patchEdgeElement(currentSource, freshEdge, {
          stroke: strokeColor,
          lineWidth: freshEdge.lineWidth || theme.defaultLineWidth,
          dashed: shouldBeDotted ? false : isResidual ? true : freshEdge.dashed,
          dotted: shouldBeDotted ? true : freshEdge.dotted,
        });
      } else if (hasContainerBox && freshEdge.dashed && !freshEdge.dotted) {
        currentSource = patchEdgeElement(currentSource, freshEdge, {
          dashed: false,
          dotted: true,
        });
        dottedConvertedCount++;
      }
    }

    if (coloredNodeCount > 0) {
      appliedFixes.push(
        `按显著度预算 (1 Neutral + 1 Signal + 1 Hero Accent) 为 ${coloredNodeCount} 个模块应用 ${theme.name} 配色`
      );
    }
    if (dottedConvertedCount > 0) {
      appliedFixes.push(
        `将 ${dottedConvertedCount} 条辅助/残差虚线转为 dotted 点线，保持 dashed 仅代表容器边界`
      );
    }
  }

  // ── Step 3: Vertical Column Spacing & Anti-Overlap Solver ──
  if (fixOverlaps) {
    const doc = parseTikzDocument(currentSource, activeThemeId);
    const regularNodes = doc.nodes.filter((n) => n.subtype !== 'container');

    // Remember which nodes were originally inside each container BEFORE we shift y coordinates
    const containerMembership = new Map<string, string[]>();
    for (const c of doc.nodes.filter((n) => n.subtype === 'container')) {
      const cLeft = c.x - c.width / 2 - 0.5;
      const cRight = c.x + c.width / 2 + 0.5;
      const cBottom = c.y - c.height / 2 - 0.35;
      const cTop = c.y + c.height / 2 + 0.35;
      const memberIds = regularNodes
        .filter(
          (n) =>
            n.subtype !== 'caption' &&
            n.subtype !== 'math' &&
            n.x >= cLeft &&
            n.x <= cRight &&
            n.y >= cBottom &&
            n.y <= cTop
        )
        .map((n) => n.id);
      containerMembership.set(c.id, memberIds);
    }

    // Track mutable coordinates for all regular nodes
    const coords = new Map<string, { x: number; y: number }>();
    for (const n of regularNodes) {
      coords.set(n.id, { x: n.x, y: n.y });
    }

    // Group functional stack nodes by X column (within 0.45cm)
    const stackCandidates = regularNodes.filter(
      (n) =>
        n.subtype !== 'caption' &&
        !(n.subtype === 'math' && n.width < 1.2) &&
        n.width < 8.0
    );

    const columns: TikzNodeElement[][] = [];
    for (const node of stackCandidates) {
      const col = columns.find(
        (c) => Math.abs(c[0].x - node.x) <= 0.45
      );
      if (col) {
        col.push(node);
      } else {
        columns.push([node]);
      }
    }

    let spacingAdjustedCount = 0;
    const isConnected = (idA: string, idB: string) =>
      doc.edges.some(
        (e) =>
          (e.from === idA && e.to === idB) || (e.from === idB && e.to === idA)
      );

    for (const col of columns) {
      if (col.length < 2) continue;
      // Sort bottom to top by Y
      col.sort((a, b) => a.y - b.y);

      for (let i = 1; i < col.length; i++) {
        const prev = col[i - 1];
        const curr = col[i];
        const prevPos = coords.get(prev.id)!;
        const currPos = coords.get(curr.id)!;

        // Skip if they are intentionally side-by-side (e.g. Positional Encoding next to +)
        if (Math.abs(prevPos.y - currPos.y) < 0.08 && Math.abs(prevPos.x - currPos.x) > 0.45) {
          continue;
        }

        const connected = isConnected(prev.id, curr.id);
        const minEdgeGap = connected ? 0.56 : 0.36;
        const requiredDeltaY = (prev.height + curr.height) / 2 + minEdgeGap;
        const actualDeltaY = currPos.y - prevPos.y;

        if (actualDeltaY < requiredDeltaY - 0.04) {
          const shiftUp = Number((requiredDeltaY - actualDeltaY).toFixed(2));
          currPos.y = Number((currPos.y + shiftUp).toFixed(2));
          spacingAdjustedCount++;
          // Also shift any side-attached sibling that was at the exact same original Y as `curr`
          for (const other of regularNodes) {
            if (other.id === curr.id || col.some((c) => c.id === other.id)) continue;
            const otherPos = coords.get(other.id)!;
            if (
              Math.abs(other.y - curr.y) <= 0.12 &&
              Math.abs(otherPos.x - currPos.x) <= 3.6
            ) {
              otherPos.y = Number((otherPos.y + shiftUp).toFixed(2));
            }
          }
        }
      }
    }

    // Push any wide bottom caption / note nodes below the lowest functional node
    const functionalNodes = regularNodes.filter(
      (n) => n.subtype !== 'caption' && n.width < 8.0
    );
    if (functionalNodes.length > 0) {
      const minFunctionalBottom = Math.min(
        ...functionalNodes.map((n) => coords.get(n.id)!.y - n.height / 2)
      );
      for (const n of regularNodes) {
        if (n.subtype === 'caption' || n.width >= 8.0) {
          const pos = coords.get(n.id)!;
          if (pos.y + n.height / 2 > minFunctionalBottom - 0.35 && pos.y < minFunctionalBottom + 1.5) {
            pos.y = Number((minFunctionalBottom - n.height / 2 - 0.65).toFixed(2));
            spacingAdjustedCount++;
          }
        }
      }
    }

    // Apply coordinate updates
    const coordUpdates: Array<{
      element: TikzNodeElement;
      x: number;
      y: number;
    }> = [];
    for (const n of regularNodes) {
      const next = coords.get(n.id)!;
      if (
        Math.abs(next.x - n.x) >= 0.03 ||
        Math.abs(next.y - n.y) >= 0.03
      ) {
        coordUpdates.push({ element: n, x: next.x, y: next.y });
      }
    }

    if (coordUpdates.length > 0) {
      currentSource = patchElementsCoordinates(currentSource, coordUpdates);
      appliedFixes.push(
        `自动优化 ${coordUpdates.length} 个节点的垂直步进与防重叠间距 (保障 ≥0.55cm 箭头净空)`
      );
    }

    // ── Step 4: Re-frame Containers (`stage_box`) around their updated children ──
    if (fixContainers && containerMembership.size > 0) {
      let containerAdjusted = 0;
      for (const [cId, memberIds] of containerMembership.entries()) {
        if (memberIds.length === 0) continue;
        const freshDoc = parseTikzDocument(currentSource, activeThemeId);
        const cNode = freshDoc.nodes.find((n) => n.id === cId);
        if (!cNode) continue;

        const members = freshDoc.nodes.filter((n) => memberIds.includes(n.id));
        if (members.length === 0) continue;

        const minX = Math.min(...members.map((m) => m.x - m.width / 2));
        const maxX = Math.max(...members.map((m) => m.x + m.width / 2));
        const minY = Math.min(...members.map((m) => m.y - m.height / 2));
        const maxY = Math.max(...members.map((m) => m.y + m.height / 2));

        const padX = 0.65;
        const padBottom = 0.45;
        const padTop = 0.6;

        const nextCx = Number(((minX + maxX) / 2).toFixed(2));
        const nextCy = Number(
          ((minY - padBottom + (maxY + padTop)) / 2).toFixed(2)
        );
        const nextW = Number(
          Math.max(cNode.width, maxX - minX + padX * 2).toFixed(2)
        );
        const nextH = Number(
          Math.max(cNode.height, maxY - minY + padTop + padBottom).toFixed(2)
        );

        if (
          Math.abs(nextCx - cNode.x) >= 0.05 ||
          Math.abs(nextCy - cNode.y) >= 0.05
        ) {
          currentSource = patchElementsCoordinates(currentSource, [
            { element: cNode, x: nextCx, y: nextCy },
          ]);
        }

        const freshDoc2 = parseTikzDocument(currentSource, activeThemeId);
        const cNode2 = freshDoc2.nodes.find((n) => n.id === cId);
        if (
          cNode2 &&
          (Math.abs(nextW - cNode2.width) >= 0.05 ||
            Math.abs(nextH - cNode2.height) >= 0.05)
        ) {
          currentSource = patchNodeOptions(currentSource, cNode2, {
            'minimum width': `${formatCoordNum(nextW)}cm`,
            'minimum height': `${formatCoordNum(nextH)}cm`,
          });
        }
        containerAdjusted++;
      }

      if (containerAdjusted > 0) {
        appliedFixes.push(
          `自适应校准 ${containerAdjusted} 个分组容器框 (stage_box) 包围盒尺寸与内边距`
        );
      }
    }
  }

  const docAfter = parseTikzDocument(currentSource, activeThemeId);
  const reportAfter = analyzeTikzLayout(docAfter, activeThemeId);

  return {
    repairedCode: currentSource,
    repairedTikz: currentSource,
    appliedFixes,
    reportBefore,
    reportAfter,
    tikzCode: currentSource,
    repairs: appliedFixes,
    beforeReport: reportBefore,
    afterReport: reportAfter,
  };
}

export const validateTikzLayout = analyzeTikzLayout;

