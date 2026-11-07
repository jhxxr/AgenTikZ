import { FULL_FIGURE_TEMPLATES } from './dl-templates';

/** Send drawing ideas, never ready-made code, coordinates or experiment data. */
export function buildTemplateReferenceContext(templateId?: string): string {
  const selected = FULL_FIGURE_TEMPLATES.find((template) => template.id === templateId);
  return JSON.stringify({
    usage: 'Optional composition inspiration, not a figure to copy. The user request determines the content and topology; ignore unrelated references.',
    selectedTemplateId: selected?.id ?? null,
    references: (selected ? [selected] : FULL_FIGURE_TEMPLATES).map((template) => ({
      id: template.id,
      title: template.title,
      ...template.designGuide,
    })),
  });
}
