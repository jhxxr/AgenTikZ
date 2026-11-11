/**
 * Paper template library (desktop): built-in official author kits plus templates
 * imported from a folder, an archive, a URL or a Git repository.
 * Templates live in the Rust side, so the frontend only lists and uses them.
 */

export interface PaperTemplateInfo {
  id: string;
  name: string;
  description: string;
  mainFile: string;
  mainCandidates: string[];
  defaultThemeId: string;
  columnLayout: 'single' | 'double' | string;
  source: string;
  builtin: boolean;
  /** Result of the last trial build with the bundled engine; `null` means not tried yet. */
  verified: boolean | null;
  note: string;
  fileCount: number;
}

export interface CreatedPaper {
  mainFile: string;
  defaultThemeId: string;
}

export function isDesktopRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

async function invokeCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isDesktopRuntime()) throw new Error('模板库需要桌面版 AgenTikZ。');
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

export function listPaperTemplates(): Promise<PaperTemplateInfo[]> {
  return invokeCommand('paper_templates_list');
}

export type TemplateSourceKind = 'auto' | 'url' | 'git';

/** Accepts a local folder/archive, a direct download URL or a repository page. */
export function importPaperTemplate(options: {
  location: string;
  name?: string;
  proxy?: string;
  sourceKind?: TemplateSourceKind;
  subdirectory?: string;
}): Promise<PaperTemplateInfo> {
  return invokeCommand('paper_template_import', {
    location: options.location.trim(), name: options.name?.trim() || null,
    proxy: options.proxy || null, sourceKind: options.sourceKind || 'auto',
    subdirectory: options.subdirectory?.trim() || null,
  });
}

export function removePaperTemplate(id: string): Promise<void> {
  return invokeCommand('paper_template_remove', { id });
}

export function setPaperTemplateMain(id: string, mainFile: string): Promise<PaperTemplateInfo> {
  return invokeCommand('paper_template_set_main', { id, mainFile });
}

/** Compiles the template once with the bundled engine so failures surface before use. */
export function verifyPaperTemplate(id: string): Promise<PaperTemplateInfo> {
  return invokeCommand('paper_template_verify', { id });
}

export function createPaperFromTemplate(
  templateId: string,
  projectDir: string,
  title: string,
  extraFiles: Record<string, string>
): Promise<CreatedPaper> {
  return invokeCommand('paper_template_create_project', {
    templateId, projectDir, title, extraFiles,
  });
}
