import { describe, it, expect } from 'vitest';
import { useImageAttach } from '../../../src/composables/useImageAttach';

const MAX_BYTES = 5 * 1024 * 1024;

function fakeFile({ size = 1024, type = 'image/png', name = 'a.png' } = {}): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe('useImageAttach', () => {
  it('accepts a PNG under the size cap', () => {
    const attach = useImageAttach({ maxBytes: MAX_BYTES });
    const file = fakeFile({ size: 1024, type: 'image/png' });
    const result = attach.validate(file);
    expect(result.ok).toBe(true);
  });

  it('rejects MIME types that are not image/(png|jpeg|webp)', () => {
    const attach = useImageAttach({ maxBytes: MAX_BYTES });
    const file = fakeFile({ size: 1024, type: 'application/pdf' });
    const result = attach.validate(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/type/i);
  });

  it('rejects files over the size cap before any upload happens', () => {
    const attach = useImageAttach({ maxBytes: 100 });
    const file = fakeFile({ size: 200, type: 'image/png' });
    const result = attach.validate(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/size|too large/i);
  });

  it('exposes the rejection cap as a human-readable byte count', () => {
    const attach = useImageAttach({ maxBytes: 5 * 1024 * 1024 });
    const file = fakeFile({ size: 6 * 1024 * 1024, type: 'image/png' });
    const result = attach.validate(file);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('5');
  });

  it('builds a preview URL via createObjectURL and cleans it up via revoke', () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const originalCreate = (URL as any).createObjectURL;
    const originalRevoke = (URL as any).revokeObjectURL;
    (URL as any).createObjectURL = (file: File) => {
      const url = `blob:mock/${file.name}`;
      created.push(url);
      return url;
    };
    (URL as any).revokeObjectURL = (url: string) => revoked.push(url);
    try {
      const attach = useImageAttach({ maxBytes: MAX_BYTES });
      const file = fakeFile({ name: 'preview.png', type: 'image/png' });
      const url = attach.makePreview(file);
      expect(url).toBe('blob:mock/preview.png');
      expect(created).toHaveLength(1);
      attach.revokePreview(url);
      expect(revoked).toEqual(['blob:mock/preview.png']);
    } finally {
      (URL as any).createObjectURL = originalCreate;
      (URL as any).revokeObjectURL = originalRevoke;
    }
  });
});
