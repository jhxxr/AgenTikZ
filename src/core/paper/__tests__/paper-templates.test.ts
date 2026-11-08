import { describe, expect, it } from 'vitest';
import { buildPaperTemplateFiles, PAPER_VENUE_TEMPLATES } from '../paper-templates';

describe('paper templates without a figure library', () => {
  it('retains paper choices and offers a minimal blank manuscript', () => {
    expect(PAPER_VENUE_TEMPLATES.map((template) => template.id))
      .toEqual(['blank', 'nature', 'neurips', 'cvpr', 'ieee', 'arxiv']);
    const blank = buildPaperTemplateFiles('blank', 'My Paper');
    expect(Object.keys(blank)).toEqual(['main.tex', 'references.bib']);
    expect(blank['main.tex']).toContain('\\title{My Paper}');
    expect(blank['main.tex']).toContain('\\begin{document}');
  });

  it('never inserts a sample drawing, fake result table or missing figure reference', () => {
    for (const template of PAPER_VENUE_TEMPLATES) {
      const files = buildPaperTemplateFiles(template.id);
      const manuscript = Object.entries(files).filter(([path]) => path.endsWith('.tex'))
        .map(([, content]) => content).join('\n');
      expect(manuscript).not.toContain('\\input{figures/');
      expect(manuscript).not.toContain('\\begin{tikzpicture}');
      expect(manuscript).not.toContain('\\begin{tabular}');
      const inputs = [...manuscript.matchAll(/\\input\{([^}]+)\}/g)];
      for (const [, target] of inputs) expect(Object.hasOwn(files, target)).toBe(true);
    }
  });

  it('keeps single- and double-column paper layouts', () => {
    for (const id of ['cvpr', 'ieee'] as const) {
      expect(buildPaperTemplateFiles(id)['main.tex']).toContain('[10pt,twocolumn]');
    }
    expect(buildPaperTemplateFiles('arxiv')['main.tex']).toContain('[11pt]');
  });

  it('escapes plain-text titles so punctuation cannot break the TeX document', () => {
    const files = buildPaperTemplateFiles('blank', 'A & B: 50%_test');
    expect(files['main.tex']).toContain('\\title{A \\& B: 50\\%\\_test}');
  });
});
