import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../useProjectStore';
import { useWorkspaceStore } from '../useWorkspaceStore';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
const main = '\\documentclass{article}\n\\begin{document}\n\\input{sections/method.tex}\n\\end{document}\n';
const drawing = '\\begin{tikzpicture}\n\\node (a) at (0,0) {User diagram};\n\\end{tikzpicture}';
const initialSources: Record<string, string> = { 'main.tex': main, 'sections/method.tex': '\\section{Method}\nOriginal text.\n', 'sections/empty.tex': '' };
const metadata = (relativePath: string) => ({
  relativePath, fileName: relativePath.split('/').at(-1)!, category: relativePath === 'main.tex' ? 'main' as const : 'section' as const,
  sizeBytes: 100, modifiedAt: 0,
});
const asset = (relativePath: string) => ({
  relativePath, fileName: relativePath.split('/').at(-1)!, folder: relativePath.split('/').slice(0, -1).join('/'),
  ext: relativePath.split('.').at(-1)!, sizeBytes: 20, modifiedAt: 0,
});
const options = {
  mode: 'external_graphic' as const, relativePath: 'figures/assets/image.png',
  targetTexFile: 'sections/method.tex', caption: 'Measured image', label: 'fig:image',
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  invoke.mockReset();
  useProjectStore.setState({ ...useProjectStore.getInitialState(), projectDir: null });
  useWorkspaceStore.setState(useWorkspaceStore.getInitialState());
  useWorkspaceStore.getState().setTikzCode(drawing);
  useProjectStore.setState({ projectDir: 'E:/Paper' });
  useProjectStore.setState({
    workbenchMode: 'figure', activeCanvasFileName: 'figure.canvas.json', activeCanvasName: 'User figure',
    paperFiles: Object.keys(initialSources).map(metadata), paperFileContents: { ...initialSources },
    paperDirtyFiles: {}, paperEditRevision: 0, activePaperFilePath: 'sections/method.tex',
    lastPaperCursorOffset: null, saveStatus: 'saved',
    assets: [asset(options.relativePath), asset('figures/external/other.pdf'), asset('figures/assets/unsupported.svg')],
  });
  invoke.mockImplementation(async (command, args) => {
    if (command === 'project_write_text_file') return true;
    if (command === 'project_check_figure_asset') return true;
    if (command === 'project_save_canvas') return { fileName: args.fileName, updatedAt: 1000 };
    if (command === 'project_list_paper_files') return Object.keys(useProjectStore.getState().paperFileContents).map(metadata);
    if (command === 'project_import_asset') return asset(args.relativePath);
    if (command === 'img_save_processed_asset') return args.relativePath;
    throw new Error(`Unexpected IPC: ${command}`);
  });
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });
const writes = () => invoke.mock.calls.filter(([command]) => command === 'project_write_text_file').map(([, args]) => args);

describe('paper figure insertion transaction', () => {
  it('inserts an image into the selected chapter, adds graphicx to the root, and never saves the drawing or TikZ macros', async () => {
    const result = await useProjectStore.getState().insertFigureIntoPaper(options);
    expect(result).toMatchObject({ ok: true, targetFile: options.targetTexFile });
    expect(useProjectStore.getState().paperFileContents[options.targetTexFile]).toContain('\\includegraphics');
    expect(useProjectStore.getState().paperFileContents['main.tex']).toContain('\\usepackage{graphicx}');
    expect(invoke.mock.calls.some(([command]) => command === 'project_save_canvas')).toBe(false);
    expect(writes().some((args) => args.relativePath.includes('agentikz-macros'))).toBe(false);
    expect(useWorkspaceStore.getState().tikzCode).toBe(drawing);
    expect(useProjectStore.getState().paperInsertionLocation?.path).toBe(options.targetTexFile);
  });

  it('never substitutes a full paper for an intentionally empty chapter', async () => {
    const result = await useProjectStore.getState().insertFigureIntoPaper({ ...options, targetTexFile: 'sections/empty.tex' });
    expect(result.ok).toBe(true);
    const source = useProjectStore.getState().paperFileContents['sections/empty.tex'];
    expect(source).toContain('\\begin{figure}');
    expect(source).not.toContain('\\documentclass');
    expect(source).not.toContain('Original text');
  });

  it('does not apply a cursor from the previously active chapter to the newly selected target', async () => {
    useProjectStore.setState({ lastPaperCursorOffset: 2 });
    const before = useProjectStore.getState().paperFileContents['main.tex'];
    expect((await useProjectStore.getState().insertFigureIntoPaper({ ...options, targetTexFile: 'main.tex' })).ok).toBe(true);
    const after = useProjectStore.getState().paperFileContents['main.tex'];
    expect(after.indexOf('\\begin{figure}')).toBeGreaterThan(after.indexOf('\\input{sections/method.tex}'));
    expect(after).toContain(before.slice(0, before.indexOf('\\begin{document}')));
  });

  it('reports native save failure, keeps dirty edits, and retries without duplicating the buffered figure', async () => {
    const normal = invoke.getMockImplementation()!;
    let fail = true;
    invoke.mockImplementation(async (command, args) => {
      if (command === 'project_write_text_file' && fail) { fail = false; return false; }
      return normal(command, args);
    });
    const result = await useProjectStore.getState().insertFigureIntoPaper(options);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining('保存失败') });
    expect(useProjectStore.getState().lastExportedNotice).toBeNull();
    expect(Object.values(useProjectStore.getState().paperDirtyFiles).some(Boolean)).toBe(true);
    const retry = await useProjectStore.getState().insertFigureIntoPaper(options);
    expect(retry).toMatchObject({ ok: true, alreadyPresent: true });
    expect(useProjectStore.getState().paperFileContents[options.targetTexFile].match(/\\begin\{figure\}/g)).toHaveLength(1);
  });

  it('does not silently insert a missing file, unsupported format, absent chapter or absent main document', async () => {
    for (const changes of [
      { relativePath: 'figures/missing.png' }, { relativePath: 'figures/assets/unsupported.svg' },
      { targetTexFile: 'missing.tex' }, { widthRatio: '1.5' },
    ]) expect((await useProjectStore.getState().insertFigureIntoPaper({ ...options, ...changes })).ok).toBe(false);
    useProjectStore.setState({ paperFileContents: { ...initialSources, 'main.tex': '' } });
    expect((await useProjectStore.getState().insertFigureIntoPaper(options)).ok).toBe(false);
    expect(writes()).toEqual([]);
  });

  it('verifies the exact disk image without loading a PDF into a preview or writing a broken reference', async () => {
    invoke.mockImplementationOnce(async () => { throw new Error('配图文件不存在'); });
    expect(await useProjectStore.getState().insertFigureIntoPaper({ ...options, relativePath: 'figures/external/other.pdf' }))
      .toMatchObject({ ok: false, error: '配图文件不存在' });
    expect(invoke).toHaveBeenCalledWith('project_check_figure_asset', { projectDir: 'E:/Paper', relativePath: 'figures/external/other.pdf' });
    expect(writes()).toHaveLength(0);
    expect(useProjectStore.getState().paperFileContents[options.targetTexFile]).toBe(initialSources[options.targetTexFile]);
  });

  it('locates a duplicate by path, permits explicit repeats, and avoids label collisions in other chapters', async () => {
    useProjectStore.setState({ paperFileContents: { ...initialSources, 'sections/empty.tex': '\\label{fig:image}\n' } });
    expect(await useProjectStore.getState().insertFigureIntoPaper(options)).toMatchObject({ ok: true, label: 'fig:image-2' });
    expect(await useProjectStore.getState().insertFigureIntoPaper(options)).toMatchObject({ ok: true, alreadyPresent: true });
    expect(await useProjectStore.getState().insertFigureIntoPaper({ ...options, allowDuplicate: true }))
      .toMatchObject({ ok: true, alreadyPresent: false, label: 'fig:image-3' });
    expect(useProjectStore.getState().paperFileContents[options.targetTexFile].match(/\\begin\{figure\}/g)).toHaveLength(2);
  });

  it('does not clobber or retarget a second project after an asynchronous read', async () => {
    const contents = { ...initialSources };
    delete (contents as Record<string, string>)['sections/empty.tex'];
    useProjectStore.setState({ paperFileContents: contents });
    invoke.mockImplementation(async (command) => {
      if (command === 'project_read_text_file') {
        useProjectStore.setState({ projectDir: 'E:/OtherPaper' });
        return 'Old project section';
      }
      throw new Error(`Unexpected write after project change: ${command}`);
    });
    expect((await useProjectStore.getState().insertFigureIntoPaper(options)).ok).toBe(false);
    expect(useProjectStore.getState().paperFileContents).toEqual({});
    expect(useProjectStore.getState().figureInsertionError).toBeNull();
    expect(writes()).toHaveLength(0);
  });

  it('does not allow simultaneous duplicate submissions', async () => {
    let finish!: () => void;
    invoke.mockImplementationOnce(() => new Promise<boolean>((resolve) => { finish = () => resolve(true); }));
    const first = useProjectStore.getState().insertFigureIntoPaper(options);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(await useProjectStore.getState().insertFigureIntoPaper(options)).toMatchObject({ ok: false, error: expect.stringContaining('重复点击') });
    finish();
    expect((await first).ok).toBe(true);
  });

  it('saves the actual TikZ path even when automatic synchronization is disabled, without changing that preference', async () => {
    useProjectStore.setState({ autoSyncTikz: false });
    const result = await useProjectStore.getState().insertFigureIntoPaper({
      ...options, mode: 'tikz_package', relativePath: 'figures/figure.tikz',
    });
    expect(result.ok).toBe(true);
    expect(writes()).toContainEqual(expect.objectContaining({ relativePath: 'figures/figure.tikz', content: drawing }));
    expect(useProjectStore.getState().autoSyncTikz).toBe(false);
    expect(useProjectStore.getState().paperFileContents['main.tex']).toContain('styles/agentikz-macros');
  });

  it('does not insert empty drawings or treat a failed canvas save as a successful insertion', async () => {
    useWorkspaceStore.getState().setTikzCode('\\begin{tikzpicture}% empty\n\\end{tikzpicture}');
    expect((await useProjectStore.getState().quickInsertActiveFigureIntoPaper()).ok).toBe(false);
    useWorkspaceStore.getState().setTikzCode(drawing);
    invoke.mockImplementationOnce(async () => { throw new Error('Canvas disk unavailable'); });
    expect((await useProjectStore.getState().quickInsertActiveFigureIntoPaper()).ok).toBe(false);
    expect(useProjectStore.getState().workbenchMode).toBe('figure');
    expect(writes()).toHaveLength(0);
  });

  it('inserts an existing non-active drawing without switching or saving the active canvas', async () => {
    useProjectStore.setState({
      paperFiles: [...Object.keys(initialSources).map(metadata), metadata('figures/other.tikz')],
      paperFileContents: { ...initialSources, 'figures/other.tikz': drawing.replace('User diagram', 'Other diagram') },
    });
    expect((await useProjectStore.getState().insertFigureIntoPaper({ ...options, mode: 'tikz_package', relativePath: 'figures/other.tikz' })).ok).toBe(true);
    expect(useProjectStore.getState().activeCanvasFileName).toBe('figure.canvas.json');
    expect(useWorkspaceStore.getState().tikzCode).toBe(drawing);
    expect(invoke.mock.calls.some(([command]) => command === 'project_save_canvas')).toBe(false);
  });

  it('uses the actual manuscript entry when the active paper tab is a bibliography and the project has no main.tex', async () => {
    useProjectStore.setState({
      paperFiles: [{ ...metadata('paper.tex'), category: 'main' }, { ...metadata('references.bib'), category: 'bib' }],
      paperFileContents: { 'paper.tex': main, 'references.bib': '% user bibliography' },
      activePaperFilePath: 'references.bib',
    });
    const result = await useProjectStore.getState().quickInsertActiveFigureIntoPaper();
    expect(result).toMatchObject({ ok: true, targetFile: 'paper.tex' });
    expect(useProjectStore.getState().paperFileContents['paper.tex']).toContain('\\begin{figure}');
    expect(useProjectStore.getState().paperFileContents['references.bib']).toBe('% user bibliography');
  });

  it('does not reinterpret dollar replacement tokens when inserting before the document end', async () => {
    const caption = '\\begin{tabular}{cc}$x$&$y$\\end{tabular}';
    const result = await useProjectStore.getState().insertFigureIntoPaper({ ...options, caption, targetTexFile: 'main.tex' });
    expect(result.ok).toBe(true);
    expect(useProjectStore.getState().paperFileContents['main.tex']).toContain(`\\caption{${caption}}`);
    expect(useProjectStore.getState().paperFileContents['main.tex'].match(/\\end\{document\}/g)).toHaveLength(1);
  });
});

describe('asset import and generated-image persistence', () => {
  it('does not replace the new project library with a stale asset scan', async () => {
    invoke.mockImplementationOnce(async () => {
      useProjectStore.setState({ projectDir: 'E:/Other' });
      useProjectStore.setState({ assets: [asset('figures/assets/new-project.png')] });
      return [asset('figures/assets/old-project.png')];
    });
    await useProjectStore.getState().refreshProjectAssets();
    expect(useProjectStore.getState().assets.map((item) => item.fileName)).toEqual(['new-project.png']);
  });

  it('preserves a newly imported asset when an older disk scan completes', async () => {
    invoke.mockImplementationOnce(async () => {
      useProjectStore.setState((state) => ({ assets: [...state.assets, asset('figures/assets/just-imported.png')] }));
      return [asset('figures/assets/image.png')];
    });
    await useProjectStore.getState().refreshProjectAssets();
    expect(useProjectStore.getState().assets.map((item) => item.fileName)).toEqual(['image.png', 'just-imported.png']);
  });

  it('does not publish an image to the asset list when its native save fails', async () => {
    invoke.mockRejectedValueOnce(new Error('Image disk unavailable'));
    await expect(useProjectStore.getState().registerGeneratedAsset('figures/assets/ai/new.png', 'data:image/png;base64,eA==', 'E:/Paper'))
      .rejects.toThrow('Image disk unavailable');
    expect(useProjectStore.getState().assets.some((item) => item.fileName === 'new.png')).toBe(false);
  });

  it('uses the actual asset-import contract rather than calling an incompatible image-generation metadata API', async () => {
    const path = 'figures/assets/ai/new.png';
    expect(await useProjectStore.getState().registerGeneratedAsset(path, 'data:image/png;base64,eA==', 'E:/Paper')).toBe(path);
    expect(invoke).toHaveBeenCalledWith('project_import_asset', { projectDir: 'E:/Paper', relativePath: path, dataUrl: 'data:image/png;base64,eA==' });
    expect(invoke.mock.calls.some(([command]) => command === 'img_save_processed_asset')).toBe(false);
  });

  it('refuses to register a generated result belonging to another project', async () => {
    await expect(useProjectStore.getState().registerGeneratedAsset('figures/assets/ai/new.png', 'data:image/png;base64,eA==', 'E:/Other'))
      .rejects.toThrow('项目已切换');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('renames duplicate imports instead of silently replacing the existing asset', async () => {
    const files = [new File(['image-one'], 'image.png', { type: 'image/png' }), new File(['image-two'], 'image.png', { type: 'image/png' })];
    const imported = await useProjectStore.getState().registerLocalBrowserAssetFiles(files, 'figures/assets');
    expect(imported.map((item) => item.relativePath)).toEqual(['figures/assets/image-2.png', 'figures/assets/image-3.png']);
    expect(useProjectStore.getState().assets.some((item) => item.relativePath === options.relativePath)).toBe(true);
  });

  it('reserves filenames across simultaneous imports, not just within one file picker batch', async () => {
    const paths: string[] = [];
    let finishFirst!: () => void;
    invoke.mockImplementation(async (_command, args) => {
      paths.push(args.relativePath);
      if (paths.length === 1) await new Promise<void>((resolve) => { finishFirst = resolve; });
      return asset(args.relativePath);
    });
    const first = useProjectStore.getState().registerLocalBrowserAssetFiles([new File(['one'], 'concurrent.png')], 'figures/assets');
    await vi.waitFor(() => expect(paths).toHaveLength(1));
    const second = await useProjectStore.getState().registerLocalBrowserAssetFiles([new File(['two'], 'concurrent.png')], 'figures/assets');
    finishFirst();
    await first;
    expect(second[0].relativePath).toBe('figures/assets/concurrent-2.png');
    expect(new Set(paths).size).toBe(2);
  });

  it('never merges delayed imports into the new project asset cache', async () => {
    invoke.mockImplementationOnce(async (_command, args) => {
      useProjectStore.setState({ projectDir: 'E:/Other' });
      useProjectStore.setState({ assets: [], assetDataUrls: {} });
      return asset(args.relativePath);
    });
    const result = await useProjectStore.getState().registerLocalBrowserAssetFiles([new File(['png'], 'new.png')], 'figures/assets');
    expect(result).toEqual([]);
    expect(useProjectStore.getState().assets).toEqual([]);
    expect(useProjectStore.getState().assetDataUrls).toEqual({});
  });
});
