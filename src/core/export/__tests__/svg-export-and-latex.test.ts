import { describe, expect, it } from 'vitest';
import { renderMixedLatexToHtml } from '../../../components/canvas/LatexLabel';
import { buildStandaloneLatexDocument } from '../../../components/editor/TikzCodePanel';
import { FIGURE_PARSER_FIXTURES } from '../../parser/__tests__/fixtures/figure-examples';
import { computeSceneTightBounds } from '../svg-exporter';

describe('LatexLabel & KaTeX Formula Rendering (renderMixedLatexToHtml)', () => {
  it('renders inline $...$ formulas with output:"html" and zero duplicate .katex-mathml nodes', () => {
    const html = renderMixedLatexToHtml(
      'Input Tokens $X \\in \\mathbb{R}^{N\\times d}$'
    );
    expect(html).toContain('class="katex"');
    expect(html).toContain('class="katex-html"');
    // Must NOT include .katex-mathml which duplicates text when CSS is absent
    expect(html).not.toContain('katex-mathml');
    expect(html).toContain('Input Tokens');
  });

  it('auto-detects raw math formulas without $ delimiters (e.g. \\text{Softmax}(QK^\\top / \\sqrt{d_k})V)', () => {
    const html = renderMixedLatexToHtml(
      '\\text{Softmax}(QK^\\top / \\sqrt{d_k})V'
    );
    expect(html).toContain('class="katex"');
    expect(html).not.toContain('katex-mathml');
    expect(html).toContain('Softmax');
  });

  it('handles nested braces inside \\textbf{...} and \\textit{...} containing inline math', () => {
    const html = renderMixedLatexToHtml(
      '\\textbf{(a) Loss $\\mathcal{L}_{\\text{total}}$} \\& \\textit{Acc (\\%)}'
    );
    expect(html).toContain('<strong>');
    expect(html).toContain('class="katex"');
    expect(html).toContain('&amp;');
    expect(html).toContain('Acc (%)');
    expect(html).not.toContain('\\textbf');
  });

  it('strips LaTeX sizing commands (\\scriptsize, \\footnotesize, \\small) and preserves escaped spaces', () => {
    const html = renderMixedLatexToHtml(
      '\\scriptsize\\textbf{Transformer\\ Block} ($\\times L$)'
    );
    expect(html).not.toContain('\\scriptsize');
    expect(html).toContain('Transformer Block');
    expect(html).toContain('class="katex"');
  });

  it('generates valid standalone LaTeX documents with hex color hoisting, PGFPlots key declarations, and CJK support', () => {
    const sampleTikz = `${FIGURE_PARSER_FIXTURES[0].tikzCode}\n% 中文节点测试: 线性输出头 $\\hat{Y}$`;
    const standalone = buildStandaloneLatexDocument(sampleTikz, 'neurips');

    // CJK figures use the bundled font package instead of a system TeX Live's ctex.
    expect(standalone).toContain('\\usepackage{agentikz-fonts}');
    expect(standalone).not.toContain('ctex');
    expect(buildStandaloneLatexDocument('\\begin{tikzpicture}\\node {A};\\end{tikzpicture}', 'neurips')).not.toContain('agentikz-fonts');
    expect(standalone).toContain('\\definecolor{hex_2B5B84}{HTML}{2B5B84}');
    expect(standalone).toContain('color=hex_2B5B84');
    expect(standalone).not.toContain('color=#2B5B84');
    expect(standalone).toContain('chart_type/.code={}');
    expect(standalone).toContain('every node/.append style={align=center}');
  });

  it('computes tight centered bounds without distortion from nested KaTeX radical SVGs or relative path commands', () => {
    const mkEl = (
      tagName: string,
      attrs: Record<string, string>,
      children: any[] = [],
      textContent = ''
    ): any => {
      const node: any = {
        tagName,
        textContent,
        children,
        getAttribute: (k: string) => attrs[k] ?? null,
        closest: () => null,
      };
      return node;
    };

    const mockSceneRoot = mkEl('g', { id: 'agentikz-scene-root' }, [
      mkEl('rect', {
        x: '200',
        y: '150',
        width: '300',
        height: '200',
        fill: '#EFF6FF',
        stroke: '#1E40AF',
      }),
      mkEl('g', { class: 'agentikz-vector-label' }, [
        mkEl(
          'svg',
          {
            x: '260',
            y: '210',
            width: '22',
            height: '14',
            viewBox: '0 0 1620 1080',
          },
          [
            mkEl('path', {
              d: 'M263,681c340,-704.7,510.7,-1060.3,512,-1067s-271.3,567,-271.3,567 M1001 80H1620v40H1012z',
              fill: '#0F172A',
            }),
          ]
        ),
      ]),
    ]);

    const bounds = computeSceneTightBounds(null, mockSceneRoot);
    expect(bounds.minX).toBe(200);
    expect(bounds.minY).toBe(150);
    expect(bounds.maxX).toBe(500);
    expect(bounds.maxY).toBe(350);
  });
});
