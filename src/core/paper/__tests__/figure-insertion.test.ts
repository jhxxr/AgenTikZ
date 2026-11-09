import { describe, expect, it } from 'vitest';
import { buildFigureLaTeXSnippet } from '../paper-templates';
import {
  canvasFigurePath, defaultFigureSpan, ensureFigurePackages, findExistingFigure, hasDrawableFigure,
  insertFigureAtSafePosition, normalizeFigurePath, uniqueFigureLabel,
} from '../figure-insertion';

const document = '\\documentclass{article}\n% \\begin{document}\n\\begin{document}\nBody.\n% \\end{document}\n\\end{document}\n';
const options = { mode: 'external_graphic' as const, relativePath: 'figures/assets/chart.png', caption: '', label: 'fig:chart' };

describe('safe figure insertion helpers', () => {
  it('preserves actual filenames and quotes spaces and Unicode without changing the saved path', () => {
    expect(canvasFigurePath('Model figure.canvas.json')).toBe('figures/Model figure.tikz');
    expect(buildFigureLaTeXSnippet({ ...options, relativePath: 'figures/实验 图.png' }))
      .toContain('{\\detokenize{figures/实验 图.png}}');
    expect(buildFigureLaTeXSnippet(options)).toContain('\\caption{}');
    expect(buildFigureLaTeXSnippet(options)).not.toContain('proposed method');
  });

  it.each(['../escape.png', '/absolute.png', 'C:/path.png', '.git/secret.png', 'figures/%bad.png', 'figures/{bad}.png'])(
    'rejects unsafe project paths: %s', (path) => expect(() => normalizeFigurePath(path)).toThrow(),
  );

  it.each(['NaN', '0', '-0.5', '1.5', '0.8\\textwidth'])('rejects invalid width %s', (widthRatio) => {
    expect(() => buildFigureLaTeXSnippet({ ...options, widthRatio })).toThrow(/宽度/);
  });

  it('rejects unsupported image formats, unsafe labels and malformed captions', () => {
    expect(() => buildFigureLaTeXSnippet({ ...options, relativePath: 'figures/a.svg' })).toThrow(/SVG/);
    expect(() => buildFigureLaTeXSnippet({ ...options, relativePath: 'figures/a.webp' })).toThrow(/SVG/);
    expect(() => buildFigureLaTeXSnippet({ ...options, label: 'fig:{broken}' })).toThrow(/标签/);
    expect(() => buildFigureLaTeXSnippet({ ...options, caption: 'Accuracy 50%' })).toThrow(/转义/);
    expect(() => buildFigureLaTeXSnippet({ ...options, caption: '\\textbf{Unclosed' })).toThrow(/花括号/);
    expect(buildFigureLaTeXSnippet({ ...options, caption: 'Accuracy 50\\%, $x_{i}$' })).toContain('Accuracy 50\\%, $x_{i}$');
  });

  it('detects empty and comment-only canvases without requiring an AST-supported architecture', () => {
    expect(hasDrawableFigure('\\begin{tikzpicture}[>=Stealth]\n% nothing\n\\end{tikzpicture}')).toBe(false);
    expect(hasDrawableFigure('\\begin{tikzpicture}\\fill (0,0) circle (1cm);\\end{tikzpicture}')).toBe(true);
  });

  it('uses the manuscript layout rather than guessing a double-column paper from canvas dimensions', () => {
    expect(defaultFigureSpan(document, 16)).toBe('single_column');
    expect(defaultFigureSpan(document.replace('{article}', '[twocolumn]{article}'), 16)).toBe('double_column');
    expect(defaultFigureSpan(document.replace('{article}', '[twocolumn]{article}'), 8)).toBe('single_column');
    expect(defaultFigureSpan('% \\documentclass[twocolumn]{article}\n' + document, 16)).toBe('single_column');
  });

  it('adds only the required package to the real preamble and never trusts a commented-out package', () => {
    const external = ensureFigurePackages(document, 'external_graphic');
    expect(external.indexOf('\\usepackage{graphicx}')).toBeLessThan(external.indexOf('\\begin{document}\nBody'));
    expect(external).not.toContain('agentikz-macros');
    expect(ensureFigurePackages(external, 'external_graphic')).toBe(external);
    const commented = document.replace('\\begin{document}\nBody', '% \\usepackage{graphicx}\n\\begin{document}\nBody');
    expect(ensureFigurePackages(commented, 'external_graphic').match(/\\usepackage\{graphicx\}/g)).toHaveLength(2);
    expect(() => ensureFigurePackages('', 'tikz_package')).toThrow(/主文件/);
  });

  it('never uses another file cursor, a preamble cursor, or a cursor inside an environment or command argument', () => {
    const source = '\\documentclass{article}\n\\begin{document}\n\\section{A\nlong title}\n\\begin{equation}\nx=1\n\\end{equation}\nEnd.\n\\end{document}';
    for (const cursor of [2, source.indexOf('long'), source.indexOf('x=1')]) {
      const inserted = insertFigureAtSafePosition(source, 'FIGURE', cursor);
      expect(inserted.text.indexOf('FIGURE')).toBeGreaterThan(inserted.text.indexOf('End.'));
      expect(inserted.text.indexOf('FIGURE')).toBeLessThan(inserted.text.indexOf('\\end{document}'));
    }
  });

  it('inserts on a safe line without trimming user text or interpreting JS replacement metacharacters', () => {
    const source = '\\begin{document}\n  Keep  spaces.  \nNext.\n\\end{document}';
    const result = insertFigureAtSafePosition(source, 'FIGURE $& $$ $`', source.indexOf('Keep') + 2);
    expect(result.text).toContain('  Keep  spaces.  \n');
    expect(result.text).toContain('FIGURE $& $$ $`');
    expect(result.text.indexOf('FIGURE')).toBeLessThan(result.text.indexOf('Next.'));
    const beforeEnd = insertFigureAtSafePosition(document, 'FIGURE');
    expect(beforeEnd.text.indexOf('FIGURE')).toBeGreaterThan(beforeEnd.text.indexOf('% \\end{document}'));
  });

  it('does not insert inside multiline inline math or literal code examples, including blank lines', () => {
    for (const block of ['\\(\nx=1\n\\)', '\\[\nx=1\n\\]', '\\begin{verbatim}\nx=1\n\n\\end{verbatim}']) {
      const source = `\\begin{document}\n${block}\nEnd.\n\\end{document}`;
      const result = insertFigureAtSafePosition(source, 'FIGURE', source.indexOf('x=1'));
      expect(result.text.indexOf('FIGURE')).toBeGreaterThan(result.text.indexOf('End.'));
    }
  });

  it('does not treat comments or verbatim examples as existing figures or occupied labels', () => {
    const source = '% \\includegraphics{figures/assets/chart.png}\n\\begin{verbatim}\n\\label{fig:chart}\n\\end{verbatim}';
    expect(findExistingFigure(source, options.relativePath, options.mode)).toBeUndefined();
    expect(uniqueFigureLabel('fig:chart', [source])).toBe('fig:chart');
    expect(uniqueFigureLabel('fig:chart', ['\\label{fig:chart}', '\\label{fig:chart-2}'])).toBe('fig:chart-3');
    const existing = '\\begin{figure}\n\\includegraphics[width=.9\\columnwidth]{\\detokenize{figures/my chart.pdf}}\n\\label{fig:chart}\n\\end{figure}';
    expect(findExistingFigure(existing, 'figures/my chart.pdf', 'external_graphic')).toMatchObject({ label: 'fig:chart' });
  });
});
