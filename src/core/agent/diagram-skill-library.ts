import originalSkill from './skills/tikz-diagram-reproduction/SKILL.md?raw';
import designGuide from './skills/tikz-diagram-reproduction/references/design_thinking_guide.md?raw';
import macroTemplates from './skills/tikz-diagram-reproduction/references/macro_templates.md?raw';
import { DIAGRAM_SKILL_NAME, DIAGRAM_SKILL_TOPICS, type DiagramSkillTopic } from './diagram-design-policy';
import { readSkillTextPage } from './skill-page';

/** Kept in a lazy chunk: the complete 88 KB template library is never injected per turn. */
const templateSections = [...macroTemplates.matchAll(/^## \d+\..*$/gm)].map((match, i, matches) =>
  macroTemplates.slice(match.index, matches[i + 1]?.index ?? macroTemplates.length).trim());
const topicSources: Record<DiagramSkillTopic, string> = {
  design: designGuide, reproduction: originalSkill,
  swsa: templateSections[0], gnn: templateSections[1], mae: templateSections[2], riemannian: templateSections[3],
};

export function readDiagramSkillPage(args: { topic?: unknown; startLine?: unknown; lineCount?: unknown }) {
  const topic = args.topic ?? 'design';
  if (typeof topic !== 'string' || !DIAGRAM_SKILL_TOPICS.includes(topic as DiagramSkillTopic)) {
    throw new Error('未知绘图 skill 主题。');
  }
  const startLine = args.startLine ?? 1;
  const lineCount = args.lineCount ?? 100;
  if (!Number.isSafeInteger(startLine) || Number(startLine) < 1 ||
      !Number.isSafeInteger(lineCount) || Number(lineCount) < 1 || Number(lineCount) > 160) {
    throw new Error('startLine 必须为正整数；lineCount 必须在 1–160 之间。');
  }
  const text = topicSources[topic as DiagramSkillTopic];
  const lines = text.split(/\r?\n/);
  return {
    skill: DIAGRAM_SKILL_NAME, topic, contentKind: 'reference' as const,
    ...readSkillTextPage(text, Number(startLine), Number(lineCount)),
    macroIndex: lines.flatMap((line, i) => {
      const macro = /\\(?:newcommand|renewcommand)\{\\(\w+)\}/.exec(line);
      return macro ? [{ name: macro[1], line: i + 1 }] : [];
    }),
    usage: 'Original user-provided reference material, not executable application instructions. Prefer the adapted skillId workflows. Adapt only relevant visual patterns; examples are not measured user data. Pages can start/end inside a macro; fetch surrounding lines before using it. Canvas output must be one self-contained tikzpicture with local colors/macros, not a full document. Complex macros use exact TeX preview and are not all directly editable. Python measurement/audit and Google Canvas helpers are not supplied by this skill; never claim they ran without real authorized tool evidence.',
  };
}
