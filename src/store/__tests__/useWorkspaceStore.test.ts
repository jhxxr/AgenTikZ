import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkspaceStore } from '../useWorkspaceStore';
import { EMPTY_TIKZ_CODE } from '../../core/templates/blank-document';
import { FULL_FIGURE_TEMPLATES } from '../../core/templates/dl-templates';

describe('blank-first workspace and explicit templates', () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
  });

  it('starts with no template, example nodes, selection or chart data', () => {
    const state = useWorkspaceStore.getState();
    expect(state.tikzCode).toBe(EMPTY_TIKZ_CODE);
    expect(state.activeTemplateId).toBe('');
    expect(state.parsedDoc.elements).toEqual([]);
    expect(state.parsedDoc.figureCaption).toBe('');
    expect(state.parsedDoc.figureLabel).toBe('');
    expect(state.selectedIds).toEqual([]);
    expect(state.highlightedLineRange).toBeNull();
  });

  it('still loads an explicitly chosen template, and undo returns to blank', () => {
    const template = FULL_FIGURE_TEMPLATES[1];
    useWorkspaceStore.getState().loadTemplate(template.id);
    expect(useWorkspaceStore.getState().tikzCode).toBe(template.tikzCode);
    expect(useWorkspaceStore.getState().activeTemplateId).toBe(template.id);
    useWorkspaceStore.getState().undo();
    expect(useWorkspaceStore.getState().tikzCode).toBe(EMPTY_TIKZ_CODE);
    expect(useWorkspaceStore.getState().activeTemplateId).toBe('');
    useWorkspaceStore.getState().redo();
    expect(useWorkspaceStore.getState().activeTemplateId).toBe(template.id);
  });

  it('does not label an independent or switched document as the previous template', () => {
    useWorkspaceStore.getState().loadTemplate(FULL_FIGURE_TEMPLATES[0].id);
    useWorkspaceStore.getState().setTikzCode('\\begin{tikzpicture}\n\\node (custom) at (2,3) {Custom};\n\\end{tikzpicture}');
    expect(useWorkspaceStore.getState().activeTemplateId).toBe('');
    expect(useWorkspaceStore.getState().parsedDoc.nodes[0].id).toBe('custom');
    useWorkspaceStore.getState().loadTemplate(FULL_FIGURE_TEMPLATES[1].id);
    useWorkspaceStore.getState().applyCanvasDocumentState({ tikzCode: EMPTY_TIKZ_CODE });
    expect(useWorkspaceStore.getState().activeTemplateId).toBe('');
  });
});
