import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { buildStandaloneLatexDocument } from './document';

export interface TexPreviewResult {
  ok: boolean;
  svg?: string | null;
  message: string;
}

/** Shared by the toolbar and debounced automatic preview. Never fake success. */
export async function compileWorkspaceTexPreview(): Promise<void> {
  const workspace = useWorkspaceStore.getState();
  if (workspace.isCompilingTex) return;
  const { tikzCode, activeThemeId, sourceRevision } = workspace;
  const { projectDir, activeCanvasFileName } = useProjectStore.getState();
  const { texEngine, texLiveBinDir } = useSettingsStore.getState();
  const isCurrent = () => {
    const current = useWorkspaceStore.getState();
    const project = useProjectStore.getState();
    const settings = useSettingsStore.getState();
    return current.sourceRevision === sourceRevision &&
      current.tikzCode === tikzCode && current.activeThemeId === activeThemeId &&
      project.projectDir === projectDir && project.activeCanvasFileName === activeCanvasFileName &&
      settings.texEngine === texEngine && settings.texLiveBinDir === texLiveBinDir;
  };
  workspace.setIsCompilingTex(true);
  workspace.setCompiledSvg(null, '正在使用本地 TeX 编译…');
  try {
    let result: TexPreviewResult;
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
      result = {
        ok: false,
        message: '浏览器模式无法调用本地 TeX。请在 AgenTikZ 桌面版中打开，并在设置 → 编辑器与 TeX中配置 TeX Live（需要 latex 和 dvisvgm）。',
      };
    } else {
      const { invoke } = await import('@tauri-apps/api/core');
      result = await invoke<TexPreviewResult>('tex_compile_preview', {
        texSource: buildStandaloneLatexDocument(tikzCode, activeThemeId),
        texEngine,
        projectDir,
        texLiveBinDir: texLiveBinDir || undefined,
      });
    }
    if (!isCurrent()) return;
    workspace.setCompiledSvg(result.ok && result.svg ? result.svg : null, result.message);
    workspace.setPreviewMode('tex_split');
  } catch (error) {
    if (!isCurrent()) return;
    workspace.setCompiledSvg(null, `TeX 编译失败：${error instanceof Error ? error.message : String(error)}`);
    workspace.setPreviewMode('tex_split');
  } finally {
    workspace.setIsCompilingTex(false);
  }
}
