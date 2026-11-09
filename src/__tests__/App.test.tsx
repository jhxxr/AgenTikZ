import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../store/useProjectStore';
import { App } from '../App';

// Zustand's server snapshot intentionally uses its initial state. This harness
// renders a chosen live state without needing a browser-only test environment.
vi.mock('../store/useProjectStore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../store/useProjectStore')>();
  return {
    ...actual,
    useProjectStore: Object.assign(
      (selector: (state: ReturnType<typeof actual.useProjectStore.getState>) => unknown) =>
        selector(actual.useProjectStore.getState()),
      actual.useProjectStore,
    ),
  };
});

// Check mount boundaries, not just CSS visibility: drawing components register
// shortcuts and preview effects, so they must be absent while writing.
vi.mock('../components/toolbar/TopToolbar', () => ({ TopToolbar: () => <header /> }));
vi.mock('../components/sidebar/LeftTabbedSidebar', () => ({ LeftTabbedSidebar: () => <aside>drawing-library</aside> }));
vi.mock('../components/canvas/InteractiveCanvas', () => ({ InteractiveCanvas: () => <div>drawing-canvas</div> }));
vi.mock('../components/inspector/PropertyPanel', () => ({
  FloatingSelectionBar: () => <div>drawing-selection</div>,
  PropertyPanel: () => <div>drawing-inspector</div>,
}));
vi.mock('../components/agent/RightAgentPanel', () => ({ RightAgentPanel: () => <aside>project-agent</aside> }));
vi.mock('../components/project/CanvasTabsBar', () => ({ CanvasTabsBar: () => <div>drawing-tabs</div> }));
vi.mock('../components/paper/PaperWorkspaceView', () => ({ PaperWorkspaceView: () => <section>paper-editor-and-pdf</section> }));
vi.mock('../components/settings/SettingsModal', () => ({ SettingsModal: () => null }));
vi.mock('../components/project/ProjectPickerModal', () => ({ ProjectPickerModal: () => null }));
vi.mock('../components/paper/InsertFigureModal', () => ({ InsertFigureModal: () => null }));

describe('exclusive workspaces', () => {
  beforeEach(() => useProjectStore.setState({ workbenchMode: 'figure' }));

  it('unmounts drawing surfaces but preserves the shared project assistant while writing', () => {
    useProjectStore.setState({ workbenchMode: 'paper' });
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('paper-editor-and-pdf');
    expect(html).toContain('project-agent');
    for (const feature of ['canvas', 'selection', 'inspector', 'library', 'tabs']) {
      expect(html).not.toContain(`drawing-${feature}`);
    }
  });

  it('only mounts the canvas workspace after explicitly switching to drawing', () => {
    const html = renderToStaticMarkup(<App />);
    expect(html).toContain('drawing-canvas');
    expect(html).toContain('drawing-inspector');
    expect(html).toContain('project-agent');
    expect(html).not.toContain('paper-editor-and-pdf');
  });
});
