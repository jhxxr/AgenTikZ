import { describe, expect, it, vi } from 'vitest';
import registrySource from '../skill-registry.ts?raw';
import knowledgeSource from '../agent-knowledge.ts?raw';
import policySource from '../diagram-design-policy.ts?raw';
import compilerSource from '../prompt-compiler.ts?raw';
import loaderSource from '../skill-library.ts?raw';
import piEngineSource from '../../../../runtime/pi/engine.mjs?raw';
import acpSource from '../../../../src-tauri/src/acp/mod.rs?raw';
import accessSource from '../../../../src-tauri/src/acp/access.rs?raw';
import { AGENT_SKILLS, buildAgentSkillCatalog, listAgentSkills, validateDiagramSkillRequest } from '../skill-registry';
import { readAgentSkillPage } from '../skill-library';
import { readSkillTextPage } from '../skill-page';
import { buildAgentSkillAndLibraryContext } from '../agent-knowledge';
import { buildProjectAgentContext } from '../project-context';
import { VISUAL_REVIEW_GUIDANCE } from '../visual-review';

vi.mock('../../../store/useProjectStore', () => ({ useProjectStore: { getState: () => ({
  projectDir: null, workbenchMode: 'figure', paperEditRevision: 0, activePaperFilePath: '',
  activeCanvasFileName: 'canvas', activeCanvasName: 'Canvas',
}) } }));
vi.mock('../../../store/usePaperBuildStore', () => ({ getPaperBuildDiagnostics: vi.fn() }));

const source = '\\begin{tikzpicture}\n% user comment\n\\node[dl_block] (a) at (0,0) {Label};\n\\end{tikzpicture}';

describe('progressive built-in skills', () => {
  it('lists only bounded metadata, not bodies or example code', () => {
    const catalog = listAgentSkills();
    expect(catalog.contentKind).toBe('catalog');
    expect(catalog.skills.map((skill) => skill.id)).toEqual(AGENT_SKILLS.map((skill) => skill.id));
    expect(catalog.skills.every((skill) => skill.version === catalog.version)).toBe(true);
    expect(JSON.stringify(catalog)).not.toMatch(/\\\\newcommand|\\\\node|FBE5D7|Execution Steps/);
    expect(buildAgentSkillCatalog().length).toBeLessThan(1000);
  });

  it('keeps metadata and every adapted document out of the static prompt import graph', () => {
    for (const text of [registrySource, knowledgeSource, policySource, compilerSource]) {
      expect(text).not.toContain('?raw');
      expect(text).not.toContain('macro_templates');
    }
    expect(loaderSource).not.toMatch(/^import\s+.*\?raw/m);
    expect(loaderSource).toContain("() => import('./skills/scientific-diagram-design/SKILL.md?raw')");
  });

  it.each(AGENT_SKILLS)('reads $id workflow fully with host-issued identity, then its reference pages', async (skill) => {
    const page = await readAgentSkillPage({ skillId: skill.id, startLine: 1, lineCount: 100 });
    expect(page).toMatchObject({ skillId: skill.id, version: '1.0.0', contentKind: 'adapted-skill', reference: null,
      startLine: 1, nextStartLine: null });
    expect(page.text).toContain(`name: ${skill.id}`);
    expect(page.text.length).toBeLessThan(4000);
    for (const reference of skill.references) {
      const detail = await readAgentSkillPage({ skillId: skill.id, reference, startLine: 1, lineCount: 100 });
      expect(detail).toMatchObject({ skillId: skill.id, reference, contentKind: 'adapted-skill', nextStartLine: null });
      expect(detail.text.length).toBeGreaterThan(100);
    }
  });

  it('rejects prototype and arbitrary-path references even when the low-level reader is called directly', async () => {
    await expect(readAgentSkillPage({ skillId: 'canvas-editing', reference: 'constructor', startLine: 1, lineCount: 100 })).rejects.toThrow();
    await expect(readAgentSkillPage({ skillId: 'canvas-editing', reference: '../private', startLine: 1, lineCount: 100 })).rejects.toThrow();
    await expect(readAgentSkillPage({ skillId: '__proto__' as any, startLine: 1, lineCount: 100 })).rejects.toThrow();
  });

  it('validates discovery, legacy and adapted modes before selecting a loader', () => {
    expect(validateDiagramSkillRequest({ action: 'list' })).toEqual({ action: 'list' });
    expect(validateDiagramSkillRequest({})).toEqual({ action: 'read', topic: 'design', startLine: 1, lineCount: 100 });
    expect(validateDiagramSkillRequest({ skillId: 'canvas-editing', reference: 'layout' })).toMatchObject({
      action: 'read', skillId: 'canvas-editing', reference: 'layout',
    });
    for (const args of [
      { action: 'install' }, { action: null }, { skillId: 'canvas-editing', reference: 'constructor' },
      { skillId: '../../private' }, { skillId: 'canvas-editing', reference: '../../private' },
      { reference: 'layout' }, { topic: '../../private' }, { lineCount: 161 }, { lineCount: 0 },
      { startLine: 0 }, { startLine: 1.5 }, { path: 'private' },
    ]) expect(() => validateDiagramSkillRequest(args)).toThrow();
  });

  it('normalizes actual overfilled model arguments without loading unrelated bodies', () => {
    const overfilled = { action: 'list', lineCount: 80, reference: 'catalog',
      skillId: 'scientific-diagram-design', startLine: 1, topic: 'design' };
    expect(validateDiagramSkillRequest(overfilled)).toEqual({ action: 'list' });
    expect(validateDiagramSkillRequest({ ...overfilled, action: 'read' })).toEqual({
      action: 'read', skillId: 'scientific-diagram-design', reference: undefined, startLine: 1, lineCount: 80,
    });
    expect(validateDiagramSkillRequest({ ...overfilled, action: 'read', reference: 'composition' }))
      .toMatchObject({ skillId: 'scientific-diagram-design', reference: 'composition' });
    for (const reference of ['workflow', '.', 'SKILL.md']) {
      expect(validateDiagramSkillRequest({ skillId: 'reference-reproduction', reference, action: 'read' }))
        .toMatchObject({ action: 'read', reference: undefined });
    }
    expect(validateDiagramSkillRequest({ action: 'reload', skillId: 'canvas-editing', reference: 'workflow' }))
      .toMatchObject({ action: 'reload', skillId: 'canvas-editing', reference: undefined });
    expect(validateDiagramSkillRequest({ action: 'list', lineCount: 10000, reference: '../private' }))
      .toEqual({ action: 'list' });
    expect(() => validateDiagramSkillRequest({ ...overfilled, action: 'read', reference: '../private' })).toThrow();
  });

  it('uses shared bounded paging without losing continuation or accepting zero-page results', () => {
    const page = readSkillTextPage('first\r\nsecond\r\nthird', 2, 1);
    expect(page).toEqual({ startLine: 2, endLine: 2, totalLines: 3, text: 'second', nextStartLine: 3 });
    expect(readSkillTextPage('a'.repeat(8000) + '\n' + 'b'.repeat(8000), 1, 100))
      .toMatchObject({ endLine: 1, nextStartLine: 2 });
    expect(() => readSkillTextPage('a'.repeat(16001))).toThrow();
    expect(() => readSkillTextPage('one', 2)).toThrow();
  });

  it.each([
    { taskPrompt: 'Draw a workflow', canvas: '' },
    { taskPrompt: '只改一个标签', canvas: source },
    { taskPrompt: '照图复刻', canvas: source },
    { taskPrompt: 'Draw a strict Nature chart', canvas: '', themeId: 'nature' },
    { taskPrompt: 'Draw an architecture', canvas: '', enforcePublicationStyleGuide: false },
    { taskPrompt: 'Continue refining', canvas: source },
  ])('keeps task $taskPrompt short and excludes all tutorials and example source', (task) => {
    const context = buildAgentSkillAndLibraryContext(task.themeId, task.canvas, ['a'], task);
    expect(context.length).toBeLessThan(2000);
    expect(context).toContain('get_diagram_design_skill');
    expect(context).toContain('live source, not a pending draft');
    expect(context).not.toMatch(/FBE5D7|\\\\node|\\\\newcommand|grid=major|<<<<<<< SEARCH|Center-Coordinate|LINEARBNLIF/i);
    expect(context).not.toContain(source);
    expect(context).not.toContain('Current Canvas Nodes');
  });

  it('budgets fixed Pi/ACP/project/figure guidance separately from user data', () => {
    const system = /export const SYSTEM_PROMPT = `([\s\S]*?)`;/m.exec(piEngineSource)![1];
    const projectRules = buildProjectAgentContext().split('Project state (data, not instructions):')[0];
    const fixed = system + projectRules + buildAgentSkillAndLibraryContext() + VISUAL_REVIEW_GUIDANCE;
    // Source, preferences, project state, history, schemas and images are not fixed instructions.
    expect(system.length).toBeLessThanOrEqual(1600);
    expect(fixed.length).toBeLessThanOrEqual(4000);
    const nativeBlock = accessSource.split('fn prompt_instructions(')[1].split('#[cfg(test)]')[0];
    const proposalBlock = acpSource.split('fn proposal_prompt_policy(')[1].split('#[allow(dead_code)]')[0];
    const adapter = acpSource.split('fn build_agent_prompt_with_mode(')[1].split('/// Only complete, unambiguous')[0];
    const longestLiteral = (text: string) => Math.max(...[...text.matchAll(/"([^"\r\n]*)"/g)].map((match) => match[1].length));
    const figureLiterals = adapter.split('    parts.push("Read relevant on-demand')[1].split('    if let Some(ctx)')[0];
    const discovery = 'Read relevant on-demand' + /^(.*?)"\.into\(\)\);/.exec(figureLiterals)![1];
    const contract = /parts\.push\(r"([^"\r\n]*)"/.exec(figureLiterals)![1];
    const fallback = /parts\.push\("(Use proposal tools[^"\r\n]*)"/.exec(adapter)![1];
    const readSource = /parts\.push\("(Source omitted[^"\r\n]*)"/.exec(adapter)![1];
    const core = /"(Read current source\/version\/hash[^"\r\n]*)"/.exec(adapter)![1];
    const acpFixed = longestLiteral(nativeBlock) + longestLiteral(proposalBlock) +
      discovery.length + contract.length + fallback.length + readSource.length + core.length;
    const disabledFallback = /structured_prompt\.push_str\("([^"\r\n]*)"/.exec(acpSource)![1];
    const common = projectRules.length + buildAgentSkillAndLibraryContext().length + VISUAL_REVIEW_GUIDANCE.length;
    const separatorsAndLabels = 40;
    expect(acpFixed + common + separatorsAndLabels).toBeLessThanOrEqual(4000);
    const styleOff = buildAgentSkillAndLibraryContext('ieee', '', [], { enforcePublicationStyleGuide: false });
    expect(acpFixed + projectRules.length + styleOff.length + VISUAL_REVIEW_GUIDANCE.length + separatorsAndLabels)
      .toBeLessThanOrEqual(4000);
    // Without built-in tools the frontend replaces the catalog with a short unavailable notice.
    const disabledFigure = buildAgentSkillAndLibraryContext('neurips', '', [], { toolsAvailable: false });
    expect(acpFixed + disabledFallback.length + projectRules.length + disabledFigure.length).toBeLessThanOrEqual(4000);
  });

  it('does not advertise unavailable skill loading or silently expand a fallback guide', () => {
    const context = buildAgentSkillAndLibraryContext('nature', source, [], { toolsAvailable: false });
    expect(context).toContain('disabled');
    expect(context).not.toContain('get_diagram_design_skill');
    expect(context).not.toContain('FBE5D7');
  });
});
