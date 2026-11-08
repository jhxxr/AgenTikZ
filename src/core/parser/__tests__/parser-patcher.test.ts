import { describe, expect, it } from 'vitest';
import { parseTikzDocument } from '../parser';
import {
  duplicateElementsInSource,
  formatCoordNum,
  patchChartElement,
  patchChartLegendPosition,
  patchEdgeElement,
  patchElementsCoordinates,
  patchFigureCaptionAndLabel,
  patchImageNodePath,
  patchNodeLabel,
  patchNodeOptions,
} from '../patcher';
import { FIGURE_PARSER_FIXTURES } from '../../parser/__tests__/fixtures/figure-examples';
import { useSettingsStore } from '../../../store/useSettingsStore';

const SAMPLE_TIKZ = `% Header comment that must NEVER be lost
\\begin{tikzpicture}[>=Stealth]
  % Section 1: Encoder Layers
  \\node[mha_block, fill=nips_amber!16] (mha) at (2.8, 3.15) {Multi-Head Self-Attention}; % inline comment
  \\node[addnorm_block] (ln1) at (2.8, 1.8) {LayerNorm};
  \\draw[-Stealth, line width=0.7pt] (ln1) -- (mha);
  \\draw[-Stealth, line width=0.7pt] (ln1.east) -- ++(1.35, 0) |- (mha.east);
\\end{tikzpicture}`;

describe('Lossless TikZ CST/AST Parser & Surgical Patcher', () => {
  it('preserves exact line numbers for all spans in mixed, out-of-order documents', () => {
    for (const newline of ['\n', '\r\n']) {
      const source = [
        '% Leading comment',
        '\\begin{tikzpicture}',
        '\\node[minimum width=2cm] (before) at (1,2) {Multi',
        'line label};',
        '\\begin{axis}[id=chart, legend style={at={(0.5,1.0)}}]',
        '\\addplot coordinates {(0,1) (1,2)};',
        '\\end{axis}',
        '\\node (after) at (3,4) {Last};',
        '\\draw (before) -- (after);',
        '\\end{tikzpicture}',
      ].join(newline);
      const doc = parseTikzDocument(source);
      expect(doc.nodes).toHaveLength(2);
      expect(doc.charts).toHaveLength(1);
      expect(doc.edges).toHaveLength(1);
      for (const element of doc.elements) {
        for (const value of Object.values(element)) {
          if (value && typeof value === 'object' && 'startLine' in value && 'start' in value && 'end' in value) {
            const span = value as { start: number; end: number; startLine: number; endLine: number };
            expect(span.startLine).toBe(source.slice(0, span.start).split('\n').length);
            expect(span.endLine).toBe(source.slice(0, Math.max(span.start, span.end - 1)).split('\n').length);
          }
        }
      }
    }
  });

  it('batch-patches nodes of changing coordinate length without shifting other spans', () => {
    const source = Array.from({ length: 300 }, (_, i) =>
      `\\node (n${i}) at (${i}, 0) {Node ${i}}; % keep ${i}`
    ).join('\n');
    const doc = parseTikzDocument(source);
    const next = patchElementsCoordinates(source, doc.nodes.map((element, i) => ({
      element, x: -i * 10, y: i / 2,
    })).reverse());
    const parsed = parseTikzDocument(next);
    expect(parsed.nodes).toHaveLength(300);
    parsed.nodes.forEach((node, i) => {
      expect(node.x).toBe(i === 0 ? 0 : -i * 10);
      expect(node.y).toBe(i / 2);
      expect(next).toContain(`% keep ${i}`);
    });
  });

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

    // Also verify legendScale updates and round-trips cleanly
    const docAfterMove = parseTikzDocument(patched);
    const scaledSource = patchChartElement(
      docAfterMove.fullSource,
      docAfterMove.charts[0],
      { legendScale: 0.8 }
    );
    expect(scaledSource).toContain('legend_scale=0.8');
    expect(scaledSource).toContain('nodes={scale=0.8, transform shape}');

    const docAfterScale = parseTikzDocument(scaledSource);
    expect(docAfterScale.charts[0].legendScale).toBeCloseTo(0.8);
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
    let source = FIGURE_PARSER_FIXTURES[0].tikzCode;

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

  it('parses complex regression drawings cleanly with valid nodes, edges, or charts', () => {
    expect(FIGURE_PARSER_FIXTURES.length).toBeGreaterThanOrEqual(6);
    for (const tpl of FIGURE_PARSER_FIXTURES) {
      const doc = parseTikzDocument(tpl.tikzCode);
      expect(doc.elements.length).toBeGreaterThan(0);
      expect(doc.diagnostics.length).toBe(0);
    }
  });

  it('respects coordPrecision setting (1 vs 2 decimals) in formatCoordNum', () => {
    useSettingsStore.getState().updateSettings({ coordPrecision: 1 });
    expect(formatCoordNum(2.46)).toBe('2.5');
    expect(formatCoordNum(3)).toBe('3.0');

    useSettingsStore.getState().updateSettings({ coordPrecision: 2 });
    expect(formatCoordNum(2.46)).toBe('2.45');
    expect(formatCoordNum(3)).toBe('3.0');
  });

  it('parses, resizes, and updates paths on project image asset (\\includegraphics) nodes losslessly', () => {
    const imgTikz = `% Image asset node test
\\begin{tikzpicture}
  \\node[draw=none, inner sep=0pt, minimum width=3.2cm, minimum height=2.2cm] (img1) at (3.5, 4.0) {\\includegraphics[width=3.2cm, height=2.2cm]{figs/overview.png}}; % keep comment
\\end{tikzpicture}`;

    const doc = parseTikzDocument(imgTikz);
    expect(doc.nodes.length).toBe(1);
    const imgNode = doc.nodes[0];
    expect(imgNode.id).toBe('img1');
    expect(imgNode.subtype).toBe('image');
    expect(imgNode.imagePath).toBe('figs/overview.png');
    expect(imgNode.width).toBeCloseTo(3.2);
    expect(imgNode.height).toBeCloseTo(2.2);
    expect(imgNode.label).toBe('overview.png');

    // Resize image node via patchNodeOptions and verify both node options and \includegraphics are updated
    const resizedSource = patchNodeOptions(imgTikz, imgNode, {
      'minimum width': '4.5cm',
      'minimum height': '3.0cm',
    });
    expect(resizedSource).toContain('% Image asset node test');
    expect(resizedSource).toContain('% keep comment');
    expect(resizedSource).toContain('minimum width=4.5cm, minimum height=3.0cm');
    expect(resizedSource).toContain(
      '\\includegraphics[width=4.5cm, height=3.0cm]{figs/overview.png}'
    );

    const docAfterResize = parseTikzDocument(resizedSource);
    const resizedNode = docAfterResize.nodes[0];
    expect(resizedNode.width).toBeCloseTo(4.5);
    expect(resizedNode.height).toBeCloseTo(3.0);

    // Update image path via patchImageNodePath and verify re-parsing
    const pathUpdatedSource = patchImageNodePath(
      resizedSource,
      resizedNode,
      'assets/new_teaser.svg'
    );
    expect(pathUpdatedSource).toContain(
      '\\includegraphics[width=4.5cm, height=3.0cm]{assets/new_teaser.svg}'
    );

    const docAfterPath = parseTikzDocument(pathUpdatedSource);
    const updatedImgNode = docAfterPath.nodes[0];
    expect(updatedImgNode.subtype).toBe('image');
    expect(updatedImgNode.imagePath).toBe('assets/new_teaser.svg');
    expect(updatedImgNode.label).toBe('new_teaser.svg');
  });

  it('parses and patches draggable edge label offsets (xshift, yshift) losslessly', () => {
    const src = `\\begin{tikzpicture}
  \\node (cond_emb) at (6.2, 5.6) {Conditioning};
  \\node (mod_gate) at (6.2, 3.6) {$\\otimes$};
  \\draw[-Stealth, line width=0.7pt] (cond_emb) -- node[pos=0.4, fill=white, inner sep=1.5pt, font=\\scriptsize] {$\\gamma, \\beta$} (mod_gate);
\\end{tikzpicture}`;

    const doc = parseTikzDocument(src);
    expect(doc.edges.length).toBe(1);
    const edge = doc.edges[0]!;
    expect(edge.label).toBe('$\\gamma, \\beta$');
    expect(edge.labelOffset).toBeUndefined();

    const shiftedSrc = patchEdgeElement(src, edge, {
      labelOffset: { x: 0.45, y: -0.2 },
    });
    expect(shiftedSrc).toContain('xshift=0.45cm, yshift=-0.2cm');

    const reparsed = parseTikzDocument(shiftedSrc);
    expect(reparsed.edges[0]!.label).toBe('$\\gamma, \\beta$');
    expect(reparsed.edges[0]!.labelOffset).toEqual({ x: 0.45, y: -0.2 });

    // Resetting offset to (0, 0) removes xshift/yshift cleanly
    const resetSrc = patchEdgeElement(shiftedSrc, reparsed.edges[0]!, {
      labelOffset: { x: 0, y: 0 },
    });
    expect(resetSrc).not.toContain('xshift=');
    expect(resetSrc).not.toContain('yshift=');
    const resetDoc = parseTikzDocument(resetSrc);
    expect(resetDoc.edges[0]!.labelOffset).toBeUndefined();
  });
});
