import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createPaperFromTemplate, importPaperTemplate, listPaperTemplates,
  removePaperTemplate, setPaperTemplateMain, verifyPaperTemplate,
} from '../template-library';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
beforeEach(() => { invoke.mockReset(); vi.stubGlobal('window', { __TAURI_INTERNALS__: {} }); });
afterEach(() => vi.unstubAllGlobals());

describe('desktop paper template library boundary', () => {
  it('passes URL/Git source types, names, subdirectories and proxy explicitly', async () => {
    invoke.mockResolvedValue({ id: 'user-kit' });
    await importPaperTemplate({ location: ' https://example.org/download?id=42 ', sourceKind: 'url', name: ' Journal ', subdirectory: ' latex ', proxy: 'http://localhost:7890' });
    expect(invoke).toHaveBeenLastCalledWith('paper_template_import', {
      location: 'https://example.org/download?id=42', name: 'Journal', subdirectory: 'latex',
      sourceKind: 'url', proxy: 'http://localhost:7890',
    });
    await importPaperTemplate({ location: 'E:/Templates/kit.zip' });
    expect(invoke).toHaveBeenLastCalledWith('paper_template_import', {
      location: 'E:/Templates/kit.zip', name: null, subdirectory: null, sourceKind: 'auto', proxy: null,
    });
    // Merely importing untrusted source files never compiles them implicitly.
    expect(invoke).not.toHaveBeenCalledWith('paper_template_verify', expect.anything());
  });

  it('keeps list, trial build, main-file selection and removal as separate operations', async () => {
    await listPaperTemplates();
    expect(invoke).toHaveBeenLastCalledWith('paper_templates_list', undefined);
    await setPaperTemplateMain('user-kit', 'latex/paper.tex');
    expect(invoke).toHaveBeenLastCalledWith('paper_template_set_main', { id: 'user-kit', mainFile: 'latex/paper.tex' });
    await verifyPaperTemplate('user-kit');
    expect(invoke).toHaveBeenLastCalledWith('paper_template_verify', { id: 'user-kit' });
    await removePaperTemplate('user-kit');
    expect(invoke).toHaveBeenLastCalledWith('paper_template_remove', { id: 'user-kit' });
  });

  it('creates the exact selected template instead of fabricating an article fallback', async () => {
    invoke.mockResolvedValue({ mainFile: 'example_paper.tex', defaultThemeId: 'neurips' });
    const extra = { 'styles/agentikz-macros.sty': '% figure styles' };
    expect(await createPaperFromTemplate('icml', 'E:/Papers/New', 'My title', extra)).toEqual({
      mainFile: 'example_paper.tex', defaultThemeId: 'neurips',
    });
    expect(invoke).toHaveBeenLastCalledWith('paper_template_create_project', {
      templateId: 'icml', projectDir: 'E:/Papers/New', title: 'My title', extraFiles: extra,
    });
  });

  it('reports browser limitations rather than pretending to import a remote template', async () => {
    vi.stubGlobal('window', {});
    await expect(importPaperTemplate({ location: 'https://github.com/a/b' })).rejects.toThrow('桌面版');
    expect(invoke).not.toHaveBeenCalled();
  });
});
