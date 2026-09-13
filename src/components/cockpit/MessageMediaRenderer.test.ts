import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (file: string) => readFileSync(new URL(file, import.meta.url), 'utf8');

describe('MessageMediaRenderer normalization and visual type discrimination', () => {
  it('does not blindly fall back to document for images, stickers, audios and videos', () => {
    const source = read('./MessageMediaRenderer.tsx');

    // Ensures normalization handles lowercase / WAHA / Meta payload shapes
    expect(source).toContain("const mimetype = (raw.mimetype || raw.mimeType || raw.contentType || '') as string;");
    expect(source).toContain("const rawUrl = (raw.url || raw.mediaUrl || raw.link || '') as string;");
    expect(source).toContain("rawType === 'image'");
    expect(source).toContain("mime.startsWith('image/')");
    expect(source).toContain("rawType === 'audio'");
    expect(source).toContain("rawType === 'ptt'");
    expect(source).toContain("mime.startsWith('audio/')");
    expect(source).toContain("rawType === 'video'");
    expect(source).toContain("mime.startsWith('video/')");

    // Ensures lightbox modal is present for images
    expect(source).toContain('setLightboxOpen(true)');
    expect(source).toContain('Ver foto completa');
    expect(source).toContain('Baixar Foto');

    // Ensures audio player has waveform and playback rate toggling
    expect(source).toContain('togglePlayAudio');
    expect(source).toContain('handleSpeedToggle');
  });

  it('normalizes internal WAHA and localhost urls into media-proxy and supports document modal preview', () => {
    const source = read('./MessageMediaRenderer.tsx');

    // Normalizes localhost:3000 and internal paths to media-proxy
    expect(source).toContain('/api/v1/channels/waha/media-proxy?path=');
    expect(source).toContain("trimmed.includes('/api/files/')");
    expect(source).toContain("trimmed.includes('localhost')");

    // Interactive document actions
    expect(source).toContain('setDocPreviewOpen');
    expect(source).toContain('Nova Aba');
    expect(source).toContain('Baixar');
    expect(source).toContain('Pré-visualização do documento');
  });

  it('rejects unrecognized types and non-media objects without falling back to document', () => {
    const source = read('./MessageMediaRenderer.tsx');

    // Asserts null return on non-media types to avoid phantom document cards for text
    expect(source).toContain('Not a media item! Return null so text messages or unknown events are not rendered as bogus document attachments');
  });
});
