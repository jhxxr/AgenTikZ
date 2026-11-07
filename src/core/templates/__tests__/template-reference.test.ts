import { describe, expect, it } from 'vitest';
import { FULL_FIGURE_TEMPLATES } from '../dl-templates';
import { buildTemplateReferenceContext } from '../template-reference';

describe('AI composition references', () => {
  it('provides design guidance without ready-made source or example data', () => {
    const context = buildTemplateReferenceContext();
    const data = JSON.parse(context);
    expect(data.selectedTemplateId).toBeNull();
    expect(data.references).toHaveLength(FULL_FIGURE_TEMPLATES.length);
    for (const reference of data.references) {
      expect(reference.intent).toBeTruthy();
      expect(reference.layout.length).toBeGreaterThan(0);
      expect(reference.adapt.length).toBeGreaterThan(0);
      expect(Object.keys(reference).sort()).toEqual(['adapt', 'id', 'intent', 'layout', 'title']);
    }
    expect(context).not.toContain('tikzpicture');
    expect(context).not.toContain('coordinates');
    expect(context).not.toContain('tikzCode');
  });

  it('uses only the explicitly selected reference, without loading it', () => {
    const template = FULL_FIGURE_TEMPLATES[2];
    const data = JSON.parse(buildTemplateReferenceContext(template.id));
    expect(data.selectedTemplateId).toBe(template.id);
    expect(data.references).toHaveLength(1);
    expect(data.references[0].layout).toEqual(template.designGuide.layout);
  });

  it('treats an unknown reference as unselected, not as the first template', () => {
    expect(JSON.parse(buildTemplateReferenceContext('missing')).selectedTemplateId).toBeNull();
  });
});
