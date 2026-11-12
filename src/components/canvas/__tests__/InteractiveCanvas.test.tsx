import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { InteractiveCanvas } from '../InteractiveCanvas';

// Render chosen live Zustand state, not the fixed server initial snapshot.
vi.mock('../../../store/useWorkspaceStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../store/useWorkspaceStore')>();
  return {
    ...actual,
    useWorkspaceStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useWorkspaceStore.getState>) => unknown) =>
        selector(actual.useWorkspaceStore.getState()),
      actual.useWorkspaceStore,
    ),
  };
});

const complexSource = String.raw`\newcommand{\custom}{\fill[blue] (0,0) circle (1);}
\begin{tikzpicture}
% Keep the macro, path, label styling and this handwritten comment.
\custom
\node[dl_block,text=red,rotate=90] (editable) at (1,2) {Editable label};
\end{tikzpicture}`;

describe('editing and TeX preview coexist', () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
    useWorkspaceStore.getState().setTikzCode(complexSource);
  });

  it.each(['interactive', 'tex_split', 'tex_overlay'] as const)(
    'never hides editing in %s even with unsupported TikZ features',
    (previewMode) => {
      useWorkspaceStore.getState().setPreviewMode(previewMode);
      const html = renderToStaticMarkup(<InteractiveCanvas />);
      const canvasTag = html.match(/<svg\b[^>]*id="agentikz-canvas-svg"[^>]*>/)?.[0];
      expect(canvasTag).toBeDefined();
      expect(canvasTag).not.toMatch(/class="[^"]*\bhidden\b/);
      expect(canvasTag).toContain('aria-label="可编辑 TikZ 画布"');
      expect(html).toContain('Editable label');
      expect(html).toContain('编辑源码');
      expect(html.includes('aria-label="TeX 精确对照预览"')).toBe(previewMode !== 'interactive');
      if (previewMode !== 'interactive') expect(html).toContain('关闭精确预览，继续编辑');
    }
  );

  it('shows the actual compiled details next to, not instead of, editable nodes', () => {
    useWorkspaceStore.getState().setPreviewMode('tex_split');
    useWorkspaceStore.getState().setCompiledSvg('<svg id="full-detail"><path d="M0 0L1 1"/></svg>');
    const html = renderToStaticMarkup(<InteractiveCanvas />);
    expect(html).toContain('id="full-detail"');
    expect(html).toContain('id="agentikz-canvas-svg"');
    expect(html).toContain('Editable label');
  });

  it('patches a supported label without erasing any unsupported details', () => {
    const node = useWorkspaceStore.getState().parsedDoc.nodes.find((n) => n.id === 'editable')!;
    useWorkspaceStore.getState().updateNodeLabelById(node.id, 'Updated label');
    expect(useWorkspaceStore.getState().tikzCode).toBe(complexSource.replace('Editable label', 'Updated label'));
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().tikzCode).toBe(complexSource);
  });
});
