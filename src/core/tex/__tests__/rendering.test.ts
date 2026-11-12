import { describe, expect, it } from 'vitest';
import nestedSwsa from './fixtures/swsa-nested.tex?raw';
import complexCjkDiagram from './fixtures/complex-cjk-diagram.tex?raw';
import { buildStandaloneLatexDocument } from '../document';
import { getExactPreviewReasons, maskLatexComments, normalizeLatexDocument } from '../source';
import { buildVectorPreview, evaluatePreviewNumber, expandPreviewMacros } from '../vector-preview';
import { parseTikzDocument } from '../../parser/parser';

describe('full documents and path-based TikZ rendering', () => {
  it('routes noncanonical flowchart shapes to exact preview rather than showing misleading rectangles', () => {
    for (const source of [
      '\\node[diamond] (decision) at (0,0) {Accept?};',
      '\\node[cylinder,draw] (storage) at (0,0) {Dataset};',
      '\\begin{tikzpicture}[reduce/.style={trapezium,draw}]\\node[reduce] (r) at (0,0) {Encode};\\end{tikzpicture}',
      '\\node[shape=ellipse] (end) at (0,0) {End};',
    ]) expect(getExactPreviewReasons(source)).toContain('自定义节点形状');
    expect(getExactPreviewReasons('\\node[dl_block] (a) at (0,0) {A};')).toEqual([]);
  });

  it('recovers the supplied SWSA diagram without nesting document preambles', () => {
    const normalized = buildStandaloneLatexDocument(nestedSwsa, 'neurips');
    expect(normalized.match(/\\documentclass\b/g)).toHaveLength(1);
    expect(normalized.match(/\\begin\{document\}/g)).toHaveLength(1);
    expect(normalized.match(/\\end\{document\}/g)).toHaveLength(1);
    expect(normalized).toContain('\\usepackage[scaled=0.95]{helvet}');
    expect(normalized).toContain('\\newcommand{\\lifneuron}');
    expect(normalized).toContain('\\Y{86.0}{89.5}');
    expect(normalizeLatexDocument(normalized)).toBe(normalized);
  });

  it('preserves a complete document verbatim, including its fonts and layout', () => {
    const doc = '\\documentclass{article}\n\\usepackage{tikz}\n\\begin{document}\n\\begin{tikzpicture}\\node at (1,2) {A};\\end{tikzpicture}\n\\end{document}\n';
    expect(buildStandaloneLatexDocument(doc, 'nature')).toBe(doc);
    expect(normalizeLatexDocument(`% \\documentclass{bad}\n${doc}`)).toBe(`% \\documentclass{bad}\n${doc}`);
  });

  it('loads bundled CJK fonts for a full document without changing any drawing commands', () => {
    const prepared = buildStandaloneLatexDocument(complexCjkDiagram, 'neurips');
    expect(prepared).toContain('\\usepackage{agentikz-fonts}');
    expect(prepared.replace('\n\\usepackage{agentikz-fonts}', '')).toBe(complexCjkDiagram);
    expect(buildStandaloneLatexDocument(prepared, 'nature')).toBe(prepared);
    expect(prepared.match(/\\documentclass\b/g)).toHaveLength(1);
    expect(prepared.split('\\begin{document}')[1]).toBe(complexCjkDiagram.split('\\begin{document}')[1]);
  });

  it('does not override existing CJK setup or mistake comments for font configuration', () => {
    for (const setup of [
      '\\usepackage{xeCJK}\\setCJKmainfont{MyFont}',
      '\\usepackage[UTF8]{ctex}',
      '\\usepackage{tikz,agentikz-fonts}',
    ]) {
      const source = `\\documentclass{standalone}\n${setup}\n\\begin{document}中文\\end{document}`;
      expect(buildStandaloneLatexDocument(source, 'neurips')).toBe(source);
    }
    const commented = '\\documentclass{standalone}\n% \\usepackage{xeCJK}\n\\begin{document}中文\\end{document}';
    expect(buildStandaloneLatexDocument(commented, 'neurips')).toContain('\\documentclass{standalone}\n\\usepackage{agentikz-fonts}');
    const latin = '\\documentclass{standalone}\n% 中文注释\n\\begin{document}Latin only\\end{document}';
    expect(buildStandaloneLatexDocument(latin, 'neurips')).toBe(latin);
  });

  it('expands the sample macros, renders all tiles and preserves clipping and curves', () => {
    const expanded = expandPreviewMacros(nestedSwsa);
    expect(expanded).not.toMatch(/\\(?:vblock|lifneuron|addnode|mulnode|X|Y|yA|yB)\b/);
    const scene = buildVectorPreview(nestedSwsa, (error) => { throw error; });
    expect(scene).not.toBeNull();
    expect(scene!.elements.length).toBeGreaterThan(600);
    expect(scene!.clips.length).toBeGreaterThan(8);
    expect(scene!.elements.some((el) => el.kind === 'path' && el.d.includes(' C '))).toBe(true);
    expect(scene!.elements.some((el) => el.kind === 'path' && el.fill.toUpperCase() === '#E2F0D9')).toBe(true);
    const labels = scene!.elements.filter((el) => el.kind === 'label');
    expect(labels.some((el) => el.kind === 'label' && el.lines.includes('SWSA') && el.rotate === 90)).toBe(true);
    expect(scene!.viewBox[2] / scene!.viewBox[3]).toBeCloseTo(1023 / 688, 1);
  });

  it('does not interpret macro definitions as visible source nodes', () => {
    const doc = parseTikzDocument(nestedSwsa);
    expect(doc.nodes.every((node) => !node.label.includes('#6'))).toBe(true);
    expect(doc.diagnostics.some((d) => d.message.includes('TeX'))).toBe(true);
    expect(getExactPreviewReasons('% \\fill (0,0) circle (1);\n\\node (a) at (0,0) {A};')).toEqual([]);
    expect(getExactPreviewReasons('\\draw (a.east) -- (2,0) |- (b.west);')).toEqual([]);
  });

  it('evaluates arithmetic without executing code and bounds recursive macros', () => {
    expect(evaluatePreviewNumber('{0.5*(195+231)}')).toBe(213);
    expect(evaluatePreviewNumber('302 - 0.98*21.5')).toBeCloseTo(280.93);
    expect(() => evaluatePreviewNumber('globalThis.alert(1)')).toThrow();
    expect(() => evaluatePreviewNumber('1/0')).toThrow();
    expect(() => expandPreviewMacros('\\newcommand{\\loop}{\\loop}\\loop')).toThrow(/recursion/i);
    expect(buildVectorPreview('\\begin{tikzpicture}\\foreach \\x in {1,2} {\\draw (0,0)--(1,1);}\\end{tikzpicture}')).toBeNull();
    expect(maskLatexComments('A\\%B % hidden\nC')).toBe('A\\%B         \nC');
  });

  it('retains colored, rotated labels instead of failing the entire compatibility scene', () => {
    const scene = buildVectorPreview(String.raw`\definecolor{accent}{HTML}{C9211E}
\begin{tikzpicture}[x=0.25mm,y=-0.25mm]
\fill[accent] (0,0) rectangle (30,40);
\node[text=white,rotate=90] at (15,20) {Details $x^2$};
\draw[blue,->] (30,20) -- (50,20);
\end{tikzpicture}`);
    expect(scene).not.toBeNull();
    expect(scene!.elements).toHaveLength(3);
    expect(scene!.elements[0]).toMatchObject({ kind: 'path', fill: '#C9211E' });
    expect(scene!.elements[1]).toMatchObject({ kind: 'label', color: '#FFFFFF', rotate: -90 });
    expect(scene!.elements[2]).toMatchObject({ kind: 'path', stroke: '#0000FF', arrow: true });
  });
});
