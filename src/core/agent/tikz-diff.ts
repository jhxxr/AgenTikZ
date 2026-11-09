import { TikzDiffLine, TikzSemanticDiffItem } from '../../types/acp';
import { JournalThemeId } from '../../types/theme';
import { parseTikzDocument } from '../parser/parser';
import { insertTikzStatement } from '../parser/patcher';

export interface SearchReplaceBlock {
  search: string;
  replace: string;
}

export interface AgentDirective {
  theme?: JournalThemeId;
  fitCanvas?: boolean;
  caption?: string;
  label?: string;
  selectIds?: string[];
}

export interface ResolvedAgentPatch {
  newTikzCode: string;
  mode: 'surgical_diff' | 'full_replace';
  appliedHunks: number;
  directives: AgentDirective;
}

export interface ComputedTikzDiff {
  semanticSummary: string;
  rationaleSummary: string;
  affectedElementIds: string[];
  semanticItems: TikzSemanticDiffItem[];
  diffLines: TikzDiffLine[];
  addedCount: number;
  modifiedCount: number;
  removedCount: number;
}

/**
 * Extracts optional `@agent-action {...}` or ```agent-action {...} ``` JSON directives from agent reply.
 */
export function extractAgentDirectives(reply: string): AgentDirective {
  const directive: AgentDirective = {};
  const blockMatch =
    /```(?:agent-action|json-action)\s*\n([\s\S]*?)```|@agent-action\s*(\{[^\n]+\})/i.exec(
      reply
    );
  const rawJson = blockMatch?.[1] || blockMatch?.[2];
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson.trim());
      if (
        parsed.theme &&
        ['neurips', 'cvpr', 'nature', 'ieee'].includes(parsed.theme)
      ) {
        directive.theme = parsed.theme as JournalThemeId;
      }
      if (typeof parsed.fitCanvas === 'boolean') {
        directive.fitCanvas = parsed.fitCanvas;
      }
      if (typeof parsed.caption === 'string') {
        directive.caption = parsed.caption;
      }
      if (typeof parsed.label === 'string') {
        directive.label = parsed.label;
      }
      if (Array.isArray(parsed.selectIds)) {
        directive.selectIds = parsed.selectIds.map(String);
      }
    } catch {
      // ignore malformed directive
    }
  }
  return directive;
}

/**
 * Extracts all `<<<<<<< SEARCH ... ======= ... >>>>>>> REPLACE` blocks from an agent response.
 */
export function extractSearchReplaceBlocks(reply: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];
  const regex =
    /<<<<<<<\s*SEARCH[ \t]*\r?\n([\s\S]*?)\r?\n=======[ \t]*\r?\n([\s\S]*?)\r?\n>>>>>>>\s*REPLACE/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(reply)) !== null) {
    blocks.push({
      search: match[1],
      replace: match[2],
    });
  }
  return blocks;
}

/**
 * Applies a single SEARCH/REPLACE block to `source` with exact match first,
 * falling back to line-trimmed whitespace-tolerant matching.
 */
function applySingleSearchReplace(
  source: string,
  block: SearchReplaceBlock
): { nextSource: string; applied: boolean } {
  const searchNorm = block.search.replace(/\r\n/g, '\n');
  const replaceNorm = block.replace.replace(/\r\n/g, '\n');
  const sourceNorm = source.replace(/\r\n/g, '\n');

  if (!searchNorm.trim()) {
    // Empty SEARCH means insert before \end{tikzpicture}
    if (replaceNorm.trim()) {
      return {
        nextSource: insertTikzStatement(sourceNorm, replaceNorm),
        applied: true,
      };
    }
    return { nextSource: source, applied: false };
  }

  // 1. Exact substring match
  const exactIdx = sourceNorm.indexOf(searchNorm);
  if (exactIdx !== -1) {
    const nextSource =
      sourceNorm.slice(0, exactIdx) +
      replaceNorm +
      sourceNorm.slice(exactIdx + searchNorm.length);
    return { nextSource, applied: true };
  }

  // 2. Whitespace-tolerant line-by-line match
  const sourceLines = sourceNorm.split('\n');
  const searchLines = searchNorm.split('\n');
  // Trim leading/trailing blank lines from searchLines
  while (searchLines.length > 0 && searchLines[0].trim() === '') {
    searchLines.shift();
  }
  while (
    searchLines.length > 0 &&
    searchLines[searchLines.length - 1].trim() === ''
  ) {
    searchLines.pop();
  }

  if (searchLines.length === 0) {
    return { nextSource: source, applied: false };
  }

  const normalizeWs = (line: string) => line.trim().replace(/\s+/g, ' ');
  for (let i = 0; i <= sourceLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (
        normalizeWs(sourceLines[i + j]) !== normalizeWs(searchLines[j])
      ) {
        matches = false;
        break;
      }
    }
    if (matches) {
      const before = sourceLines.slice(0, i);
      const after = sourceLines.slice(i + searchLines.length);
      const nextLines = [
        ...before,
        ...(replaceNorm.trim() === '' ? [] : replaceNorm.split('\n')),
        ...after,
      ];
      return {
        nextSource: nextLines.join('\n'),
        applied: true,
      };
    }
  }

  // 3. Node ID / Edge Endpoint AST fallback if SEARCH is a single \node or \draw statement
  if (searchLines.length === 1) {
    const single = searchLines[0].trim();
    const doc = parseTikzDocument(sourceNorm);
    if (single.startsWith('\\node')) {
      const withoutAt = single.replace(
        /at\s*\(\s*[-+0-9.a-zA-Z]+\s*,\s*[-+0-9.a-zA-Z]+\s*\)/,
        ' '
      );
      const idMatch = /\(\s*([a-zA-Z0-9_:-]+)\s*\)/.exec(withoutAt);
      if (idMatch) {
        const targetNode = doc.nodes.find((n) => n.id === idMatch[1].trim());
        if (targetNode) {
          let start = targetNode.span.start;
          while (
            start > 0 &&
            (sourceNorm[start - 1] === ' ' || sourceNorm[start - 1] === '\t')
          ) {
            start--;
          }
          const nextSource =
            sourceNorm.slice(0, start) +
            (replaceNorm.trim() ? `  ${replaceNorm.trim()}` : '') +
            sourceNorm.slice(targetNode.span.end);
          return { nextSource, applied: true };
        }
      }
    }
  }

  return { nextSource: source, applied: false };
}

/**
 * Applies all `SEARCH/REPLACE` blocks to `canvasTikz`.
 */
export function applySearchReplaceBlocks(
  canvasTikz: string,
  blocks: SearchReplaceBlock[]
): { nextSource: string; appliedCount: number } {
  let current = canvasTikz;
  let appliedCount = 0;
  for (const block of blocks) {
    const { nextSource, applied } = applySingleSearchReplace(current, block);
    if (applied) {
      current = nextSource;
      appliedCount++;
    }
  }
  return { nextSource: current, appliedCount };
}

/**
 * Merges a snippet of `\node` / `\draw` statements into an existing `canvasTikz`
 * by updating matching node IDs in-place and inserting new nodes/edges before `\end{tikzpicture}`.
 */
export function mergeTikzSnippetIntoCanvas(
  canvasTikz: string,
  snippet: string
): { nextSource: string; changedCount: number } {
  if (!canvasTikz.includes('\\begin{tikzpicture}')) {
    return { nextSource: canvasTikz, changedCount: 0 };
  }
  const snippetDoc = parseTikzDocument(
    `\\begin{tikzpicture}\n${snippet}\n\\end{tikzpicture}`
  );
  if (
    snippetDoc.nodes.length === 0 &&
    snippetDoc.edges.length === 0 &&
    snippetDoc.charts.length === 0
  ) {
    return { nextSource: canvasTikz, changedCount: 0 };
  }

  let current = canvasTikz;
  let changedCount = 0;

  // 1. Update or insert nodes
  for (const sNode of snippetDoc.nodes) {
    const rawNodeStmt = snippetDoc.fullSource
      .slice(sNode.span.start, sNode.span.end)
      .trim();
    const curDoc = parseTikzDocument(current);
    const existing = curDoc.nodes.find(
      (n) => n.namedInSource && sNode.namedInSource && n.id === sNode.id
    );
    if (existing) {
      let start = existing.span.start;
      while (
        start > 0 &&
        (current[start - 1] === ' ' || current[start - 1] === '\t')
      ) {
        start--;
      }
      current =
        current.slice(0, start) +
        `  ${rawNodeStmt}` +
        current.slice(existing.span.end);
      changedCount++;
    } else {
      current = insertTikzStatement(current, rawNodeStmt);
      changedCount++;
    }
  }

  // 2. Update or insert edges
  for (const sEdge of snippetDoc.edges) {
    const rawEdgeStmt = snippetDoc.fullSource
      .slice(sEdge.span.start, sEdge.span.end)
      .trim();
    const curDoc = parseTikzDocument(current);
    const existingEdge = curDoc.edges.find(
      (e) =>
        e.from === sEdge.from &&
        e.to === sEdge.to &&
        e.routeType === sEdge.routeType
    );
    if (existingEdge) {
      let start = existingEdge.span.start;
      while (
        start > 0 &&
        (current[start - 1] === ' ' || current[start - 1] === '\t')
      ) {
        start--;
      }
      current =
        current.slice(0, start) +
        `  ${rawEdgeStmt}` +
        current.slice(existingEdge.span.end);
      changedCount++;
    } else {
      current = insertTikzStatement(current, rawEdgeStmt);
      changedCount++;
    }
  }

  // 3. Update or insert charts
  for (const sChart of snippetDoc.charts) {
    const rawChartStmt = snippetDoc.fullSource
      .slice(sChart.span.start, sChart.span.end)
      .trim();
    const curDoc = parseTikzDocument(current);
    const existingChart = curDoc.charts.find((c) => c.id === sChart.id);
    if (existingChart) {
      let start = existingChart.span.start;
      while (
        start > 0 &&
        (current[start - 1] === ' ' || current[start - 1] === '\t')
      ) {
        start--;
      }
      current =
        current.slice(0, start) +
        `  ${rawChartStmt}` +
        current.slice(existingChart.span.end);
      changedCount++;
    } else {
      current = insertTikzStatement(current, rawChartStmt);
      changedCount++;
    }
  }

  return { nextSource: current, changedCount };
}

/**
 * Extracts a complete `\begin{tikzpicture} ... \end{tikzpicture}` block from a reply.
 */
export function extractCompleteTikzBlock(reply: string): string | null {
  const candidates: string[] = [];
  const fenceRegex = /```(?:latex|tex|tikz)?[ \t]*\r?\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(reply)) !== null) {
    const code = match[1].trim();
    if (
      code.includes('\\begin{tikzpicture}') &&
      code.includes('\\end{tikzpicture}') &&
      !code.includes('\\documentclass') &&
      !code.includes('\\begin{document}')
    ) {
      candidates.push(code);
    }
  }
  if (candidates.length === 1) {
    return candidates[0];
  }
  if (candidates.length > 1) {
    // Return the last complete block if the agent showed a before/after or step-by-step
    return candidates[candidates.length - 1];
  }
  return null;
}

/**
 * Resolves an agent's reply (and optional backend `proposedTikz`) into a clean `ResolvedAgentPatch`,
 * supporting both surgical `SEARCH/REPLACE` diffs and full `tikzpicture` replacements.
 */
export function resolveAgentPatchFromReply(
  reply: string,
  currentCanvasTikz: string,
  backendProposedTikz?: string | null
): ResolvedAgentPatch | null {
  const directives = extractAgentDirectives(reply);

  // 1. Check for explicit SEARCH / REPLACE surgical diff blocks
  const srBlocks = extractSearchReplaceBlocks(reply);
  if (srBlocks.length > 0 && currentCanvasTikz.trim()) {
    const { nextSource, appliedCount } = applySearchReplaceBlocks(
      currentCanvasTikz,
      srBlocks
    );
    if (appliedCount > 0 && nextSource !== currentCanvasTikz) {
      return {
        newTikzCode: nextSource,
        mode: 'surgical_diff',
        appliedHunks: appliedCount,
        directives,
      };
    }
  }

  // 2. Check for backend-extracted or reply-extracted complete tikzpicture
  const fullBlock = backendProposedTikz?.trim() || extractCompleteTikzBlock(reply);
  if (fullBlock) {
    const isIncrementalEdit =
      Boolean(currentCanvasTikz.trim()) &&
      parseTikzDocument(currentCanvasTikz).elements.length > 0;
    return {
      newTikzCode: fullBlock,
      mode: isIncrementalEdit ? 'surgical_diff' : 'full_replace',
      appliedHunks: srBlocks.length || 1,
      directives,
    };
  }

  return null;
}

/**
 * Computes both AST-level semantic diffs (added/modified/removed nodes, edges, charts)
 * and compact line-level unified diffs for display in `RightAgentPanel`.
 */
export function computeTikzDiff(
  oldCode: string,
  newCode: string
): ComputedTikzDiff {
  const oldDoc = parseTikzDocument(oldCode || '');
  const newDoc = parseTikzDocument(newCode || '');

  const semanticItems: TikzSemanticDiffItem[] = [];
  const affectedSet = new Set<string>();

  let addedCount = 0;
  let modifiedCount = 0;
  let removedCount = 0;

  // 1. Compare Nodes
  const oldNodeMap = new Map(oldDoc.nodes.map((n) => [n.id, n]));
  const newNodeMap = new Map(newDoc.nodes.map((n) => [n.id, n]));

  for (const [id, nNode] of newNodeMap.entries()) {
    const oNode = oldNodeMap.get(id);
    if (!oNode) {
      addedCount++;
      affectedSet.add(id);
      semanticItems.push({
        type: 'add',
        category: 'node',
        id,
        detail: `新增 ${nNode.subtype} 节点 "${nNode.label.slice(0, 24)}" at (${nNode.x.toFixed(1)}, ${nNode.y.toFixed(1)})`,
      });
    } else {
      const changes: string[] = [];
      if (
        Math.abs(oNode.x - nNode.x) >= 0.05 ||
        Math.abs(oNode.y - nNode.y) >= 0.05
      ) {
        changes.push(
          `坐标 (${oNode.x.toFixed(1)},${oNode.y.toFixed(1)})→(${nNode.x.toFixed(1)},${nNode.y.toFixed(1)})`
        );
      }
      if (
        Math.abs(oNode.width - nNode.width) >= 0.05 ||
        Math.abs(oNode.height - nNode.height) >= 0.05
      ) {
        changes.push(
          `尺寸 ${oNode.width.toFixed(1)}×${oNode.height.toFixed(1)}→${nNode.width.toFixed(1)}×${nNode.height.toFixed(1)}cm`
        );
      }
      if (oNode.label !== nNode.label || oNode.sublabel !== nNode.sublabel) {
        changes.push(`文本标签更新`);
      }
      if (
        oNode.fill !== nNode.fill ||
        oNode.stroke !== nNode.stroke ||
        oNode.styleClass !== nNode.styleClass ||
        oNode.subtype !== nNode.subtype
      ) {
        changes.push(
          `样式/配色 (${nNode.styleClass || nNode.fill || nNode.subtype})`
        );
      }
      if (changes.length > 0) {
        modifiedCount++;
        affectedSet.add(id);
        semanticItems.push({
          type: 'modify',
          category: 'node',
          id,
          detail: changes.join(' · '),
        });
      }
    }
  }

  for (const [id, oNode] of oldNodeMap.entries()) {
    if (!newNodeMap.has(id)) {
      removedCount++;
      semanticItems.push({
        type: 'remove',
        category: 'node',
        id,
        detail: `移除节点 "${oNode.label.slice(0, 24)}"`,
      });
    }
  }

  // 2. Compare Edges
  const edgeKey = (e: { from: string; to: string }) => `${e.from}->${e.to}`;
  const oldEdgeMap = new Map(oldDoc.edges.map((e) => [edgeKey(e), e]));
  const newEdgeMap = new Map(newDoc.edges.map((e) => [edgeKey(e), e]));

  for (const [key, nEdge] of newEdgeMap.entries()) {
    const oEdge = oldEdgeMap.get(key);
    if (!oEdge) {
      addedCount++;
      affectedSet.add(nEdge.id);
      semanticItems.push({
        type: 'add',
        category: 'edge',
        id: `${nEdge.from}→${nEdge.to}`,
        detail: `新增连线 (${nEdge.routeType}${nEdge.label ? `: ${nEdge.label}` : ''})`,
      });
    } else if (
      oEdge.routeType !== nEdge.routeType ||
      oEdge.label !== nEdge.label ||
      oEdge.stroke !== nEdge.stroke ||
      oEdge.dashed !== nEdge.dashed ||
      Math.abs((oEdge.residualOffset || 0) - (nEdge.residualOffset || 0)) >=
        0.05
    ) {
      modifiedCount++;
      affectedSet.add(nEdge.id);
      semanticItems.push({
        type: 'modify',
        category: 'edge',
        id: `${nEdge.from}→${nEdge.to}`,
        detail: `更新连线路由/样式 (${nEdge.routeType})`,
      });
    }
  }

  for (const [key] of oldEdgeMap.entries()) {
    if (!newEdgeMap.has(key)) {
      removedCount++;
      semanticItems.push({
        type: 'remove',
        category: 'edge',
        id: key.replace('->', '→'),
        detail: `移除连线`,
      });
    }
  }

  // 3. Compare Charts
  const oldChartMap = new Map(oldDoc.charts.map((c) => [c.id, c]));
  const newChartMap = new Map(newDoc.charts.map((c) => [c.id, c]));

  for (const [id, nChart] of newChartMap.entries()) {
    const oChart = oldChartMap.get(id);
    if (!oChart) {
      addedCount++;
      affectedSet.add(id);
      semanticItems.push({
        type: 'add',
        category: 'chart',
        id,
        detail: `新增 PGFPlots 图表 "${nChart.title}" (${nChart.chartType})`,
      });
    } else if (
      oChart.title !== nChart.title ||
      oChart.chartType !== nChart.chartType ||
      Math.abs(oChart.x - nChart.x) >= 0.05 ||
      Math.abs(oChart.y - nChart.y) >= 0.05 ||
      JSON.stringify(oChart.series) !== JSON.stringify(nChart.series)
    ) {
      modifiedCount++;
      affectedSet.add(id);
      semanticItems.push({
        type: 'modify',
        category: 'chart',
        id,
        detail: `更新图表 "${nChart.title}" 数据/布局`,
      });
    }
  }

  for (const [id, oChart] of oldChartMap.entries()) {
    if (!newChartMap.has(id)) {
      removedCount++;
      semanticItems.push({
        type: 'remove',
        category: 'chart',
        id,
        detail: `移除图表 "${oChart.title}"`,
      });
    }
  }

  // 4. Build concise semantic summary
  const summaryParts: string[] = [];
  if (oldDoc.elements.length === 0 && newDoc.elements.length > 0) {
    summaryParts.push(
      `新建完整图形 (${newDoc.nodes.length} 节点 · ${newDoc.edges.length} 连线${
        newDoc.charts.length > 0 ? ` · ${newDoc.charts.length} 图表` : ''
      })`
    );
  } else {
    if (addedCount > 0) summaryParts.push(`+${addedCount} 新增`);
    if (modifiedCount > 0) summaryParts.push(`~${modifiedCount} 修改`);
    if (removedCount > 0) summaryParts.push(`-${removedCount} 移除`);
    if (summaryParts.length === 0 && oldCode.trim() !== newCode.trim()) {
      summaryParts.push('更新 TikZ 样式定义与注释');
    }
  }

  const semanticSummary =
    summaryParts.length > 0
      ? `TikZ Diff 变更 (${summaryParts.join(' · ')})`
      : '来自 ACP Agent 的 TikZ 代码更新';

  const rationaleSummary =
    semanticItems.length > 0
      ? semanticItems
          .slice(0, 4)
          .map(
            (item) =>
              `${item.type === 'add' ? '+' : item.type === 'modify' ? '~' : '-'} [${item.id}] ${item.detail}`
          )
          .join('；') +
        (semanticItems.length > 4 ? ` 等 ${semanticItems.length} 项变更` : '')
      : '本地 ACP 返回的代码变更；可展开 Diff 对比后一键应用。';

  // 5. Compute compact Unified Line Diff
  const diffLines = computeCompactLineDiff(oldCode, newCode);

  return {
    semanticSummary,
    rationaleSummary,
    affectedElementIds: Array.from(affectedSet),
    semanticItems,
    diffLines,
    addedCount,
    modifiedCount,
    removedCount,
  };
}

/**
 * Computes a clean, compact LCS line diff with 2 lines of context around changed hunks.
 */
export function computeCompactLineDiff(
  oldText: string,
  newText: string
): TikzDiffLine[] {
  const oldLines = (oldText || '').replace(/\r\n/g, '\n').split('\n');
  const newLines = (newText || '').replace(/\r\n/g, '\n').split('\n');

  const n = oldLines.length;
  const m = newLines.length;

  // Guard against huge matrices
  if (n * m > 250000) {
    return [...oldLines.map((text, idx) => ({
      type: 'remove' as const,
      text,
      oldLine: idx + 1,
    })), ...newLines.map((text, idx) => ({
      type: 'add' as const,
      text,
      newLine: idx + 1,
    }))];
  }

  const dp: number[][] = Array.from({ length: n + 1 }, () =>
    new Array(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = 1 + dp[i + 1][j + 1];
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const rawDiff: TikzDiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      rawDiff.push({
        type: 'context',
        text: oldLines[i],
        oldLine: i + 1,
        newLine: j + 1,
      });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rawDiff.push({
        type: 'remove',
        text: oldLines[i],
        oldLine: i + 1,
      });
      i++;
    } else {
      rawDiff.push({
        type: 'add',
        text: newLines[j],
        newLine: j + 1,
      });
      j++;
    }
  }
  while (i < n) {
    rawDiff.push({ type: 'remove', text: oldLines[i], oldLine: i + 1 });
    i++;
  }
  while (j < m) {
    rawDiff.push({ type: 'add', text: newLines[j], newLine: j + 1 });
    j++;
  }

  // Filter to keep 2 context lines around each change
  const keep = new Array(rawDiff.length).fill(false);
  const contextRadius = 2;
  for (let idx = 0; idx < rawDiff.length; idx++) {
    if (rawDiff[idx].type !== 'context') {
      for (
        let k = Math.max(0, idx - contextRadius);
        k <= Math.min(rawDiff.length - 1, idx + contextRadius);
        k++
      ) {
        keep[k] = true;
      }
    }
  }

  const compact: TikzDiffLine[] = [];
  let lastKept = -1;
  for (let idx = 0; idx < rawDiff.length; idx++) {
    if (!keep[idx]) continue;
    if (lastKept !== -1 && idx - lastKept > 1) {
      compact.push({
        type: 'header',
        text: `@@ ... 省略 ${idx - lastKept - 1} 行未改动代码 ... @@`,
      });
    }
    compact.push(rawDiff[idx]);
    lastKept = idx;
  }

  return compact;
}
