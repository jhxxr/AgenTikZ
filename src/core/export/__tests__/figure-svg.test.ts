import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useProjectStore } from '../../../store/useProjectStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { resolveFigureSvgForExport } from '../figure-svg';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

describe('full-fidelity figure SVG exports', () => {
  const readCanvas = vi.fn(() => '<svg id="approximate"/>');
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
    useProjectStore.setState(useProjectStore.getInitialState());
    useSettingsStore.setState(useSettingsStore.getInitialState());
    invoke.mockReset();
    readCanvas.mockClear();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('exports exactly the SVG shown in the real TeX preview', async () => {
    useWorkspaceStore.getState().setCompiledSvg('<svg id="exact"/>');
    expect(await resolveFigureSvgForExport(readCanvas)).toBe('<svg id="exact"/>');
    expect(invoke).not.toHaveBeenCalled();
    expect(readCanvas).not.toHaveBeenCalled();
  });

  it('waits for real TeX on the desktop, including simple drawings', async () => {
    invoke.mockResolvedValue({ ok: true, svg: '<svg id="compiled"/>', message: 'compiled' });
    expect(await resolveFigureSvgForExport(readCanvas)).toBe('<svg id="compiled"/>');
    expect(invoke).toHaveBeenCalledOnce();
    expect(readCanvas).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().previewMode).toBe('interactive');
  });

  it('never substitutes a compatible approximation when real TeX fails', async () => {
    useWorkspaceStore.getState().setTikzCode(String.raw`\begin{tikzpicture}\fill (0,0) circle (1);\end{tikzpicture}`);
    invoke.mockResolvedValue({ ok: false, message: 'Missing package' });
    expect(await resolveFigureSvgForExport(readCanvas)).toBeNull();
    expect(readCanvas).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().texCompilerStatus).toContain('Missing package');
    expect(useWorkspaceStore.getState().previewMode).toBe('tex_split');
  });

  it('retains canvas export for simple browser-only drawings', async () => {
    vi.stubGlobal('window', {});
    useWorkspaceStore.getState().setTikzCode(String.raw`\begin{tikzpicture}\node[dl_block] (a) at (0,0) {A};\end{tikzpicture}`);
    expect(await resolveFigureSvgForExport(readCanvas)).toBe('<svg id="approximate"/>');
    expect(readCanvas).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('explains complex browser exports rather than quietly dropping paths and text', async () => {
    vi.stubGlobal('window', {});
    useWorkspaceStore.getState().setTikzCode(String.raw`\begin{tikzpicture}\fill (0,0) circle (1);\end{tikzpicture}`);
    expect(await resolveFigureSvgForExport(readCanvas)).toBeNull();
    expect(readCanvas).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().texCompilerStatus).toContain('浏览器模式');
  });

  it('does not export an obsolete drawing or reopen a different canvas', async () => {
    let finish!: (value: unknown) => void;
    invoke.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const exporting = resolveFigureSvgForExport(readCanvas);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    useProjectStore.setState({ activeCanvasFileName: 'other.canvas.json' });
    finish({ ok: true, svg: '<svg id="obsolete"/>', message: 'compiled' });
    expect(await exporting).toBeNull();
    expect(useWorkspaceStore.getState().previewMode).toBe('interactive');
    expect(readCanvas).not.toHaveBeenCalled();
  });
});
