import { beforeEach, describe, expect, it } from 'vitest';
import fixture from '../../core/tex/__tests__/fixtures/complex-cjk-diagram.tex?raw';
import { useWorkspaceStore as store } from '../useWorkspaceStore';

describe('native paths use the original workspace operations', () => {
  beforeEach(() => {
    store.setState(store.getInitialState());
    store.getState().setTikzCode(fixture);
  });

  it('uses one AST for the existing nodes, paths and normal node/edge workflows', () => {
    const doc = store.getState().parsedDoc;
    expect(doc.nodes).toHaveLength(4);
    expect(doc.paths).toHaveLength(8);
    expect(doc.elements).toHaveLength(12);
    expect(doc.elements.every((element) => !element.id.startsWith('vector:'))).toBe(true);
    expect(doc.nodes.every((node) => node.coordinateGeometry)).toBe(true);
  });

  it('moves native paths and text together through moveElementsByPosition in cm', () => {
    const { parsedDoc, moveElementsByPosition } = store.getState();
    const path = parsedDoc.paths![0], title = parsedDoc.nodes[0];
    moveElementsByPosition([{ id: path.id, x: path.x + 0.25, y: path.y - 0.5 },
      { id: title.id, x: title.x + 0.25, y: title.y - 0.5 }], true);
    expect(store.getState().tikzCode).toBe(fixture
      .replace('(8,8) rectangle (150,150)', '(18,28) rectangle (160,170)')
      .replace('at (16,20)', 'at (26,40)'));
    store.getState().undo();
    expect(store.getState().tikzCode).toBe(fixture);
    store.getState().redo();
    expect(store.getState().tikzCode).toContain('at (26,40)');
  });

  it('edits a rotated native label through the original node label and option actions', () => {
    const node = store.getState().parsedDoc.nodes.find((item) => item.label === '旋转标签')!;
    store.getState().updateNodeLabelById(node.id, '中文与 $x^2$');
    expect(store.getState().tikzCode).toBe(fixture.replace('{旋转标签}', '{中文与 $x^2$}'));
    store.getState().updateNodeOptionsById(node.id, { text: 'red' });
    expect(store.getState().parsedDoc.nodes.find((item) => item.id === node.id)?.geometry).toMatchObject({ rotate: -90, color: '#FF0000' });
    expect(store.getState().highlightedLineRange).not.toBeNull();
  });

  it('resizes and recolors the same path used by the original inspector and eight-way handles', () => {
    const path = store.getState().parsedDoc.paths![0];
    store.getState().updatePathById(path.id, { width: path.width * 2, height: path.height,
      options: { fill: 'red', 'line width': '2pt' } });
    expect(store.getState().parsedDoc.paths![0].width).toBeCloseTo(path.width * 2);
    expect(store.getState().parsedDoc.paths![0].geometry).toMatchObject({ fill: '#FF0000', strokeWidth: 2 * 52 / 28.45274 });
  });

  it('uses the original selection, duplicate, nudge and delete actions for paths', () => {
    const path = store.getState().parsedDoc.paths![0];
    store.getState().setSelectedIds([path.id]);
    store.getState().duplicateSelectedElements();
    expect(store.getState().parsedDoc.paths).toHaveLength(9);
    const duplicate = store.getState().parsedDoc.paths!.find((item) => item.id === store.getState().selectedIds[0])!;
    expect(duplicate).toBeDefined();
    expect(duplicate.x).toBeCloseTo(path.x + 0.45);
    expect(duplicate.y).toBeCloseTo(path.y - 0.45);
    store.getState().nudgeSelectedElements(0.1, -0.2);
    const nudged = store.getState().parsedDoc.paths!.find((item) => item.id === duplicate.id)!;
    expect(nudged.x).toBeCloseTo(duplicate.x + 0.1);
    expect(nudged.y).toBeCloseTo(duplicate.y - 0.2);
    store.getState().deleteSelectedElements();
    expect(store.getState().parsedDoc.paths).toHaveLength(8);
    expect(store.getState().tikzCode).toContain('% Minimal regression fixture');
    store.getState().undo();
    expect(store.getState().parsedDoc.paths).toHaveLength(9);
  });

  it('aligns mixed original nodes and native paths using their shared cm space', () => {
    const path = store.getState().parsedDoc.paths![0], node = store.getState().parsedDoc.nodes[0];
    store.getState().setSelectedIds([path.id, node.id]);
    store.getState().alignSelectedNodes('align_x');
    const doc = store.getState().parsedDoc;
    expect(doc.paths![0].x).toBeCloseTo(doc.nodes[0].x);
  });

  it('fits the original artboard without rewriting imported path source or undo history', () => {
    const before = store.getState();
    store.getState().fitCanvasToContent(0.5, { width: 900, height: 700 });
    expect(store.getState().tikzCode).toBe(fixture);
    expect(store.getState().undoStack).toBe(before.undoStack);
    expect(store.getState().previewMode).toBe('interactive');
    expect(store.getState().canvasWidthCm).toBeGreaterThan(8);
  });

  it('keeps original named nodes, edges and charts in the same AST as coordinate paths', () => {
    const source = String.raw`\begin{tikzpicture}[x=0.25mm,y=-0.25mm]
\fill[blue] (0,0) rectangle (100,100);
\node[dl_block] (a) at (200,100) {A};
\node[dl_block] (b) at (400,100) {B};
\draw[->] (a.east) -- (b.west);
\begin{scope}[shift={(2cm,3cm)}]\begin{axis}[width=4cm,height=3cm]
\addplot coordinates {(0,0) (1,1)};
\end{axis}\end{scope}
\end{tikzpicture}`;
    store.getState().setTikzCode(source);
    const doc = store.getState().parsedDoc;
    expect(doc.paths).toHaveLength(1);
    expect(doc.nodes).toHaveLength(2);
    expect(doc.nodes[0].x).toBeCloseTo(5);
    expect(doc.edges).toHaveLength(1);
    expect(doc.charts).toHaveLength(1);
    store.getState().addEdgeBetweenNodes('a', 'b', 'residual_right');
    expect(store.getState().parsedDoc.paths).toHaveLength(1);
    expect(store.getState().parsedDoc.edges).toHaveLength(2);
    const residual = store.getState().parsedDoc.edges[1];
    expect(residual.residualOffset).toBeCloseTo(1.3);
    store.getState().updateEdgeById(residual.id, { stroke: 'blue' });
    expect(store.getState().tikzCode).toContain('++(1.3cm, 0cm)');
    expect(store.getState().parsedDoc.paths).toHaveLength(1);
  });

  it('names imported anonymous nodes before using the original connection tool', () => {
    const nodes = store.getState().parsedDoc.nodes;
    const from = nodes[0].id, to = nodes[1].id;
    store.getState().addEdgeBetweenNodes(from, to);
    const doc = store.getState().parsedDoc;
    expect(doc.paths).toHaveLength(8);
    expect(doc.edges).toHaveLength(1);
    expect(doc.edges[0]).toMatchObject({ from, to });
    expect(doc.nodes.filter((node) => [from, to].includes(node.id)).every((node) => node.namedInSource)).toBe(true);
    expect(store.getState().tikzCode).not.toContain('draw=nips_');
    store.getState().undo();
    expect(store.getState().tikzCode).toBe(fixture);
  });

  it('moves macro-based coordinates without flattening the coordinate macro or label macro', () => {
    const source = String.raw`\def\position{10,20}
\newcommand{\title}{中文}
\begin{tikzpicture}[x=0.25mm,y=-0.25mm]
\fill[blue] (0,0) rectangle (100,100);
\node[text=red] at (\position) {\title};
\end{tikzpicture}`;
    store.getState().setTikzCode(source);
    const node = store.getState().parsedDoc.nodes[0];
    expect(node.label).toBe('\\title');
    store.getState().moveElementsByPosition([{ id: node.id, x: node.x + 0.25, y: node.y - 0.5 }]);
    const updated = store.getState().parsedDoc.nodes[0];
    expect(updated.x).toBeCloseTo(node.x + 0.25);
    expect(updated.y).toBeCloseTo(node.y - 0.5);
    expect(store.getState().tikzCode).toContain('at (\\position) {\\title}');
    expect(store.getState().tikzCode.startsWith('\\def\\position{10,20}')).toBe(true);
  });

  it('does not reinterpret parentheses in label text as duplicate node IDs', () => {
    store.getState().setTikzCode(String.raw`\begin{tikzpicture}[x=0.25mm,y=-0.25mm]
\node[text=red] at (10,20) {Head (64)};
\node[text=red] at (30,20) {Other (64)};
\end{tikzpicture}`);
    const nodes = store.getState().parsedDoc.nodes;
    expect(new Set(nodes.map((node) => node.id)).size).toBe(2);
    expect(nodes.every((node) => !node.namedInSource)).toBe(true);
  });

  it('keeps image-node sizing on the original includegraphics patching path', () => {
    store.getState().setTikzCode(String.raw`\begin{tikzpicture}[x=0.25mm,y=-0.25mm]
\fill[blue] (0,0) rectangle (100,100);
\node[inner sep=0pt] (image) at (50,50) {\includegraphics[width=2cm,height=1cm]{image.png}};
\end{tikzpicture}`);
    const node = store.getState().parsedDoc.nodes[0];
    expect(node.subtype).toBe('image');
    store.getState().updateNodeOptionsById(node.id, { 'minimum width': '3cm', 'minimum height': '2cm' });
    expect(store.getState().tikzCode).toContain('\\includegraphics[width=3cm, height=2cm]{image.png}');
    expect(store.getState().parsedDoc.paths).toHaveLength(1);
  });
});

describe('macro instances use the original node actions without changing shared definitions', () => {
  const macro = String.raw`\newcommand{\tile}[4]{%
\fill[#4] (#1,#2) rectangle ({#1+30},{#2+40});
\node[font=\tiny,text=black] at ({#1+15},{#2+20}) {#3};
}
\begin{tikzpicture}[x=0.25mm,y=-0.25mm]
\tile{10}{20}{A}{blue}
\tile{80}{20}{B}{red}
\end{tikzpicture}`;
  beforeEach(() => {
    store.setState(store.getInitialState());
    store.getState().setTikzCode(macro);
  });

  it('selects and moves one whole macro invocation, with no repeated scope nesting during dragging', () => {
    const node = store.getState().parsedDoc.nodes[0];
    expect(node.macroSource).toBeDefined();
    expect(node.geometryGroup).toHaveLength(2);
    const definition = macro.slice(0, macro.indexOf('\\begin{tikzpicture}'));
    for (let i = 1; i <= 10; i++) store.getState().moveElementsByPosition([{ id: node.id, x: node.x + i / 10, y: node.y - 0.25 }]);
    const next = store.getState();
    expect(next.tikzCode.startsWith(definition)).toBe(true);
    expect(next.tikzCode.match(/% @agentikz-edit-group/g)).toHaveLength(1);
    expect(next.parsedDoc.nodes).toHaveLength(2);
    expect(next.parsedDoc.nodes[0].x).toBeCloseTo(node.x + 1);
    expect(next.parsedDoc.nodes[0].y).toBeCloseTo(node.y - 0.25);
    expect(next.parsedDoc.nodes[1].label).toBe('B');
  });

  it('edits macro label arguments, resizes and duplicates through the same original actions', () => {
    const node = store.getState().parsedDoc.nodes[0];
    store.getState().updateNodeLabelById(node.id, 'Changed');
    expect(store.getState().tikzCode).toBe(macro.replace('\\tile{10}{20}{A}{blue}', '\\tile{10}{20}{Changed}{blue}'));
    store.getState().updateMacroArgumentById(node.id, 3, 'red');
    expect(store.getState().tikzCode).toContain('\\tile{10}{20}{Changed}{red}');
    store.getState().updateNodeOptionsById(node.id, { 'minimum width': `${node.width * 2}cm`, 'minimum height': `${node.height * 2}cm` });
    expect(store.getState().parsedDoc.nodes[0].width).toBeCloseTo(node.width * 2);
    store.getState().setSelectedIds([node.id]);
    store.getState().duplicateSelectedElements();
    expect(store.getState().parsedDoc.nodes).toHaveLength(3);
    const copied = store.getState().parsedDoc.nodes.find((item) => item.id === store.getState().selectedIds[0]);
    expect(copied?.macroSource).toBeDefined();
    expect(copied?.id).toContain('macro_1_copy');
    store.getState().deleteSelectedElements();
    expect(store.getState().parsedDoc.nodes).toHaveLength(2);
    expect(store.getState().tikzCode).toContain('\\newcommand{\\tile}');
  });

  it('keeps bounded foreach drawings as editable instances, without phantom body nodes', () => {
    const source = String.raw`\begin{tikzpicture}[x=0.25mm,y=-0.25mm]
\foreach \x in {1,...,3} {
  \fill[blue] ({20*\x},20) rectangle ({20*\x+10},40);
  \node[font=\tiny] at ({20*\x+5},30) {\x};
}
\end{tikzpicture}`;
    store.getState().setTikzCode(source);
    const node = store.getState().parsedDoc.nodes[0];
    expect(store.getState().parsedDoc.nodes).toHaveLength(1);
    expect(node.geometryGroup).toHaveLength(6);
    store.getState().moveElementsByPosition([{ id: node.id, x: node.x + 0.25, y: node.y }], true);
    expect(store.getState().tikzCode).toContain('\\foreach \\x in {1,...,3}');
    expect(store.getState().parsedDoc.nodes[0].x).toBeCloseTo(node.x + 0.25);
    store.getState().updateMacroArgumentById(node.id, 0, '1,2');
    expect(store.getState().parsedDoc.nodes[0].geometryGroup).toHaveLength(4);
    store.getState().undo();
    expect(store.getState().parsedDoc.nodes[0].geometryGroup).toHaveLength(6);
  });

  it('connects macro groups through stable named bounds that follow subsequent moves', () => {
    const nodes = store.getState().parsedDoc.nodes;
    store.getState().addEdgeBetweenNodes(nodes[0].id, nodes[1].id);
    let doc = store.getState().parsedDoc;
    expect(doc.nodes).toHaveLength(2);
    expect(doc.edges).toHaveLength(1);
    expect(doc.nodes.every((node) => node.namedInSource)).toBe(true);
    expect(doc.edges[0].geometry).toBeDefined();
    expect(store.getState().tikzCode).toContain('local bounding box=macro_1');
    const node = doc.nodes[0];
    store.getState().moveElementsByPosition([{ id: node.id, x: node.x + 0.5, y: node.y }], true);
    doc = store.getState().parsedDoc;
    expect(doc.nodes[0].x).toBeCloseTo(node.x + 0.5);
    expect(doc.edges[0].geometry).toBeDefined();
  });
});
