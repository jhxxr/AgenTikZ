import { useWorkspaceStore } from '../../store/useWorkspaceStore';
import { useProjectStore } from '../../store/useProjectStore';
import { useSettingsStore } from '../../store/useSettingsStore';
import { getExactPreviewReasons } from '../tex/source';
import { compileWorkspaceTexPreview } from '../tex/preview';

/**
 * Use the same real TeX SVG as the precision preview, not a screenshot of the
 * editable subset. Only simple browser-only drawings may use the canvas SVG.
 * An unsupported/failed complex drawing must never silently lose its details.
 */
export async function resolveFigureSvgForExport(
  readCanvasSvg: () => string | null
): Promise<string | null> {
  const workspace = useWorkspaceStore.getState();
  if (workspace.compiledSvg) return workspace.compiledSvg;
  const desktop = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (!desktop && getExactPreviewReasons(workspace.tikzCode).length === 0) {
    return readCanvasSvg();
  }
  const revision = workspace.sourceRevision;
  const theme = workspace.activeThemeId;
  const { projectDir, activeCanvasFileName } = useProjectStore.getState();
  const { texEngine } = useSettingsStore.getState();
  const svg = await compileWorkspaceTexPreview();
  const current = useWorkspaceStore.getState();
  const project = useProjectStore.getState();
  if (!svg && current.sourceRevision === revision && current.activeThemeId === theme &&
      project.projectDir === projectDir && project.activeCanvasFileName === activeCanvasFileName &&
      useSettingsStore.getState().texEngine === texEngine) {
    // Explain the actual compiler error while keeping the editing canvas open.
    useWorkspaceStore.getState().setPreviewMode('tex_split');
  }
  return svg;
}
