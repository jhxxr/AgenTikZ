import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { buildStandaloneLatexDocument } from './document';

export interface TexPreviewResult {
  ok: boolean;
  svg?: string | null;
  message: string;
}

let pendingPreview: Promise<string | null> | null = null;

/** Shared by preview and export. Compilation must never change the editing mode. */
export function compileWorkspaceTexPreview(): Promise<string | null> {
  if (pendingPreview) return pendingPreview;
  const task = compileCurrentWorkspaceTexPreview();
  pendingPreview = task;
  void task.finally(() => {
    if (pendingPreview === task) pendingPreview = null;
  });
  return task;
}

async function compileCurrentWorkspaceTexPreview(): Promise<string | null> {
  const workspace = useWorkspaceStore.getState();
  if (workspace.isCompilingTex) return null;
  const { tikzCode, activeThemeId, sourceRevision } = workspace;
  const { projectDir, activeCanvasFileName } = useProjectStore.getState();
  const { texEngine } = useSettingsStore.getState();
  const isCurrent = () => {
    const current = useWorkspaceStore.getState();
    const project = useProjectStore.getState();
    const settings = useSettingsStore.getState();
    return current.sourceRevision === sourceRevision &&
      current.tikzCode === tikzCode && current.activeThemeId === activeThemeId &&
      project.projectDir === projectDir && project.activeCanvasFileName === activeCanvasFileName &&
      settings.texEngine === texEngine;
  };
  workspace.setIsCompilingTex(true);
  workspace.setCompiledSvg(null, '正在使用内置 TeX 引擎编译…');
  try {
    let result: TexPreviewResult;
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      result = {
        ok: false,
        message: '浏览器模式不包含 TeX 引擎。请在 AgenTikZ 桌面版中打开，桌面版已内置 XeLaTeX，无需安装 TeX Live。',
      };
    } else {
      const { invoke } = await import('@tauri-apps/api/core');
      result = await invoke<TexPreviewResult>('tex_compile_preview', {
        texSource: buildStandaloneLatexDocument(tikzCode, activeThemeId),
        texEngine,
        projectDir,
      });
    }
    if (!isCurrent()) return null;
    const svg = result.ok && result.svg ? result.svg : null;
    workspace.setCompiledSvg(svg, result.message);
    return svg;
  } catch (error) {
    if (!isCurrent()) return null;
    workspace.setCompiledSvg(null, `TeX 编译失败：${error instanceof Error ? error.message : String(error)}`);
    return null;
  } finally {
    workspace.setIsCompilingTex(false);
  }
}
