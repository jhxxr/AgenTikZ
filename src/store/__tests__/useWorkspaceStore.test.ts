import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceStore } from '../useWorkspaceStore';
import { EMPTY_TIKZ_CODE } from '../../core/templates/blank-document';

describe('independent, template-free figure workspace', () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
  });

  it('starts with no template, example nodes, selection or chart data', () => {
    const state = useWorkspaceStore.getState();
    expect(state.tikzCode).toBe(EMPTY_TIKZ_CODE);
    expect(state).not.toHaveProperty('activeTemplateId');
    expect(state).not.toHaveProperty('loadTemplate');
    expect(state.parsedDoc.elements).toEqual([]);
    expect(state.parsedDoc.figureCaption).toBe('');
    expect(state.parsedDoc.figureLabel).toBe('');
    expect(state.selectedIds).toEqual([]);
    expect(state.highlightedLineRange).toBeNull();
  });

  it('supports independent source edits, undo and redo without template state', () => {
    const code = '\\begin{tikzpicture}\\node (custom) at (2,3) {Custom};\\end{tikzpicture}';
    useWorkspaceStore.getState().setTikzCode(code);
    expect(useWorkspaceStore.getState().parsedDoc.nodes[0].id).toBe('custom');
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().tikzCode).toBe(EMPTY_TIKZ_CODE);
    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().tikzCode).toBe(code);
    useWorkspaceStore.getState().applyCanvasDocumentState({ tikzCode: EMPTY_TIKZ_CODE });
    expect(useWorkspaceStore.getState().parsedDoc.elements).toEqual([]);
  });

  it('invalidates compiled output when source, theme or undo history changes', () => {
    const store = useWorkspaceStore;
    const compile = () => store.getState().setCompiledSvg('<svg/>', '内置 TeX 引擎');
    const expectInvalidated = () => {
      expect(store.getState().compiledSvg).toBeNull();
      expect(store.getState().texCompilerStatus).toBeNull();
    };
    compile();
    store.getState().setTikzCode('\\begin{tikzpicture}\\node (a) at (0,0) {A};\\end{tikzpicture}');
    expectInvalidated();
    compile();
    store.getState().setActiveTheme('nature');
    expectInvalidated();
    compile();
    store.getState().undo();
    expectInvalidated();
    compile();
    store.getState().redo();
    expectInvalidated();
    compile();
    store.getState().applyCanvasDocumentState({ tikzCode: EMPTY_TIKZ_CODE });
    expectInvalidated();
  });

  it('does not publish state or record undo for a coordinate no-op', () => {
    useWorkspaceStore.getState().setTikzCode('\\node (a) at (0.0, 0.0) {A};');
    const before = useWorkspaceStore.getState();
    useWorkspaceStore.getState().moveElementsByPosition([{ id: 'a', x: 0, y: 0 }], true);
    expect(useWorkspaceStore.getState()).toBe(before);
  });

  it('ignores non-finite coordinates instead of corrupting source', () => {
    useWorkspaceStore.getState().setTikzCode('\\node (a) at (0.0, 0.0) {A};');
    const before = useWorkspaceStore.getState();
    useWorkspaceStore.getState().moveElementsByPosition([{ id: 'a', x: NaN, y: Infinity }], true);
    expect(useWorkspaceStore.getState()).toBe(before);
  });
});
