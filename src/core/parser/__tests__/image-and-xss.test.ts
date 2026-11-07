import { describe, expect, it } from 'vitest';
import { renderMixedLatexToHtml } from '../../../components/canvas/LatexLabel';
import { parseTikzDocument } from '../parser';
import { patchImageNodePath, patchNodeLabel } from '../patcher';
import { TikzNodeElement } from '../../../types/tikz-ast';

describe('Issue 6: XSS protection in renderMixedLatexToHtml', () => {
  it('escapes raw script, img, and svg HTML tags in plain text', () => {
    const scriptHtml = renderMixedLatexToHtml('<script>alert(1)</script>');
    expect(scriptHtml).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(scriptHtml).not.toContain('<script');

    const imgHtml = renderMixedLatexToHtml('<img src=x onerror=alert(1)>');
    expect(imgHtml).toBe('&lt;img src=x onerror=alert(1)&gt;');
    expect(imgHtml).not.toContain('<img');

    const svgHtml = renderMixedLatexToHtml('<svg onload=alert(1)>');
    expect(svgHtml).toBe('&lt;svg onload=alert(1)&gt;');
    expect(svgHtml).not.toContain('<svg');
  });

  it('escapes raw HTML inside \\textbf, \\textit, \\emph, and \\texttt while preserving formatting tags', () => {
    const html = renderMixedLatexToHtml(
      '\\textbf{<img src=x onerror=alert(1)>} and \\textit{<script>alert("xss")</script>} and \\texttt{<svg onload=alert(1)>}'
    );
    expect(html).toBe(
      '<strong>&lt;img src=x onerror=alert(1)&gt;</strong> and <em>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</em> and <code>&lt;svg onload=alert(1)&gt;</code>'
    );
  });

  it('escapes raw HTML alongside and inside \\textbf wrapping $...$ math', () => {
    const html = renderMixedLatexToHtml(
      '\\textbf{Bold $x^2$ and <img src=x onerror=alert(1)>} + <script>alert(1)</script>'
    );
    expect(html).toContain('<strong>Bold ');
    expect(html).toContain('class="katex"');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;</strong>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
  });

  it('handles LaTeX escaped special characters properly without XSS', () => {
    const html = renderMixedLatexToHtml('Add \\& Norm 100\\% \\#1 \\_test');
    expect(html).toBe('Add &amp; Norm 100% #1 _test');
  });
});

describe('Issue 8: Image node label and sublabel patching and parsing', () => {
  const initialTikz = `\\begin{tikzpicture}
  \\node[draw=nips_slate!40, fill=white, rounded corners=2pt, inner sep=2pt, minimum width=4.2cm, minimum height=3.0cm] (img_1) at (3.0, 2.0) {\\includegraphics[width=4.2cm, height=3.0cm]{assets/sample_vis.png}};
\\end{tikzpicture}`;

  function getFirstNode(tikz: string): TikzNodeElement {
    const parsed = parseTikzDocument(tikz);
    const node = parsed.elements.find((el): el is TikzNodeElement => el.kind === 'node');
    expect(node).toBeDefined();
    return node!;
  }

  it('preserves subtype=image, imagePath, and \\includegraphics when editing label, sublabel, or both', () => {
    const node0 = getFirstNode(initialTikz);
    expect(node0.subtype).toBe('image');
    expect(node0.imagePath).toBe('assets/sample_vis.png');
    expect(node0.label).toBe('sample_vis.png');
    expect(node0.sublabel).toBeUndefined();

    // 1. Edit only sublabel (keeping default filename as label)
    const tikzWithSub = patchNodeLabel(initialTikz, node0, 'sample_vis.png', '(a) Input RGB');
    expect(tikzWithSub).toContain('\\includegraphics[width=4.2cm, height=3.0cm]{assets/sample_vis.png}');
    const node1 = getFirstNode(tikzWithSub);
    expect(node1.subtype).toBe('image');
    expect(node1.imagePath).toBe('assets/sample_vis.png');
    expect(node1.label).toBe('sample_vis.png');
    expect(node1.sublabel).toBe('(a) Input RGB');

    // 2. Edit custom label while keeping sublabel
    const tikzWithBoth = patchNodeLabel(tikzWithSub, node1, ' Qualitative Comparison ', '(a) Input RGB');
    expect(tikzWithBoth).toContain('\\includegraphics[width=4.2cm, height=3.0cm]{assets/sample_vis.png}');
    const node2 = getFirstNode(tikzWithBoth);
    expect(node2.subtype).toBe('image');
    expect(node2.imagePath).toBe('assets/sample_vis.png');
    expect(node2.label).toBe('Qualitative Comparison');
    expect(node2.sublabel).toBe('(a) Input RGB');

    // 3. Clear sublabel while keeping custom label
    const tikzOnlyCustomLabel = patchNodeLabel(tikzWithBoth, node2, 'Qualitative Comparison', '');
    expect(tikzOnlyCustomLabel).toContain('\\includegraphics[width=4.2cm, height=3.0cm]{assets/sample_vis.png}');
    const node3 = getFirstNode(tikzOnlyCustomLabel);
    expect(node3.subtype).toBe('image');
    expect(node3.imagePath).toBe('assets/sample_vis.png');
    expect(node3.label).toBe('Qualitative Comparison');
    expect(node3.sublabel).toBeUndefined();

    // 4. Reset label back to default filename
    const tikzReset = patchNodeLabel(tikzOnlyCustomLabel, node3, 'sample_vis.png', '');
    const node4 = getFirstNode(tikzReset);
    expect(node4.subtype).toBe('image');
    expect(node4.imagePath).toBe('assets/sample_vis.png');
    expect(node4.label).toBe('sample_vis.png');
    expect(node4.sublabel).toBeUndefined();
  });

  it('preserves custom label and sublabel when updating image path via patchImageNodePath', () => {
    const node0 = getFirstNode(initialTikz);
    const tikzWithBoth = patchNodeLabel(initialTikz, node0, 'Qualitative Result', '(b) Ours');
    const nodeWithBoth = getFirstNode(tikzWithBoth);

    const tikzUpdatedPath = patchImageNodePath(tikzWithBoth, nodeWithBoth, 'figures\\qual_ours.png');
    expect(tikzUpdatedPath).toContain('\\includegraphics[width=4.2cm, height=3.0cm]{figures/qual_ours.png}');
    const nodeAfterPath = getFirstNode(tikzUpdatedPath);
    expect(nodeAfterPath.subtype).toBe('image');
    expect(nodeAfterPath.imagePath).toBe('figures/qual_ours.png');
    expect(nodeAfterPath.label).toBe('Qualitative Result');
    expect(nodeAfterPath.sublabel).toBe('(b) Ours');
  });
});
