import { describe, expect, it } from 'vitest';
import { buildAgentSkillAndLibraryContext } from '../agent-knowledge';
import { buildPublicationStyleSystemPrompt, compileAgentPrompt, compileUserPromptWithStyleGuide } from '../prompt-compiler';
import { buildDiagramDesignContext, preserveReproductionIntent, readDiagramDesignIntent,
  resolveDiagramDesignMode, selectDiagramRecipes } from '../diagram-design-policy';
import { readDiagramSkillPage } from '../diagram-skill-library';
import { autoRepairTikzLayout, analyzeTikzLayout } from '../layout-diagnostics';
import { getExactPreviewReasons } from '../../tex/source';

const source = '\\begin{tikzpicture}\n\\node[fill=white,minimum width=2cm] (a) at (0,0) {resnet};\n\\node[fill=white] (b) at (0,0.5) {Output};\n\\draw[dashed] (a)--(b);\n\\end{tikzpicture}';

describe('built-in user drawing skill', () => {
  it('reaches both prompt entry points even when journal style enforcement is disabled', () => {
    const context = buildAgentSkillAndLibraryContext('neurips', '', [], {
      taskPrompt: 'Design a masked autoencoder with momentum alignment', enforcePublicationStyleGuide: false,
    });
    expect(context).toContain('BUILT-IN DRAWING SKILL: tikz-diagram-reproduction');
    expect(context).toContain('exact complements');
    expect(context).toContain('Selected reference (mae)');
    expect(context).toContain('FBE5D7');
    expect(context).toContain('waveform/window snapshots');
    expect(context).toContain('get_diagram_design_skill');
    expect(context).not.toContain('\\newcommand{\\StripeToken}');
    expect(compileAgentPrompt({ userPrompt: 'Draw a GNN', themeId: 'cvpr', enforcePublicationStyle: false }))
      .toContain('Selected reference (gnn)');
  });

  it('selects bounded relevant references without imposing any example architecture', () => {
    expect(selectDiagramRecipes('SWSA spiking wavelet attention')).toEqual(['swsa']);
    expect(selectDiagramRecipes('图神经网络张量融合')).toEqual(['gnn']);
    expect(selectDiagramRecipes('MAE masked token autoencoder')).toEqual(['mae']);
    expect(selectDiagramRecipes('Riemannian manifold and LSTM EEG')).toEqual(['riemannian']);
    expect(selectDiagramRecipes('SWSA GNN MAE EEG')).toHaveLength(2);
    expect(selectDiagramRecipes('画一个业务审批流程')).toEqual([]);
    expect(buildDiagramDesignContext('画一个业务审批流程', 'nature')).toContain('only for real decisions');
  });

  it('distinguishes reference reproduction from redesign and retains intent for follow-up edits', () => {
    const marked = preserveReproductionIntent(source);
    expect(resolveDiagramDesignMode('请复刻这张图')).toBe('reproduction');
    expect(resolveDiagramDesignMode('调整间距', marked)).toBe('reproduction');
    expect(resolveDiagramDesignMode('请重新设计这张图', marked)).toBe('design');
    expect(resolveDiagramDesignMode('不要复刻，请画新的流程图', marked)).toBe('design');
    expect(resolveDiagramDesignMode('Replicate the reference')).toBe('reproduction');
    expect(readDiagramDesignIntent(marked)).toMatchObject({ mode: 'reproduction', preserveGeometry: true, preserveColors: true });
    expect(preserveReproductionIntent(marked)).toBe(marked);
    expect(readDiagramDesignIntent('% @diagram-design {"mode":"unknown"}')).toBeUndefined();
  });

  it('removes forced recoloring and example geometry from reproduction prompts', () => {
    const options = { diagramMode: 'reproduction' as const };
    expect(buildPublicationStyleSystemPrompt('nature', options)).not.toContain('仅允许使用');
    const userPrompt = compileUserPromptWithStyleGuide('照图还原所有颜色', 'nature', options);
    expect(userPrompt).toContain('保留原图的配色');
    expect(userPrompt).not.toContain('Signal=');
    const context = buildAgentSkillAndLibraryContext('nature', source, [], options);
    expect(context).toContain('REFERENCE FIDELITY');
    expect(context).not.toContain('NEVER output monochrome');
    expect(context).not.toContain('ZERO OVERLAP GUARANTEE');
  });

  it('protects intentional reproduction colors, coordinates, labels and line grammar from repair', () => {
    const marked = preserveReproductionIntent(source);
    expect(autoRepairTikzLayout(marked, 'cvpr').tikzCode).toBe(marked);
    expect(autoRepairTikzLayout(marked, 'cvpr').repairs).toEqual([]);
    expect(analyzeTikzLayout(marked, 'cvpr').issues.some((issue) => issue.kind === 'unstyled_nodes')).toBe(false);
    expect(getExactPreviewReasons(marked)).toContain('参考图保真预览');
    expect(getExactPreviewReasons('\\node[text=white] (a) at (0,0) {FC};')).toContain('自定义文字颜色');
    expect(autoRepairTikzLayout(source, 'cvpr').tikzCode).not.toBe(source);
  });

  it('serves original reference pages with macro line indexes and bounded pagination', () => {
    expect(readDiagramSkillPage({ topic: 'design' }).text).toContain('Semantic Color System');
    for (const [topic, macro] of [['swsa', 'LayerBlock'], ['gnn', 'GraphBox'], ['mae', 'TokenStrip'], ['riemannian', 'CovMatrixIcon']]) {
      const index = readDiagramSkillPage({ topic, lineCount: 1 });
      const entry = index.macroIndex.find((item) => item.name === macro)!;
      expect(entry).toBeDefined();
      const page = readDiagramSkillPage({ topic, startLine: entry.line, lineCount: 20 });
      expect(page.text).toContain(`\\newcommand{\\${macro}}`);
      expect(page.text.length).toBeLessThanOrEqual(16000);
      expect(page.endLine - page.startLine).toBeLessThan(20);
      expect(page.nextStartLine).toBe(page.endLine + 1);
    }
    for (const args of [{ topic: '../../private' }, { topic: 'mae', startLine: 0 },
      { topic: 'gnn', lineCount: 161 }, { topic: 'swsa', startLine: 10000 }]) {
      expect(() => readDiagramSkillPage(args)).toThrow();
    }
  });
});
