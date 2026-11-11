import { describe, expect, it } from 'vitest';
import { buildBlankPaperFiles, PAPER_VENUE_TEMPLATES } from '../paper-templates';

const prefix = '../../../../runtime/paper-templates/';
const sources = import.meta.glob<string>('../../../../runtime/paper-templates/**/*.{json,tex}', { query: '?raw', import: 'default', eager: true });
const assets = import.meta.glob('../../../../runtime/paper-templates/**/*', { query: '?url', import: 'default', eager: true });
const manifests = ['blank', 'ieee', 'neurips', 'icml', 'iclr', 'cvpr', 'acl'].map((id) =>
  JSON.parse(sources[`${prefix}${id}/template.json`]) as {
    id: string; mainFile: string; source: string;
  });

describe('official paper template library', () => {
  it('only generates the blank fallback in browser mode', () => {
    expect(PAPER_VENUE_TEMPLATES.map((template) => template.id)).toEqual(['blank']);
    const blank = buildBlankPaperFiles('My Paper');
    expect(Object.keys(blank)).toEqual(['main.tex', 'references.bib']);
    expect(blank['main.tex']).toContain('\\title{My Paper}');
    expect(blank['main.tex']).not.toContain('\\begin{tikzpicture}');
    expect(blank['main.tex']).not.toContain('\\begin{tabular}');
  });

  it('ships original author kits, not article-based imitation venue layouts', () => {
    expect(manifests.map((template) => template.id)).toEqual(['blank', 'ieee', 'neurips', 'icml', 'iclr', 'cvpr', 'acl']);
    for (const template of manifests) {
      expect(Object.hasOwn(assets, `${prefix}${template.id}/files/${template.mainFile}`)).toBe(true);
      if (template.id !== 'blank') expect(template.source).toMatch(/^https:\/\//);
    }
    for (const [id, file] of [
      ['cvpr', 'cvpr.sty'], ['cvpr', 'sec/1_intro.tex'], ['icml', 'icml2026.sty'],
      ['icml', 'icml_numpapers.pdf'], ['iclr', 'iclr2027_conference.sty'],
      ['neurips', 'neurips_2026.sty'], ['neurips', 'checklist.tex'], ['acl', 'acl.sty'],
      ['ieee', 'IEEEtran.cls'], ['ieee', 'bare_conf.tex'], ['ieee', 'bibtex/IEEEtran.bst'],
    ]) expect(Object.hasOwn(assets, `${prefix}${id}/files/${file}`)).toBe(true);
    expect(sources[`${prefix}ieee/files/bare_jrnl.tex`]).toContain('\\documentclass[journal]{IEEEtran}');
    expect(sources[`${prefix}cvpr/files/main.tex`]).toContain('\\usepackage[review]{cvpr}');
  });

  it('does not replace official sample titles with a project name', () => {
    for (const template of manifests.filter((template) => template.id !== 'blank')) {
      const main = sources[`${prefix}${template.id}/files/${template.mainFile}`];
      expect(main).not.toContain('AGENTIKZ-PAPER-TITLE');
    }
  });

  it('escapes plain-text blank manuscript titles', () => {
    expect(buildBlankPaperFiles('A & B: 50%_test')['main.tex']).toContain('\\title{A \\& B: 50\\%\\_test}');
  });
});
