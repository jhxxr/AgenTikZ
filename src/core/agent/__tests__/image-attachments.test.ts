import { describe, expect, it } from 'vitest';
import { clipboardImages, validateAgentImages } from '../image-attachments';
import type { AgentImageAttachment } from '../../../types/acp';

const image: AgentImageAttachment = { id: 'ref', name: 'ref.png', mimeType: 'image/png', data: 'cGl4ZWxz' };

describe('agent reference images', () => {
  it('bounds raster attachments and rejects URLs, malformed payloads and unsupported formats', () => {
    expect(() => validateAgentImages([image])).not.toThrow();
    for (const images of [Array(5).fill(image), [{ ...image, data: 'https://example.test' }],
      [{ ...image, data: 'x'.repeat(1_400_004) }], [{ ...image, data: 'a==a' }],
      [{ ...image, mimeType: 'image/svg+xml' }]]) {
      expect(() => validateAgentImages(images as AgentImageAttachment[])).toThrow();
    }
  });
  it('only intercepts image files, deduplicates the files fallback and keeps ordinary text paste', () => {
    const file = new File(['pixels'], 'ref.png', { type: 'image/png' });
    const item = { kind: 'file', type: file.type, getAsFile: () => file };
    const clipboard = (items: unknown[], files: File[]) => ({ items, files }) as unknown as DataTransfer;
    expect(clipboardImages(clipboard([item], [file]))).toEqual([file]);
    expect(clipboardImages(clipboard([], [file]))).toEqual([file]);
    expect(clipboardImages(clipboard([{ kind: 'string', type: 'text/plain' }], []))).toEqual([]);
  });
});
