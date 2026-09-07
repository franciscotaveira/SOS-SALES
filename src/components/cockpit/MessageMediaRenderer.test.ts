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
});
