/** Prompt compiler: metadata/task flags only. Detailed guides are on-demand skills. */
import type { JournalThemeId } from '../../types/theme';
import { buildAgentSkillAndLibraryContext } from './agent-knowledge';
import { resolveDiagramDesignMode, type DiagramDesignMode } from './diagram-design-policy';

export interface PromptCompilerOptions {
  enforcePublicationStyleGuide?: boolean;
  requireFigureContract?: boolean;
  diagramMode?: DiagramDesignMode;
}

export function buildPublicationStyleSystemPrompt(
  activeThemeId: JournalThemeId | string = 'neurips',
  options: PromptCompilerOptions = {},
): string {
  if (options.enforcePublicationStyleGuide === false) return '';
  const themeId = ['neurips', 'cvpr', 'nature', 'ieee'].includes(activeThemeId) ? activeThemeId : 'neurips';
  return `Publication task (data): ${JSON.stringify({ themeId,
    requireFigureContract: options.requireFigureContract ?? true, mode: options.diagramMode ?? 'design' })}\n` +
    'Use publication-style/get_theme_palette only when applicable; reference/user style takes precedence. Preserve existing figure metadata.';
}

/** User text stays intact; routing flags belong in the task context, not a prefix. */
export function compileUserPromptWithStyleGuide(
  userPrompt: string,
  _activeThemeId: JournalThemeId | string = 'neurips',
  _options: PromptCompilerOptions = {},
): string {
  return userPrompt.trim();
}

export function compileAgentPrompt(params: {
  userPrompt: string;
  themeId: JournalThemeId;
  enforcePublicationStyle?: boolean;
  requireFigureContract?: boolean;
  allowAiCutoutIllustrations?: boolean;
}): string {
  return `${buildAgentSkillAndLibraryContext(params.themeId, '', [], {
    taskPrompt: params.userPrompt, diagramMode: resolveDiagramDesignMode(params.userPrompt),
    enforcePublicationStyleGuide: params.enforcePublicationStyle,
    requireFigureContract: params.requireFigureContract,
  })}\n\nUser request:\n${params.userPrompt.trim()}`;
}
