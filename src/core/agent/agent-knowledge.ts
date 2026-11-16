/** Short drawing contract and metadata discovery; skill bodies are loaded only by tools. */
import { buildAgentSkillCatalog } from './skill-registry';
import { resolveDiagramDesignMode, type DiagramDesignMode } from './diagram-design-policy';

export function buildAgentSkillAndLibraryContext(
  activeThemeId = 'neurips',
  canvasTikz = '',
  _selectedIds: string[] = [],
  options: { enforcePublicationStyleGuide?: boolean; requireFigureContract?: boolean;
    taskPrompt?: string; diagramMode?: DiagramDesignMode; toolsAvailable?: boolean } = {},
): string {
  const themeId = ['neurips', 'cvpr', 'nature', 'ieee'].includes(activeThemeId) ? activeThemeId : 'neurips';
  const enforceStyle = options.enforcePublicationStyleGuide ?? true;
  const mode = options.diagramMode ?? resolveDiagramDesignMode(options.taskPrompt || '', canvasTikz);
  return [
    `Drawing task (data): ${JSON.stringify({ themeId, mode, enforcePublicationStyleGuide: enforceStyle,
      requireFigureContract: enforceStyle && (options.requireFigureContract ?? true) })}`,
    'Canvas output: one self-contained tikzpicture, no document preamble. Ordinary editable nodes need unique IDs and explicit cm coordinates; complex paths/macros are not all draggable.',
    'Preserve unrelated source, comments and design/figure pragmas. User/reference intent overrides defaults; reproduction keeps colors, geometry and topology.',
    'Surgical edits target live source, not a pending draft; revise pending source in full or pass proposalId to repair.',
    options.toolsAvailable === false
      ? 'Built-in tools/skills are disabled. Report this limitation; no skill is loaded and no code block is an applied tool edit.'
      : buildAgentSkillCatalog(),
  ].join('\n');
}
