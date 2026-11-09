import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateScientificIllustration, postProcessCutoutDataUrl } from '../illustration-prompt';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));
const fixturePng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/1FEAAAAASUVORK5CYII=';
let decodeFails = false;
let contextMissing = false;
const request = {
  projectDir: 'E:/Paper', provider: 'openai' as const, apiKey: 'test-fixture-not-a-real-key',
  model: 'fixture', subjectPrompt: 'Test scientific object', autoRemoveWhiteBg: false, autoTrimAlpha: false,
};

beforeEach(() => {
  invoke.mockReset(); decodeFails = false; contextMissing = false;
  vi.stubGlobal('window', { __TAURI_INTERNALS__: {} });
  vi.stubGlobal('Image', class {
    width = 8; height = 6; naturalWidth = 8; naturalHeight = 6;
    onload?: () => void;
    onerror?: () => void;
    set src(_value: string) { queueMicrotask(() => decodeFails ? this.onerror?.() : this.onload?.()); }
  });
  vi.stubGlobal('document', {
    createElement: () => ({
      width: 0, height: 0, toDataURL: () => fixturePng,
      getContext: () => contextMissing ? null : ({
        drawImage: vi.fn(), putImageData: vi.fn(),
        getImageData: () => ({ data: new Uint8ClampedArray(8 * 6 * 4).fill(255) }),
      }),
    }),
  });
  invoke.mockImplementation(async (command, args) => {
    if (command === 'img_generate_illustration') return { dataUrl: fixturePng };
    if (command === 'img_save_processed_asset') return { relativePath: args.targetRelativePath };
    throw new Error(`Unexpected IPC ${command}`);
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('generated illustration save contract', () => {
  it('honors the requested unique filenames and supplies the full native metadata signature', async () => {
    for (const name of ['first_unique', 'second_unique']) {
      const path = `figures/assets/ai/${name}.png`;
      expect(await generateScientificIllustration({ ...request, targetRelativePath: path }))
        .toMatchObject({ ok: true, savedRelativePath: path, width: 8, height: 6 });
      expect(invoke).toHaveBeenCalledWith('img_generate_illustration', expect.objectContaining({ nodeId: name }));
      expect(invoke).toHaveBeenCalledWith('img_save_processed_asset', expect.objectContaining({
        nodeId: name, targetRelativePath: path, projectDir: request.projectDir,
        prompt: request.subjectPrompt, provider: 'openai', model: 'fixture', widthPx: 8, heightPx: 6,
      }));
    }
  });

  it('does not reuse ai_cutout.png when the caller does not supply an id or a path', async () => {
    const first = await generateScientificIllustration(request);
    const second = await generateScientificIllustration(request);
    expect(first.savedRelativePath).not.toBe(second.savedRelativePath);
    const generated = invoke.mock.calls.filter(([command]) => command === 'img_generate_illustration');
    expect(generated[0][1].nodeId).not.toBe(generated[1][1].nodeId);
  });

  it('never publishes a decoded placeholder with invented dimensions after image decode failure', async () => {
    decodeFails = true;
    await expect(generateScientificIllustration(request)).rejects.toThrow('无法解码');
    expect(invoke.mock.calls.some(([command]) => command === 'img_save_processed_asset')).toBe(false);
  });

  it('fails explicitly if image processing has no canvas context or DOM support', async () => {
    contextMissing = true;
    await expect(generateScientificIllustration(request)).rejects.toThrow('画布不可用');
    vi.stubGlobal('document', undefined);
    await expect(postProcessCutoutDataUrl(fixturePng, { autoRemoveWhiteBg: false, autoTrimAlpha: false }))
      .rejects.toThrow('不能解码');
  });

  it('validates the destination before calling a potentially paid image-generation API', async () => {
    await expect(generateScientificIllustration({ ...request, targetRelativePath: '../overwrite.png' })).rejects.toThrow();
    await expect(generateScientificIllustration({ ...request, targetRelativePath: 'figures/external/wrong.png' })).rejects.toThrow('figures/assets/ai');
    expect(invoke).not.toHaveBeenCalled();
  });
});
