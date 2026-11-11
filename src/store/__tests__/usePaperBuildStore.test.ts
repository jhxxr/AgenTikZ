import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../useProjectStore';
import { usePaperBuildStore, getPaperBuildDiagnostics } from '../usePaperBuildStore';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
const realSave = useProjectStore.getState().saveAllDirtyPaperFiles;

beforeEach(() => {
  invoke.mockReset();
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  useProjectStore.setState({ projectDir: 'E:/Paper' });
  useProjectStore.setState({
    projectDir: 'E:/Paper', activePaperFilePath: 'sections/results.tex', paperEditRevision: 5,
    paperFiles: [{ relativePath: 'main.tex', fileName: 'main.tex', category: 'main', sizeBytes: 1, modifiedAt: 0 }],
    saveStatus: 'saved', autoSyncTikz: true,
    saveAllDirtyPaperFiles: vi.fn().mockResolvedValue(true),
  });
  usePaperBuildStore.setState({ projectId: 'E:/Paper', status: 'idle', result: null, compiledRevision: -1 });
});
afterEach(() => {
  vi.unstubAllGlobals();
  useProjectStore.setState({ saveAllDirtyPaperFiles: realSave });
});

describe('shared paper compilation', () => {
  it('does not fake compilation in browser mode or run a compiler after save failure', async () => {
    vi.stubGlobal('window', {});
    await usePaperBuildStore.getState().run();
    expect(usePaperBuildStore.getState().status).toBe('failed');
    expect(usePaperBuildStore.getState().result?.message).toContain('浏览器');
    expect(invoke).not.toHaveBeenCalled();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
    useProjectStore.setState({ saveAllDirtyPaperFiles: vi.fn().mockResolvedValue(false) });
    await usePaperBuildStore.getState().run();
    expect(usePaperBuildStore.getState().result?.message).toContain('保存失败');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('shares actual results across workbench changes and tracks stale source revisions', async () => {
    invoke.mockResolvedValue({ ok: true, pdfPath: 'E:/Paper/main.pdf', message: 'Compiled', logExcerpt: 'Actual log' });
    await usePaperBuildStore.getState().run();
    expect(invoke).toHaveBeenCalledWith('tex_compile_paper', expect.objectContaining({ projectDir: 'E:/Paper', mainTexFile: 'main.tex' }));
    useProjectStore.setState({ workbenchMode: 'figure' });
    expect(getPaperBuildDiagnostics()).toMatchObject({ status: 'completed', stale: false, result: { logExcerpt: 'Actual log' } });
    useProjectStore.setState({ paperEditRevision: 6 });
    expect(getPaperBuildDiagnostics()).toMatchObject({ stale: true });
  });

  it('passes the build mode to the bundled engine and cleans only when idle', async () => {
    invoke.mockResolvedValue({ ok: true, pdfPath: 'E:/Paper/main.pdf', message: 'Compiled' });
    await usePaperBuildStore.getState().run();
    expect(invoke).toHaveBeenLastCalledWith('tex_compile_paper', {
      projectDir: 'E:/Paper', mainTexFile: 'main.tex', texEngine: 'xelatex', mode: 'normal',
    });
    for (const mode of ['force', 'clean'] as const) {
      await usePaperBuildStore.getState().run(mode);
      expect(invoke).toHaveBeenLastCalledWith('tex_compile_paper', expect.objectContaining({ mode }));
    }
    invoke.mockResolvedValue({ removed: 4, message: '已清理 4 个中间产物（PDF 与源码保留）' });
    await expect(usePaperBuildStore.getState().clean()).resolves.toContain('4');
    expect(invoke).toHaveBeenLastCalledWith('tex_clean_artifacts', { projectDir: 'E:/Paper', mainTexFile: 'main.tex' });
    usePaperBuildStore.setState({ status: 'running' });
    await expect(usePaperBuildStore.getState().clean()).rejects.toThrow('正在编译');
  });

  it('uses the template-marked main file even when another main.tex exists', async () => {
    useProjectStore.setState({ paperFiles: [
      { relativePath: 'main.tex', fileName: 'main.tex', category: 'section', sizeBytes: 1, modifiedAt: 0 },
      { relativePath: 'latex/paper.tex', fileName: 'paper.tex', category: 'main', sizeBytes: 1, modifiedAt: 0 },
    ] });
    invoke.mockResolvedValue({ ok: true, pdfPath: 'E:/Paper/paper.pdf', message: 'Compiled' });
    await usePaperBuildStore.getState().run();
    expect(invoke).toHaveBeenLastCalledWith('tex_compile_paper', expect.objectContaining({ mainTexFile: 'latex/paper.tex' }));
  });

  it('does not validate a paper while its canvas-backed figure is still awaiting synchronization', async () => {
    useProjectStore.setState({ saveStatus: 'saving' });
    await usePaperBuildStore.getState().run();
    expect(invoke).not.toHaveBeenCalled();
    expect(usePaperBuildStore.getState().result?.message).toContain('配图');
  });

  it('does not duplicate a running build or publish its result after A -> B -> A', async () => {
    let complete!: (value: unknown) => void;
    invoke.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const task = usePaperBuildStore.getState().run();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    await usePaperBuildStore.getState().run();
    expect(invoke).toHaveBeenCalledOnce();
    useProjectStore.setState({ projectDir: 'E:/Other' });
    useProjectStore.setState({ projectDir: 'E:/Paper' });
    await usePaperBuildStore.getState().run();
    expect(invoke).toHaveBeenCalledOnce();
    complete({ ok: true, pdfPath: 'wrong.pdf', message: 'Old build' });
    await task;
    expect(usePaperBuildStore.getState().result).toBeNull();
    expect(usePaperBuildStore.getState().status).toBe('idle');
  });

  it('clears prior success on failure instead of presenting an older PDF as new', async () => {
    invoke.mockResolvedValueOnce({ ok: true, pdfPath: 'main.pdf', message: 'Compiled' })
      .mockRejectedValueOnce(new Error('Compiler unavailable'));
    await usePaperBuildStore.getState().run();
    await usePaperBuildStore.getState().run();
    expect(getPaperBuildDiagnostics()).toMatchObject({ status: 'failed', result: { ok: false, message: 'Compiler unavailable' } });
    expect(usePaperBuildStore.getState().result?.pdfPath).toBeUndefined();
  });
});
