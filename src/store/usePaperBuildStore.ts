import { create } from 'zustand';
import { useProjectStore } from './useProjectStore';
import { useSettingsStore, type TexBuildMode } from './useSettingsStore';

export interface PaperBuildResult {
  ok: boolean;
  pdfPath?: string;
  message: string;
  logExcerpt?: string;
  errors?: string[];
  buildId: number;
}

interface PaperBuildState {
  projectId: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed';
  buildId: number;
  compiledRevision: number;
  result: PaperBuildResult | null;
  /** `force` skips the up-to-date check; `clean` removes build files first. */
  run: (mode?: TexBuildMode) => Promise<void>;
  /** Removes intermediate build files; sources and the PDF stay. */
  clean: () => Promise<string>;
}

let nextBuildId = 0;
const runningProjects = new Set<string>();

function mainTexFile(): string | undefined {
  const state = useProjectStore.getState();
  return state.paperFiles.find((file) => file.category === 'main')?.relativePath
    || state.paperFiles.find((file) => file.relativePath === 'main.tex')?.relativePath
    || state.paperFiles.find((file) => file.relativePath === state.activePaperFilePath && /\.tex$/i.test(file.relativePath))?.relativePath
    || state.paperFiles.find((file) => /\.tex$/i.test(file.relativePath))?.relativePath;
}

/** Shared by the paper preview and agent review UI; tools only read its diagnostics. */
export const usePaperBuildStore = create<PaperBuildState>((set, get) => ({
  projectId: null, status: 'idle', buildId: 0, compiledRevision: -1, result: null,
  run: async (mode = 'normal') => {
    const project = useProjectStore.getState();
    const projectId = project.projectDir;
    if (get().status === 'running' || (projectId && runningProjects.has(projectId))) return;
    const buildId = ++nextBuildId;
    set({ projectId, buildId, status: 'running', compiledRevision: -1, result: null });
    const isCurrent = () => get().buildId === buildId && useProjectStore.getState().projectDir === projectId;
    if (projectId) runningProjects.add(projectId);
    try {
      if (!projectId || typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
        throw new Error('当前为浏览器预览，未执行 TeX 编译。请在桌面端打开此项目（已内置 TeX 引擎）。');
      }
      if (!await project.saveAllDirtyPaperFiles()) throw new Error('文件保存失败，已停止编译。');
      if (!isCurrent()) return;
      const state = useProjectStore.getState();
      if (state.autoSyncTikz && ['dirty', 'saving', 'error'].includes(state.saveStatus)) {
        throw new Error('配图尚未成功同步到论文文件，请先完成配图保存再编译。');
      }
      const entry = mainTexFile();
      if (!entry) throw new Error('未找到可编译的 .tex 主文件。');
      const revision = state.paperEditRevision;
      const { texEngine } = useSettingsStore.getState();
      const { invoke } = await import('@tauri-apps/api/core');
      if (!isCurrent()) return;
      const result = await invoke<Omit<PaperBuildResult, 'buildId'>>('tex_compile_paper', {
        projectDir: projectId, mainTexFile: entry, texEngine, mode,
      });
      if (isCurrent()) set({
        status: result.ok ? 'completed' : 'failed',
        compiledRevision: revision, result: { ...result, buildId },
      });
    } catch (error) {
      if (isCurrent()) set({
        status: 'failed', result: { ok: false, buildId, message: error instanceof Error ? error.message : String(error) },
      });
    } finally {
      if (projectId) runningProjects.delete(projectId);
    }
  },
  clean: async () => {
    const projectId = useProjectStore.getState().projectDir;
    if (!projectId || typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      throw new Error('请先在桌面端打开论文项目。');
    }
    if (get().status === 'running' || runningProjects.has(projectId)) throw new Error('正在编译，请稍后再清理。');
    const { invoke } = await import('@tauri-apps/api/core');
    const result = await invoke<{ removed: number; message: string }>('tex_clean_artifacts', {
      projectDir: projectId, mainTexFile: mainTexFile(),
    });
    return result.message;
  },
}));

// Invalidate even an A -> B -> A project switch; old build results must never reappear.
useProjectStore.subscribe((state, previous) => {
  if (state.projectDir !== previous.projectDir) {
    usePaperBuildStore.setState({
      projectId: state.projectDir, status: 'idle', buildId: ++nextBuildId, compiledRevision: -1, result: null,
    });
  }
});

export function getPaperBuildDiagnostics() {
  const project = useProjectStore.getState();
  const build = usePaperBuildStore.getState();
  if (build.projectId !== project.projectDir) return { status: 'idle', message: '尚未编译当前项目。' };
  return {
    status: build.status, buildId: build.buildId,
    compiledRevision: build.compiledRevision, currentRevision: project.paperEditRevision,
    stale: build.compiledRevision >= 0 && build.compiledRevision !== project.paperEditRevision,
    result: build.result,
    scope: 'Current applied paper files only. Pending proposals are not compiled. Compilation is not a visual review.',
  };
}
