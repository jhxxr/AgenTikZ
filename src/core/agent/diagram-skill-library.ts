import originalSkill from './skills/tikz-diagram-reproduction/SKILL.md?raw';
import designGuide from './skills/tikz-diagram-reproduction/references/design_thinking_guide.md?raw';
import macroTemplates from './skills/tikz-diagram-reproduction/references/macro_templates.md?raw';
import { DIAGRAM_SKILL_NAME, DIAGRAM_SKILL_TOPICS, type DiagramSkillTopic } from './diagram-design-policy';

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
  if (Number(startLine) > lines.length) throw new Error(`起始行超出当前主题范围（共 ${lines.length} 行）。`);
  const page: string[] = [];
  let chars = 0;
  for (const line of lines.slice(Number(startLine) - 1, Number(startLine) - 1 + Number(lineCount))) {
    if (chars + line.length + 1 > 16000) break;
    page.push(line); chars += line.length + 1;
  }
  const endLine = Number(startLine) + page.length - 1;
  return {
    skill: DIAGRAM_SKILL_NAME, topic, startLine: Number(startLine), endLine, totalLines: lines.length,
    nextStartLine: endLine < lines.length ? endLine + 1 : null,
    text: page.join('\n'),
    macroIndex: lines.flatMap((line, i) => {
      const macro = /\\(?:newcommand|renewcommand)\{\\(\w+)\}/.exec(line);
      return macro ? [{ name: macro[1], line: i + 1 }] : [];
    }),
    usage: 'User-provided reference material. Adapt only relevant visual patterns to the actual task. Pages can start/end inside a macro; fetch surrounding lines before using it. Canvas output must be one self-contained tikzpicture with needed local colors/macros, not a copied full document. Complex macros use exact TeX preview and are not all directly editable. Do not claim Python measurement/audit tools were run; those helpers are not installed as agent tools.',
  };
}
