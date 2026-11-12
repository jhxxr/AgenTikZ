import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceStore } from '../../../store/useWorkspaceStore';
import { useProjectStore } from '../../../store/useProjectStore';
import { useSettingsStore } from '../../../store/useSettingsStore';
import { compileWorkspaceTexPreview, TexPreviewResult } from '../preview';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

describe('real TeX preview results', () => {
  beforeEach(() => {
    useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
    useProjectStore.setState(useProjectStore.getInitialState());
    useSettingsStore.setState(useSettingsStore.getInitialState());
    invoke.mockReset();
    vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps compilation failures visible instead of claiming the approximate canvas is exact', async () => {
    invoke.mockResolvedValue({ ok: false, message: 'latex 编译失败：l.12 Undefined control sequence' });
    await compileWorkspaceTexPreview();
    expect(useWorkspaceStore.getState().compiledSvg).toBeNull();
    expect(useWorkspaceStore.getState().texCompilerStatus).toContain('Undefined control sequence');
    expect(useWorkspaceStore.getState().isCompilingTex).toBe(false);
  });

  it('explains browser limitations without manufacturing a successful SVG', async () => {
    vi.stubGlobal('window', {});
    await compileWorkspaceTexPreview();
    expect(invoke).not.toHaveBeenCalled();
    expect(useWorkspaceStore.getState().compiledSvg).toBeNull();
    expect(useWorkspaceStore.getState().texCompilerStatus).toContain('浏览器模式');
  });

  it('does not publish old output after edits, even if the text is restored', async () => {
    let finish!: (result: TexPreviewResult) => void;
    invoke.mockImplementation(() => new Promise<TexPreviewResult>((resolve) => { finish = resolve; }));
    const pending = compileWorkspaceTexPreview();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    const original = useWorkspaceStore.getState().tikzCode;
    useWorkspaceStore.getState().setTikzCode(`${original}\n% edit`);
    useWorkspaceStore.getState().setTikzCode(original);
    finish({ ok: true, svg: '<svg id="stale"/>', message: '内置 xelatex 引擎编译成功' });
    await pending;
    expect(useWorkspaceStore.getState().compiledSvg).toBeNull();
    expect(useWorkspaceStore.getState().texCompilerStatus).toBeNull();
    expect(useWorkspaceStore.getState().isCompilingTex).toBe(false);
  });

  it('passes normalized full documents to the backend and publishes actual SVG', async () => {
    const source = '\\documentclass{article}\\begin{document}\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}\\end{document}';
    useWorkspaceStore.getState().setTikzCode(source);
    invoke.mockResolvedValue({ ok: true, svg: '<svg/>', message: '内置 xelatex 引擎编译成功' });
    await compileWorkspaceTexPreview();
    expect(invoke.mock.calls[0][1].texSource).toBe(source);
    expect(useWorkspaceStore.getState().compiledSvg).toBe('<svg/>');
  });

  it.each(['interactive', 'tex_split', 'tex_overlay'] as const)(
    'does not switch away from %s when compilation succeeds',
    async (mode) => {
      useWorkspaceStore.getState().setPreviewMode(mode);
      invoke.mockResolvedValue({ ok: true, svg: '<svg/>', message: 'compiled' });
      expect(await compileWorkspaceTexPreview()).toBe('<svg/>');
      expect(useWorkspaceStore.getState().previewMode).toBe(mode);
    }
  );

  it('does not reopen a preview closed while the engine was running', async () => {
    let finish!: (result: TexPreviewResult) => void;
    invoke.mockImplementation(() => new Promise<TexPreviewResult>((resolve) => { finish = resolve; }));
    useWorkspaceStore.getState().setPreviewMode('tex_split');
    const pending = compileWorkspaceTexPreview();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    useWorkspaceStore.getState().setPreviewMode('interactive');
    finish({ ok: true, svg: '<svg/>', message: 'compiled' });
    await pending;
    expect(useWorkspaceStore.getState().previewMode).toBe('interactive');
  });

  it('shares an in-flight compilation with export instead of requiring another click', async () => {
    let finish!: (result: TexPreviewResult) => void;
    invoke.mockImplementation(() => new Promise<TexPreviewResult>((resolve) => { finish = resolve; }));
    const preview = compileWorkspaceTexPreview();
    const exporting = compileWorkspaceTexPreview();
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    finish({ ok: true, svg: '<svg id="real"/>', message: 'compiled' });
    expect(await preview).toBe('<svg id="real"/>');
    expect(await exporting).toBe('<svg id="real"/>');
  });

  it('keeps editing available when the compiler rejects a drawing', async () => {
    invoke.mockRejectedValue(new Error('engine unavailable'));
    expect(await compileWorkspaceTexPreview()).toBeNull();
    expect(useWorkspaceStore.getState().previewMode).toBe('interactive');
    expect(useWorkspaceStore.getState().texCompilerStatus).toContain('engine unavailable');
  });
});
