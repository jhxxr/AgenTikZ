import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockInvoke } = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: mockInvoke,
}));

import { CanvasFileDocument, useProjectStore } from '../useProjectStore';
import { useWorkspaceStore } from '../useWorkspaceStore';
import { EMPTY_TIKZ_CODE } from '../../core/templates/blank-document';
import { FULL_FIGURE_TEMPLATES } from '../../core/templates/dl-templates';

interface MockStorage {
  store: Record<string, string>;
  getItem: ReturnType<typeof vi.fn>;
  setItem: ReturnType<typeof vi.fn>;
  removeItem: ReturnType<typeof vi.fn>;
  clear: ReturnType<typeof vi.fn>;
}

function createMockLocalStorage(): MockStorage {
  const store: Record<string, string> = {};
  return {
    store,
    getItem: vi.fn((key: string) => (key in store ? store[key] : null)),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = String(value);
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      for (const k of Object.keys(store)) {
        delete store[k];
      }
    }),
  };
}

function makeCanvasDoc(
  fileName: string,
  name: string,
  tikzCode: string
): CanvasFileDocument {
  return {
    schema: 1,
    id: fileName.replace(/\.canvas\.json$/i, ''),
    name,
    fileName,
    createdAt: 1000,
    updatedAt: 2000,
    activeThemeId: 'neurips',
    zoom: 1,
    pan: { x: 80, y: 495 },
    showGrid: true,
    snapToGrid: true,
    canvasWidthCm: 16,
    canvasHeightCm: 10,
    tikzCode,
  };
}

const CODE_A = '\\begin{tikzpicture}\n\\node (a) at (0,0) {Canvas A};\n\\end{tikzpicture}';
const CODE_B = '\\begin{tikzpicture}\n\\node (b) at (1,1) {Canvas B};\n\\end{tikzpicture}';
const CODE_A_EDITED =
  '\\begin{tikzpicture}\n\\node (a) at (2,2) {Canvas A Edited};\n\\end{tikzpicture}';

describe('useProjectStore', () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    // Only freeze the application's debounce clock. Faking setImmediate also
    // freezes module-loading work on Node/Linux and can deadlock concurrent IPC.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    mockInvoke.mockReset();
    mockStorage = createMockLocalStorage();

    (globalThis as unknown as { window: Record<string, unknown> }).window = {
      localStorage: mockStorage,
      prompt: vi.fn(),
    };

    useWorkspaceStore.getState().applyCanvasDocumentState({
      tikzCode: CODE_A,
      activeThemeId: 'neurips',
      zoom: 1,
      pan: { x: 80, y: 495 },
      showGrid: true,
      snapToGrid: true,
      canvasWidthCm: 16,
      canvasHeightCm: 10,
    });

    useProjectStore.setState({
      initialized: true,
      projectDir: null,
      projectName: '未关联文件夹 (临时画布)',
      storageDir: null,
      exportDir: null,
      isPickerOpen: false,
      autoOpenLastProject: true,
      autoSyncTikz: true,
      lastProjectDir: null,
      recentProjects: [],
      canvases: [
        {
          fileName: 'fig1-architecture.canvas.json',
          name: 'Fig 1 - Architecture',
          updatedAt: 1000,
          sizeBytes: 512,
          activeThemeId: 'neurips',
        },
      ],
      localCanvases: {},
      activeCanvasFileName: 'fig1-architecture.canvas.json',
      activeCanvasName: 'Fig 1 - Architecture',
      saveStatus: 'local_only',
      lastSavedAt: null,
      lastExportedNotice: null,
      assets: [],
      assetDataUrls: {},
      isScanningAssets: false,
      errorMessage: null,
      paperFiles: [],
      paperFileContents: {},
      paperDirtyFiles: {},
      activePaperFilePath: 'main.tex',
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  function enableTauriRuntime() {
    (
      globalThis as unknown as { window: Record<string, unknown> }
    ).window.__TAURI_INTERNALS__ = {};
  }

  describe('project-scoped paper persistence', () => {
    function setupPaper(content = 'first version') {
      enableTauriRuntime();
      useProjectStore.setState({ projectDir: 'E:/Papers/PaperA' });
      useProjectStore.setState({
        paperFileContents: { 'main.tex': content },
        paperDirtyFiles: { 'main.tex': true },
      });
    }

    it('serializes writes and does not clear edits made during a save', async () => {
      setupPaper();
      let finishFirst!: () => void;
      let finishSecond!: () => void;
      const firstWrite = new Promise<void>((resolve) => { finishFirst = resolve; });
      const secondWrite = new Promise<void>((resolve) => { finishSecond = resolve; });
      mockInvoke.mockReturnValueOnce(firstWrite).mockReturnValueOnce(secondWrite);

      const first = useProjectStore.getState().savePaperFileNow();
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
      useProjectStore.getState().updatePaperFileContent('main.tex', 'latest version');
      const second = useProjectStore.getState().savePaperFileNow();
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockInvoke).toHaveBeenCalledTimes(1);

      finishFirst();
      await first;
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
      expect(useProjectStore.getState().paperDirtyFiles['main.tex']).toBe(true);
      expect(mockInvoke).toHaveBeenLastCalledWith('project_write_text_file', {
        projectDir: 'E:/Papers/PaperA',
        relativePath: 'main.tex',
        content: 'latest version',
      });
      finishSecond();
      expect(await second).toBe(true);
      expect(useProjectStore.getState().paperDirtyFiles['main.tex']).toBe(false);
    });

    it('deduplicates concurrent saves of identical content', async () => {
      setupPaper();
      let finish!: () => void;
      mockInvoke.mockReturnValue(new Promise<void>((resolve) => { finish = resolve; }));
      const first = useProjectStore.getState().savePaperFileNow();
      const second = useProjectStore.getState().savePaperFileNow();
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
      expect(mockInvoke).toHaveBeenCalledTimes(1);
      finish();
      expect(await Promise.all([first, second])).toEqual([true, true]);
    });

    it('allows different files to save concurrently', async () => {
      setupPaper();
      useProjectStore.getState().updatePaperFileContent('sections/intro.tex', 'intro');
      let finish!: () => void;
      let writesStarted!: () => void;
      const started = new Promise<void>((resolve) => { writesStarted = resolve; });
      const pending = new Promise<void>((resolve) => { finish = resolve; });
      mockInvoke.mockImplementation(() => {
        if (mockInvoke.mock.calls.length === 2) writesStarted();
        return pending;
      });
      const saves = [
        useProjectStore.getState().savePaperFileNow('main.tex'),
        useProjectStore.getState().savePaperFileNow('sections/intro.tex'),
      ];
      // Observe both requests starting, not an assumed number of event-loop ticks.
      await started;
      expect(mockInvoke).toHaveBeenCalledTimes(2);
      finish();
      expect(await Promise.all(saves)).toEqual([true, true]);
    });

    it('invalidates caches and cancels delayed paper saves on a project change', async () => {
      setupPaper();
      useProjectStore.getState().updatePaperFileContent('main.tex', 'unsaved');
      useProjectStore.setState({ projectDir: 'E:/Papers/PaperB' });
      expect(useProjectStore.getState().paperFileContents).toEqual({});
      expect(useProjectStore.getState().paperDirtyFiles).toEqual({});
      await vi.advanceTimersByTimeAsync(600);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('ignores save failures belonging to an old project, including an A-B-A switch', async () => {
      setupPaper();
      let fail!: (error: Error) => void;
      mockInvoke.mockReturnValue(new Promise<void>((_resolve, reject) => { fail = reject; }));
      const save = useProjectStore.getState().savePaperFileNow();
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
      useProjectStore.setState({ projectDir: 'E:/Papers/PaperB' });
      useProjectStore.setState({ projectDir: 'E:/Papers/PaperA' });
      useProjectStore.setState({
        paperFileContents: { 'main.tex': 'new workspace content' },
        paperDirtyFiles: { 'main.tex': true },
      });
      fail(new Error('old write failed'));
      expect(await save).toBe(false);
      expect(useProjectStore.getState().errorMessage).toBeNull();
      expect(useProjectStore.getState().paperDirtyFiles['main.tex']).toBe(true);
    });

    it('never lets a delayed file read replace newer edits', async () => {
      setupPaper();
      useProjectStore.setState({ paperFileContents: {}, paperDirtyFiles: {} });
      let finishRead!: (content: string) => void;
      mockInvoke.mockReturnValue(new Promise<string>((resolve) => { finishRead = resolve; }));
      const read = useProjectStore.getState().openPaperFile('main.tex');
      await vi.dynamicImportSettled();
      await vi.advanceTimersByTimeAsync(0);
      useProjectStore.getState().updatePaperFileContent('main.tex', 'typed while loading');
      finishRead('old disk version');
      expect(await read).toBe('typed while loading');
      expect(useProjectStore.getState().paperFileContents['main.tex']).toBe('typed while loading');
    });

    it('discards delayed paper reads and directory scans from an old project', async () => {
      setupPaper();
      useProjectStore.setState({ paperFileContents: {} });
      let finishRead!: (content: string) => void;
      let finishScan!: (files: unknown[]) => void;
      let readStarted!: () => void;
      let scanStarted!: () => void;
      const reading = new Promise<void>((resolve) => { readStarted = resolve; });
      const scanning = new Promise<void>((resolve) => { scanStarted = resolve; });
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'project_read_text_file') {
          return new Promise<string>((resolve) => {
            finishRead = resolve;
            readStarted();
          });
        }
        return new Promise<unknown[]>((resolve) => {
          finishScan = resolve;
          scanStarted();
        });
      });
      const read = useProjectStore.getState().openPaperFile('main.tex');
      const scan = useProjectStore.getState().refreshPaperFiles();
      await Promise.all([reading, scanning]);
      useProjectStore.setState({ projectDir: 'E:/Papers/PaperB' });
      finishRead('A content');
      finishScan([{ relativePath: 'main.tex', category: 'main' }]);
      expect(await read).toBe('');
      await scan;
      expect(useProjectStore.getState().paperFileContents).toEqual({});
      expect(useProjectStore.getState().paperFiles).toEqual([]);
    });

    it('keeps a paper dirty and reports a browser storage failure', async () => {
      useProjectStore.setState({ projectDir: 'E:/Papers/Browser' });
      useProjectStore.getState().updatePaperFileContent('main.tex', 'important edit');
      mockStorage.setItem.mockImplementation(() => { throw new Error('quota exceeded'); });
      expect(await useProjectStore.getState().savePaperFileNow()).toBe(false);
      expect(useProjectStore.getState().paperDirtyFiles['main.tex']).toBe(true);
      expect(useProjectStore.getState().errorMessage).toContain('quota exceeded');
    });

    it('does not manufacture an empty file when saving an unloaded path', async () => {
      setupPaper();
      expect(await useProjectStore.getState().savePaperFileNow('missing.tex')).toBe(false);
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('does not schedule writes for unchanged content', async () => {
      setupPaper();
      useProjectStore.setState({ paperDirtyFiles: { 'main.tex': false } });
      useProjectStore.getState().updatePaperFileContent('main.tex', 'first version');
      await vi.advanceTimersByTimeAsync(600);
      expect(mockInvoke).not.toHaveBeenCalled();
      expect(useProjectStore.getState().paperDirtyFiles['main.tex']).toBe(false);
    });

    it('flushes dirty paper files before opening a different project', async () => {
      useProjectStore.setState({ projectDir: 'E:/Papers/BrowserA' });
      useProjectStore.getState().updatePaperFileContent('main.tex', 'saved before switching');
      expect(await useProjectStore.getState().openProjectDirectory('E:/Papers/BrowserB')).toBe(true);
      const stored = Object.values(mockStorage.store).map((value) => JSON.parse(value));
      expect(stored.some((value) =>
        value.paperFiles?.['main.tex'] === 'saved before switching'
      )).toBe(true);
      expect(useProjectStore.getState().paperFileContents['main.tex']).not.toBe('saved before switching');
    });

    it('drains edits made during a flush before reporting that all paper files are saved', async () => {
      setupPaper();
      let finish!: () => void;
      let writeStarted!: () => void;
      const started = new Promise<void>((resolve) => { writeStarted = resolve; });
      mockInvoke.mockImplementation((_cmd: string, args: { content: string }) => {
        if (args.content === 'first version') {
          return new Promise<void>((resolve) => {
            finish = resolve;
            writeStarted();
          });
        }
        return Promise.resolve();
      });
      const flush = useProjectStore.getState().saveAllDirtyPaperFiles();
      await started;
      useProjectStore.getState().updatePaperFileContent('main.tex', 'edited during flush');
      finish();
      expect(await flush).toBe(true);
      expect(mockInvoke).toHaveBeenCalledTimes(2);
      expect(mockInvoke).toHaveBeenLastCalledWith('project_write_text_file', expect.objectContaining({
        content: 'edited during flush',
      }));
      expect(useProjectStore.getState().paperDirtyFiles['main.tex']).toBe(false);
    });

    it('blocks project switching when a paper file cannot be saved', async () => {
      setupPaper();
      useProjectStore.setState({ saveStatus: 'saved' });
      mockInvoke.mockRejectedValue(new Error('paper is read-only'));
      expect(await useProjectStore.getState().openProjectDirectory('E:/Papers/PaperB')).toBe(false);
      expect(useProjectStore.getState().projectDir).toBe('E:/Papers/PaperA');
      expect(useProjectStore.getState().paperDirtyFiles['main.tex']).toBe(true);
      expect(mockInvoke).not.toHaveBeenCalledWith('project_open_workspace', expect.anything());
    });

    it('does not replace native read failures with a fabricated browser project', async () => {
      setupPaper();
      mockInvoke.mockRejectedValue(new Error('directory unavailable'));
      await useProjectStore.getState().refreshPaperFiles();
      expect(useProjectStore.getState().errorMessage).toContain('directory unavailable');
      expect(mockStorage.setItem).not.toHaveBeenCalled();
      expect(useProjectStore.getState().paperFileContents['main.tex']).toBe('first version');
    });
  });

  describe('blank-first canvas creation', () => {
    it('creates an empty canvas without changing the previous drawing', async () => {
      const fileName = await useProjectStore.getState().createNewCanvasFile('Independent drawing');
      expect(fileName).toBeTruthy();
      expect(useWorkspaceStore.getState().tikzCode).toBe(EMPTY_TIKZ_CODE);
      expect(useWorkspaceStore.getState().activeTemplateId).toBe('');
      await useProjectStore.getState().switchCanvasFile('fig1-architecture.canvas.json');
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_A);
    });

    it('uses ready-made code only for an explicitly chosen template', async () => {
      const template = FULL_FIGURE_TEMPLATES[2];
      await useProjectStore.getState().createNewCanvasFile('Quick start', template.id);
      expect(useWorkspaceStore.getState().tikzCode).toBe(template.tikzCode);
      expect(useWorkspaceStore.getState().activeThemeId).toBe(template.themeId);
      expect(useWorkspaceStore.getState().activeTemplateId).toBe(template.id);
    });

    it('does not silently fall back to the first template for an invalid ID', async () => {
      await useProjectStore.getState().createNewCanvasFile('Unknown template', 'missing');
      expect(useWorkspaceStore.getState().tikzCode).toBe(EMPTY_TIKZ_CODE);
    });
  });

  describe('1. Async save race condition (Issue 1)', () => {
    it('does not overwrite activeCanvasFileName with A or overwrite A with B when A finishes saving after switching to B', async () => {
      enableTauriRuntime();
      const projectDir = 'E:/Papers/TestProject';
      useProjectStore.setState({
        projectDir,
        projectName: 'TestProject',
        canvases: [
          {
            fileName: 'fig1-architecture.canvas.json',
            name: 'Fig 1 - Architecture',
            updatedAt: 1000,
            sizeBytes: 512,
          },
          {
            fileName: 'fig2-ablation.canvas.json',
            name: 'Fig 2 - Ablation',
            updatedAt: 1000,
            sizeBytes: 512,
          },
        ],
        activeCanvasFileName: 'fig1-architecture.canvas.json',
        activeCanvasName: 'Fig 1 - Architecture',
        saveStatus: 'saved',
      });

      let resolveSaveA!: (val: { fileName: string; updatedAt: number }) => void;
      const saveAPromiseInternal = new Promise<{
        fileName: string;
        updatedAt: number;
      }>((resolve) => {
        resolveSaveA = resolve;
      });

      const savedPayloads: Array<{ fileName: string; content: string }> = [];

      mockInvoke.mockImplementation((cmd: string, args: Record<string, unknown>) => {
        if (cmd === 'project_save_canvas') {
          savedPayloads.push({
            fileName: String(args.fileName),
            content: String(args.content),
          });
          if (args.fileName === 'fig1-architecture.canvas.json') {
            return saveAPromiseInternal;
          }
          return Promise.resolve({
            fileName: String(args.fileName),
            updatedAt: 3000,
          });
        }
        if (cmd === 'project_load_canvas') {
          return Promise.resolve(
            JSON.stringify(
              makeCanvasDoc(
                'fig2-ablation.canvas.json',
                'Fig 2 - Ablation',
                CODE_B
              )
            )
          );
        }
        return Promise.resolve(null);
      });

      useWorkspaceStore.getState().setTikzCode(CODE_A_EDITED);
      expect(useProjectStore.getState().saveStatus).toBe('dirty');

      // Start saving canvas A (in-flight)
      const saveTaskA = useProjectStore.getState().saveActiveCanvasNow();
      expect(useProjectStore.getState().saveStatus).toBe('saving');

      // Initiate switch to canvas B while A is still saving
      const switchTaskB = useProjectStore
        .getState()
        .switchCanvasFile('fig2-ablation.canvas.json');

      // Resolve A's save
      resolveSaveA({
        fileName: 'fig1-architecture.canvas.json',
        updatedAt: 2500,
      });

      await Promise.all([saveTaskA, switchTaskB]);

      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig2-ablation.canvas.json'
      );
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_B);

      // Even if activeCanvasFileName changed before an in-flight save resolved,
      // resolving A's save must never reset activeCanvasFileName back to A.
      let resolveDelayedSaveA!: (val: {
        fileName: string;
        updatedAt: number;
      }) => void;
      const delayedSaveAPromise = new Promise<{
        fileName: string;
        updatedAt: number;
      }>((r) => {
        resolveDelayedSaveA = r;
      });
      mockInvoke.mockImplementationOnce(() => delayedSaveAPromise);

      useProjectStore.setState({
        activeCanvasFileName: 'fig1-architecture.canvas.json',
        activeCanvasName: 'Fig 1 - Architecture',
      });
      const delayedPromise = useProjectStore.getState().saveActiveCanvasNow();

      // Simulate active canvas already having switched to B while A's save is still in-flight
      useProjectStore.setState({
        activeCanvasFileName: 'fig2-ablation.canvas.json',
        activeCanvasName: 'Fig 2 - Ablation',
        saveStatus: 'saved',
      });
      useWorkspaceStore.getState().applyCanvasDocumentState({
        tikzCode: CODE_B,
      });

      resolveDelayedSaveA({
        fileName: 'fig1-architecture.canvas.json',
        updatedAt: 4000,
      });
      await delayedPromise;

      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig2-ablation.canvas.json'
      );
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_B);
    });

    it('keeps saveStatus dirty if newer edits occurred while save was in flight, and re-saves when saveActiveCanvasNow is called concurrently', async () => {
      enableTauriRuntime();
      useProjectStore.setState({
        projectDir: 'E:/Papers/TestProject',
        activeCanvasFileName: 'fig1-architecture.canvas.json',
        activeCanvasName: 'Fig 1 - Architecture',
        saveStatus: 'dirty',
      });

      let resolveFirstSave!: (val: {
        fileName: string;
        updatedAt: number;
      }) => void;
      const firstSaveDeferred = new Promise<{
        fileName: string;
        updatedAt: number;
      }>((r) => {
        resolveFirstSave = r;
      });
      let saveCallCount = 0;

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'project_save_canvas') {
          saveCallCount += 1;
          if (saveCallCount === 1) {
            return firstSaveDeferred;
          }
          return Promise.resolve({
            fileName: 'fig1-architecture.canvas.json',
            updatedAt: 5000,
          });
        }
        return Promise.resolve(null);
      });

      const firstSave = useProjectStore.getState().saveActiveCanvasNow();

      // Edit again while first save is in flight
      useWorkspaceStore.getState().setTikzCode(CODE_A_EDITED);
      const secondSave = useProjectStore.getState().saveActiveCanvasNow();

      resolveFirstSave({
        fileName: 'fig1-architecture.canvas.json',
        updatedAt: 4000,
      });

      await Promise.all([firstSave, secondSave]);
      expect(saveCallCount).toBe(2);
      expect(useProjectStore.getState().saveStatus).toBe('saved');
    });
  });

  describe('2. Save failure blocks switch/create/duplicate and preserves workspace (Issue 4)', () => {
    beforeEach(() => {
      enableTauriRuntime();
      useProjectStore.setState({
        projectDir: 'E:/Papers/TestProject',
        canvases: [
          {
            fileName: 'fig1-architecture.canvas.json',
            name: 'Fig 1 - Architecture',
            updatedAt: 1000,
            sizeBytes: 512,
          },
          {
            fileName: 'fig2-ablation.canvas.json',
            name: 'Fig 2 - Ablation',
            updatedAt: 1000,
            sizeBytes: 512,
          },
        ],
        activeCanvasFileName: 'fig1-architecture.canvas.json',
        activeCanvasName: 'Fig 1 - Architecture',
        saveStatus: 'saved',
      });
    });

    it('aborts switchCanvasFile when saving dirty active canvas fails', async () => {
      useWorkspaceStore.getState().setTikzCode(CODE_A_EDITED);
      expect(useProjectStore.getState().saveStatus).toBe('dirty');

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'project_save_canvas') {
          return Promise.reject(new Error('Disk full'));
        }
        if (cmd === 'project_load_canvas') {
          return Promise.resolve(
            JSON.stringify(
              makeCanvasDoc(
                'fig2-ablation.canvas.json',
                'Fig 2 - Ablation',
                CODE_B
              )
            )
          );
        }
        return Promise.resolve(null);
      });

      await useProjectStore
        .getState()
        .switchCanvasFile('fig2-ablation.canvas.json');

      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig1-architecture.canvas.json'
      );
      expect(useProjectStore.getState().saveStatus).toBe('error');
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_A_EDITED);
      expect(mockInvoke).not.toHaveBeenCalledWith(
        'project_load_canvas',
        expect.anything()
      );
    });

    it('aborts createNewCanvasFile when saving dirty active canvas fails and preserves workspace', async () => {
      useWorkspaceStore.getState().setTikzCode(CODE_A_EDITED);
      mockInvoke.mockRejectedValue(new Error('Permission denied'));

      const created = await useProjectStore
        .getState()
        .createNewCanvasFile('Fig 3 - Pipeline');

      expect(created).toBeNull();
      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig1-architecture.canvas.json'
      );
      expect(useProjectStore.getState().saveStatus).toBe('error');
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_A_EDITED);
    });

    it('aborts duplicateCurrentCanvasFile and rolls back when save fails', async () => {
      mockInvoke.mockRejectedValue(new Error('Disk full'));

      const duplicated = await useProjectStore
        .getState()
        .duplicateCurrentCanvasFile();

      expect(duplicated).toBeNull();
      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig1-architecture.canvas.json'
      );
      expect(useProjectStore.getState().activeCanvasName).toBe(
        'Fig 1 - Architecture'
      );
      expect(useProjectStore.getState().saveStatus).toBe('error');
    });
  });

  describe('3. Switching project flushes dirty active canvas first (Issue 3)', () => {
    it('saves dirty active canvas and cancels autoSaveTimer before opening another project', async () => {
      enableTauriRuntime();
      useProjectStore.setState({
        projectDir: 'E:/Papers/ProjectA',
        projectName: 'ProjectA',
        activeCanvasFileName: 'fig1-architecture.canvas.json',
        activeCanvasName: 'Fig 1 - Architecture',
        saveStatus: 'saved',
      });

      useWorkspaceStore.getState().setTikzCode(CODE_A_EDITED);
      expect(useProjectStore.getState().saveStatus).toBe('dirty');

      const calls: Array<{ cmd: string; args: Record<string, unknown> }> = [];
      mockInvoke.mockImplementation(
        (cmd: string, args: Record<string, unknown>) => {
          calls.push({ cmd, args });
          if (cmd === 'project_save_canvas') {
            return Promise.resolve({
              fileName: 'fig1-architecture.canvas.json',
              updatedAt: 2000,
            });
          }
          if (cmd === 'project_open_workspace') {
            return Promise.resolve({
              projectDir: 'E:/Papers/ProjectB',
              projectName: 'ProjectB',
              storageDir: 'E:/Papers/ProjectB/agentikzfile',
              exportDir: 'E:/Papers/ProjectB/agentikzfile/export',
              meta: {
                lastActiveCanvas: 'fig-b.canvas.json',
                autoSyncTikz: true,
              },
              canvases: [
                {
                  fileName: 'fig-b.canvas.json',
                  name: 'Fig B',
                  updatedAt: 3000,
                  sizeBytes: 256,
                },
              ],
              assets: [],
            });
          }
          if (cmd === 'project_load_canvas') {
            return Promise.resolve(
              JSON.stringify(
                makeCanvasDoc('fig-b.canvas.json', 'Fig B', CODE_B)
              )
            );
          }
          return Promise.resolve(null);
        }
      );

      const ok = await useProjectStore
        .getState()
        .openProjectDirectory('E:/Papers/ProjectB');

      expect(ok).toBe(true);
      expect(calls[0].cmd).toBe('project_save_canvas');
      expect(calls[0].args.projectDir).toBe('E:/Papers/ProjectA');
      expect(JSON.parse(String(calls[0].args.content)).tikzCode).toBe(
        CODE_A_EDITED
      );
      expect(useProjectStore.getState().projectDir).toBe('E:/Papers/ProjectB');
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_B);

      // Advance past the 750ms autoSaveTimer window; no stale timer should fire
      const callCountAfterOpen = calls.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(calls.length).toBe(callCountAfterOpen);
    });

    it('aborts openProjectDirectory if flushing dirty canvas fails', async () => {
      enableTauriRuntime();
      useProjectStore.setState({
        projectDir: 'E:/Papers/ProjectA',
        projectName: 'ProjectA',
        activeCanvasFileName: 'fig1-architecture.canvas.json',
        activeCanvasName: 'Fig 1 - Architecture',
        saveStatus: 'saved',
      });

      useWorkspaceStore.getState().setTikzCode(CODE_A_EDITED);

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'project_save_canvas') {
          return Promise.reject(new Error('Write error'));
        }
        return Promise.resolve(null);
      });

      const ok = await useProjectStore
        .getState()
        .openProjectDirectory('E:/Papers/ProjectB');

      expect(ok).toBe(false);
      expect(useProjectStore.getState().projectDir).toBe('E:/Papers/ProjectA');
      expect(useProjectStore.getState().saveStatus).toBe('error');
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_A_EDITED);
      expect(mockInvoke).not.toHaveBeenCalledWith(
        'project_open_workspace',
        expect.anything()
      );
    });
  });

  describe('4. Unassociated (projectDir === null) mode preserves canvas content (Issue 5)', () => {
    it('preserves old canvas content when creating new canvas, switching back and forth, duplicating, renaming, and deleting', async () => {
      expect(useProjectStore.getState().projectDir).toBeNull();

      // Edit first canvas in temporary mode
      useWorkspaceStore.getState().setTikzCode(CODE_A_EDITED);

      // Create a second canvas in temporary mode
      const secondFile = await useProjectStore
        .getState()
        .createNewCanvasFile('Fig 2 - Custom');

      expect(secondFile).toBe('fig-2-custom.canvas.json');
      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig-2-custom.canvas.json'
      );
      expect(useProjectStore.getState().canvases).toHaveLength(2);

      // Edit second canvas
      useWorkspaceStore.getState().setTikzCode(CODE_B);

      // Switch back to first canvas
      await useProjectStore
        .getState()
        .switchCanvasFile('fig1-architecture.canvas.json');
      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig1-architecture.canvas.json'
      );
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_A_EDITED);

      // Switch forward to second canvas
      await useProjectStore
        .getState()
        .switchCanvasFile('fig-2-custom.canvas.json');
      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig-2-custom.canvas.json'
      );
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_B);

      // Rename second canvas in temporary mode
      const renamedOk = await useProjectStore
        .getState()
        .renameCanvasFile('fig-2-custom.canvas.json', 'Fig 2 - Renamed');
      expect(renamedOk).toBe(true);
      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig-2-renamed.canvas.json'
      );

      // Delete active second canvas in temporary mode -> switches back to first canvas
      const deletedOk = await useProjectStore
        .getState()
        .deleteCanvasFile('fig-2-renamed.canvas.json');
      expect(deletedOk).toBe(true);
      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig1-architecture.canvas.json'
      );
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_A_EDITED);
    });
  });

  describe('5. Browser localStorage quota failure in writeVirtualProject (Issue 9)', () => {
    it('sets saveStatus to error and returns false from saveActiveCanvasNow when localStorage.setItem throws', async () => {
      // Browser mode (no __TAURI_INTERNALS__)
      useProjectStore.setState({
        projectDir: 'E:/Papers/BrowserProject',
        activeCanvasFileName: 'fig1-architecture.canvas.json',
        activeCanvasName: 'Fig 1 - Architecture',
        saveStatus: 'dirty',
      });

      mockStorage.setItem.mockImplementation((key: string) => {
        if (key.startsWith('agentikz-vfs-v1:')) {
          throw new Error('QuotaExceededError');
        }
      });

      const ok = await useProjectStore.getState().saveActiveCanvasNow();

      expect(ok).toBe(false);
      expect(useProjectStore.getState().saveStatus).toBe('error');
      expect(useProjectStore.getState().errorMessage).toContain(
        'QuotaExceededError'
      );
    });
  });

  describe('6. Deleting a dirty active canvas does not re-save it (Issue 10)', () => {
    it('cancels pending auto-save and switches to remaining canvas without re-saving the deleted canvas', async () => {
      enableTauriRuntime();
      useProjectStore.setState({
        projectDir: 'E:/Papers/TestProject',
        canvases: [
          {
            fileName: 'fig1-architecture.canvas.json',
            name: 'Fig 1 - Architecture',
            updatedAt: 1000,
            sizeBytes: 512,
          },
          {
            fileName: 'fig2-ablation.canvas.json',
            name: 'Fig 2 - Ablation',
            updatedAt: 1000,
            sizeBytes: 512,
          },
        ],
        activeCanvasFileName: 'fig1-architecture.canvas.json',
        activeCanvasName: 'Fig 1 - Architecture',
        saveStatus: 'saved',
      });

      // Make active canvas dirty (starts 750ms autoSaveTimer)
      useWorkspaceStore.getState().setTikzCode(CODE_A_EDITED);
      expect(useProjectStore.getState().saveStatus).toBe('dirty');

      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'project_delete_canvas') {
          return Promise.resolve(null);
        }
        if (cmd === 'project_load_canvas') {
          return Promise.resolve(
            JSON.stringify(
              makeCanvasDoc(
                'fig2-ablation.canvas.json',
                'Fig 2 - Ablation',
                CODE_B
              )
            )
          );
        }
        return Promise.resolve(null);
      });

      const deleted = await useProjectStore
        .getState()
        .deleteCanvasFile('fig1-architecture.canvas.json');

      expect(deleted).toBe(true);
      expect(useProjectStore.getState().activeCanvasFileName).toBe(
        'fig2-ablation.canvas.json'
      );
      expect(useWorkspaceStore.getState().tikzCode).toBe(CODE_B);

      // Advance timers past 750ms to confirm autoSaveTimer was cleared
      await vi.advanceTimersByTimeAsync(1000);

      expect(mockInvoke).not.toHaveBeenCalledWith(
        'project_save_canvas',
        expect.anything()
      );
    });
  });

  describe('7. Desktop Tauri registerLocalBrowserAssetFiles persists imported files (Issue 7)', () => {
    it('calls project_import_asset for valid image files and updates assets and assetDataUrls', async () => {
      enableTauriRuntime();
      useProjectStore.setState({
        projectDir: 'E:/Papers/TestProject',
        assets: [],
        assetDataUrls: {},
      });

      mockInvoke.mockImplementation(
        (cmd: string, args: Record<string, unknown>) => {
          if (cmd === 'project_import_asset') {
            return Promise.resolve({
              relativePath: args.relativePath,
              fileName: 'sample.png',
              folder: 'figs',
              ext: 'png',
              sizeBytes: 4,
              modifiedAt: 9999,
            });
          }
          return Promise.resolve(null);
        }
      );

      const fakeFile = new File([new Uint8Array([137, 80, 78, 71])], 'sample.png', {
        type: 'image/png',
      });

      await useProjectStore
        .getState()
        .registerLocalBrowserAssetFiles([fakeFile]);

      expect(mockInvoke).toHaveBeenCalledWith(
        'project_import_asset',
        expect.objectContaining({
          projectDir: 'E:/Papers/TestProject',
          relativePath: 'figs/sample.png',
          dataUrl: expect.stringContaining('data:image/png;base64,'),
        })
      );

      const state = useProjectStore.getState();
      expect(state.assets).toHaveLength(1);
      expect(state.assets[0].relativePath).toBe('figs/sample.png');
      expect(state.assetDataUrls['figs/sample.png']).toContain(
        'data:image/png;base64,'
      );
    });

    it('sets saveStatus to error when project_import_asset fails in Tauri runtime', async () => {
      enableTauriRuntime();
      useProjectStore.setState({
        projectDir: 'E:/Papers/TestProject',
        assets: [],
        assetDataUrls: {},
        saveStatus: 'saved',
      });

      mockInvoke.mockRejectedValue(new Error('Failed to write asset to disk'));

      const fakeFile = new File([new Uint8Array([1, 2, 3])], 'broken.png', {
        type: 'image/png',
      });

      await useProjectStore
        .getState()
        .registerLocalBrowserAssetFiles([fakeFile]);

      expect(useProjectStore.getState().saveStatus).toBe('error');
      expect(useProjectStore.getState().errorMessage).toContain(
        'Failed to write asset to disk'
      );
      expect(useProjectStore.getState().assets).toHaveLength(0);
    });

    it('deduplicates concurrent ensureAssetDataUrl calls and skips PDF files', async () => {
      enableTauriRuntime();
      useProjectStore.setState({
        projectDir: 'E:/Papers/TestProject',
        assets: [],
        assetDataUrls: {},
      });

      let resolveRead!: (val: string) => void;
      const readPromise = new Promise<string>((r) => {
        resolveRead = r;
      });
      mockInvoke.mockImplementation((cmd: string) => {
        if (cmd === 'project_read_asset_data_url') {
          return readPromise;
        }
        return Promise.resolve(null);
      });

      // PDF should be skipped immediately without IPC call
      const pdfRes = await useProjectStore
        .getState()
        .ensureAssetDataUrl('figures/external/paper_fig.pdf');
      expect(pdfRes).toBeNull();
      expect(mockInvoke).not.toHaveBeenCalled();

      // Fire 3 concurrent calls for the same image
      const p1 = useProjectStore
        .getState()
        .ensureAssetDataUrl('figures/assets/ai/cutout1.png');
      const p2 = useProjectStore
        .getState()
        .ensureAssetDataUrl('figures/assets/ai/cutout1.png');
      const p3 = useProjectStore
        .getState()
        .ensureAssetDataUrl('figures/assets/ai/cutout1.png');

      resolveRead('data:image/png;base64,AAAA');
      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toBe('data:image/png;base64,AAAA');
      expect(r2).toBe('data:image/png;base64,AAAA');
      expect(r3).toBe('data:image/png;base64,AAAA');
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });
  });
});
