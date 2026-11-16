import type { AgentSkillId } from './skill-registry';

/** Request-scoped record of text actually returned. Not a cross-turn memory. */
export interface SkillCoverage {
  listed: boolean;
  stall: number;
  unknownReferences: number;
  workflows: Set<string>;
  documents: Map<string, { hash: string; ranges: Array<[number, number]> }>;
  chain: Promise<void>;
}

export interface SkillPageBody {
  skillId: AgentSkillId;
  version: string;
  reference: string | null;
  documentId: string;
  contentHash: string;
  startLine: number;
  endLine: number;
  totalLines: number;
  nextStartLine: number | null;
  text: string;
}

export type SkillDeliveryKind = 'new' | 'partial' | 'already-read';

const STALL_LIMIT = 4;

export class SkillReadStalled extends Error {
  readonly code = 'skill_read_stalled';
}

export function createSkillCoverage(): SkillCoverage {
  return { listed: false, stall: 0, unknownReferences: 0, workflows: new Set(), documents: new Map(), chain: Promise.resolve() };
}

function mergeRange(ranges: Array<[number, number]>, start: number, end: number): Array<[number, number]> {
  const merged: Array<[number, number]> = [];
  for (const [from, to] of [...ranges, [start, end] as [number, number]].sort((a, b) => a[0] - b[0])) {
    const last = merged.at(-1);
    if (!last || from > last[1] + 1) merged.push([from, to]);
    else last[1] = Math.max(last[1], to);
  }
  return merged;
}

function gaps(ranges: Array<[number, number]>, start: number, end: number): Array<[number, number]> {
  const missing: Array<[number, number]> = [];
  let cursor = start;
  for (const [from, to] of ranges) {
    if (to < cursor) continue;
    if (from > end) break;
    if (from > cursor) missing.push([cursor, Math.min(from - 1, end)]);
    cursor = Math.max(cursor, to + 1);
    if (cursor > end) return missing;
  }
  if (cursor <= end) missing.push([cursor, end]);
  return missing;
}

function slicePage(page: SkillPageBody, start: number, end: number): string {
  const lines = page.text.split('\n');
  return lines.slice(start - page.startLine, end - page.startLine + 1).join('\n');
}

export function skillStallMessage(coverage: SkillCoverage): string {
  const supplied = [...coverage.documents.keys()].sort().join(', ') || '无';
  return `技能读取没有新内容，已停止重复查询。已提供：${supplied}。请根据已有工作流程开始提案，或具体说明缺失资料；不要再次读取已完整的页面。`;
}

/** First unknown reference is a correction. Later ones join the no-progress count. */
export function noteUnknownSkillReference(coverage: SkillCoverage): 'correct' | 'stall' | 'stop' {
  coverage.unknownReferences += 1;
  if (coverage.unknownReferences === 1) return 'correct';
  coverage.stall += 1;
  return coverage.stall >= STALL_LIMIT ? 'stop' : 'stall';
}

export function noteRepeatedSkillCatalog(coverage: SkillCoverage): 'first' | 'stall' | 'stop' {
  if (!coverage.listed) {
    coverage.listed = true;
    return 'first';
  }
  coverage.stall += 1;
  return coverage.stall >= STALL_LIMIT ? 'stop' : 'stall';
}

export function noteSkillProgress(coverage: SkillCoverage | undefined): void {
  if (!coverage) return;
  coverage.stall = 0;
  coverage.unknownReferences = 0;
}

export async function deliverSkillRead<T extends SkillPageBody>(
  coverage: SkillCoverage,
  page: T,
  options: { reload: boolean; workflow?: () => Promise<T> },
): Promise<T & { delivery: SkillDeliveryKind; nextAction: 'draft' | 'continue'; workflow?: T; notice?: string }> {
  const run = coverage.chain.then(async () => {
    const prior = coverage.documents.get(page.documentId);
    const same = prior?.hash === page.contentHash ? prior : undefined;
    const missing = same ? gaps(same.ranges, page.startLine, page.endLine) : [[page.startLine, page.endLine] as [number, number]];
    const workflowNeeded = page.reference !== null && !coverage.workflows.has(page.skillId);
    if (!options.reload && missing.length === 0) {
      const workflow = workflowNeeded ? await options.workflow?.() : undefined;
      if (workflow?.nextStartLine) throw new Error('技能工作流程超过单页上限，无法完整提供。');
      if (workflow) {
        coverage.workflows.add(page.skillId);
        coverage.documents.set(workflow.documentId, {
          hash: workflow.contentHash, ranges: [[workflow.startLine, workflow.endLine]],
        });
        coverage.stall = 0;
        coverage.unknownReferences = 0;
      } else coverage.stall += 1;
      if (coverage.stall >= STALL_LIMIT) throw new SkillReadStalled(skillStallMessage(coverage));
      return {
        ...page, text: '', workflow, delivery: 'already-read' as const,
        nextAction: coverage.workflows.has(page.skillId) ? 'draft' as const : 'continue' as const,
        notice: workflow
          ? '参考页已提供；本回复只补上尚未提供的技能工作流程。'
          : `已提供 ${page.documentId} 第 ${page.startLine}–${page.endLine} 行，没有新内容。不要重复读取；根据工作流程开始提案，或指出尚未读取的具体参考页。`,
      };
    }
    let body = page;
    if (!options.reload && same && missing.length) {
      body = { ...page, startLine: missing[0][0], endLine: missing.at(-1)![1], text: missing.map(([from, to]) => slicePage(page, from, to)).join('\n') };
    }
    const workflow = workflowNeeded ? await options.workflow?.() : undefined;
    if (workflow?.nextStartLine) throw new Error('技能工作流程超过单页上限，无法完整提供。');
    const delivered = options.reload ? [[page.startLine, page.endLine] as [number, number]] : missing;
    const ranges = delivered.reduce((current, [from, to]) => mergeRange(current, from, to), same?.ranges ?? []);
    coverage.documents.set(page.documentId, { hash: page.contentHash, ranges });
    if (page.reference === null || workflow) coverage.workflows.add(page.skillId);
    if (workflow) {
      coverage.documents.set(workflow.documentId, {
        hash: workflow.contentHash, ranges: [[workflow.startLine, workflow.endLine]],
      });
    }
    // Reloading an already supplied page returns the text once, but is not new knowledge.
    if (options.reload && missing.length === 0) coverage.stall += 1;
    else { coverage.stall = 0; coverage.unknownReferences = 0; }
    if (coverage.stall >= STALL_LIMIT) throw new SkillReadStalled(skillStallMessage(coverage));
    const complete = page.nextStartLine === null && (ranges.at(-1)?.[1] ?? 0) >= page.totalLines;
    return {
      ...body, nextStartLine: complete ? null : page.nextStartLine, workflow,
      delivery: (options.reload || !same ? 'new' : 'partial') as SkillDeliveryKind,
      nextAction: coverage.workflows.has(page.skillId) && complete ? 'draft' as const : 'continue' as const,
      notice: workflow ? '本回复附带该技能的工作流程，只需一次。读完所需参考页后开始提案，不要遍历全部参考页。' : undefined,
    };
  });
  coverage.chain = run.then(() => undefined, () => undefined);
  return run;
}
