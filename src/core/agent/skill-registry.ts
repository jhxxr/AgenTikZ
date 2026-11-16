import { DIAGRAM_SKILL_TOPICS, type DiagramSkillTopic } from './diagram-design-policy';

/** Metadata only: importing the catalog must not load any skill or template text. */
export const AGENT_SKILL_VERSION = '1.0.0';
export const AGENT_SKILLS = [
  { id: 'scientific-diagram-design', description: 'New scientific figures: composition, data-state shapes and visual narrative.',
    references: ['composition', 'layout', 'renderer', 'review'] },
  { id: 'reference-reproduction', description: 'Reference-image reproduction: fidelity, coordinate mapping and uncertainty.',
    references: ['coordinate-mapping', 'layout', 'renderer', 'review'] },
  { id: 'canvas-editing', description: 'Local canvas edits, layout repair and refinement of a pending draft.',
    references: ['layout', 'renderer', 'review', 'surgical-diff'] },
  { id: 'publication-style', description: 'Enabled journal defaults, figure contracts, charts and illustration directives.',
    references: ['figure-contract', 'charts', 'illustrations'] },
] as const;
export type AgentSkillId = typeof AGENT_SKILLS[number]['id'];

/** Explicit workflow aliases only. Not a filesystem path lookup. */
const WORKFLOW_ALIASES = new Set(['', 'skill', 'catalog', 'workflow', '.', 'skill.md']);

export type DiagramSkillRequest =
  | { action: 'list' }
  | { action: 'read' | 'reload'; skillId: AgentSkillId; reference?: string; startLine: number; lineCount: number }
  | { action: 'read'; topic: DiagramSkillTopic; startLine: number; lineCount: number };

export function validateDiagramSkillRequest(args: Record<string, unknown>): DiagramSkillRequest {
  const keys = ['action', 'skillId', 'reference', 'topic', 'startLine', 'lineCount'];
  if (!args || Array.isArray(args) || typeof args !== 'object' || Object.keys(args).some((key) => !keys.includes(key))) {
    throw new Error('绘图 skill 参数包含未知字段。');
  }
  const action = args.action === undefined ? 'read' : args.action;
  if (action !== 'list' && action !== 'read' && action !== 'reload') throw new Error('action 必须为 list、read 或 reload。');
  // Some model gateways populate every optional field. Listing never reads a body.
  if (action === 'list') return { action };
  const startLine = args.startLine ?? 1;
  const lineCount = args.lineCount ?? 100;
  if (!Number.isSafeInteger(startLine) || Number(startLine) < 1 ||
      !Number.isSafeInteger(lineCount) || Number(lineCount) < 1 || Number(lineCount) > 160) {
    throw new Error('startLine 必须为正整数；lineCount 必须在 1–160 之间。');
  }
  if (args.skillId === undefined) {
    if (action === 'reload') throw new Error('reload 必须指定 skillId。');
    if (args.reference !== undefined) throw new Error('reference 必须配合 skillId。');
    const topic = args.topic ?? 'design';
    if (typeof topic !== 'string' || !(DIAGRAM_SKILL_TOPICS as readonly string[]).includes(topic)) {
      throw new Error('未知绘图 skill 主题。');
    }
    return { action, topic: topic as DiagramSkillTopic, startLine: Number(startLine), lineCount: Number(lineCount) };
  }
  // Adapted workflows take precedence over a redundantly supplied legacy topic.
  const skill = AGENT_SKILLS.find((item) => item.id === args.skillId);
  if (!skill) throw new Error('未知的内置 skill ID。');
  const raw = args.reference === undefined ? '' : args.reference;
  if (typeof raw !== 'string') throw new Error('reference 必须是字符串。');
  const reference = WORKFLOW_ALIASES.has(raw.trim().toLowerCase()) ? undefined : raw;
  if (reference !== undefined && !(skill.references as readonly string[]).includes(reference)) {
    throw new Error(`未知的 skill 参考页；${skill.id} 可用：${skill.references.join(', ')}。省略 reference、或使用 workflow / . 读取工作流程。`);
  }
  return { action, skillId: skill.id, reference: reference as string | undefined,
    startLine: Number(startLine), lineCount: Number(lineCount) };
}

export function listAgentSkills() {
  return {
    version: AGENT_SKILL_VERSION, contentKind: 'catalog' as const,
    skills: AGENT_SKILLS.map((skill) => ({ ...skill, version: AGENT_SKILL_VERSION, references: [...skill.references] })),
    usage: 'Read one applicable skillId (omit reference, or use workflow / .). The first reference read also returns that skill workflow once. Then read only needed references. Do not reread a complete page. Legacy topic reads are original reference material, not executable application instructions. action=reload refetches one page after genuine context loss; it is not a progress reset.',
    example: { skillId: 'reference-reproduction', reference: 'coordinate-mapping' },
  };
}

export function buildAgentSkillCatalog(): string {
  return [
    `On-demand skills v${AGENT_SKILL_VERSION} (get_diagram_design_skill; action=list for references):`,
    ...AGENT_SKILLS.map(({ id, description }) => `- ${id}: ${description}`),
    'Read one skillId. Its first reference includes the workflow. Load only needed pages; do not reread a complete page.',
    'Use get_theme_palette for enabled journal defaults and get_component_library with componentId/category for needed examples.',
  ].join('\n');
}
