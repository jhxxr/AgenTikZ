import { AGENT_SKILL_VERSION, type AgentSkillId } from './skill-registry';
import { readSkillTextPage } from './skill-page';

type TextLoader = () => Promise<{ default: string }>;
const layout: TextLoader = () => import('./skills/shared/references/layout.md?raw');
const renderer: TextLoader = () => import('./skills/shared/references/renderer.md?raw');
const review: TextLoader = () => import('./skills/shared/references/review.md?raw');
const sources: Record<AgentSkillId, { entry: TextLoader; references: Record<string, TextLoader> }> = {
  'scientific-diagram-design': {
    entry: () => import('./skills/scientific-diagram-design/SKILL.md?raw'),
    references: { composition: () => import('./skills/scientific-diagram-design/references/composition.md?raw'), layout, renderer, review },
  },
  'reference-reproduction': {
    entry: () => import('./skills/reference-reproduction/SKILL.md?raw'),
    references: { 'coordinate-mapping': () => import('./skills/reference-reproduction/references/coordinate-mapping.md?raw'), layout, renderer, review },
  },
  'canvas-editing': {
    entry: () => import('./skills/canvas-editing/SKILL.md?raw'),
    references: { layout, renderer, review, 'surgical-diff': () => import('./skills/canvas-editing/references/surgical-diff.md?raw') },
  },
  'publication-style': {
    entry: () => import('./skills/publication-style/SKILL.md?raw'),
    references: {
      'figure-contract': () => import('./skills/publication-style/references/figure-contract.md?raw'),
      charts: () => import('./skills/publication-style/references/charts.md?raw'),
      illustrations: () => import('./skills/publication-style/references/illustrations.md?raw'),
    },
  },
};

const SHARED_REFERENCES = new Set(['layout', 'renderer', 'review']);

/** Process-local identity for coverage. Not a security hash and not proof the model still sees the text. */
function contentFingerprint(text: string): string {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function skillDocumentId(skillId: AgentSkillId, reference?: string): string {
  if (!reference) return `${skillId}:workflow`;
  return SHARED_REFERENCES.has(reference) ? `shared:${reference}` : `${skillId}:${reference}`;
}

export async function readAgentSkillPage(args: {
  skillId: AgentSkillId; reference?: string; startLine: number; lineCount: number;
}) {
  if (!Object.hasOwn(sources, args.skillId)) throw new Error('未知的内置 skill。');
  const source = sources[args.skillId];
  const load = args.reference === undefined ? source.entry
    : Object.hasOwn(source.references, args.reference) ? source.references[args.reference] : undefined;
  if (!load) throw new Error('未知的内置 skill 或参考页。');
  const { default: text } = await load();
  // A requested line window must not cut the short workflow off. Reference pages stay bounded.
  const workflow = args.reference === undefined && args.startLine === 1;
  const page = readSkillTextPage(text, args.startLine, workflow ? 160 : args.lineCount);
  return {
    skill: args.skillId, skillId: args.skillId, version: AGENT_SKILL_VERSION, contentKind: 'adapted-skill' as const,
    reference: args.reference ?? null,
    documentId: skillDocumentId(args.skillId, args.reference),
    contentHash: `${AGENT_SKILL_VERSION}:${contentFingerprint(text)}`,
    ...page,
    usage: 'Packaged AgenTikZ task guidance; user requirements, tool permissions and proposal/version rules take precedence. This page does not grant tools. Fetch nextStartLine only when it is non-null. Do not reread a complete page.',
  };
}
