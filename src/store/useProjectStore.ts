import { create } from 'zustand';
import { JournalThemeId } from '../types/theme';
import { EMPTY_TIKZ_CODE } from '../core/templates/blank-document';
import {
  buildFigureLaTeXSnippet,
  buildPaperTemplateFiles,
  generateAgentikzMacrosSty,
  PAPER_VENUE_TEMPLATES,
  PaperVenueTemplateId,
} from '../core/paper/paper-templates';
import { useWorkspaceStore } from './useWorkspaceStore';
import { isEditablePaperPath, isPaperFilePath, type PaperFileChange } from '../types/project-agent';
import {
  canvasFigurePath, canInsertGraphic, defaultFigureLabel, defaultFigureSpan, ensureFigurePackages,
  escapeLatexText, findExistingFigure, hasDrawableFigure, insertFigureAtSafePosition,
  manuscriptCode, normalizeFigurePath, uniqueFigureLabel,
  type FigureInsertionOptions, type FigureInsertionResult, type FigureInsertSource, type PaperInsertionLocation,
} from '../core/paper/figure-insertion';

export const AGENTIKZ_FOLDER_NAME = 'agentikzfile';

export type WorkbenchMode = 'figure' | 'paper';
export type ProjectPickerTab = 'open' | 'create_template';

export interface PaperFileItem {
  relativePath: string;
  fileName: string;
  category: 'main' | 'section' | 'bib' | 'style' | 'figure_tikz' | 'other';
  sizeBytes: number;
  modifiedAt: number;
}

export interface CanvasFileDocument {
  schema: 1;
  id: string;
  name: string;
  fileName: string;
  createdAt: number;
  updatedAt: number;
  activeThemeId: JournalThemeId;
  zoom: number;
  pan: { x: number; y: number };
  showGrid: boolean;
  snapToGrid: boolean;
  canvasWidthCm?: number;
  canvasHeightCm?: number;
  tikzCode: string;
}

export interface CanvasFileSummary {
  fileName: string;
  name: string;
  updatedAt: number;
  sizeBytes: number;
  activeThemeId?: string;
}

export interface ProjectAssetItem {
  relativePath: string;
  fileName: string;
  folder: string;
  ext: string;
  sizeBytes: number;
  modifiedAt: number;
}

export interface RecentProjectEntry {
  path: string;
  name: string;
  lastOpenedAt: number;
  canvasCount: number;
  lastCanvasFileName?: string;
  pinned?: boolean;
}

interface PersistedProjectPrefs {
  lastProjectDir: string | null;
  autoOpenLastProject: boolean;
  autoSyncTikz: boolean;
  recentProjects: RecentProjectEntry[];
}

const PREFS_STORAGE_KEY = 'agentikz-project-prefs-v1';
const VIRTUAL_FS_PREFIX = 'agentikz-vfs-v1:';

function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

function loadPrefs(): PersistedProjectPrefs {
  if (typeof window === 'undefined') {
    return {
      lastProjectDir: null,
      autoOpenLastProject: true,
      autoSyncTikz: true,
      recentProjects: [],
    };
  }
  try {
    const raw = window.localStorage.getItem(PREFS_STORAGE_KEY);
    if (!raw) {
      return {
        lastProjectDir: null,
        autoOpenLastProject: true,
        autoSyncTikz: true,
        recentProjects: [],
      };
    }
    const parsed = JSON.parse(raw);
    return {
      lastProjectDir: parsed.lastProjectDir ?? null,
      autoOpenLastProject: parsed.autoOpenLastProject ?? true,
      autoSyncTikz: parsed.autoSyncTikz ?? true,
      recentProjects: Array.isArray(parsed.recentProjects)
        ? parsed.recentProjects
        : [],
    };
  } catch {
    return {
      lastProjectDir: null,
      autoOpenLastProject: true,
      autoSyncTikz: true,
      recentProjects: [],
    };
  }
}

function savePrefs(prefs: PersistedProjectPrefs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage quota errors
  }
}

export function slugifyCanvasFileName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\.canvas\.json$/i, '')
    .replace(/\.json$/i, '')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  const safe = base || `fig-${Date.now().toString().slice(-4)}`;
  return `${safe}.canvas.json`;
}

function extractFolderName(dirPath: string): string {
  const normalized = dirPath.replace(/\\/g, '/').replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || 'MyPaper-Project';
}

// --- Browser / Non-Tauri Virtual Folder Storage Fallback ---
interface VirtualProjectStorage {
  lastActiveCanvas?: string;
  canvases: Record<string, CanvasFileDocument>;
  assets: ProjectAssetItem[];
  assetDataUrls: Record<string, string>;
  paperFiles?: Record<string, string>;
}

function classifyPaperFileCategory(
  relPath: string
): PaperFileItem['category'] {
  const clean = relPath.replace(/\\/g, '/').toLowerCase();
  if (clean === 'main.tex' || clean === 'paper.tex' || clean === 'manuscript.tex') {
    return 'main';
  }
  if (clean.endsWith('.bib')) return 'bib';
  if (clean.endsWith('.sty') || clean.endsWith('.cls')) return 'style';
  if (clean.endsWith('.tikz')) return 'figure_tikz';
  if (clean.endsWith('.tex')) return 'section';
  return 'other';
}

function readVirtualProject(projectDir: string): VirtualProjectStorage {
  if (typeof window === 'undefined') {
    return { canvases: {}, assets: [], assetDataUrls: {}, paperFiles: {} };
  }
  try {
    const raw = window.localStorage.getItem(`${VIRTUAL_FS_PREFIX}${projectDir}`);
    if (!raw) return { canvases: {}, assets: [], assetDataUrls: {}, paperFiles: {} };
    const parsed = JSON.parse(raw);
    return {
      lastActiveCanvas: parsed.lastActiveCanvas,
      canvases: parsed.canvases || {},
      assets: parsed.assets || [],
      assetDataUrls: parsed.assetDataUrls || {},
      paperFiles: parsed.paperFiles || {},
    };
  } catch {
    return { canvases: {}, assets: [], assetDataUrls: {}, paperFiles: {} };
  }
}

function writeVirtualProject(
  projectDir: string,
  data: VirtualProjectStorage
): { ok: boolean; error?: string } {
  if (typeof window === 'undefined') {
    return { ok: false, error: 'window is undefined' };
  }
  try {
    window.localStorage.setItem(
      `${VIRTUAL_FS_PREFIX}${projectDir}`,
      JSON.stringify(data)
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

async function readFileAsDataUrl(file: File): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ''));
      reader.onerror = () =>
        reject(reader.error || new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  }
  if (typeof file.arrayBuffer === 'function') {
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const b64 = typeof btoa === 'function' ? btoa(binary) : '';
    const mime = file.type || 'image/png';
    return `data:${mime};base64,${b64}`;
  }
  return '';
}

export type SaveStatus = 'saved' | 'saving' | 'dirty' | 'local_only' | 'error';

interface ProjectState {
  initialized: boolean;
  projectDir: string | null;
  projectName: string;
  storageDir: string | null;
  exportDir: string | null;
  isPickerOpen: boolean;
  pickerTab: ProjectPickerTab;
  autoOpenLastProject: boolean;
  autoSyncTikz: boolean;
  lastProjectDir: string | null;
  recentProjects: RecentProjectEntry[];

  // One-Stop Paper + Figure Workbench Mode
  workbenchMode: WorkbenchMode;
  paperFiles: PaperFileItem[];
  activePaperFilePath: string;
  paperFileContents: Record<string, string>;
  paperDirtyFiles: Record<string, boolean>;
  paperEditRevision: number;
  lastPaperCursorOffset: number | null;
  isInsertFigureModalOpen: boolean;
  figureInsertSource: FigureInsertSource | null;
  figureInsertRequestId: string | null;
  isInsertingFigure: boolean;
  figureInsertionError: string | null;
  paperInsertionLocation: PaperInsertionLocation | null;

  canvases: CanvasFileSummary[];
  localCanvases: Record<string, CanvasFileDocument>;
  activeCanvasFileName: string;
  activeCanvasName: string;
  saveStatus: SaveStatus;
  lastSavedAt: number | null;
  lastExportedNotice: string | null;

  assets: ProjectAssetItem[];
  assetDataUrls: Record<string, string>;
  isScanningAssets: boolean;
  errorMessage: string | null;

  // Actions
  initOnStartup: () => Promise<void>;
  setPickerOpen: (open: boolean, tab?: ProjectPickerTab) => void;
  setWorkbenchMode: (mode: WorkbenchMode) => void;
  setInsertFigureModalOpen: (open: boolean, source?: FigureInsertSource) => void;
  clearPaperInsertionLocation: () => void;
  setLastPaperCursorOffset: (offset: number | null) => void;
  setAutoOpenLastProject: (autoOpen: boolean) => void;
  setAutoSyncTikz: (autoSync: boolean) => void;
  pickAndOpenDirectory: () => Promise<boolean>;
  openProjectDirectory: (dirPath: string) => Promise<boolean>;
  initPaperWorkspace: (
    dirPath: string,
    templateId: PaperVenueTemplateId,
    paperTitle?: string
  ) => Promise<boolean>;
  togglePinRecentProject: (dirPath: string) => void;
  removeRecentProject: (dirPath: string) => void;

  // Paper File Actions
  refreshPaperFiles: () => Promise<void>;
  readPaperFile: (relativePath: string) => Promise<string>;
  openPaperFile: (relativePath: string) => Promise<string>;
  applyPaperFileChanges: (projectId: string, revision: number, changes: PaperFileChange[]) => boolean;
  updatePaperFileContent: (relativePath: string, content: string) => void;
  savePaperFileNow: (relativePath?: string) => Promise<boolean>;
  saveAllDirtyPaperFiles: () => Promise<boolean>;
  createNewPaperFile: (relativePath: string, initialContent?: string) => Promise<boolean>;
  ensureAgentikzMacrosSty: () => Promise<void>;
  insertFigureIntoPaper: (opts: FigureInsertionOptions) => Promise<FigureInsertionResult>;
  quickInsertActiveFigureIntoPaper: () => Promise<FigureInsertionResult>;

  switchCanvasFile: (fileName: string) => Promise<void>;
  createNewCanvasFile: (
    name: string,
  ) => Promise<string | null>;
  duplicateCurrentCanvasFile: () => Promise<string | null>;
  renameCanvasFile: (
    oldFileName: string,
    newDisplayName: string
  ) => Promise<boolean>;
  deleteCanvasFile: (fileName: string) => Promise<boolean>;
  saveActiveCanvasNow: () => Promise<boolean>;
  markCanvasDirty: () => void;

  refreshProjectAssets: () => Promise<void>;
  ensureAssetDataUrl: (relativePath: string) => Promise<string | null>;
  registerLocalBrowserAssetFiles: (
    files: FileList | File[],
    targetFolder?: string
  ) => Promise<ProjectAssetItem[]>;
  registerGeneratedAsset: (
    relativePath: string,
    dataUrl: string,
    expectedProjectDir?: string | null
  ) => Promise<string>;
  exportFileToProject: (
    fileName: string,
    content: string,
    isBase64?: boolean
  ) => Promise<string | null>;
  revealInFileManager: (targetPath?: string) => Promise<void>;
  clearExportNotice: () => void;
}

function buildCurrentCanvasDoc(
  fileName: string,
  displayName: string,
  createdAt?: number
): CanvasFileDocument {
  const ws = useWorkspaceStore.getState();
  const now = Date.now();
  return {
    schema: 1,
    id: fileName.replace(/\.canvas\.json$/i, ''),
    name: displayName,
    fileName,
    createdAt: createdAt ?? now,
    updatedAt: now,
    activeThemeId: ws.activeThemeId,
    zoom: ws.zoom,
    pan: ws.pan,
    showGrid: ws.showGrid,
    snapToGrid: ws.snapToGrid,
    canvasWidthCm: ws.canvasWidthCm,
    canvasHeightCm: ws.canvasHeightCm,
    tikzCode: ws.tikzCode,
  };
}

let autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
const paperAutoSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const figureInsertions = new Set<number>();
const reservedAssetPaths = new Map<number, Set<string>>();
let paperWorkspaceVersion = 0;
let assetScanSequence = 0;
export function getPaperWorkspaceVersion(): number { return paperWorkspaceVersion; }
const inFlightPaperSaves = new Map<
  string,
  { content: string; promise: Promise<boolean> }
>();
let isApplyingCanvasSwitch = false;
let inFlightSavePromise: Promise<boolean> | null = null;
let inFlightSaveTarget: {
  projectDir: string | null;
  fileName: string;
  editVersion: number;
} | null = null;
let editVersion = 0;
let savedEditVersion = 0;
const failedAssetLookupCache = new Set<string>();
const inFlightAssetLookups = new Map<string, Promise<string | null>>();
const MAX_CACHED_ASSET_DATA_URLS = 40;

function setBoundedAssetDataUrl(
  current: Record<string, string>,
  key: string,
  value: string
): Record<string, string> {
  if (current[key] === value) {
    return current;
  }
  const next: Record<string, string> = { ...current, [key]: value };
  const keys = Object.keys(next);
  if (keys.length <= MAX_CACHED_ASSET_DATA_URLS) {
    return next;
  }
  const activeCanvasPaths = new Set(
    useWorkspaceStore
      .getState()
      .parsedDoc.nodes.filter((n) => n.subtype === 'image' && n.imagePath)
      .map((n) => (n.imagePath || '').replace(/\\/g, '/').trim())
  );
  for (const k of keys) {
    if (Object.keys(next).length <= MAX_CACHED_ASSET_DATA_URLS) break;
    if (k !== key && !activeCanvasPaths.has(k)) {
      delete next[k];
    }
  }
  return next;
}

export const useProjectStore = create<ProjectState>((set, get) => {
  const initialPrefs = loadPrefs();

  const persistCurrentPrefs = (patch?: Partial<PersistedProjectPrefs>) => {
    const s = get();
    const next: PersistedProjectPrefs = {
      lastProjectDir:
        patch && 'lastProjectDir' in patch
          ? (patch.lastProjectDir ?? null)
          : s.lastProjectDir,
      autoOpenLastProject:
        patch?.autoOpenLastProject ?? s.autoOpenLastProject,
      autoSyncTikz: patch?.autoSyncTikz ?? s.autoSyncTikz,
      recentProjects: patch?.recentProjects ?? s.recentProjects,
    };
    savePrefs(next);
  };

  return {
    initialized: false,
    projectDir: null,
    projectName: '未关联文件夹 (临时画布)',
    storageDir: null,
    exportDir: null,
    isPickerOpen: false,
    pickerTab: 'open',
    autoOpenLastProject: initialPrefs.autoOpenLastProject,
    autoSyncTikz: initialPrefs.autoSyncTikz,
    lastProjectDir: initialPrefs.lastProjectDir,
    recentProjects: initialPrefs.recentProjects,

    workbenchMode: 'figure',
    paperFiles: [],
    activePaperFilePath: 'main.tex',
    paperFileContents: {},
    paperDirtyFiles: {},
    paperEditRevision: 0,
    lastPaperCursorOffset: null,
    isInsertFigureModalOpen: false,
    figureInsertSource: null,
    figureInsertRequestId: null,
    isInsertingFigure: false,
    figureInsertionError: null,
    paperInsertionLocation: null,

    canvases: [
      {
        fileName: 'fig1-architecture.canvas.json',
        name: 'Fig 1 - Architecture',
        updatedAt: Date.now(),
        sizeBytes: initialPrefs.lastProjectDir ? 0 : 1024,
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

    initOnStartup: async () => {
      if (get().initialized) return;
      set({ initialized: true });
      const { autoOpenLastProject, lastProjectDir } = get();
      if (autoOpenLastProject && lastProjectDir) {
        const ok = await get().openProjectDirectory(lastProjectDir);
        if (ok) return;
      }
      // If no last project or failed to open, show the Project Picker welcome modal
      set({ isPickerOpen: true });
    },

    setPickerOpen: (isPickerOpen, pickerTab = 'open') =>
      set({ isPickerOpen, pickerTab, errorMessage: null }),

    setWorkbenchMode: (workbenchMode) => {
      set({ workbenchMode });
      if (workbenchMode !== 'figure' && get().paperFiles.length === 0) {
        void get().refreshPaperFiles();
      }
    },

    setInsertFigureModalOpen: (isInsertFigureModalOpen, source) =>
      set({ isInsertFigureModalOpen, figureInsertSource: isInsertFigureModalOpen ? source ?? null : null,
        figureInsertRequestId: isInsertFigureModalOpen ? crypto.randomUUID() : null }),
    clearPaperInsertionLocation: () => set({ paperInsertionLocation: null }),

    setLastPaperCursorOffset: (lastPaperCursorOffset) =>
      set({ lastPaperCursorOffset }),

    setAutoOpenLastProject: (autoOpenLastProject) => {
      set({ autoOpenLastProject });
      persistCurrentPrefs({ autoOpenLastProject });
    },

    setAutoSyncTikz: (autoSyncTikz) => {
      set({ autoSyncTikz });
      persistCurrentPrefs({ autoSyncTikz });
    },

    pickAndOpenDirectory: async () => {
      set({ errorMessage: null });
      if (isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const picked = await invoke<string | null>('project_pick_directory', {
            initialDir: get().projectDir || get().lastProjectDir || null,
          });
          if (!picked) return false;
          return await get().openProjectDirectory(picked);
        } catch (err) {
          set({ errorMessage: String(err) });
          return false;
        }
      } else {
        // Browser fallback: prompt or open default workspace path
        const defaultPath =
          get().lastProjectDir || 'E:/Papers/NeurIPS2027-Paper';
        const input = window.prompt(
          '当前为浏览器预览环境，请输入模拟的项目/论文文件夹路径：',
          defaultPath
        );
        if (!input || !input.trim()) return false;
        return await get().openProjectDirectory(input.trim());
      }
    },

    openProjectDirectory: async (dirPath: string) => {
      const trimmed = dirPath.trim();
      if (!trimmed) return false;

      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }

      const currentProjectDir = get().projectDir;
      const currentSaveStatus = get().saveStatus;
      if (
        currentProjectDir !== null &&
        (currentSaveStatus === 'dirty' ||
          currentSaveStatus === 'error' ||
          currentSaveStatus === 'saving')
      ) {
        const saved = await get().saveActiveCanvasNow();
        if (!saved) {
          return false;
        }
      } else if (currentProjectDir === null) {
        await get().saveActiveCanvasNow();
      }

      // Flush every edited paper file before replacing its project-scoped cache.
      if (!await get().saveAllDirtyPaperFiles()) return false;

      set({ errorMessage: null });

      if (isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const info = await invoke<{
            projectDir: string;
            projectName: string;
            storageDir: string;
            exportDir: string;
            meta: {
              lastActiveCanvas?: string | null;
              defaultThemeId?: string | null;
              autoSyncTikz: boolean;
            };
            canvases: CanvasFileSummary[];
            assets: ProjectAssetItem[];
          }>('project_open_workspace', { projectDir: trimmed });

          let canvases = info.canvases;
          let targetFile =
            info.meta.lastActiveCanvas &&
            canvases.some((c) => c.fileName === info.meta.lastActiveCanvas)
              ? info.meta.lastActiveCanvas
              : canvases[0]?.fileName;

          // If this folder has no canvas files in `agentikzfile/` yet, create the first one from current canvas
          if (!targetFile) {
            const firstFileName = 'fig1-architecture.canvas.json';
            const firstName = 'Fig 1 - Architecture';
            const firstDoc = { ...buildCurrentCanvasDoc(firstFileName, firstName), tikzCode: EMPTY_TIKZ_CODE };
            const saveRes = await invoke<{
              fileName: string;
              updatedAt: number;
            }>('project_save_canvas', {
              projectDir: info.projectDir,
              fileName: firstFileName,
              content: JSON.stringify(firstDoc, null, 2),
              syncTikz: get().autoSyncTikz ? firstDoc.tikzCode : null,
            });
            targetFile = saveRes.fileName;
            isApplyingCanvasSwitch = true;
            try {
              useWorkspaceStore.getState().applyCanvasDocumentState(firstDoc);
            } finally {
              isApplyingCanvasSwitch = false;
            }
            canvases = [
              {
                fileName: saveRes.fileName,
                name: firstName,
                updatedAt: saveRes.updatedAt,
                sizeBytes: JSON.stringify(firstDoc).length,
                activeThemeId: firstDoc.activeThemeId,
              },
            ];
          } else {
            // Load the target canvas file into workspace store
            const rawJson = await invoke<string>('project_load_canvas', {
              projectDir: info.projectDir,
              fileName: targetFile,
            });
            try {
              const parsedDoc = JSON.parse(rawJson) as CanvasFileDocument;
              isApplyingCanvasSwitch = true;
              useWorkspaceStore.getState().applyCanvasDocumentState({
                tikzCode: parsedDoc.tikzCode,
                activeThemeId: parsedDoc.activeThemeId,
                zoom: parsedDoc.zoom,
                pan: parsedDoc.pan,
                showGrid: parsedDoc.showGrid,
                snapToGrid: parsedDoc.snapToGrid,
                canvasWidthCm: parsedDoc.canvasWidthCm,
                canvasHeightCm: parsedDoc.canvasHeightCm,
              });
            } finally {
              isApplyingCanvasSwitch = false;
            }
          }

          const activeSummary =
            canvases.find((c) => c.fileName === targetFile) || canvases[0];

          const existingRecents = get().recentProjects;
          const prevEntry = existingRecents.find(
            (r) => r.path.toLowerCase() === info.projectDir.toLowerCase()
          );
          const nextEntry: RecentProjectEntry = {
            path: info.projectDir,
            name: info.projectName,
            lastOpenedAt: Date.now(),
            canvasCount: canvases.length,
            lastCanvasFileName: targetFile,
            pinned: prevEntry?.pinned ?? false,
          };
          const nextRecents = [
            nextEntry,
            ...existingRecents.filter(
              (r) => r.path.toLowerCase() !== info.projectDir.toLowerCase()
            ),
          ].slice(0, 15);

          savedEditVersion = editVersion;
          failedAssetLookupCache.clear();
          inFlightAssetLookups.clear();
          set({
            projectDir: info.projectDir,
            projectName: info.projectName,
            storageDir: info.storageDir,
            exportDir: info.exportDir,
            canvases,
            activeCanvasFileName: targetFile,
            activeCanvasName: activeSummary?.name || 'Fig 1',
            assets: info.assets,
            assetDataUrls: {},
            saveStatus: 'saved',
            lastSavedAt: Date.now(),
            lastProjectDir: info.projectDir,
            recentProjects: nextRecents,
            errorMessage: null,
          });

          persistCurrentPrefs({
            lastProjectDir: info.projectDir,
            recentProjects: nextRecents,
          });

          // Preload data URLs for any image nodes already on the canvas
          const imageNodes = useWorkspaceStore
            .getState()
            .parsedDoc.nodes.filter((n) => n.subtype === 'image' && n.imagePath);
          for (const n of imageNodes) {
            if (n.imagePath) {
              void get().ensureAssetDataUrl(n.imagePath);
            }
          }

          await get().refreshPaperFiles();
          get().setWorkbenchMode(
            get().paperFiles.some((f) => f.category === 'main' || f.category === 'section')
              ? 'paper' : 'figure'
          );
          set({ isPickerOpen: false });
          return true;
        } catch (err) {
          set({ errorMessage: String(err) });
          return false;
        }
      }

      // Browser / Virtual FS Fallback
      const cleanDir = trimmed.replace(/\\/g, '/').replace(/\/+$/, '');
      const projName = extractFolderName(cleanDir);
      const vfs = readVirtualProject(cleanDir);

      let canvasKeys = Object.keys(vfs.canvases);
      if (canvasKeys.length === 0) {
        const firstFile = 'fig1-architecture.canvas.json';
        const firstDoc = buildCurrentCanvasDoc(
          firstFile,
          'Fig 1 - Architecture'
        );
        firstDoc.tikzCode = EMPTY_TIKZ_CODE;
        vfs.canvases[firstFile] = firstDoc;
        vfs.lastActiveCanvas = firstFile;
        const writeRes = writeVirtualProject(cleanDir, vfs);
        if (!writeRes.ok) {
          set({
            saveStatus: 'error',
            errorMessage: `浏览器本地存储空间不足或不可用: ${writeRes.error}`,
          });
          return false;
        }
        canvasKeys = [firstFile];
      }

      const targetFile =
        vfs.lastActiveCanvas && vfs.canvases[vfs.lastActiveCanvas]
          ? vfs.lastActiveCanvas
          : canvasKeys[0];
      const targetDoc = vfs.canvases[targetFile];

      if (targetDoc) {
        isApplyingCanvasSwitch = true;
        try {
          useWorkspaceStore.getState().applyCanvasDocumentState({
            tikzCode: targetDoc.tikzCode,
            activeThemeId: targetDoc.activeThemeId,
            zoom: targetDoc.zoom,
            pan: targetDoc.pan,
            showGrid: targetDoc.showGrid,
            snapToGrid: targetDoc.snapToGrid,
            canvasWidthCm: targetDoc.canvasWidthCm,
            canvasHeightCm: targetDoc.canvasHeightCm,
          });
        } finally {
          isApplyingCanvasSwitch = false;
        }
      }

      const summaries: CanvasFileSummary[] = Object.values(vfs.canvases)
        .map((c) => ({
          fileName: c.fileName,
          name: c.name,
          updatedAt: c.updatedAt,
          sizeBytes: JSON.stringify(c).length,
          activeThemeId: c.activeThemeId,
        }))
        .sort((a, b) => a.fileName.localeCompare(b.fileName));

      const existingRecents = get().recentProjects;
      const prevEntry = existingRecents.find(
        (r) => r.path.toLowerCase() === cleanDir.toLowerCase()
      );
      const nextEntry: RecentProjectEntry = {
        path: cleanDir,
        name: projName,
        lastOpenedAt: Date.now(),
        canvasCount: summaries.length,
        lastCanvasFileName: targetFile,
        pinned: prevEntry?.pinned ?? false,
      };
      const nextRecents = [
        nextEntry,
        ...existingRecents.filter(
          (r) => r.path.toLowerCase() !== cleanDir.toLowerCase()
        ),
      ].slice(0, 15);

      savedEditVersion = editVersion;
      set({
        projectDir: cleanDir,
        projectName: projName,
        storageDir: `${cleanDir}/${AGENTIKZ_FOLDER_NAME}`,
        exportDir: `${cleanDir}/${AGENTIKZ_FOLDER_NAME}/export`,
        canvases: summaries,
        activeCanvasFileName: targetFile,
        activeCanvasName: targetDoc?.name || 'Fig 1 - Architecture',
        assets: vfs.assets,
        assetDataUrls: vfs.assetDataUrls || {},
        saveStatus: 'saved',
        lastSavedAt: Date.now(),
        lastProjectDir: cleanDir,
        recentProjects: nextRecents,
        errorMessage: null,
      });

      persistCurrentPrefs({
        lastProjectDir: cleanDir,
        recentProjects: nextRecents,
      });

      await get().refreshPaperFiles();
      get().setWorkbenchMode(
        get().paperFiles.some((f) => f.category === 'main' || f.category === 'section')
          ? 'paper' : 'figure'
      );
      set({ isPickerOpen: false });
      return true;
    },

    initPaperWorkspace: async (dirPath, templateId, paperTitle) => {
      const trimmed = dirPath.trim();
      if (!trimmed) return false;
      const tpl =
        PAPER_VENUE_TEMPLATES.find((t) => t.id === templateId) ||
        PAPER_VENUE_TEMPLATES[0];
      const filesMap = buildPaperTemplateFiles(
        tpl.id,
        paperTitle?.trim() || 'Title of Your Scientific Paper'
      );

      if (isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('project_init_paper_workspace', {
            projectDir: trimmed,
            files: filesMap,
          });
        } catch (err) {
          set({ errorMessage: String(err) });
          return false;
        }
      } else {
        const cleanDir = trimmed.replace(/\\/g, '/').replace(/\/+$/, '');
        const vfs = readVirtualProject(cleanDir);
        // Match native initialization: never overwrite an existing manuscript.
        vfs.paperFiles = { ...filesMap, ...(vfs.paperFiles || {}) };
        const result = writeVirtualProject(cleanDir, vfs);
        if (!result.ok) {
          set({ errorMessage: `论文创建失败: ${result.error}` });
          return false;
        }
      }

      const opened = await get().openProjectDirectory(trimmed);
      if (opened) {
        await get().refreshPaperFiles();
        await get().openPaperFile('main.tex');
        get().setWorkbenchMode('paper');
      }
      return opened;
    },

    refreshPaperFiles: async () => {
      const { projectDir } = get();
      const workspaceVersion = paperWorkspaceVersion;
      if (!projectDir) {
        return;
      }

      if (isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const list = await invoke<PaperFileItem[]>(
            'project_list_paper_files',
            { projectDir }
          );
          if (workspaceVersion !== paperWorkspaceVersion) return;
          set({ paperFiles: list });
          if (list.length > 0) {
            const curActive = get().activePaperFilePath;
            const target = list.some((f) => f.relativePath === curActive)
              ? curActive
              : list.find((f) => f.category === 'main')?.relativePath ||
                list[0].relativePath;
            await get().openPaperFile(target);
          }
          return;
        } catch (err) {
          // A failed native read must not create a simulated project over it.
          if (workspaceVersion === paperWorkspaceVersion) {
            set({ errorMessage: String(err) });
          }
          return;
        }
      }

      const vfs = readVirtualProject(projectDir);
      const paperMap = vfs.paperFiles || {};
      const items: PaperFileItem[] = Object.entries(paperMap).map(
        ([relPath, content]) => ({
          relativePath: relPath,
          fileName: relPath.split('/').pop() || relPath,
          category: classifyPaperFileCategory(relPath),
          sizeBytes: content.length,
          modifiedAt: Date.now(),
        })
      );
      set({
        paperFiles: items,
        paperFileContents: { ...paperMap, ...get().paperFileContents },
      });
    },

    readPaperFile: async (relativePath) => {
      if (!isPaperFilePath(relativePath) ||
          !get().paperFiles.some((file) => file.relativePath === relativePath)) {
        throw new Error('只能读取当前项目文件列表中的论文文件。');
      }
      const state = get();
      if (Object.hasOwn(state.paperFileContents, relativePath)) return state.paperFileContents[relativePath];
      const { projectDir } = state;
      if (!projectDir) throw new Error('请先打开论文项目。');
      const version = paperWorkspaceVersion;
      let content: string;
      if (isTauriRuntime()) {
        const { invoke } = await import('@tauri-apps/api/core');
        content = await invoke<string>('project_read_text_file', { projectDir, relativePath });
      } else {
        const files = readVirtualProject(projectDir).paperFiles || {};
        if (!Object.hasOwn(files, relativePath)) throw new Error('论文文件不存在。');
        content = files[relativePath];
      }
      if (version !== paperWorkspaceVersion || get().projectDir !== projectDir) {
        throw new Error('读取期间项目已切换。');
      }
      // Never replace a newer editor buffer or navigate the user's editor from a tool.
      if (Object.hasOwn(get().paperFileContents, relativePath)) return get().paperFileContents[relativePath];
      set((s) => ({ paperFileContents: { ...s.paperFileContents, [relativePath]: content } }));
      return content;
    },

    applyPaperFileChanges: (projectId, revision, changes) => {
      const state = get();
      if ((state.projectDir || 'temporary') !== projectId || state.paperEditRevision !== revision ||
          changes.length === 0 || changes.length > 20 ||
          new Set(changes.map((change) => change.relativePath)).size !== changes.length ||
          changes.some((change) => !isEditablePaperPath(change.relativePath) ||
            !state.paperFiles.some((file) => file.relativePath === change.relativePath) ||
            state.paperFileContents[change.relativePath] !== change.before)) return false;
      const version = paperWorkspaceVersion;
      const contents = { ...state.paperFileContents };
      const dirty = { ...state.paperDirtyFiles };
      for (const change of changes) {
        contents[change.relativePath] = change.after;
        dirty[change.relativePath] = true;
      }
      // Validate the entire set first and publish it in one update, never a partial edit.
      set({ paperFileContents: contents, paperDirtyFiles: dirty, paperEditRevision: revision + 1 });
      for (const { relativePath } of changes) {
        clearTimeout(paperAutoSaveTimers[relativePath]);
        paperAutoSaveTimers[relativePath] = setTimeout(() => {
          delete paperAutoSaveTimers[relativePath];
          if (version === paperWorkspaceVersion) void get().savePaperFileNow(relativePath);
        }, 500);
      }
      return true;
    },

    openPaperFile: async (relativePath) => {
      const cleanRel = relativePath.replace(/\\/g, '/').trim();
      if (!cleanRel) return '';
      set({ activePaperFilePath: cleanRel });

      const cached = get().paperFileContents[cleanRel];
      if (typeof cached === 'string') {
        return cached;
      }

      const { projectDir } = get();
      const workspaceVersion = paperWorkspaceVersion;
      if (projectDir && isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const content = await invoke<string>('project_read_text_file', {
            projectDir,
            relativePath: cleanRel,
          });
          if (workspaceVersion !== paperWorkspaceVersion) return '';
          // Typing may have started before the disk read completed.
          const currentContent = get().paperFileContents[cleanRel];
          if (typeof currentContent === 'string') return currentContent;
          set((s) => ({
            paperFileContents: { ...s.paperFileContents, [cleanRel]: content },
          }));
          return content;
        } catch {
          return '';
        }
      }

      if (projectDir) {
        const vfs = readVirtualProject(projectDir);
        const content = vfs.paperFiles?.[cleanRel] || '';
        set((s) => ({
          paperFileContents: { ...s.paperFileContents, [cleanRel]: content },
        }));
        return content;
      }
      return '';
    },

    updatePaperFileContent: (relativePath, content) => {
      const cleanRel = relativePath.replace(/\\/g, '/').trim();
      if (!cleanRel || get().paperFileContents[cleanRel] === content) return;
      const workspaceVersion = paperWorkspaceVersion;
      set((s) => ({
        paperFileContents: { ...s.paperFileContents, [cleanRel]: content },
        paperDirtyFiles: { ...s.paperDirtyFiles, [cleanRel]: true },
        paperEditRevision: s.paperEditRevision + 1,
      }));
      if (paperAutoSaveTimers[cleanRel]) {
        clearTimeout(paperAutoSaveTimers[cleanRel]);
      }
      paperAutoSaveTimers[cleanRel] = setTimeout(() => {
        delete paperAutoSaveTimers[cleanRel];
        if (workspaceVersion === paperWorkspaceVersion) {
          void get().savePaperFileNow(cleanRel);
        }
      }, 500);
    },

    savePaperFileNow: async (relativePath) => {
      const targetRel = (
        relativePath || get().activePaperFilePath || 'main.tex'
      )
        .replace(/\\/g, '/')
        .trim();
      if (paperAutoSaveTimers[targetRel]) {
        clearTimeout(paperAutoSaveTimers[targetRel]);
        delete paperAutoSaveTimers[targetRel];
      }
      const { projectDir } = get();
      const workspaceVersion = paperWorkspaceVersion;
      const saveKey = JSON.stringify([workspaceVersion, projectDir, targetRel]);
      // Serialize writes for a file, but allow different files to save in parallel.
      // A waiting save takes a fresh snapshot after the previous write completes.
      while (inFlightPaperSaves.has(saveKey)) {
        const pending = inFlightPaperSaves.get(saveKey)!;
        const sameContent = get().paperFileContents[targetRel] === pending.content;
        const ok = await pending.promise;
        if (workspaceVersion !== paperWorkspaceVersion) return false;
        if (sameContent && get().paperFileContents[targetRel] === pending.content) {
          return ok;
        }
      }
      if (workspaceVersion !== paperWorkspaceVersion) return false;
      const content = get().paperFileContents[targetRel];
      if (typeof content !== 'string') return false;

      const runSave = (async (): Promise<boolean> => {
        try {
          if (projectDir && isTauriRuntime()) {
            const { invoke } = await import('@tauri-apps/api/core');
            const written = await invoke<boolean | void>('project_write_text_file', {
              projectDir,
              relativePath: targetRel,
              content,
            });
            if (written === false) throw new Error(`保存失败：${targetRel}`);
          } else if (projectDir) {
            const vfs = readVirtualProject(projectDir);
            vfs.paperFiles = { ...(vfs.paperFiles || {}), [targetRel]: content };
            const result = writeVirtualProject(projectDir, vfs);
            if (!result.ok) throw new Error(result.error);
          }
          if (
            workspaceVersion === paperWorkspaceVersion &&
            get().paperFileContents[targetRel] === content
          ) {
            set((s) => ({
              paperDirtyFiles: { ...s.paperDirtyFiles, [targetRel]: false },
            }));
          }
          return true;
        } catch (err) {
          if (workspaceVersion === paperWorkspaceVersion) {
            set({ errorMessage: String(err) });
          }
          return false;
        }
      })();
      inFlightPaperSaves.set(saveKey, { content, promise: runSave });
      try {
        return await runSave;
      } finally {
        if (inFlightPaperSaves.get(saveKey)?.promise === runSave) {
          inFlightPaperSaves.delete(saveKey);
        }
      }
    },

    saveAllDirtyPaperFiles: async () => {
      const workspaceVersion = paperWorkspaceVersion;
      while (workspaceVersion === paperWorkspaceVersion) {
        const paths = Object.keys(get().paperDirtyFiles).filter(
          (path) => get().paperDirtyFiles[path]
        );
        if (paths.length === 0) return true;
        const results = await Promise.all(
          paths.map((path) => get().savePaperFileNow(path))
        );
        if (results.some((ok) => !ok)) return false;
        // Edits made while writing must be drained before switching or compiling.
      }
      return false;
    },

    createNewPaperFile: async (relativePath, initialContent = '') => {
      const cleanRel = relativePath.replace(/\\/g, '/').trim();
      if (!cleanRel) return false;
      get().updatePaperFileContent(cleanRel, initialContent);
      const ok = await get().savePaperFileNow(cleanRel);
      await get().refreshPaperFiles();
      set({ activePaperFilePath: cleanRel });
      return ok;
    },

    ensureAgentikzMacrosSty: async () => {
      const styContent = generateAgentikzMacrosSty();
      const styPath = 'styles/agentikz-macros.sty';
      if (
        get().paperFileContents[styPath] === styContent &&
        !get().paperDirtyFiles[styPath]
      ) return;
      if (get().paperDirtyFiles[styPath] && get().paperFileContents[styPath] !== styContent) {
        throw new Error('宏包存在未保存的手动修改，请先保存或撤销，避免被同步覆盖。');
      }
      get().updatePaperFileContent(styPath, styContent);
      if (!await get().savePaperFileNow(styPath)) throw new Error('TikZ 宏包保存失败，已停止插入。');
    },

    insertFigureIntoPaper: async (opts) => {
      const origin = get();
      const version = paperWorkspaceVersion;
      const targetFile = (opts.targetTexFile || origin.activePaperFilePath || 'main.tex').replace(/\\/g, '/').trim();
      if (figureInsertions.has(version)) return { ok: false, snippet: '', targetFile, error: '配图正在插入，请勿重复点击。' };
      figureInsertions.add(version);
      set({ isInsertingFigure: true, figureInsertionError: null, lastExportedNotice: null });
      const checkProject = () => {
        if (paperWorkspaceVersion !== version || get().projectDir !== origin.projectDir) {
          throw new Error('插入期间项目已切换，已停止后续操作。');
        }
      };
      try {
        if (!origin.projectDir) throw new Error('请先打开或新建论文项目，再插入配图。');
        const path = normalizeFigurePath(opts.relativePath || opts.figureRelPath || '');
        const normalized = { ...opts, relativePath: path, label: opts.label || defaultFigureLabel(path) };
        buildFigureLaTeXSnippet(normalized); // Validate before any writes.
        const texFiles = origin.paperFiles.filter((file) =>
          /\.tex$/i.test(file.relativePath) && isPaperFilePath(file.relativePath) && !file.relativePath.startsWith('agentikzfile/'));
        if (!isPaperFilePath(targetFile) || !texFiles.some((file) => file.relativePath === targetFile)) {
          throw new Error('目标章节不存在；请先新建论文或选择当前项目中的 .tex 文件。');
        }
        await Promise.all(texFiles.map((file) => get().readPaperFile(file.relativePath)));
        checkProject();
        const candidates = texFiles.filter((file) => {
          const code = manuscriptCode(get().paperFileContents[file.relativePath] || '');
          return /\\documentclass\b/.test(code) && /\\begin\s*\{document\}/.test(code);
        });
        const entry = candidates.find((file) => file.relativePath === 'main.tex')
          || candidates.find((file) => file.category === 'main') || candidates[0];
        if (!entry) throw new Error('未找到完整论文主文件；不会用整篇模板替换空章节。');
        ensureFigurePackages(get().paperFileContents[entry.relativePath], opts.mode);

        if (opts.mode === 'external_graphic') {
          if (!origin.assets.some((asset) => asset.relativePath === path) || !canInsertGraphic(path)) {
            throw new Error('请先导入或刷新图片素材，再选择实际存在的 PDF、PNG 或 JPEG 文件。');
          }
          if (isTauriRuntime()) {
            const { invoke } = await import('@tauri-apps/api/core');
            if (!await invoke<boolean>('project_check_figure_asset', { projectDir: origin.projectDir, relativePath: path })) {
              throw new Error('配图文件无法确认存在，请刷新素材或重新导入。');
            }
            checkProject();
          } else if (!get().assetDataUrls[path] && !readVirtualProject(origin.projectDir).assetDataUrls[path]) {
            throw new Error('浏览器项目中缺少这张图片的数据，请重新导入。');
          }
        } else {
          const currentPath = origin.activeCanvasFileName ? canvasFigurePath(origin.activeCanvasFileName) : '';
          const fromCurrent = path === currentPath;
          let source: string;
          if (fromCurrent) {
            source = useWorkspaceStore.getState().tikzCode;
          } else if (origin.paperFiles.some((file) => file.relativePath === path)) {
            source = await get().readPaperFile(path);
          } else {
            const canvas = origin.canvases.find((item) => canvasFigurePath(item.fileName) === path);
            if (!canvas) throw new Error('所选图源不存在，请保存画布或刷新项目文件。');
            if (isTauriRuntime()) {
              const { invoke } = await import('@tauri-apps/api/core');
              const raw = await invoke<string>('project_load_canvas', { projectDir: origin.projectDir, fileName: canvas.fileName });
              const document = JSON.parse(raw) as CanvasFileDocument;
              if (typeof document.tikzCode !== 'string') throw new Error('画布文件没有有效图源。');
              source = document.tikzCode;
            } else {
              const document = readVirtualProject(origin.projectDir).canvases[canvas.fileName];
              if (!document) throw new Error('所选画布文件不存在。');
              source = document.tikzCode;
            }
          }
          checkProject();
          if (!hasDrawableFigure(source)) throw new Error('所选画布为空，不能插入空白配图。');
          if (/\\documentclass\b/.test(manuscriptCode(source))) {
            throw new Error('完整 LaTeX 文档不能作为 TikZ 代码包嵌入，请改用独立 tikzpicture 或导出 PDF。');
          }
          if (/\\includegraphics\s*(?:\[[^\]]*\]\s*)?\{[^{}]*\.(?:svg|webp)\s*\}/i.test(manuscriptCode(source))) {
            throw new Error('图源含 SVG/WebP 图片，请先转换为 PDF、PNG 或 JPEG，避免论文编译失败。');
          }
          if (get().paperDirtyFiles[path] && get().paperFileContents[path] !== source) {
            throw new Error('图源文件有未保存的手工修改，请先处理，避免被画布覆盖。');
          }
          if (fromCurrent) {
            if (!await get().saveActiveCanvasNow()) throw new Error('画布保存失败，已停止插入。');
            checkProject();
            if (get().activeCanvasFileName !== origin.activeCanvasFileName || useWorkspaceStore.getState().tikzCode !== source) {
              throw new Error('保存期间画布已变化，请重新插入。');
            }
          }
          get().updatePaperFileContent(path, source);
          if (!await get().savePaperFileNow(path)) throw new Error('TikZ 图源保存失败，已停止插入。');
          checkProject();
          await get().ensureAgentikzMacrosSty();
          checkProject();
        }

        const live = get();
        const currentTex = live.paperFileContents[targetFile];
        const mainTex = live.paperFileContents[entry.relativePath];
        const existing = opts.allowDuplicate ? undefined : findExistingFigure(currentTex, path, opts.mode);
        const label = existing ? existing.label || normalized.label
          : uniqueFigureLabel(normalized.label, texFiles.map((file) => live.paperFileContents[file.relativePath]));
        const snippet = existing?.snippet || buildFigureLaTeXSnippet({ ...normalized, label });
        const cursor = opts.insertAtCursor !== false && origin.activePaperFilePath === targetFile &&
          live.activePaperFilePath === targetFile ? live.lastPaperCursorOffset : null;
        const inserted = existing ? { text: currentTex, offset: existing.offset } : insertFigureAtSafePosition(currentTex, snippet, cursor);
        const changes: PaperFileChange[] = [];
        if (entry.relativePath === targetFile) {
          const after = ensureFigurePackages(inserted.text, opts.mode);
          if (after !== currentTex) changes.push({ relativePath: targetFile, before: currentTex, after });
        } else {
          const afterMain = ensureFigurePackages(mainTex, opts.mode);
          if (inserted.text !== currentTex) changes.push({ relativePath: targetFile, before: currentTex, after: inserted.text });
          if (afterMain !== mainTex) changes.push({ relativePath: entry.relativePath, before: mainTex, after: afterMain });
        }
        if (changes.length && !live.applyPaperFileChanges(origin.projectDir, live.paperEditRevision, changes)) {
          throw new Error('论文版本或目标文件已变化，请重新插入。');
        }
        const expectedTarget = get().paperFileContents[targetFile];
        for (const file of new Set([entry.relativePath, targetFile])) {
          if (!await get().savePaperFileNow(file)) throw new Error('论文保存失败，修改已保留在编辑器中，请重试保存；不会提示插入成功。');
          checkProject();
        }
        if (get().paperFileContents[targetFile] !== expectedTarget) throw new Error('保存期间章节又有编辑，请检查插入结果后重试。');
        await get().refreshPaperFiles();
        checkProject();
        const offset = existing
          ? findExistingFigure(get().paperFileContents[targetFile], path, opts.mode)?.offset ?? inserted.offset
          : get().paperFileContents[targetFile].indexOf(snippet);
        const notice = existing ? `配图已在 ${targetFile}，未重复插入` : `已将配图插入至 ${targetFile}`;
        set({
          activePaperFilePath: targetFile, lastExportedNotice: notice, errorMessage: null,
          paperInsertionLocation: { id: crypto.randomUUID(), projectId: origin.projectDir, path: targetFile, offset: Math.max(0, offset) },
        });
        setTimeout(() => {
          if (paperWorkspaceVersion === version && get().lastExportedNotice === notice) set({ lastExportedNotice: null });
        }, 4000);
        return { ok: true, snippet, targetFile, alreadyPresent: Boolean(existing), label };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (paperWorkspaceVersion === version) set({ figureInsertionError: message, errorMessage: message });
        return { ok: false, snippet: '', targetFile, error: message };
      } finally {
        figureInsertions.delete(version);
        if (paperWorkspaceVersion === version) set({ isInsertingFigure: false });
      }
    },

    quickInsertActiveFigureIntoPaper: async () => {
      const ws = useWorkspaceStore.getState();
      const s = get();
      const version = paperWorkspaceVersion;
      const texFiles = s.paperFiles.filter((file) => /\.tex$/i.test(file.relativePath) &&
        !file.relativePath.startsWith('agentikzfile/'));
      if (!s.projectDir || !texFiles.length) {
        const error = '请先打开或新建论文项目，再插入当前配图。';
        set({ figureInsertionError: error });
        return { ok: false, snippet: '', targetFile: '', error };
      }
      if (!hasDrawableFigure(ws.tikzCode)) {
        const error = '当前画布为空，请先绘图或选择已有图片。';
        set({ figureInsertionError: error });
        return { ok: false, snippet: '', targetFile: s.activePaperFilePath, error };
      }
      let path: string;
      try { path = canvasFigurePath(s.activeCanvasFileName); }
      catch (error) {
        const message = String(error instanceof Error ? error.message : error);
        set({ figureInsertionError: message });
        return { ok: false, snippet: '', targetFile: s.activePaperFilePath, error: message };
      }
      const entryFile = texFiles.find((file) => file.relativePath === 'main.tex')
        || texFiles.find((file) => file.category === 'main') || texFiles[0];
      const targetTex = texFiles.some((file) => file.relativePath === s.activePaperFilePath)
        ? s.activePaperFilePath : entryFile.relativePath;
      const contractClaim = ws.parsedDoc.contract?.claim;
      const caption =
        ws.parsedDoc.figureCaption ||
        contractClaim ||
        escapeLatexText(s.activeCanvasName || s.activeCanvasFileName.replace(/\.canvas\.json$/i, ''));
      const label =
        ws.parsedDoc.figureLabel ||
        defaultFigureLabel(path);
      const entry = s.paperFileContents[entryFile.relativePath] || Object.values(s.paperFileContents).find((source) => /\\documentclass\b/.test(manuscriptCode(source))) || '';
      const columnSpan = defaultFigureSpan(entry, ws.canvasWidthCm);

      const res = await get().insertFigureIntoPaper({
        mode: 'tikz_package',
        figureRelPath: path,
        caption,
        label,
        columnSpan,
        widthRatio: 0.98,
        placement: 't',
        targetTexFile: targetTex,
        insertAtCursor: true,
      });

      if (res.ok && paperWorkspaceVersion === version) {
        get().setWorkbenchMode('paper');
      }
      return res;
    },

    togglePinRecentProject: (dirPath) => {
      const nextRecents = get().recentProjects.map((r) =>
        r.path === dirPath ? { ...r, pinned: !r.pinned } : r
      );
      set({ recentProjects: nextRecents });
      persistCurrentPrefs({ recentProjects: nextRecents });
    },

    removeRecentProject: (dirPath) => {
      const nextRecents = get().recentProjects.filter(
        (r) => r.path !== dirPath
      );
      const nextLast =
        get().lastProjectDir === dirPath
          ? (nextRecents[0]?.path ?? null)
          : get().lastProjectDir;
      set({ recentProjects: nextRecents, lastProjectDir: nextLast });
      persistCurrentPrefs({
        recentProjects: nextRecents,
        lastProjectDir: nextLast,
      });
    },

    switchCanvasFile: async (fileName) => {
      const { projectDir, activeCanvasFileName, saveStatus } = get();
      if (fileName === activeCanvasFileName) return;

      // Flush pending changes on current canvas before switching
      if (
        projectDir &&
        (saveStatus === 'dirty' ||
          saveStatus === 'error' ||
          saveStatus === 'saving')
      ) {
        const ok = await get().saveActiveCanvasNow();
        if (!ok) return;
      }

      if (!projectDir) {
        if (
          get().canvases.some((c) => c.fileName === get().activeCanvasFileName)
        ) {
          await get().saveActiveCanvasNow();
        }
        const localDoc = get().localCanvases[fileName];
        if (!localDoc) return;

        isApplyingCanvasSwitch = true;
        try {
          useWorkspaceStore.getState().applyCanvasDocumentState({
            tikzCode: localDoc.tikzCode,
            activeThemeId: localDoc.activeThemeId,
            zoom: localDoc.zoom,
            pan: localDoc.pan,
            showGrid: localDoc.showGrid,
            snapToGrid: localDoc.snapToGrid,
            canvasWidthCm: localDoc.canvasWidthCm,
            canvasHeightCm: localDoc.canvasHeightCm,
          });
        } finally {
          isApplyingCanvasSwitch = false;
        }

        savedEditVersion = editVersion;
        set({
          activeCanvasFileName: fileName,
          activeCanvasName:
            localDoc.name || fileName.replace(/\.canvas\.json$/i, ''),
          saveStatus: 'local_only',
          lastSavedAt: localDoc.updatedAt,
        });
        return;
      }

      const currentProjectDir = get().projectDir;
      if (!currentProjectDir) return;

      if (isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const raw = await invoke<string>('project_load_canvas', {
            projectDir: currentProjectDir,
            fileName,
          });
          const parsed = JSON.parse(raw) as CanvasFileDocument;
          isApplyingCanvasSwitch = true;
          try {
            useWorkspaceStore.getState().applyCanvasDocumentState({
              tikzCode: parsed.tikzCode,
              activeThemeId: parsed.activeThemeId,
              zoom: parsed.zoom,
              pan: parsed.pan,
              showGrid: parsed.showGrid,
              snapToGrid: parsed.snapToGrid,
              canvasWidthCm: parsed.canvasWidthCm,
              canvasHeightCm: parsed.canvasHeightCm,
            });
          } finally {
            isApplyingCanvasSwitch = false;
          }
          savedEditVersion = editVersion;
          set({
            activeCanvasFileName: fileName,
            activeCanvasName:
              parsed.name || fileName.replace(/\.canvas\.json$/i, ''),
            saveStatus: 'saved',
            lastSavedAt: parsed.updatedAt || Date.now(),
          });

          // Ensure data URLs for any image nodes in the switched canvas
          const imageNodes = useWorkspaceStore
            .getState()
            .parsedDoc.nodes.filter((n) => n.subtype === 'image' && n.imagePath);
          for (const n of imageNodes) {
            if (n.imagePath) {
              void get().ensureAssetDataUrl(n.imagePath);
            }
          }
        } catch (err) {
          set({ errorMessage: String(err) });
        }
        return;
      }

      // Virtual FS fallback
      const vfs = readVirtualProject(currentProjectDir);
      const doc = vfs.canvases[fileName];
      if (!doc) return;
      vfs.lastActiveCanvas = fileName;
      writeVirtualProject(currentProjectDir, vfs);

      isApplyingCanvasSwitch = true;
      try {
        useWorkspaceStore.getState().applyCanvasDocumentState({
          tikzCode: doc.tikzCode,
          activeThemeId: doc.activeThemeId,
          zoom: doc.zoom,
          pan: doc.pan,
          showGrid: doc.showGrid,
          snapToGrid: doc.snapToGrid,
          canvasWidthCm: doc.canvasWidthCm,
          canvasHeightCm: doc.canvasHeightCm,
        });
      } finally {
        isApplyingCanvasSwitch = false;
      }

      savedEditVersion = editVersion;
      set({
        activeCanvasFileName: fileName,
        activeCanvasName: doc.name,
        saveStatus: 'saved',
        lastSavedAt: doc.updatedAt,
      });
    },

    createNewCanvasFile: async (name) => {
      const { projectDir, saveStatus } = get();
      if (
        projectDir &&
        (saveStatus === 'dirty' ||
          saveStatus === 'error' ||
          saveStatus === 'saving')
      ) {
        const ok = await get().saveActiveCanvasNow();
        if (!ok) return null;
      } else if (!projectDir) {
        await get().saveActiveCanvasNow();
      }

      const currentCanvases = get().canvases;
      const prevFileName = get().activeCanvasFileName;
      const prevName = get().activeCanvasName;
      const prevDoc = buildCurrentCanvasDoc(prevFileName, prevName);

      const displayName =
        name.trim() || `Fig ${currentCanvases.length + 1} - New Canvas`;
      let candidateFile = slugifyCanvasFileName(displayName);
      let counter = 2;
      while (currentCanvases.some((c) => c.fileName === candidateFile)) {
        const stem = candidateFile.replace(/\.canvas\.json$/i, '');
        candidateFile = `${stem}-${counter}.canvas.json`;
        counter++;
      }

      isApplyingCanvasSwitch = true;
      try {
        useWorkspaceStore.getState().applyCanvasDocumentState({
          tikzCode: EMPTY_TIKZ_CODE,
          activeThemeId: prevDoc.activeThemeId,
          zoom: 1,
          pan: { x: 80, y: 495 },
        });
      } finally {
        isApplyingCanvasSwitch = false;
      }

      set({
        activeCanvasFileName: candidateFile,
        activeCanvasName: displayName,
      });

      const saved = await get().saveActiveCanvasNow();
      if (!saved) {
        isApplyingCanvasSwitch = true;
        try {
          useWorkspaceStore.getState().applyCanvasDocumentState({
            tikzCode: prevDoc.tikzCode,
            activeThemeId: prevDoc.activeThemeId,
            zoom: prevDoc.zoom,
            pan: prevDoc.pan,
            showGrid: prevDoc.showGrid,
            snapToGrid: prevDoc.snapToGrid,
            canvasWidthCm: prevDoc.canvasWidthCm,
            canvasHeightCm: prevDoc.canvasHeightCm,
          });
        } finally {
          isApplyingCanvasSwitch = false;
        }
        set({
          activeCanvasFileName: prevFileName,
          activeCanvasName: prevName,
        });
        return null;
      }
      return get().activeCanvasFileName;
    },

    duplicateCurrentCanvasFile: async () => {
      const { projectDir, saveStatus } = get();
      if (
        projectDir &&
        (saveStatus === 'dirty' ||
          saveStatus === 'error' ||
          saveStatus === 'saving')
      ) {
        const ok = await get().saveActiveCanvasNow();
        if (!ok) return null;
      } else if (!projectDir) {
        await get().saveActiveCanvasNow();
      }

      const {
        activeCanvasFileName: prevFileName,
        activeCanvasName: prevName,
        canvases,
      } = get();
      const copyName = `${prevName} (Copy)`;
      let candidateFile = slugifyCanvasFileName(copyName);
      let counter = 2;
      while (canvases.some((c) => c.fileName === candidateFile)) {
        const stem = candidateFile.replace(/\.canvas\.json$/i, '');
        candidateFile = `${stem}-${counter}.canvas.json`;
        counter++;
      }

      set({
        activeCanvasFileName: candidateFile,
        activeCanvasName: copyName,
      });
      const saved = await get().saveActiveCanvasNow();
      if (!saved) {
        set({
          activeCanvasFileName: prevFileName,
          activeCanvasName: prevName,
        });
        return null;
      }
      return get().activeCanvasFileName;
    },

    renameCanvasFile: async (oldFileName, newDisplayName) => {
      const trimmed = newDisplayName.trim();
      if (!trimmed) return false;
      const { projectDir, canvases, activeCanvasFileName, autoSyncTikz } =
        get();

      let newFileName = slugifyCanvasFileName(trimmed);
      if (
        newFileName !== oldFileName &&
        canvases.some((c) => c.fileName === newFileName)
      ) {
        newFileName = `${newFileName.replace(/\.canvas\.json$/i, '')}-${Date.now().toString().slice(-3)}.canvas.json`;
      }

      const isCurrent = oldFileName === activeCanvasFileName;
      const doc = buildCurrentCanvasDoc(newFileName, trimmed);

      if (projectDir && isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          let contentToSave = JSON.stringify(doc, null, 2);
          let tikzToSync = doc.tikzCode;
          if (!isCurrent) {
            const existingRaw = await invoke<string>('project_load_canvas', {
              projectDir,
              fileName: oldFileName,
            });
            const existingParsed = JSON.parse(
              existingRaw
            ) as CanvasFileDocument;
            existingParsed.name = trimmed;
            existingParsed.fileName = newFileName;
            existingParsed.updatedAt = Date.now();
            contentToSave = JSON.stringify(existingParsed, null, 2);
            tikzToSync = existingParsed.tikzCode;
          }
          const res = await invoke<{
            fileName: string;
            updatedAt: number;
          }>('project_rename_canvas', {
            projectDir,
            oldFileName,
            newFileName,
            newContent: contentToSave,
            syncTikz: autoSyncTikz ? tikzToSync : null,
          });
          const nextCanvases = canvases.map((c) =>
            c.fileName === oldFileName
              ? {
                  ...c,
                  fileName: res.fileName,
                  name: trimmed,
                  updatedAt: res.updatedAt,
                }
              : c
          );
          set({
            canvases: nextCanvases,
            activeCanvasFileName: isCurrent
              ? res.fileName
              : activeCanvasFileName,
            activeCanvasName: isCurrent ? trimmed : get().activeCanvasName,
            saveStatus: 'saved',
            lastSavedAt: res.updatedAt,
          });
          return true;
        } catch (err) {
          set({ saveStatus: 'error', errorMessage: String(err) });
          return false;
        }
      }

      if (projectDir) {
        const vfs = readVirtualProject(projectDir);
        const existing = isCurrent ? doc : vfs.canvases[oldFileName] || doc;
        delete vfs.canvases[oldFileName];
        const updatedAt = Date.now();
        vfs.canvases[newFileName] = {
          ...existing,
          name: trimmed,
          fileName: newFileName,
          updatedAt,
        };
        if (vfs.lastActiveCanvas === oldFileName) {
          vfs.lastActiveCanvas = newFileName;
        }
        const writeRes = writeVirtualProject(projectDir, vfs);
        if (!writeRes.ok) {
          set({
            saveStatus: 'error',
            errorMessage: `浏览器本地存储空间不足或不可用: ${writeRes.error}`,
          });
          return false;
        }
        set({
          canvases: canvases.map((c) =>
            c.fileName === oldFileName
              ? { ...c, fileName: newFileName, name: trimmed, updatedAt }
              : c
          ),
          activeCanvasFileName: isCurrent ? newFileName : activeCanvasFileName,
          activeCanvasName: isCurrent ? trimmed : get().activeCanvasName,
          saveStatus: 'saved',
          lastSavedAt: updatedAt,
        });
        return true;
      }

      const currentLocal = { ...get().localCanvases };
      const existingLocal = isCurrent ? doc : currentLocal[oldFileName] || doc;
      delete currentLocal[oldFileName];
      const updatedAt = Date.now();
      currentLocal[newFileName] = {
        ...existingLocal,
        name: trimmed,
        fileName: newFileName,
        updatedAt,
      };

      set({
        localCanvases: currentLocal,
        canvases: canvases.map((c) =>
          c.fileName === oldFileName
            ? { ...c, fileName: newFileName, name: trimmed, updatedAt }
            : c
        ),
        activeCanvasFileName: isCurrent ? newFileName : activeCanvasFileName,
        activeCanvasName: isCurrent ? trimmed : get().activeCanvasName,
        saveStatus: 'local_only',
        lastSavedAt: updatedAt,
      });
      return true;
    },

    deleteCanvasFile: async (fileName) => {
      const { projectDir, canvases, activeCanvasFileName } = get();
      if (canvases.length <= 1) {
        return false; // Always keep at least one canvas in the project
      }

      const isDeletingActive = fileName === activeCanvasFileName;
      if (isDeletingActive && autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }

      const remaining = canvases.filter((c) => c.fileName !== fileName);

      if (projectDir && isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('project_delete_canvas', { projectDir, fileName });
        } catch (err) {
          set({ errorMessage: String(err) });
          return false;
        }
      } else if (projectDir) {
        const vfs = readVirtualProject(projectDir);
        delete vfs.canvases[fileName];
        if (vfs.lastActiveCanvas === fileName && remaining[0]) {
          vfs.lastActiveCanvas = remaining[0].fileName;
        }
        const writeRes = writeVirtualProject(projectDir, vfs);
        if (!writeRes.ok) {
          set({
            saveStatus: 'error',
            errorMessage: `浏览器本地存储空间不足或不可用: ${writeRes.error}`,
          });
          return false;
        }
      } else {
        const nextLocal = { ...get().localCanvases };
        delete nextLocal[fileName];
        set({ localCanvases: nextLocal });
      }

      if (isDeletingActive) {
        savedEditVersion = editVersion;
        set({
          canvases: remaining,
          saveStatus: projectDir ? 'saved' : 'local_only',
        });
        if (remaining[0]) {
          await get().switchCanvasFile(remaining[0].fileName);
        }
      } else {
        set({ canvases: remaining });
      }
      return true;
    },

    saveActiveCanvasNow: async () => {
      if (autoSaveTimer) {
        clearTimeout(autoSaveTimer);
        autoSaveTimer = null;
      }

      while (inFlightSavePromise) {
        const target = inFlightSaveTarget;
        const inFlightOk = await inFlightSavePromise;
        const nowState = get();
        const sameTarget =
          target !== null &&
          target.projectDir === nowState.projectDir &&
          target.fileName === nowState.activeCanvasFileName &&
          target.editVersion === editVersion;
        if (sameTarget) {
          return inFlightOk;
        }
      }

      const {
        projectDir,
        activeCanvasFileName,
        activeCanvasName,
        autoSyncTikz,
        canvases,
      } = get();

      const existingCreatedAt = !projectDir
        ? get().localCanvases[activeCanvasFileName]?.createdAt
        : undefined;
      const doc = buildCurrentCanvasDoc(
        activeCanvasFileName,
        activeCanvasName,
        existingCreatedAt
      );

      if (!projectDir) {
        const contentStr = JSON.stringify(doc);
        const exists = canvases.some(
          (c) => c.fileName === activeCanvasFileName
        );
        const nextSummary: CanvasFileSummary = {
          fileName: activeCanvasFileName,
          name: activeCanvasName,
          updatedAt: doc.updatedAt,
          sizeBytes: contentStr.length,
          activeThemeId: doc.activeThemeId,
        };
        const nextCanvases = exists
          ? canvases.map((c) =>
              c.fileName === activeCanvasFileName ? nextSummary : c
            )
          : [...canvases, nextSummary];

        savedEditVersion = editVersion;
        set((s) => ({
          localCanvases: {
            ...s.localCanvases,
            [activeCanvasFileName]: doc,
          },
          canvases: nextCanvases,
          saveStatus: 'local_only',
          lastSavedAt: doc.updatedAt,
        }));
        return true;
      }

      set({ saveStatus: 'saving' });

      if (isTauriRuntime()) {
        const savingProjectDir = projectDir;
        const savingFileName = activeCanvasFileName;
        const savingCanvasName = activeCanvasName;
        const saveEditVersion = editVersion;

        inFlightSaveTarget = {
          projectDir: savingProjectDir,
          fileName: savingFileName,
          editVersion: saveEditVersion,
        };

        const runSave = (async (): Promise<boolean> => {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const contentStr = JSON.stringify(doc, null, 2);
            const res = await invoke<{
              fileName: string;
              updatedAt: number;
            }>('project_save_canvas', {
              projectDir: savingProjectDir,
              fileName: savingFileName,
              content: contentStr,
              syncTikz: autoSyncTikz ? doc.tikzCode : null,
            });

            const currentState = get();
            const isSameProject = currentState.projectDir === savingProjectDir;
            const isSameCanvas =
              isSameProject &&
              currentState.activeCanvasFileName === savingFileName;
            const wasEditedDuringSave = editVersion !== saveEditVersion;

            if (!isSameProject) {
              return true;
            }

            const existsInCurrent = currentState.canvases.some(
              (c) =>
                c.fileName === res.fileName || c.fileName === savingFileName
            );
            const nextSummary: CanvasFileSummary = {
              fileName: res.fileName,
              name: savingCanvasName,
              updatedAt: res.updatedAt,
              sizeBytes: contentStr.length,
              activeThemeId: doc.activeThemeId,
            };
            const nextCanvases = existsInCurrent
              ? currentState.canvases.map((c) =>
                  c.fileName === res.fileName || c.fileName === savingFileName
                    ? nextSummary
                    : c
                )
              : isSameCanvas
                ? [...currentState.canvases, nextSummary]
                : currentState.canvases;

            const nextRecents = currentState.recentProjects.map((r) =>
              r.path === savingProjectDir
                ? {
                    ...r,
                    canvasCount: nextCanvases.length,
                    lastCanvasFileName: isSameCanvas
                      ? res.fileName
                      : r.lastCanvasFileName,
                    lastOpenedAt: Date.now(),
                  }
                : r
            );

            const syncedFigurePath = `figures/${savingFileName.replace(/\.canvas\.json$/i, '') || 'figure'}.tikz`;
            const syncedPaper = autoSyncTikz ? {
              paperFileContents: currentState.paperDirtyFiles[syncedFigurePath]
                ? currentState.paperFileContents
                : { ...currentState.paperFileContents, [syncedFigurePath]: doc.tikzCode },
              paperEditRevision: currentState.paperEditRevision +
                (currentState.paperFileContents[syncedFigurePath] === doc.tikzCode ? 0 : 1),
            } : {};
            if (isSameCanvas) {
              savedEditVersion = Math.max(savedEditVersion, saveEditVersion);
              set({
                canvases: nextCanvases,
                activeCanvasFileName: res.fileName,
                saveStatus: wasEditedDuringSave ? 'dirty' : 'saved',
                lastSavedAt: res.updatedAt,
                recentProjects: nextRecents,
                ...syncedPaper,
              });
            } else {
              set({
                canvases: nextCanvases,
                recentProjects: nextRecents,
                ...syncedPaper,
              });
            }
            persistCurrentPrefs({ recentProjects: nextRecents });
            return true;
          } catch (err) {
            const currentState = get();
            if (
              currentState.projectDir === savingProjectDir &&
              currentState.activeCanvasFileName === savingFileName
            ) {
              set({ saveStatus: 'error', errorMessage: String(err) });
            } else if (currentState.projectDir === savingProjectDir) {
              set({ errorMessage: String(err) });
            }
            return false;
          }
        })();

        inFlightSavePromise = runSave;
        try {
          return await runSave;
        } finally {
          if (inFlightSavePromise === runSave) {
            inFlightSavePromise = null;
            inFlightSaveTarget = null;
          }
        }
      }

      // Virtual FS fallback
      const vfs = readVirtualProject(projectDir);
      vfs.canvases[activeCanvasFileName] = doc;
      vfs.lastActiveCanvas = activeCanvasFileName;
      const stem = activeCanvasFileName.replace(/\.canvas\.json$/i, '') || 'figure';
      const figRelPath = `figures/${stem}.tikz`;
      if (autoSyncTikz) {
        vfs.paperFiles = {
          ...(vfs.paperFiles || {}),
          [figRelPath]: doc.tikzCode,
        };
      }
      const writeRes = writeVirtualProject(projectDir, vfs);
      if (!writeRes.ok) {
        set({
          saveStatus: 'error',
          errorMessage: `浏览器本地存储空间不足或不可用: ${writeRes.error}`,
        });
        return false;
      }

      const exists = canvases.some((c) => c.fileName === activeCanvasFileName);
      const nextSummary: CanvasFileSummary = {
        fileName: activeCanvasFileName,
        name: activeCanvasName,
        updatedAt: doc.updatedAt,
        sizeBytes: JSON.stringify(doc).length,
        activeThemeId: doc.activeThemeId,
      };
      const nextCanvases = exists
        ? canvases.map((c) =>
            c.fileName === activeCanvasFileName ? nextSummary : c
          )
        : [...canvases, nextSummary];

      savedEditVersion = editVersion;
      set((s) => ({
        canvases: nextCanvases,
        paperFileContents: autoSyncTikz && !s.paperDirtyFiles[figRelPath]
          ? { ...s.paperFileContents, [figRelPath]: doc.tikzCode }
          : s.paperFileContents,
        paperEditRevision: s.paperEditRevision +
          (autoSyncTikz && s.paperFileContents[figRelPath] !== doc.tikzCode ? 1 : 0),
        saveStatus: 'saved',
        lastSavedAt: doc.updatedAt,
      }));
      return true;
    },

    markCanvasDirty: () => {
      if (isApplyingCanvasSwitch) return;
      editVersion += 1;
      const { projectDir } = get();
      if (!projectDir) {
        set({ saveStatus: 'local_only' });
        return;
      }
      set((s) => ({
        saveStatus: 'dirty',
        paperEditRevision: s.paperEditRevision + (s.autoSyncTikz ? 1 : 0),
      }));
      if (autoSaveTimer) clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => {
        autoSaveTimer = null;
        void get().saveActiveCanvasNow();
      }, 500);
    },

    refreshProjectAssets: async () => {
      const { projectDir, assets: initialAssets } = get();
      if (!projectDir) return;
      const version = paperWorkspaceVersion;
      const scan = ++assetScanSequence;
      failedAssetLookupCache.clear();
      inFlightAssetLookups.clear();
      set({ isScanningAssets: true });
      if (isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const assets = await invoke<ProjectAssetItem[]>(
            'project_scan_assets',
            { projectDir }
          );
          if (paperWorkspaceVersion !== version || scan !== assetScanSequence) return;
          const merged = new Map(assets.map((asset) => [asset.relativePath, asset]));
          // An import/generation finishing after scan start must not disappear from the library.
          for (const asset of get().assets) {
            if (!initialAssets.includes(asset)) merged.set(asset.relativePath, asset);
          }
          set({ assets: [...merged.values()], isScanningAssets: false });
        } catch (err) {
          if (paperWorkspaceVersion === version && scan === assetScanSequence) {
            set({ isScanningAssets: false, errorMessage: String(err) });
          }
        }
      } else {
        const vfs = readVirtualProject(projectDir);
        set({ assets: vfs.assets, isScanningAssets: false });
      }
    },

    ensureAssetDataUrl: async (relativePath) => {
      const cleanRel = relativePath.replace(/\\/g, '/').trim();
      if (!cleanRel || cleanRel.toLowerCase().endsWith('.pdf')) return null;
      const cached = get().assetDataUrls[cleanRel];
      if (cached) return cached;

      const { projectDir } = get();
      if (!projectDir) return null;
      const version = paperWorkspaceVersion;

      const cacheKey = `${projectDir}::${cleanRel}`;
      if (failedAssetLookupCache.has(cacheKey)) return null;

      const existingPromise = inFlightAssetLookups.get(cacheKey);
      if (existingPromise) {
        return await existingPromise;
      }

      if (isTauriRuntime()) {
        const task = (async (): Promise<string | null> => {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const dataUrl = await invoke<string>('project_read_asset_data_url', {
              projectDir,
              relativePath: cleanRel,
            });
            if (get().projectDir !== projectDir || paperWorkspaceVersion !== version) {
              return dataUrl;
            }
            set((s) => {
              const nextUrls = setBoundedAssetDataUrl(
                s.assetDataUrls,
                cleanRel,
                dataUrl
              );
              return nextUrls === s.assetDataUrls
                ? s
                : { assetDataUrls: nextUrls };
            });
            return dataUrl;
          } catch {
            if (paperWorkspaceVersion === version) failedAssetLookupCache.add(cacheKey);
            return null;
          }
        })();

        inFlightAssetLookups.set(cacheKey, task);
        void task.then(() => {
          if (inFlightAssetLookups.get(cacheKey) === task) inFlightAssetLookups.delete(cacheKey);
        });
        return await task;
      }

      const vfs = readVirtualProject(projectDir);
      const url = vfs.assetDataUrls?.[cleanRel] || null;
      if (url) {
        set((s) => {
          const nextUrls = setBoundedAssetDataUrl(
            s.assetDataUrls,
            cleanRel,
            url
          );
          return nextUrls === s.assetDataUrls
            ? s
            : { assetDataUrls: nextUrls };
        });
      } else {
        failedAssetLookupCache.add(cacheKey);
      }
      return url;
    },

    registerLocalBrowserAssetFiles: async (files, targetFolder = 'figs') => {
      const fileArray = Array.from(files);
      if (fileArray.length === 0) return [];

      const cleanFolder = normalizeFigurePath(targetFolder || 'figs');
      const { projectDir } = get();
      const version = paperWorkspaceVersion;
      const checkProject = () => {
        if (version !== paperWorkspaceVersion || get().projectDir !== projectDir) throw new Error('导入期间项目已切换，已停止更新当前项目素材。');
      };
      const newAssets: ProjectAssetItem[] = [];
      const newUrls: Record<string, string> = {};
      const usedPaths = new Set(get().assets.map((asset) => asset.relativePath.toLowerCase()));
      const reserved = reservedAssetPaths.get(version) || new Set<string>();
      reservedAssetPaths.set(version, reserved);
      const allocations: string[] = [];

      try {
      for (const file of fileArray) {
        const ext = (file.name.split('.').pop() || 'png').toLowerCase();
        if (!['png', 'jpg', 'jpeg', 'svg', 'webp', 'pdf'].includes(ext)) {
          continue;
        }
        const safeName = file.name.replace(/[\\/:*?"<>|%#{}\u0000-\u001f]/g, '_').replace(/^\.+/, '').trim() || `image.${ext}`;
        const base = safeName.replace(/\.[^.]*$/, '');
        let relPath = `${cleanFolder}/${safeName}`;
        for (let count = 2; usedPaths.has(relPath.toLowerCase()) || reserved.has(relPath.toLowerCase()); count++) {
          relPath = `${cleanFolder}/${base}-${count}.${ext}`;
        }
        usedPaths.add(relPath.toLowerCase());
        reserved.add(relPath.toLowerCase());
        allocations.push(relPath.toLowerCase());
        let dataUrl: string;
        try { dataUrl = await readFileAsDataUrl(file); checkProject(); }
        catch (error) {
          if (version === paperWorkspaceVersion) set({ errorMessage: String(error) });
          return [];
        }

        if (projectDir && isTauriRuntime()) {
          try {
            const { invoke } = await import('@tauri-apps/api/core');
            const savedAsset = await invoke<ProjectAssetItem>(
              'project_import_asset',
              {
                projectDir,
                relativePath: relPath,
                dataUrl,
              }
            );
            checkProject();
            const effectiveRelPath = savedAsset?.relativePath || relPath;
            failedAssetLookupCache.delete(`${projectDir}::${relPath}`);
            failedAssetLookupCache.delete(`${projectDir}::${effectiveRelPath}`);
            newAssets.push(
              savedAsset || {
                relativePath: relPath,
                fileName: relPath.split('/').pop()!,
                folder: cleanFolder,
                ext,
                sizeBytes: file.size,
                modifiedAt: file.lastModified || Date.now(),
              }
            );
            newUrls[effectiveRelPath] = dataUrl;
          } catch (err) {
            if (version === paperWorkspaceVersion) set({ saveStatus: 'error', errorMessage: String(err) });
            return [];
          }
        } else {
          if (projectDir) {
            failedAssetLookupCache.delete(`${projectDir}::${relPath}`);
          }
          newAssets.push({
            relativePath: relPath,
            fileName: relPath.split('/').pop()!,
            folder: cleanFolder,
            ext,
            sizeBytes: file.size,
            modifiedAt: file.lastModified || Date.now(),
          });
          newUrls[relPath] = dataUrl;
        }
      }

      if (newAssets.length === 0 || version !== paperWorkspaceVersion) return [];

      const currentState = get();
      const mergedAssets = [
        ...currentState.assets.filter(
          (a) => !newAssets.some((n) => n.relativePath === a.relativePath)
        ),
        ...newAssets,
      ];
      const mergedUrls = { ...currentState.assetDataUrls, ...newUrls };

      if (projectDir && !isTauriRuntime()) {
        const vfs = readVirtualProject(projectDir);
        vfs.assets = mergedAssets;
        vfs.assetDataUrls = mergedUrls;
        const writeRes = writeVirtualProject(projectDir, vfs);
        if (!writeRes.ok) {
          set({
            saveStatus: 'error',
            errorMessage: `浏览器本地存储空间不足或不可用: ${writeRes.error}`,
          });
          return [];
        }
      }

      set({ assets: mergedAssets, assetDataUrls: mergedUrls });
      return newAssets;
      } finally {
        for (const path of allocations) reserved.delete(path);
        if (!reserved.size) reservedAssetPaths.delete(version);
      }
    },

    registerGeneratedAsset: async (relativePath, dataUrl, expectedProjectDir) => {
      const cleanRel = normalizeFigurePath(relativePath);
      const parts = cleanRel.split('/');
      const fileName = parts[parts.length - 1] || 'ai_cutout.png';
      const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : 'figures/assets/ai';
      const ext = (fileName.split('.').pop() || 'png').toLowerCase();
      const { projectDir } = get();
      const version = paperWorkspaceVersion;
      const checkProject = () => {
        if (version !== paperWorkspaceVersion || get().projectDir !== projectDir ||
            (expectedProjectDir !== undefined && expectedProjectDir !== projectDir)) {
          throw new Error('生成期间项目已切换，结果不会写入其他项目或画布。');
        }
      };
      checkProject();

      if (projectDir && isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const saved = await invoke('project_import_asset', {
            projectDir,
            relativePath: cleanRel,
            dataUrl,
          });
          if (saved === false) throw new Error('生成图片保存失败。');
          checkProject();
        } catch (error) {
          if (version === paperWorkspaceVersion) set({ errorMessage: String(error) });
          throw error;
        }
      }

      if (projectDir) {
        failedAssetLookupCache.delete(`${projectDir}::${cleanRel}`);
      }

      const item: ProjectAssetItem = {
        relativePath: cleanRel,
        fileName,
        folder,
        ext,
        sizeBytes: Math.round((dataUrl.length * 3) / 4),
        modifiedAt: Date.now(),
      };

      const currentState = get();
      const mergedAssets = [
        ...currentState.assets.filter((a) => a.relativePath !== cleanRel),
        item,
      ];
      const mergedUrls = {
        ...currentState.assetDataUrls,
        [cleanRel]: dataUrl,
      };

      if (projectDir && !isTauriRuntime()) {
        const vfs = readVirtualProject(projectDir);
        vfs.assets = mergedAssets;
        vfs.assetDataUrls = mergedUrls;
        const result = writeVirtualProject(projectDir, vfs);
        if (!result.ok) throw new Error(`生成图片未保存：${result.error}`);
      }

      set({ assets: mergedAssets, assetDataUrls: mergedUrls });
      return cleanRel;
    },

    exportFileToProject: async (fileName, content, isBase64 = false) => {
      const { projectDir } = get();
      if (!projectDir) return null;

      if (isTauriRuntime()) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const savedPath = await invoke<string>('project_export_file', {
            projectDir,
            fileName,
            content,
            isBase64,
          });
          set({
            lastExportedNotice: `已导出至 ${AGENTIKZ_FOLDER_NAME}/export/${fileName}`,
          });
          setTimeout(() => {
            if (
              get().lastExportedNotice ===
              `已导出至 ${AGENTIKZ_FOLDER_NAME}/export/${fileName}`
            ) {
              set({ lastExportedNotice: null });
            }
          }, 4000);
          return savedPath;
        } catch (err) {
          set({ errorMessage: String(err) });
          return null;
        }
      }

      // Browser fallback notification
      const virtualPath = `${projectDir}/${AGENTIKZ_FOLDER_NAME}/export/${fileName}`;
      set({
        lastExportedNotice: `已导出至 ${AGENTIKZ_FOLDER_NAME}/export/${fileName}`,
      });
      return virtualPath;
    },

    revealInFileManager: async (targetPath) => {
      const pathToOpen =
        targetPath || get().storageDir || get().projectDir || null;
      if (!pathToOpen || !isTauriRuntime()) return;
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('project_reveal_in_explorer', { path: pathToOpen });
      } catch {
        // ignore
      }
    },

    clearExportNotice: () => set({ lastExportedNotice: null }),
  };
});

// Paper caches and delayed work belong to a workspace, never just a relative path.
useProjectStore.subscribe((state, prev) => {
  if (state.projectDir === prev.projectDir) return;
  paperWorkspaceVersion += 1;
  if (autoSaveTimer) {
    clearTimeout(autoSaveTimer);
    autoSaveTimer = null;
  }
  for (const path of Object.keys(paperAutoSaveTimers)) {
    clearTimeout(paperAutoSaveTimers[path]);
    delete paperAutoSaveTimers[path];
  }
  useProjectStore.setState({
    paperFiles: [],
    paperFileContents: {},
    paperDirtyFiles: {},
    activePaperFilePath: 'main.tex',
    lastPaperCursorOffset: null,
    isInsertFigureModalOpen: false,
    figureInsertSource: null,
    figureInsertRequestId: null,
    isInsertingFigure: false,
    figureInsertionError: null,
    paperInsertionLocation: null,
    isScanningAssets: false,
  });
});

// Subscribe to workspace code/theme/size changes so edits automatically mark the active canvas file dirty and auto-save
useWorkspaceStore.subscribe((state, prev) => {
  if (isApplyingCanvasSwitch) return;
  if (
    state.tikzCode !== prev.tikzCode ||
    state.activeThemeId !== prev.activeThemeId ||
    state.canvasWidthCm !== prev.canvasWidthCm ||
    state.canvasHeightCm !== prev.canvasHeightCm
  ) {
    useProjectStore.getState().markCanvasDirty();
  }
  if (
    state.activeThemeId !== prev.activeThemeId &&
    useProjectStore.getState().projectDir
  ) {
    const version = paperWorkspaceVersion;
    void useProjectStore.getState().ensureAgentikzMacrosSty().catch((error) => {
      if (paperWorkspaceVersion === version) useProjectStore.setState({ errorMessage: String(error) });
    });
  }
});
