import { describe, expect, it } from 'vitest';
import { parseTikzDocument } from '../parser';
import {
  duplicateElementsInSource,
  patchChartElement,
  patchChartLegendPosition,
  patchEdgeElement,
  patchElementsCoordinates,
  patchFigureCaptionAndLabel,
  patchNodeLabel,
  patchNodeOptions,
} from '../patcher';
import { FULL_FIGURE_TEMPLATES } from '../../templates/dl-templates';

const SAMPLE_TIKZ = `% Header comment that must NEVER be lost
\\begin{tikzpicture}[>=Stealth]
  % Section 1: Encoder Layers
  \\node[mha_block, fill=nips_amber!16] (mha) at (2.8, 3.15) {Multi-Head Self-Attention}; % inline comment
  \\node[addnorm_block] (ln1) at (2.8, 1.8) {LayerNorm};
  \\draw[-Stealth, line width=0.7pt] (ln1) -- (mha);
  \\draw[-Stealth, line width=0.7pt] (ln1.east) -- ++(1.35, 0) |- (mha.east);
\\end{tikzpicture}`;

describe('Lossless TikZ CST/AST Parser & Surgical Patcher', () => {
  it('parses nodes, standard edges, and residual skip edges with exact SourceSpans', () => {
    const doc = parseTikzDocument(SAMPLE_TIKZ);
    expect(doc.nodes.length).toBe(2);
    expect(doc.edges.length).toBe(2);

    const mha = doc.nodes.find((n) => n.id === 'mha')!;
    expect(mha).toBeDefined();
    expect(mha.x).toBeCloseTo(2.8);
    expect(mha.y).toBeCloseTo(3.15);
    expect(mha.subtype).toBe('mha');

    const resEdge = doc.edges[1];
    expect(resEdge.routeType).toBe('residual_right');
    expect(resEdge.residualOffset).toBeCloseTo(1.35);
  });

  it('surgically updates node coordinates on drag while preserving 100% of comments and formatting', () => {
    const doc = parseTikzDocument(SAMPLE_TIKZ);
    const mha = doc.nodes.find((n) => n.id === 'mha')!;

    const patched = patchElementsCoordinates(SAMPLE_TIKZ, [
      { element: mha, x: 4.25, y: 5.5 },
    ]);

    expect(patched).toContain('% Header comment that must NEVER be lost');
    expect(patched).toContain('% Section 1: Encoder Layers');
    expect(patched).toContain('% inline comment');
    expect(patched).toContain('(mha) at (4.25, 5.5) {Multi-Head Self-Attention};');
    expect(patched).toContain('(ln1) at (2.8, 1.8) {LayerNorm};');
  });

  it('surgically updates node options and labels without disturbing surrounding code', () => {
    const doc = parseTikzDocument(SAMPLE_TIKZ);
    const ln1 = doc.nodes.find((n) => n.id === 'ln1')!;

    const withLabel = patchNodeLabel(SAMPLE_TIKZ, ln1, 'RMSNorm ($\\epsilon=10^{-6}$)');
    expect(withLabel).toContain('(ln1) at (2.8, 1.8) {RMSNorm ($\\epsilon=10^{-6}$)};');

    const doc2 = parseTikzDocument(withLabel);
    const ln1Updated = doc2.nodes.find((n) => n.id === 'ln1')!;
    const withOpts = patchNodeOptions(withLabel, ln1Updated, {
      fill: 'nips_sage!18',
    });
    expect(withOpts).toContain('addnorm_block, fill=nips_sage!18');
  });

  it('patches edge routing from direct to residual skip connection', () => {
    const doc = parseTikzDocument(SAMPLE_TIKZ);
    const directEdge = doc.edges[0];
    const patched = patchEdgeElement(SAMPLE_TIKZ, directEdge, {
      routeType: 'residual_left',
      residualOffset: 1.5,
      label: 'Skip',
    });
    expect(patched).toContain('(ln1.west) -- ++(-1.5, 0) |-');
    expect(patched).toContain('{Skip}');
  });

  it('surgically updates PGFPlots legend position at={(x, y)} on drag while preserving comments', () => {
    const chartTikz = `% Chart test
\\begin{tikzpicture}
  \\begin{scope}[shift={(7.0, 2.2)}]
    \\begin{axis}[
      id=scaling_plot,
      legend style={at={(0.04, 0.94)}, anchor=north west, font=\\scriptsize}
    ]
      \\addplot[color=#2B5B84] coordinates { (1, 70) (2, 80) };
      \\addlegendentry{Ours}
      \\addplot[color=#D97706] coordinates { (1, 65) (2, 75) };
      \\addlegendentry{Baseline}
    \\end{axis}
  \\end{scope}
\\end{tikzpicture}`;
    const doc = parseTikzDocument(chartTikz);
    expect(doc.charts.length).toBe(1);
    expect(doc.charts[0].legendPos).toEqual({ x: 0.04, y: 0.94 });

    const patched = patchChartLegendPosition(doc.fullSource, doc.charts[0], {
      x: 0.52,
      y: 0.36,
    });
    expect(patched).toContain('% Chart test');
    expect(patched).toContain('legend style={at={(0.52, 0.36)}, anchor=north west');
  });

  it('parses and updates subfigure captions, overall figure caption, and element duplication', () => {
    const capTikz = `\\begin{tikzpicture}
  \\node[subcaption] (cap_a) at (2.8, -0.65) {\\textbf{(a)} Pre-LN Architecture};
\\end{tikzpicture}
% \\caption{Initial paper figure caption.}
% \\label{fig:init}`;

    const doc = parseTikzDocument(capTikz);
    expect(doc.nodes[0].subtype).toBe('caption');
    expect(doc.figureCaption).toBe('Initial paper figure caption.');
    expect(doc.figureLabel).toBe('fig:init');

    const withNewCap = patchFigureCaptionAndLabel(
      capTikz,
      'Updated NeurIPS Figure 1 caption.',
      'fig:neurips_main'
    );
    expect(withNewCap).toContain('\\caption{Updated NeurIPS Figure 1 caption.}');
    expect(withNewCap).toContain('\\label{fig:neurips_main}');

    const { nextSource, newIds } = duplicateElementsInSource(
      withNewCap,
      [doc.nodes[0]],
      2
    );
    expect(newIds[0]).toBe('cap_a_copy2');
    expect(nextSource).toContain('(cap_a_copy2)');
  });

  it('never accumulates inline or leading spaces across 50 consecutive drag frames on nodes, charts, titles, legends, or edges', () => {
    let source = FULL_FIGURE_TEMPLATES[0].tikzCode;

    for (let frame = 1; frame <= 50; frame++) {
      // 1. Drag node position
      let doc = parseTikzDocument(source);
      const mha = doc.nodes.find((n) => n.id === 'mha')!;
      source = patchElementsCoordinates(source, [
        { element: mha, x: 2.8 + frame * 0.05, y: 3.15 + frame * 0.05 },
      ]);

      // 2. Drag chart position
      doc = parseTikzDocument(source);
      const chart = doc.charts[0]!;
      source = patchElementsCoordinates(source, [
        { element: chart, x: 7.0 + frame * 0.05, y: 2.2 + frame * 0.05 },
      ]);

      // 3. Drag chart title / resize handle via patchChartElement
      doc = parseTikzDocument(source);
      source = patchChartElement(source, doc.charts[0]!, {
        titleOffset: { x: frame, y: -frame },
        width: 6.2 + (frame % 5) * 0.1,
      });

      // 4. Drag chart legend via patchChartLegendPosition
      doc = parseTikzDocument(source);
      source = patchChartLegendPosition(source, doc.charts[0]!, {
        x: 0.04 + (frame % 10) * 0.02,
        y: 0.94 - (frame % 10) * 0.02,
      });

      // 5. Drag node resize handle via patchNodeOptions
      doc = parseTikzDocument(source);
      const embed = doc.nodes.find((n) => n.id === 'embed')!;
      source = patchNodeOptions(source, embed, {
        'minimum width': `${(3.2 + (frame % 5) * 0.1).toFixed(1)}cm`,
      });

      // 6. Drag residual edge offset handle via patchEdgeElement
      doc = parseTikzDocument(source);
      const resEdge = doc.edges.find((e) => e.routeType === 'residual_right')!;
      source = patchEdgeElement(source, resEdge, {
        residualOffset: 1.35 + (frame % 5) * 0.1,
      });
    }

    const lines = source.split('\n');
    const scopeLine = lines.find((l) => l.includes('\\begin{scope}'))!;
    expect(scopeLine).toBeDefined();
    // Must strictly start with 2 spaces, never accumulating spaces
    expect(scopeLine.startsWith('  \\begin{scope}[shift={(')).toBe(true);

    // No line in the entire document should ever have more than 6 leading spaces
    for (const line of lines) {
      const leadingSpaces = /^(\s*)/.exec(line)?.[1].length ?? 0;
      expect(leadingSpaces).toBeLessThanOrEqual(6);
    }
  });

  it('parses all 6 publication full-figure templates cleanly with valid nodes, edges, or charts', () => {
    expect(FULL_FIGURE_TEMPLATES.length).toBeGreaterThanOrEqual(6);
    for (const tpl of FULL_FIGURE_TEMPLATES) {
      const doc = parseTikzDocument(tpl.tikzCode);
      expect(doc.elements.length).toBeGreaterThan(0);
      expect(doc.diagnostics.length).toBe(0);
    }
  });
});
