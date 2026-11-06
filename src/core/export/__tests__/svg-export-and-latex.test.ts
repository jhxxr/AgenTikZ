import { describe, expect, it } from 'vitest';
import { renderMixedLatexToHtml } from '../../../components/canvas/LatexLabel';

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
});
